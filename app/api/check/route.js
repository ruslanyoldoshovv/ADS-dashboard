// Ulanishni tekshirish: /api/check?p=nexus-school  (token ko'rsatilmaydi, faqat OK yoki xato matni)
import cfg from "../../../projects.config";
import { pingMeta } from "../../../lib/meta";
import { pingAmo, fetchPipelines, fetchCustomFields, fetchPipelineStages } from "../../../lib/amo";
import { projectEnv } from "../../../lib/env";
import { getProjectData } from "../../../lib/data";
import { resolveRange } from "../../../lib/range";
import { tashkentNow } from "../../../lib/calc";

export const maxDuration = 60;
import { missingStages } from "../../../lib/stages";
import { storeReady } from "../../../lib/store";
import { getUsdRate } from "../../../lib/rate";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const slug = new URL(req.url).searchParams.get("p") || cfg.projects[0].slug;
  const p = cfg.projects.find((x) => x.slug === slug);
  if (!p) return Response.json({ error: "Bunday loyiha yo'q", mavjud: cfg.projects.map((x) => x.slug) }, { status: 404 });
  const c = projectEnv(p);
  const env = { META_TOKEN: !!c.metaToken, META_ACCOUNT: !!c.metaAccount, AMO_SUBDOMAIN: !!c.amoSub, AMO_TOKEN: !!c.amoToken };
  const want = p.currency === "USD" ? "USD" : "UZS";
  const out = { loyiha: p.name, kiritilgan_o_zgaruvchilar: env, sozlamadagi_valyuta: want, reja_saqlash_joyi_ulangan: storeReady() };
  if (want === "USD") out.dollar_kursi = await getUsdRate(cfg);
  try {
    out.meta = env.META_TOKEN && env.META_ACCOUNT ? { ok: true, ...(await pingMeta({ token: c.metaToken, account: c.metaAccount })) } : { ok: false, sabab: "Token yoki akkaunt ID kiritilmagan" };
  } catch (err) { out.meta = { ok: false, sabab: String(err.message) }; }
  if (out.meta.ok) out.meta.valyuta_mos = out.meta.currency === want;
  try {
    if (env.AMO_SUBDOMAIN && env.AMO_TOKEN) {
      const sub = c.amoSub, tok = c.amoToken;
      const acc = await pingAmo(sub, tok);
      const st = await fetchPipelines(sub, tok);
      const missing = missingStages(st.statuses, cfg.stages);
      out.amocrm = { ok: true, akkaunt: acc.name, voronkalar: st.pipelines, topilmagan_bosqichlar: missing };
      // Sozlash uchun ma'lumot: bosqich nomlari va qo'shimcha maydon nomlari (qiymatlar emas)
      const safe = async (fn) => { try { return await fn(); } catch (x) { return "o'qilmadi: " + String(x.message).slice(0, 120); } };
      out.amocrm.bosqichlar = await safe(() => fetchPipelineStages(sub, tok));
      out.amocrm.maydonlar = {
        bitim: await safe(() => fetchCustomFields(sub, tok, "leads")),
        kontakt: await safe(() => fetchCustomFields(sub, tok, "contacts")),
        kompaniya: await safe(() => fetchCustomFields(sub, tok, "companies"))
      };
    } else out.amocrm = { ok: false, sabab: "Subdomen yoki token kiritilmagan" };
  } catch (err) { out.amocrm = { ok: false, sabab: String(err.message) }; }
  // Oxirgi kunlardagi lidlar bo'yicha namuna: reklama nomi qayerda turibdi va Meta bilan mos kelyaptimi
  if (out.amocrm.ok) {
    try {
      // Davr: ?r=month (standart), ?r=30d, yoki ?from=2026-09-01&to=2026-09-30
      const q = new URL(req.url).searchParams;
      const range = resolveRange({ r: q.get("r") || (q.get("days") === "30" ? "30d" : q.get("days") === "1" ? "today" : q.get("days") === "7" ? "7d" : "month"), from: q.get("from"), to: q.get("to") }, tashkentNow(cfg));
      const D = await getProjectData(p, range, { tolerant: true });
      out.namuna = D.diag || { izoh: "Namuna rejimi: haqiqiy ulanish yo'q" };
    } catch (err) { out.namuna = { ok: false, sabab: String(err.message) }; }
  }
  return Response.json(out);
}
