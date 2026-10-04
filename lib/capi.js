// Meta Conversions API (CRM): amoCRM'dagi lid bosqichlarini Meta'ga yuborish.
// Maqsad: Meta faqat "lid" emas, balki SIFATLI lid, suhbatga kelgan va sotib olgan odamlarni ko'radi
// va reklamani shunday odamlarga ko'rsatishni o'rganadi (sifatli lid narxi pasayadi).
//
// Kerakli o'zgaruvchilar (Vercel > Environment Variables), P1 = loyihaning env belgisi:
//   CAPI_DATASET_P1  = Events Manager'dagi dataset (piksel) ID
//   CAPI_TOKEN_P1    = shu dataset uchun yaratilgan token (Events Manager > Settings > Generate access token)
//   CAPI_TEST_CODE_P1 (ixtiyoriy) = sinov kodi, masalan TEST12345. Qo'yilsa, hodisalar faqat "Test events" bo'limiga tushadi.
import crypto from "crypto";
import cfg from "../projects.config";
import { projectEnv } from "./env";
import { nkey, idsOf, idsOfPipelines } from "./stages";
import { fetchPipelines, fetchLeads, fetchLeadsByIds, fetchContactsByIds, fetchCompaniesByIds, fetchStatusEvents } from "./amo";
import { storeReady, sentCheck, sentAdd, logPush } from "./store";

const GRAPH = "https://graph.facebook.com/v21.0";
const LOST_ID = 143, WON_ID = 142;
// Bosqichlar zinasi: yuqori bosqich yuborilsa, undan oldingilari ham (yuborilmagan bo'lsa) yuboriladi.
// Meta talabi: hamma bosqich ketma-ket, birinchi "xom lid"dan boshlab yuborilishi kerak.
export const ORDER = ["lead", "quality", "visit", "sale"];
const DEFAULTS = {
  crm: "amoCRM",
  leadId: ["Meta lead ID", "lead id", "leadgen id"],
  onlyAdLeads: true,
  events: { lead: "Lead", quality: "Sifatli lid", visit: "Suhbatga keldi", sale: "Sotuv" }
};

const clean = (v) => String(v || "").trim();
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

export function capiConf(p) {
  const c = Object.assign({}, DEFAULTS, p.capi || {});
  c.events = Object.assign({}, DEFAULTS.events, (p.capi && p.capi.events) || {});
  return c;
}

export function capiEnv(p) {
  const e = p.env;
  const dataset = clean(process.env["CAPI_DATASET_" + e]).replace(/\D/g, "");
  const token = clean(process.env["CAPI_TOKEN_" + e]);
  const testCode = clean(process.env["CAPI_TEST_CODE_" + e]);
  return { dataset, token, testCode, ok: !!(dataset && token) };
}

// Webhook manzilidagi kalit. Panel parolidan hosil qilinadi (parolning o'zi emas va undan parolni tiklab bo'lmaydi).
// Shu sabab alohida o'zgaruvchi kerak emas. Parol o'zgarsa, kalit ham o'zgaradi (webhook manzilini yangilash kerak bo'ladi).
export function hookKey() {
  const pass = process.env.DASH_PASSWORD || "";
  if (!pass) return "";
  return crypto.createHmac("sha256", pass).update("amo-webhook:v1").digest("hex").slice(0, 32);
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

// So'rov panel paroli bilan kelganmi (qo'lda ochilgan) yoki yo'qmi (avtomatik ishga tushgan)
export function isAdmin(req) {
  const pass = process.env.DASH_PASSWORD || "";
  const auth = req.headers.get("authorization") || "";
  if (!pass || !auth.startsWith("Basic ")) return false;
  try {
    const [user, ...rest] = Buffer.from(auth.slice(6), "base64").toString("utf8").split(":");
    return user === "admin" && safeEqual(rest.join(":"), pass);
  } catch (e) { return false; }
}

// Telefon: faqat raqamlar, davlat kodi bilan. 9 xonali raqamga 998 qo'shiladi (O'zbekiston).
export function normPhone(raw) {
  let d = String(raw || "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length === 9) d = "998" + d;
  return d.length >= 10 && d.length <= 15 ? d : "";
}

function fieldValue(entity, names) {
  if (!entity || !names || !names.length) return "";
  const want = names.map(nkey);
  const f = (entity.custom_fields_values || []).find((x) => want.includes(nkey(x.field_name)));
  const v = f && f.values && f.values[0] ? f.values[0].value : "";
  return v == null ? "" : String(v).trim();
}

function contactValues(contact, code) {
  const out = [];
  ((contact && contact.custom_fields_values) || []).forEach((f) => {
    if (f.field_code === code) (f.values || []).forEach((v) => { if (v && v.value) out.push(String(v.value)); });
  });
  return out;
}

// Bosqich to'plamlari 10 daqiqa xotirada turadi (har webhook'da amoCRM'dan qayta so'ramaslik uchun)
const stCache = new Map();
async function stageSets(p, c) {
  const hit = stCache.get(p.slug);
  if (hit && Date.now() - hit.t < 600000) return hit.v;
  const pipes = await fetchPipelines(c.amoSub, c.amoToken);
  const S = cfg.stages, st = pipes.statuses;
  const visit = idsOf(st, S.visit);
  idsOfPipelines(st, S.visitPipelines).forEach((id) => visit.add(id));
  const good = idsOf(st, S.info);
  idsOf(st, S.offer).forEach((id) => good.add(id));
  const sale = idsOf(st, S.sale);
  if (cfg.useWonStatus) Object.keys(pipes.pipelineNames).forEach((pid) => sale.add(pid + ":" + WON_ID));
  const wanted = new Set();
  [visit, good, sale].forEach((set) => set.forEach((id) => wanted.add(id)));
  const skip = new Set((p.ignorePipelines || cfg.ignorePipelines || []).map(nkey));
  const v = { visit, good, sale, wanted, skipPipe: (pid) => skip.has(nkey(pipes.pipelineNames[pid] || "")) };
  stCache.set(p.slug, { t: Date.now(), v });
  return v;
}

// Lid qaysi bosqichlarga yetgan (paneldagi sifat qoidasi bilan bir xil). Natija: ["lead", "quality", ...]
function stagesOf(p, lead, reachedSet, ST) {
  const reached = new Set(reachedSet || []);
  reached.add(lead.pipeline_id + ":" + lead.status_id);
  const any = (set) => { for (const id of reached) if (set.has(id)) return true; return false; };
  const isSale = any(ST.sale);
  const isVisit = isSale || any(ST.visit);
  const reachedGood = any(ST.good);
  let quality = isVisit || reachedGood;
  const LQ = p.lostQuality || cfg.lostQuality || null;
  if (!isVisit && lead.status_id === LOST_ID && LQ) {
    const fv = nkey(fieldValue(lead, [LQ.field]));
    if (fv && (LQ.good || []).map(nkey).includes(fv)) quality = true;
    else if (fv && (LQ.bad || []).map(nkey).includes(fv)) quality = false;
  }
  const out = ["lead"];
  if (quality) out.push("quality");
  if (isVisit) out.push("visit");
  if (isSale) out.push("sale");
  return out;
}

// Meta'ga yuborish. Bitta noto'g'ri hodisa butun to'plamni rad ettiradi, shuning uchun xato bo'lsa to'plam ikkiga bo'linib qayta yuboriladi.
async function postEvents(env, events, testCode, budget) {
  if (!events.length) return { ok: [], bad: [] };
  if (budget.left <= 0) return { ok: [], bad: events.map((e) => ({ e, err: "so'rovlar chegarasi tugadi, keyingi safar yuboriladi" })) };
  budget.left--;
  const payload = { data: events.map((x) => x.body), access_token: env.token };
  if (testCode) payload.test_event_code = testCode;
  // lead_id 15-17 xonali son: JavaScript aniqligini yo'qotmaslik uchun matndan songa JSON ichida aylantiriladi
  const body = JSON.stringify(payload).replace(/"lead_id":"(\d{10,20})"/g, '"lead_id":$1');
  let err = "", fatal = false;
  try {
    const res = await fetch(GRAPH + "/" + env.dataset + "/events", { method: "POST", headers: { "Content-Type": "application/json" }, body, cache: "no-store", signal: AbortSignal.timeout(15000) });
    const j = await res.json().catch(() => ({}));
    if (res.ok && !j.error) return { ok: events, bad: [] };
    const e = j.error || {};
    err = String(e.error_user_msg || e.message || "HTTP " + res.status).slice(0, 220);
    fatal = e.code === 190 || e.code === 200 || e.code === 10 || e.code === 4 || res.status === 401 || res.status === 403; // token/ruxsat/limit xatosi: bo'lib yuborish foydasiz
  } catch (x) { err = "Meta javob bermadi: " + String(x.message || x).slice(0, 120); fatal = true; }
  if (fatal) { budget.left = 0; return { ok: [], bad: events.map((e) => ({ e, err })) }; }
  if (events.length === 1) {
    // lead_id rad etilgan bo'lsa, telefon xeshi bilan qayta urinib ko'riladi
    const one = events[0], ud = one.body.user_data;
    if (ud.lead_id && (ud.ph || ud.em)) {
      const alt = Object.assign({}, one, { by: "tel", body: Object.assign({}, one.body, { user_data: Object.assign({}, ud, { lead_id: undefined }) }) });
      const r = await postEvents(env, [alt], testCode, budget);
      if (r.ok.length) return r;
    }
    return { ok: [], bad: [{ e: one, err }] };
  }
  const mid = Math.ceil(events.length / 2);
  const a = await postEvents(env, events.slice(0, mid), testCode, budget);
  const b = await postEvents(env, events.slice(mid), testCode, budget);
  return { ok: a.ok.concat(b.ok), bad: a.bad.concat(b.bad) };
}

// Asosiy ish: berilgan lidlar uchun hali yuborilmagan bosqichlarni Meta'ga yuborish.
// opts: { reached: { lidId: Set("voronka:bosqich") }, src: "hook"|"sync"|"cron", dry: faqat hisoblash, testCode }
export async function pushLeads(p, leads, opts) {
  opts = opts || {};
  const c = projectEnv(p), env = capiEnv(p), C = capiConf(p);
  const sum = { tekshirilgan_lid: leads.length, reklama_lidi: 0, yuboriladigan_hodisa: 0, yuborildi: 0, xato: 0, bosqichlar: {}, aniqlash: { lead_id: 0, telefon: 0, aniqlovchi_yoq: 0 },
    // Hodisa ketmagan lidlar va sababi (webhook diagnostikasi uchun)
    otkazildi: { hisobga_olinmaydigan_voronka: 0, yangi_bosqich_yoq: 0, reklama_lidi_emas: 0, telefon_va_lid_id_yoq: 0 }, xatolar: [] };
  if (!leads.length) return sum;
  if (!storeReady()) throw new Error("Saqlash joyi (Upstash) ulanmagan: takror yubormaslik uchun kerak");
  const ST = await stageSets(p, c);
  const testCode = opts.testCode || env.testCode || "";

  // 1) Har lidning bosqichlari va hali yuborilmaganlari
  sum.otkazildi.hisobga_olinmaydigan_voronka = leads.filter((l) => ST.skipPipe(l.pipeline_id)).length;
  const items = leads.filter((l) => !ST.skipPipe(l.pipeline_id)).map((l) => ({ l, stages: stagesOf(p, l, opts.reached && opts.reached[l.id], ST) }));
  const members = [];
  items.forEach((it) => it.stages.forEach((s) => members.push(it.l.id + ":" + s)));
  const done = testCode ? members.map(() => false) : await sentCheck(p.slug, members); // sinov rejimida "yuborilgan" belgisi hisobga olinmaydi
  let k = 0;
  items.forEach((it) => { it.todo = it.stages.filter(() => !done[k++]); });
  const pending = items.filter((it) => it.todo.length);
  sum.otkazildi.yangi_bosqich_yoq = items.length - pending.length; // bu lidlarning hozirgi bosqichlari allaqachon yuborilgan
  if (!pending.length) return sum;

  // 2) Kompaniya (reklama nomi shu yerda) va kontakt (telefon) ma'lumotlari
  const SRC = p.source || cfg.source || {};
  const adNames = [].concat(SRC.ad || [], SRC.campaign || []);
  const coId = (l) => { const x = l._embedded && l._embedded.companies; return x && x[0] ? x[0].id : null; };
  const ctId = (l) => { const x = (l._embedded && l._embedded.contacts) || []; const m = x.find((y) => y.is_main) || x[0]; return m ? m.id : null; };
  const [companies, contacts] = await Promise.all([
    fetchCompaniesByIds(c.amoSub, c.amoToken, Array.from(new Set(pending.map((it) => coId(it.l)).filter(Boolean)))).catch(() => ({})),
    fetchContactsByIds(c.amoSub, c.amoToken, pending.map((it) => ctId(it.l))).catch(() => ({}))
  ]);

  // 3) Hodisalarni tuzish
  const now = Math.floor(Date.now() / 1000);
  const events = [];
  pending.forEach((it) => {
    const l = it.l, co = companies[coId(l)], ct = contacts[ctId(l)];
    let leadId = "";
    for (const ent of [l, co, ct]) {
      const v = fieldValue(ent, C.leadId).replace(/\D/g, "");
      if (/^\d{15,17}$/.test(v)) { leadId = v; break; }
    }
    const isAd = !!leadId || !!(fieldValue(l, adNames) || fieldValue(co, adNames));
    if (C.onlyAdLeads && !isAd) { sum.otkazildi.reklama_lidi_emas++; return; } // kiruvchi qo'ng'iroq va boshqa manbalar Meta'ga yuborilmaydi
    sum.reklama_lidi++;
    const ph = Array.from(new Set(contactValues(ct, "PHONE").map(normPhone).filter(Boolean))).slice(0, 3).map(sha);
    const em = Array.from(new Set(contactValues(ct, "EMAIL").map((x) => x.trim().toLowerCase()).filter((x) => x.includes("@")))).slice(0, 2).map(sha);
    if (!leadId && !ph.length && !em.length) { sum.aniqlash.aniqlovchi_yoq++; sum.otkazildi.telefon_va_lid_id_yoq++; return; }
    const by = leadId ? "lead_id" : "tel";
    sum.aniqlash[leadId ? "lead_id" : "telefon"]++;
    const user_data = {};
    if (leadId) user_data.lead_id = leadId;
    if (ph.length) user_data.ph = ph;
    if (em.length) user_data.em = em;
    it.todo.forEach((stage, i) => {
      const custom_data = { event_source: "crm", lead_event_source: C.crm };
      if (stage === "sale" && p.avgCheck > 0) { custom_data.value = p.avgCheck; custom_data.currency = "UZS"; }
      // Vaqt: hozir (ketma-ketlik saqlanishi uchun bosqichlar orasida 1 soniya), lid yaratilgan vaqtdan oldin bo'lmasligi kerak
      const t = Math.max(now - (it.todo.length - 1 - i), (l.created_at || 0) + 1 + i);
      events.push({ lead: l.id, stage, by, body: { event_name: C.events[stage] || stage, event_time: Math.min(t, now), event_id: p.slug + "-" + l.id + "-" + stage, action_source: "system_generated", user_data, custom_data } });
      sum.bosqichlar[stage] = (sum.bosqichlar[stage] || 0) + 1;
    });
  });
  sum.yuboriladigan_hodisa = events.length;
  if (opts.dry || !events.length) return sum;
  if (!env.ok) throw new Error("CAPI_DATASET_" + p.env + " yoki CAPI_TOKEN_" + p.env + " kiritilmagan");

  // 4) Yuborish (1000 tadan), natijani eslab qolish va jurnalga yozish
  const budget = { left: 40 };
  let ok = [], bad = [];
  for (let i = 0; i < events.length; i += 1000) {
    const r = await postEvents(env, events.slice(i, i + 1000), testCode, budget);
    ok = ok.concat(r.ok); bad = bad.concat(r.bad);
  }
  sum.yuborildi = ok.length; sum.xato = bad.length;
  if (testCode) sum.sinov_rejimi = "Hodisalar faqat Test events bo'limiga tushdi, yuborilgan deb belgilanmadi";
  else if (ok.length) await sentAdd(p.slug, ok.map((e) => e.lead + ":" + e.stage));
  const errSet = {};
  bad.forEach((b) => { errSet[b.err] = (errSet[b.err] || 0) + 1; });
  sum.xatolar = Object.keys(errSet).map((x) => ({ xato: x, soni: errSet[x] }));
  // Jurnal: lid bo'yicha bitta yozuv (telefon va ism yozilmaydi)
  const iso = new Date().toISOString(), byLead = {};
  ok.forEach((e) => { const r = byLead[e.lead + ":ok"] = byLead[e.lead + ":ok"] || { t: iso, lid: e.lead, b: [], by: e.by, ok: true, s: opts.src || "" }; r.b.push(e.stage); });
  bad.forEach((b) => { const r = byLead[b.e.lead + ":x"] = byLead[b.e.lead + ":x"] || { t: iso, lid: b.e.lead, b: [], by: b.e.by, ok: false, x: b.err, s: opts.src || "" }; r.b.push(b.e.stage); });
  const rows = Object.keys(byLead).map((key) => Object.assign(byLead[key], testCode ? { sinov: true } : {}));
  try { await logPush(p.slug, rows); } catch (e) { /* jurnal yozilmasa ham ish to'xtamaydi */ }
  return sum;
}

// Webhook: amoCRM yuborgan lid id'lari bo'yicha
export async function pushByIds(p, ids, opts) {
  const c = projectEnv(p);
  const leads = await fetchLeadsByIds(c.amoSub, c.amoToken, ids.slice(0, 200));
  return pushLeads(p, leads, opts);
}

// Zaxira yo'l: oxirgi N kunda yaratilgan lidlar + shu kunlarda kerakli bosqichga o'tgan eski lidlar
export async function syncProject(p, opts) {
  opts = opts || {};
  const c = projectEnv(p);
  const days = Math.min(Math.max(Number(opts.days) || 3, 1), 7); // Meta 7 kundan eski hodisani qabul qilmaydi
  const now = Math.floor(Date.now() / 1000), from = now - days * 86400;
  const ST = await stageSets(p, c);
  const [fresh, reached] = await Promise.all([
    fetchLeads(c.amoSub, c.amoToken, from, now, true),
    fetchStatusEvents(c.amoSub, c.amoToken, from, Array.from(ST.wanted))
  ]);
  const have = new Set(fresh.map((l) => String(l.id)));
  const olderIds = Object.keys(reached).filter((id) => !have.has(String(id)));
  const older = olderIds.length ? await fetchLeadsByIds(c.amoSub, c.amoToken, olderIds.slice(0, 2000)) : [];
  const sum = await pushLeads(p, fresh.concat(older), Object.assign({}, opts, { reached }));
  return Object.assign({ davr_kun: days, yangi_lidlar: fresh.length, bosqichi_ozgargan_eski_lidlar: older.length }, sum);
}

// Dataset nomi (token to'g'riligini tekshirish uchun)
export async function pingDataset(env) {
  const res = await fetch(GRAPH + "/" + env.dataset + "?fields=name", { headers: { Authorization: "Bearer " + env.token }, cache: "no-store", signal: AbortSignal.timeout(8000) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(String((j.error && j.error.message) || "HTTP " + res.status).slice(0, 200));
  return j.name || "";
}
