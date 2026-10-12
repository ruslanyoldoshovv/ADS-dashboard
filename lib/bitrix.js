// Bitrix24 REST (kiruvchi webhook orqali). Panel faqat O'QIYDI: CRM'da hech narsa o'zgartirilmaydi.
// Vercel: BITRIX_WEBHOOK_<env> = "https://kompaniya.bitrix24.ru/rest/1/xxxxxxxx/" (to'liq manzil, maxfiy)
import { nkey } from "./stages";
const clean = (v) => String(v || "").trim();

// Webhook manzilini tozalash: oxiridagi metod nomi (crm.lead.list.json va h.k.) olib tashlanadi, "/" bilan tugaydi
export function bitrixBase(raw) {
  let s = clean(raw);
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  s = s.replace(/[?#].*$/, "").replace(/\/(crm|user|profile|app|batch|methods|scope)(\.[\w.]*)?\/?$/i, "/");
  if (!s.endsWith("/")) s += "/";
  return s;
}

export const bitrixEnv = (p) => bitrixBase(process.env["BITRIX_WEBHOOK_" + p.env]);

// Xato matnida webhook kaliti ko'rinmasligi uchun
const hide = (msg) => String(msg || "").replace(/\/rest\/\d+\/[^/\s"]+/g, "/rest/*/***");

async function call(base, method, params) {
  const res = await fetch(base + method + ".json", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params || {}),
    cache: "no-store"
  });
  let j = null;
  try { j = await res.json(); } catch (e) { /* bo'sh javob */ }
  if (!res.ok || !j || j.error) {
    const m = j && (j.error_description || j.error) ? (j.error_description || j.error) : "HTTP " + res.status;
    throw new Error("Bitrix24 (" + method + "): " + hide(m));
  }
  return j;
}

// Ro'yxat metodlari 50 tadan qaytaradi: start bilan sahifalab o'qiladi (cheklov: maxRows)
export async function bxList(base, method, params, maxRows) {
  const max = maxRows || 5000;
  let start = 0, out = [], guard = 0;
  while (guard++ < 200) {
    const j = await call(base, method, Object.assign({}, params, { start }));
    const rows = Array.isArray(j.result) ? j.result : (j.result && (j.result.items || j.result.stages || j.result.categories)) || [];
    out = out.concat(rows);
    if (j.next == null || out.length >= max) break;
    start = j.next;
  }
  return out;
}

export const bxCall = call;

// ---------------------------------------------------------------------
// Tuzilmani o'rganish (sozlash uchun): voronkalar, bosqichlar, maydonlar, xodimlar, oxirgi 30 kun soni.
// Qiymatlarning o'zi (telefon, ism) ko'rsatilmaydi, faqat nomlar va sonlar.
// ---------------------------------------------------------------------
export async function bitrixDiscover(base) {
  const safe = async (fn) => { try { return await fn(); } catch (e) { return { xato: hide(String(e.message || e)).slice(0, 200) }; } };
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const out = {};
  out.profil = await safe(async () => { const j = await call(base, "profile"); return { admin: !!j.result.ADMIN }; });
  out.ruxsatlar = await safe(async () => (await call(base, "scope")).result);

  // Lidlar (crm.lead) va sdelkalar (crm.deal): qaysi biri ishlatilyapti
  out.oxirgi_30_kun = await safe(async () => {
    const [l, d] = await Promise.all([
      call(base, "crm.lead.list", { filter: { ">=DATE_CREATE": since }, select: ["ID"] }).catch(() => ({ total: null })),
      call(base, "crm.deal.list", { filter: { ">=DATE_CREATE": since }, select: ["ID"] }).catch(() => ({ total: null }))
    ]);
    return { lidlar: l.total, sdelkalar: d.total };
  });

  // Lid holatlari (STATUS) va sdelka voronkalari + bosqichlari
  out.lid_holatlari = await safe(async () => (await bxList(base, "crm.status.list", { filter: { ENTITY_ID: "STATUS" }, order: { SORT: "ASC" } })).map((s) => ({ id: s.STATUS_ID, nom: s.NAME, semantika: s.SEMANTICS || (s.EXTRA && s.EXTRA.SEMANTICS) || "" })));
  out.sdelka_voronkalari = await safe(async () => {
    let cats = [];
    try { cats = (await call(base, "crm.category.list", { entityTypeId: 2 })).result.categories || []; } catch (e) { cats = []; }
    if (!cats.some((c) => Number(c.id) === 0)) cats.unshift({ id: 0, name: "Asosiy voronka" });
    const stages = await bxList(base, "crm.status.list", { order: { SORT: "ASC" } });
    return cats.map((c) => {
      const ent = Number(c.id) === 0 ? "DEAL_STAGE" : "DEAL_STAGE_" + c.id;
      return { id: Number(c.id), nom: c.name, bosqichlar: stages.filter((s) => s.ENTITY_ID === ent).map((s) => ({ id: s.STATUS_ID, nom: s.NAME, semantika: s.SEMANTICS || (s.EXTRA && s.EXTRA.SEMANTICS) || "" })) };
    });
  });
  out.manbalar = await safe(async () => (await bxList(base, "crm.status.list", { filter: { ENTITY_ID: "SOURCE" } })).map((s) => ({ id: s.STATUS_ID, nom: s.NAME })));

  // Maydonlar: standart UTM maydonlari va qo'shimcha (UF_CRM_...) maydonlar nomi
  const fieldsOf = async (method) => {
    const f = (await call(base, method)).result || {};
    return Object.keys(f).filter((k) => k.startsWith("UF_") || k.startsWith("UTM_") || ["SOURCE_ID", "SOURCE_DESCRIPTION", "OPPORTUNITY", "ASSIGNED_BY_ID", "STATUS_ID", "STAGE_ID", "CATEGORY_ID", "LEAD_ID"].includes(k))
      .map((k) => ({ kod: k, nom: f[k].formLabel || f[k].listLabel || f[k].title || k, tur: f[k].type, variantlar: Array.isArray(f[k].items) ? f[k].items.slice(0, 30).map((i) => i.VALUE) : undefined }));
  };
  out.lid_maydonlari = await safe(() => fieldsOf("crm.lead.fields"));
  out.sdelka_maydonlari = await safe(() => fieldsOf("crm.deal.fields"));

  // Oxirgi 30 kundagi lidlarda UTM qanchalik to'ldirilgan (qiymatlar: faqat reklama nomlari, eng ko'p 10 tasi)
  out.utm_namuna = await safe(async () => {
    const rows = await bxList(base, "crm.lead.list", { filter: { ">=DATE_CREATE": since }, select: ["ID", "UTM_SOURCE", "UTM_MEDIUM", "UTM_CAMPAIGN", "UTM_CONTENT", "UTM_TERM", "SOURCE_ID"] }, 1000);
    const cnt = (k) => rows.filter((r) => clean(r[k])).length;
    const top = (k) => { const m = {}; rows.forEach((r) => { const v = clean(r[k]); if (v) m[v] = (m[v] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([nom, soni]) => ({ nom, soni })); };
    return { korilgan_lidlar: rows.length, utm_source: cnt("UTM_SOURCE"), utm_campaign: cnt("UTM_CAMPAIGN"), utm_content: cnt("UTM_CONTENT"), utm_term: cnt("UTM_TERM"), eng_kop_utm_source: top("UTM_SOURCE"), eng_kop_utm_content: top("UTM_CONTENT"), eng_kop_manba: top("SOURCE_ID") };
  });
  // Sdelkalar namunasi (oxirgi 30 kun, 1000 tagacha): UTM, manba, "qayerdan eshitdi" kabi maydonlar qanchalik to'ldirilgan
  out.sdelka_namuna = await safe(async () => {
    const f = (await call(base, "crm.deal.fields")).result || {};
    const uf = Object.keys(f).filter((k) => k.startsWith("UF_") && ["enumeration", "string", "crm_lead"].includes(f[k].type));
    const rows = await bxList(base, "crm.deal.list", { filter: { ">=DATE_CREATE": since }, order: { ID: "DESC" }, select: ["ID", "CATEGORY_ID", "STAGE_ID", "SOURCE_ID", "LEAD_ID", "OPPORTUNITY", "UTM_SOURCE", "UTM_MEDIUM", "UTM_CAMPAIGN", "UTM_CONTENT", "UTM_TERM"].concat(uf) }, 1000);
    const label = (k, v) => { const it = Array.isArray(f[k] && f[k].items) ? f[k].items.find((i) => String(i.ID) === String(v)) : null; return it ? it.VALUE : v; };
    const top = (k, n) => { const m = {}; rows.forEach((r) => { let v = r[k]; if (Array.isArray(v)) v = v[0]; v = clean(v); if (v) { v = label(k, v); m[v] = (m[v] || 0) + 1; } }); return Object.entries(m).sort((x, y) => y[1] - x[1]).slice(0, n || 10).map(([nom, soni]) => ({ nom: String(nom).slice(0, 80), soni })); };
    const filled = {}; uf.concat(["UTM_SOURCE", "UTM_CAMPAIGN", "UTM_CONTENT", "UTM_TERM", "LEAD_ID"]).forEach((k) => { const c = rows.filter((r) => { const v = Array.isArray(r[k]) ? r[k][0] : r[k]; return clean(v) && clean(v) !== "0"; }).length; if (c) filled[(f[k] && (f[k].formLabel || f[k].listLabel || f[k].title)) ? k + " · " + (f[k].formLabel || f[k].listLabel || f[k].title) : k] = c; });
    return {
      korilgan: rows.length, toldirilgan_maydonlar: filled,
      voronka: top("CATEGORY_ID"), bosqich: top("STAGE_ID", 30), manba: top("SOURCE_ID"),
      utm_source: top("UTM_SOURCE"), utm_campaign: top("UTM_CAMPAIGN"), utm_content: top("UTM_CONTENT"), utm_term: top("UTM_TERM"),
      qayerdan_eshitdi: top("UF_CRM_1678555479910"), qongiroq_manbasi: top("UF_CRM_1730467483246"), mijoz_turi: top("UF_CRM_1691151409806"),
      summa_bor: rows.filter((r) => Number(r.OPPORTUNITY) > 0).length
    };
  });
  out.xodimlar_soni = await safe(async () => (await bxList(base, "user.get", { FILTER: { ACTIVE: true } }, 500)).length);
  return out;
}

// ---------------------------------------------------------------------
// Panel uchun: Bitrix24 sdelkalarini amoCRM lid ko'rinishiga keltirish (panelning qolgan hisobi o'zgarmaydi)
// ---------------------------------------------------------------------

// Ichma-ich parametrlarni so'rov qatoriga aylantirish (batch buyruqlari uchun): filter[>=DATE_CREATE]=..., select[0]=...
function qs(obj, prefix) {
  const out = [];
  Object.keys(obj || {}).forEach((k) => {
    const v = obj[k], key = prefix ? prefix + "[" + k + "]" : k;
    if (v == null) return;
    if (typeof v === "object") out.push(qs(v, key));
    else out.push(encodeURIComponent(key) + "=" + encodeURIComponent(v));
  });
  return out.filter(Boolean).join("&");
}

// Katta ro'yxatni tez o'qish: 1-sahifadan jami son olinadi, qolgan sahifalar batch orqali 50 tadan buyruq bilan
async function bigList(base, method, params, rowsOf, maxRows) {
  const max = maxRows || 20000;
  const first = await call(base, method, Object.assign({}, params, { start: 0 }));
  let out = rowsOf(first.result);
  const total = Math.min(Number(first.total) || out.length, max);
  const starts = [];
  for (let s = 50; s < total; s += 50) starts.push(s);
  for (let i = 0; i < starts.length; i += 50) {
    const cmd = {};
    starts.slice(i, i + 50).forEach((s, n) => { cmd["c" + n] = method + "?" + qs(Object.assign({}, params, { start: s })); });
    const j = await call(base, "batch", { halt: 0, cmd });
    const res = (j.result && j.result.result) || {};
    Object.keys(cmd).forEach((k) => { out = out.concat(rowsOf(res[k])); });
  }
  return out;
}

const OFF = 5 * 3600; // Toshkent vaqti (UTC+5)
const isoOf = (ts) => new Date((ts + OFF) * 1000).toISOString().slice(0, 19) + "+05:00";
const tsOf = (s) => Math.floor(Date.parse(s) / 1000);

// Voronka va bosqichlar: amoCRM fetchPipelines bilan bir xil shakl
export async function bxPipelines(base, B) {
  let cats = [];
  try { cats = (await call(base, "crm.category.list", { entityTypeId: 2 })).result.categories || []; } catch (e) { cats = []; }
  if (!cats.some((c) => Number(c.id) === 0)) cats.unshift({ id: 0, name: "Asosiy voronka" });
  const stages = await bxList(base, "crm.status.list", { order: { SORT: "ASC" } });
  const statuses = {}, pipelines = [], pipelineNames = {}, stageNames = {}, semantics = {};
  cats.forEach((c) => {
    pipelines.push(c.name); pipelineNames[c.id] = c.name;
    const ent = Number(c.id) === 0 ? "DEAL_STAGE" : "DEAL_STAGE_" + c.id;
    stages.filter((s) => s.ENTITY_ID === ent).forEach((s) => {
      const key = c.id + ":" + s.STATUS_ID;
      statuses[key] = { name: nkey(s.NAME), pipeline: nkey(c.name) };
      stageNames[key] = s.NAME;
      semantics[key] = s.SEMANTICS || (s.EXTRA && s.EXTRA.SEMANTICS) || "";
    });
  });
  return { statuses, pipelines, pipelineNames, stageNames, semantics };
}

// Sdelkalar -> lid ko'rinishi. B: loyiha sozlamasi (p.bitrix)
//  - status_id: Bitrix bosqich kodi, pipeline_id: voronka ID
//  - custom_fields_values: utm_content (reklama ID), utm_term (ad set ID), utm_campaign (kampaniya ID), utm_source
//  - _lost: yopilgan (F semantika), "rad etish" yoki sifatsiz bosqichda; _bad: sifatsiz bosqichda; _returned: qaytgan buyurtma
//  - _embedded.loss_reason: shu bosqich nomi (panelda LOST sabablari ro'yxati uchun)
export async function bxLeads(base, B, pipes, fromTs, toTs) {
  const filter = { ">=DATE_CREATE": isoOf(fromTs), "<=DATE_CREATE": isoOf(toTs) };
  if (B.categories && B.categories.length) filter.CATEGORY_ID = B.categories;
  const extra = [B.sourceField, B.lossField].filter(Boolean);
  const select = ["ID", "CATEGORY_ID", "STAGE_ID", "DATE_CREATE", "ASSIGNED_BY_ID", "OPPORTUNITY", "UTM_SOURCE", "UTM_CAMPAIGN", "UTM_CONTENT", "UTM_TERM"].concat(extra);
  const rows = await bigList(base, "crm.deal.list", { filter, select, order: { ID: "ASC" } }, (r) => (Array.isArray(r) ? r : []));
  // Manba maydoni ro'yxat bo'lsa: ID -> nom
  let srcItems = {};
  if (B.sourceField) {
    try { const f = (await call(base, "crm.deal.fields")).result[B.sourceField]; (f && f.items || []).forEach((i) => { srcItems[String(i.ID)] = i.VALUE; }); } catch (e) { srcItems = {}; }
  }
  const S = new Set((B.badStages || []).map(nkey)), L = new Set((B.lostStages || []).map(nkey)), R = new Set((B.returnStages || []).map(nkey));
  const adSrc = new Set((B.adSourceValues || []).map(nkey));
  return rows.map((d) => {
    const key = d.CATEGORY_ID + ":" + d.STAGE_ID;
    const stName = pipes.stageNames[key] || d.STAGE_ID, nk = nkey(stName);
    const sem = pipes.semantics[key] || "";
    const bad = S.has(nk), returned = R.has(nk);
    const lost = !returned && (bad || L.has(nk) || sem === "F");
    let src = d[B.sourceField]; if (Array.isArray(src)) src = src[0]; src = srcItems[String(src)] || src || "";
    const cf = (name, value) => ({ field_name: name, values: [{ value: value == null ? "" : String(value) }] });
    const utmAd = String(d.UTM_CONTENT || "").trim();
    // UTM yo'q, lekin manba maydonida "Target" belgilangan: reklama lidi, aniq reklamasi noma'lum
    const adName = utmAd || (adSrc.has(nkey(src)) ? "UTM'siz: " + src : "");
    return {
      id: Number(d.ID), created_at: tsOf(d.DATE_CREATE), pipeline_id: Number(d.CATEGORY_ID) || 0, status_id: d.STAGE_ID,
      responsible_user_id: d.ASSIGNED_BY_ID, price: Number(d.OPPORTUNITY) || 0,
      custom_fields_values: [cf("utm_content", adName), cf("utm_term", d.UTM_TERM), cf("utm_campaign", d.UTM_CAMPAIGN), cf("utm_source", d.UTM_SOURCE), cf("Manba", src)],
      _embedded: { tags: [], companies: [], loss_reason: lost ? [{ name: stName }] : [] },
      _lost: lost, _bad: bad, _returned: returned
    };
  });
}

// Bosqich tarixi: { sdelkaId: Set("voronka:bosqich") } — sdelka qaysi bosqichlardan o'tgan (amoCRM fetchStatusEvents bilan bir xil shakl)
export async function bxStageEvents(base, fromTs, wanted) {
  const want = wanted && wanted.length ? new Set(wanted) : null;
  const rows = await bigList(base, "crm.stagehistory.list", { entityTypeId: 2, filter: { ">=CREATED_TIME": isoOf(fromTs) }, select: ["OWNER_ID", "STAGE_ID", "CATEGORY_ID"], order: { ID: "ASC" } }, (r) => (r && r.items) || [], 60000);
  const out = {};
  rows.forEach((h) => {
    const k = (Number(h.CATEGORY_ID) || 0) + ":" + h.STAGE_ID;
    if (want && !want.has(k)) return;
    (out[h.OWNER_ID] = out[h.OWNER_ID] || new Set()).add(k);
  });
  return out;
}
