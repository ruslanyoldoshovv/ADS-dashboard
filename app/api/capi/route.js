// Conversions API holati: /api/capi?p=nexus-school
// Ko'rsatadi: sozlama to'liqmi, amoCRM'ga qo'yiladigan webhook manzili, oxirgi yuborilgan hodisalar.
import cfg from "../../../projects.config";
import { projectEnv } from "../../../lib/env";
import { capiEnv, capiConf, hookKey, pingDataset } from "../../../lib/capi";
import { fetchCustomFields } from "../../../lib/amo";
import { nkey } from "../../../lib/stages";
import { storeReady, sentCount, logRead, hookRead } from "../../../lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("p") || cfg.projects[0].slug;
  const p = cfg.projects.find((x) => x.slug === slug);
  if (!p) return Response.json({ error: "Bunday loyiha yo'q", mavjud: cfg.projects.map((x) => x.slug) }, { status: 404 });
  const env = capiEnv(p), c = projectEnv(p), C = capiConf(p);
  const origin = (req.headers.get("x-forwarded-proto") || "https") + "://" + (req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host);
  const out = {
    loyiha: p.name,
    kiritilgan_o_zgaruvchilar: { ["CAPI_DATASET_" + p.env]: !!env.dataset, ["CAPI_TOKEN_" + p.env]: !!env.token, ["CAPI_TEST_CODE_" + p.env]: env.testCode ? "bor (sinov rejimi yoqilgan)" : "yo'q (oddiy rejim)" },
    saqlash_joyi_ulangan: storeReady(),
    hodisa_nomlari: C.events,
    faqat_reklama_lidlari: !!C.onlyAdLeads
  };
  if (env.ok) {
    try { out.dataset = { ok: true, nomi: await pingDataset(env) }; } catch (e) { out.dataset = { ok: false, sabab: String(e.message) }; }
  } else out.dataset = { ok: false, sabab: "Dataset ID yoki token kiritilmagan" };

  // "Meta lead ID" maydoni amoCRM'da bormi
  if (c.amoSub && c.amoToken) {
    const want = C.leadId.map(nkey), found = [];
    for (const ent of ["leads", "contacts", "companies"]) {
      try { (await fetchCustomFields(c.amoSub, c.amoToken, ent)).forEach((f) => { if (want.includes(nkey(f.nom))) found.push(ent + ": " + f.nom); }); } catch (e) { /* o'qilmadi */ }
    }
    out.meta_lead_id_maydoni = found.length ? { bor: true, qayerda: found } : { bor: false, izoh: "Maydon yo'q: hodisalar telefon raqami xeshi bilan yuboriladi. Aniqlik uchun lidda '" + C.leadId[0] + "' maydonini oching va Sheets skripti unga 'id' ustunini yozsin." };
  }

  const key = hookKey();
  out.amocrm_webhook = key
    ? { manzil: origin + "/api/amo-webhook?p=" + p.slug + "&k=" + key, hodisalar: ["Сделка добавлена", "Статус сделки изменен"], izoh: "amoCRM > Настройки > Интеграции > Web hooks. Bu manzilni hech kimga bermang." }
    : { manzil: null, izoh: "DASH_PASSWORD o'rnatilmagan" };
  out.qolda_ishga_tushirish = {
    faqat_hisoblash: origin + "/api/capi/sync?p=" + p.slug + "&days=3&dry=1",
    yuborish: origin + "/api/capi/sync?p=" + p.slug + "&days=3",
    sinov_kodi_bilan: origin + "/api/capi/sync?p=" + p.slug + "&days=1&test=TEST_KODINGIZ"
  };
  if (storeReady()) {
    // Webhook diagnostikasi: amoCRM'dan nechta xabar kelgan va har biri bilan nima bo'lgan
    try { out.webhook = await hookRead(p.slug, 15); } catch (e) { out.webhook = { xato: String(e.message) }; }
    try { out.jami_yuborilgan_hodisa = await sentCount(p.slug); out.oxirgi_yozuvlar = await logRead(p.slug, 30); }
    catch (e) { out.jurnal_xatosi = String(e.message); }
  }
  return Response.json(out);
}
