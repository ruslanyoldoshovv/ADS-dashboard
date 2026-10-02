// Ma'lumotni yig'ish: Meta + amoCRM -> panel uchun bitta tuzilma.
import cfg from "../projects.config";
import { fetchAds, fetchTodaySpend, fetchCurrency } from "./meta";
import { fetchPipelines, fetchUsers, fetchLeads, fetchStatusEvents, fetchCompaniesByIds } from "./amo";
import { idsOf, idsOfPipelines, nkey } from "./stages";
import { demoData } from "./mock";
import { tashkentNow, hourShareNow } from "./calc";
import { buildDailyPlan } from "./plan";
import { projectEnv } from "./env";

const WON_ID = 142, LOST_ID = 143; // amoCRM'da hamma voronkada bir xil: muvaffaqiyatli va yopilgan
const cache = new Map(); // oddiy 60 soniyalik kesh (Meta/amoCRM limitini asrash uchun)

const creds = (p) => projectEnv(p); // qiymatlar tozalanadi: "act_" qo'shiladi, subdomen ajratib olinadi

export function projectStatus(p) {
  const c = creds(p);
  return { meta: !!(c.metaToken && c.metaAccount), amo: !!(c.amoSub && c.amoToken), ok: c.ok };
}

const norm = (s) => String(s || "").toLowerCase().trim();

// opts: { planToday: bugungi lid rejasi, rate: 1$ necha so'm, tolerant: Meta xato bersa ham amoCRM qismini qaytarish }
export async function getProjectData(p, days, opts) {
  if (!opts) opts = {};
  if (typeof opts.planToday !== "number") { const n = tashkentNow(cfg); opts.planToday = buildDailyPlan(p, n, null).byDay[n.day] || 0; }
  if (!(opts.rate > 0)) opts.rate = cfg.usdRateFallback || 12000;
  const k = p.slug + ":" + days + ":" + opts.planToday + (opts.tolerant ? ":t" : "");
  const hit = cache.get(k);
  if (hit && Date.now() - hit.t < 60000) return hit.v;
  const v = await load(p, days, opts);
  cache.set(k, { t: Date.now(), v });
  return v;
}

// Lid yoki kompaniyaning qo'shimcha maydonidan qiymat olish (maydon nomi bo'yicha, yumshoq solishtirish)
function fieldValue(entity, names) {
  if (!entity || !names || !names.length) return "";
  const want = names.map(nkey);
  const f = (entity.custom_fields_values || []).find((x) => want.includes(nkey(x.field_name)));
  const v = f && f.values && f.values[0] ? f.values[0].value : "";
  return v == null ? "" : String(v).trim();
}

const top = (map, n) => Object.keys(map).map((k) => ({ nom: k, soni: map[k] })).sort((a, b) => b.soni - a.soni).slice(0, n);

async function load(p, days, opts) {
  const now = tashkentNow(cfg);
  const share = hourShareNow(cfg);
  const planToday = opts.planToday;
  const c = creds(p);
  const periodLabel = days === 1 ? "bugungi" : days + " kunlik";

  if (!c.ok) {
    if (process.env.DEMO === "1") {
      const d = demoData(p, { today: now.day, share, planToday, dayBudget: p.dayBudget || planToday * p.thresholds.cpl, rate: opts.rate });
      if (d) return Object.assign(d, { periodLabel });
    }
    throw new Error("Bu loyiha uchun Vercel'da META_TOKEN_" + p.env + ", META_ACCOUNT_" + p.env + ", AMO_SUBDOMAIN_" + p.env + ", AMO_TOKEN_" + p.env + " kiritilmagan.");
  }

  // Sana oralig'i (Toshkent vaqti bilan)
  const offset = cfg.timezoneOffsetHours * 3600;
  const dayStartTs = (y, m, d) => Math.floor(Date.UTC(y, m, d) / 1000) - offset;
  const nowTs = Math.floor(Date.now() / 1000);
  const monthStartTs = dayStartTs(now.y, now.m, 1);
  const todayStartTs = dayStartTs(now.y, now.m, now.day);
  const periodStartTs = days === 1 ? todayStartTs : todayStartTs - (days - 1) * 86400;
  const fromTs = Math.min(monthStartTs, periodStartTs);
  const ymd = (ts) => new Date((ts + offset) * 1000).toISOString().slice(0, 10);

  // Meta: tolerant rejimda (tekshiruv sahifasi) xato bo'lsa ham amoCRM qismi ishlaydi
  let metaError = null;
  const metaPart = Promise.all([
    fetchAds({ token: c.metaToken, account: c.metaAccount, since: ymd(periodStartTs), until: ymd(nowTs) }),
    fetchTodaySpend({ token: c.metaToken, account: c.metaAccount }),
    fetchCurrency({ token: c.metaToken, account: c.metaAccount })
  ]).catch((e) => { if (!opts.tolerant) throw e; metaError = String(e.message || e); return [[], 0, null]; });

  const [[metaAds, todaySpend, accountCurrency], pipes, users, leads, events] = await Promise.all([
    metaPart,
    fetchPipelines(c.amoSub, c.amoToken),
    fetchUsers(c.amoSub, c.amoToken),
    fetchLeads(c.amoSub, c.amoToken, fromTs, nowTs),
    fetchStatusEvents(c.amoSub, c.amoToken, fromTs)
  ]);

  // Bosqich nomlaridan kalitlar ("voronkaId:bosqichId")
  const statuses = pipes.statuses;
  const S = cfg.stages;
  const visitIds = idsOf(statuses, S.visit);
  idsOfPipelines(statuses, S.visitPipelines).forEach((id) => visitIds.add(id));
  const ST = { contacted: idsOf(statuses, S.contacted), info: idsOf(statuses, S.info), offer: idsOf(statuses, S.offer), visit: visitIds, sale: idsOf(statuses, S.sale) };
  if (cfg.useWonStatus) Object.keys(pipes.pipelineNames).forEach((pid) => ST.sale.add(pid + ":" + WON_ID));
  const hasAny = (reached, set) => { for (const id of reached) if (set.has(id)) return true; return false; };

  // Hisobga olinmaydigan voronkalar (masalan eski baza, mavjud mijozlar)
  const skipPipes = new Set((p.ignorePipelines || cfg.ignorePipelines || []).map(nkey));
  const pipeName = (l) => pipes.pipelineNames[l.pipeline_id] || "Noma'lum";
  const counted = leads.filter((l) => !skipPipes.has(nkey(pipeName(l))));

  // Sutkalik lidlar (barcha manba), oy bo'yicha
  const daily = {};
  counted.forEach((l) => {
    if (l.created_at >= monthStartTs) {
      const day = new Date((l.created_at + offset) * 1000).getUTCDate();
      daily[day] = (daily[day] || 0) + 1;
    }
  });

  // Reklamalar bo'yicha qatorlar
  const blank = () => ({ spend: 0, leads: 0, good: 0, visits: 0, sales: 0, noAns: 0, lost: 0, dup: 0, revenue: 0 });
  const adRows = metaAds.map((a) => Object.assign(blank(), { id: a.id, name: a.name, format: "ID " + a.id, campaign: a.campaign, adset: a.adset, spend: a.spend }));
  const extraRows = {}; // Meta'da topilmagan reklama nomlari: nom -> qator
  const unmatched = Object.assign(blank(), { id: "unmatched", name: "Reklamasi aniqlanmagan lidlar", format: "Reklama nomi Meta'dagi nom yoki ID bilan mos kelmadi", campaign: "—", adset: "—" });
  const calls = { leads: 0, good: 0, visits: 0, sales: 0, tag: 0, noTag: 0, revenue: 0 };
  const mid = { contacted: 0, offered: 0 };
  const ops = {}; const reasonCount = {};
  const ignore = (cfg.ignoreTags || []).map(norm);

  // Lid manbasi: "tags" (teg bo'yicha, standart) yoki "fields" (lid/kompaniya maydonidagi reklama nomi bo'yicha)
  const SRC = p.source || cfg.source || { by: "tags" };
  const byFields = SRC.by === "fields" || SRC.by === "both";
  const byTags = SRC.by !== "fields";

  const periodLeads = counted.filter((l) => l.created_at >= periodStartTs);

  // Reklama nomi lid maydonida bo'lmasa, bog'langan kompaniya maydonidan olinadi
  const companyOf = (l) => { const cs = l._embedded && l._embedded.companies; return cs && cs[0] ? cs[0].id : null; };
  let companies = {};
  if (byFields) {
    const need = Array.from(new Set(periodLeads.filter((l) => !fieldValue(l, SRC.ad) && companyOf(l)).map(companyOf)));
    if (need.length) { try { companies = await fetchCompaniesByIds(c.amoSub, c.amoToken, need.slice(0, 3000)); } catch (e) { companies = {}; } }
  }
  const adInfo = (l) => {
    const co = companies[companyOf(l)];
    const pick = (names) => fieldValue(l, names) || fieldValue(co, names);
    const info = { ad: pick(SRC.ad), adset: pick(SRC.adset), campaign: pick(SRC.campaign) };
    info.from = fieldValue(l, SRC.ad) ? "lid" : fieldValue(co, SRC.ad) ? "kompaniya" : "";
    return info;
  };

  const matchTags = (tagNames) => {
    for (const t of tagNames) {
      const tn = norm(t);
      const hitAd = adRows.find((r) => norm(r.name) === tn || (r.id && tn.includes(String(r.id))) || norm(r.name).includes(tn));
      if (hitAd) return hitAd;
    }
    return null;
  };
  // Reklama nomi bir nechta ad set'da takrorlansa, ad set va kampaniya nomi bilan aniqlashtiriladi
  const matchFields = (info) => {
    const A = nkey(info.ad);
    if (!A) return null;
    let hits = adRows.filter((r) => nkey(r.name) === A || String(r.id) === info.ad);
    if (hits.length > 1 && info.adset) { const s = hits.filter((r) => nkey(r.adset) === nkey(info.adset)); if (s.length) hits = s; }
    if (hits.length > 1 && info.campaign) { const s = hits.filter((r) => nkey(r.campaign) === nkey(info.campaign)); if (s.length) hits = s; }
    return hits[0] || null;
  };
  const extraRow = (info) => {
    const key = nkey(info.ad) || "—";
    if (!extraRows[key]) {
      if (Object.keys(extraRows).length >= 15) return unmatched;
      extraRows[key] = Object.assign(blank(), { id: "x" + key, name: info.ad || "Reklama nomi yo'q", format: "Meta'da shu davrda topilmadi (sarf yo'q yoki nom boshqacha)", campaign: info.campaign || "—", adset: info.adset || "—" });
    }
    return extraRows[key];
  };

  // Tekshiruv uchun statistika
  const diag = { davr_kun: days, jami_lid: periodLeads.length, voronka_boyicha: {}, reklama_nomi_lid_maydonida: 0, reklama_nomi_kompaniya_maydonida: 0, reklama_nomi_yoq: 0, metaga_mos_keldi: 0, metaga_mos_kelmadi: 0, tegi_bor: 0 };
  const dTags = {}, dAds = {}, dMiss = {};

  periodLeads.forEach((l) => {
    const tagNames = ((l._embedded && l._embedded.tags) || []).map((t) => t.name);
    const adTags = tagNames.filter((t) => !ignore.includes(norm(t)));
    const hasCallTag = tagNames.some((t) => ignore.includes(norm(t)));
    const reached = new Set(events[l.id] ? Array.from(events[l.id]) : []);
    reached.add(l.pipeline_id + ":" + l.status_id);
    const isSale = hasAny(reached, ST.sale);
    const isVisit = isSale || hasAny(reached, ST.visit);
    const isOffer = isVisit || hasAny(reached, ST.offer);
    const isGood = isOffer || hasAny(reached, ST.info);
    const isContacted = isGood || hasAny(reached, ST.contacted);
    const isLost = l.status_id === LOST_ID;
    const reasonName = isLost && l._embedded && l._embedded.loss_reason && l._embedded.loss_reason[0] ? l._embedded.loss_reason[0].name : null;
    const rn = norm(reasonName);
    const isNoAns = isLost && cfg.reasonWords.noAnswer.some((w) => rn.includes(w));
    const isDup = isLost && cfg.reasonWords.duplicate.some((w) => rn.includes(w));
    const revenue = isSale ? Number(l.price) || 0 : 0;

    // Qaysi reklamaga tegishli
    let target = null;
    const info = byFields ? adInfo(l) : { ad: "", adset: "", campaign: "", from: "" };
    const hasField = !!(info.ad || info.adset || info.campaign);
    if (byFields && hasField) target = matchFields(info) || extraRow(info);
    if (!target && byTags && adTags.length) target = matchTags(adTags) || unmatched;

    // statistika
    diag.voronka_boyicha[pipeName(l)] = (diag.voronka_boyicha[pipeName(l)] || 0) + 1;
    if (tagNames.length) diag.tegi_bor++;
    tagNames.forEach((t) => { dTags[t] = (dTags[t] || 0) + 1; });
    if (byFields) {
      if (info.from === "lid") diag.reklama_nomi_lid_maydonida++; else if (info.from === "kompaniya") diag.reklama_nomi_kompaniya_maydonida++; else diag.reklama_nomi_yoq++;
      if (info.ad) { dAds[info.ad] = (dAds[info.ad] || 0) + 1; if (target && adRows.includes(target)) diag.metaga_mos_keldi++; else { diag.metaga_mos_kelmadi++; dMiss[info.ad] = (dMiss[info.ad] || 0) + 1; } }
    }

    const apply = (o) => {
      o.leads++; if (isGood) o.good++; if (isVisit) o.visits++; if (isSale) { o.sales++; o.revenue += revenue; }
      if (isNoAns) o.noAns++; else if (isDup) o.dup++; else if (isLost) o.lost++;
    };
    if (target) apply(target);
    else {
      calls.leads++; if (hasCallTag) calls.tag++; else calls.noTag++;
      if (isGood) calls.good++; if (isVisit) calls.visits++; if (isSale) { calls.sales++; calls.revenue += revenue; }
    }
    if (isContacted) mid.contacted++;
    if (isOffer) mid.offered++;
    const uname = users[l.responsible_user_id] || "Noma'lum";
    if (!ops[uname]) ops[uname] = { name: uname, leads: 0, good: 0, visits: 0, replyMin: null };
    ops[uname].leads++; if (isGood) ops[uname].good++; if (isVisit) ops[uname].visits++;
    if (reasonName) reasonCount[reasonName] = (reasonCount[reasonName] || 0) + 1;
  });
  Object.values(extraRows).forEach((r) => adRows.push(r));
  if (unmatched.leads > 0) adRows.push(unmatched);

  diag.manba_usuli = SRC.by;
  diag.eng_kop_teglar = top(dTags, 10);
  diag.eng_kop_reklama_nomlari = top(dAds, 12);
  diag.metada_topilmagan_nomlar = top(dMiss, 12);
  diag.meta_xato = metaError;
  diag.meta_reklamalar = metaAds.slice().sort((a, b) => b.spend - a.spend).slice(0, 15).map((a) => ({ nom: a.name, adset: a.adset, kampaniya: a.campaign, sarf: a.spend, meta_lid: a.metaLeads }));
  diag.sifatli = periodLeads.length ? adRows.reduce((s, r) => s + r.good, 0) + calls.good : 0;
  diag.keldi = adRows.reduce((s, r) => s + r.visits, 0) + calls.visits;
  diag.sotuv = adRows.reduce((s, r) => s + r.sales, 0) + calls.sales;

  return {
    mode: "live", periodLabel,
    freshness: "Ma'lumot yangilandi: " + String(now.hour).padStart(2, "0") + ":" + String(now.min).padStart(2, "0") + " (Meta va amoCRM, har so'rovda yangilanadi, 60 soniya kesh).",
    ads: adRows, calls, mid,
    operators: Object.values(ops).sort((a, b) => b.leads - a.leads),
    reasons: Object.keys(reasonCount).map((k) => ({ label: k, count: reasonCount[k] })).sort((a, b) => b.count - a.count).slice(0, 6),
    daily, todaySpend, accountCurrency, diag
  };
}
