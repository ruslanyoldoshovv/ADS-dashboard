// Bitrix24 REST (kiruvchi webhook orqali). Panel faqat O'QIYDI: CRM'da hech narsa o'zgartirilmaydi.
// Vercel: BITRIX_WEBHOOK_<env> = "https://kompaniya.bitrix24.ru/rest/1/xxxxxxxx/" (to'liq manzil, maxfiy)
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
  out.xodimlar_soni = await safe(async () => (await bxList(base, "user.get", { FILTER: { ACTIVE: true } }, 500)).length);
  return out;
}
