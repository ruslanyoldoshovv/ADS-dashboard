// Ulanishni tekshirish: /api/check?p=loyiha-1  (token ko'rsatilmaydi, faqat OK yoki xato matni)
import cfg from "../../../projects.config";
import { pingMeta } from "../../../lib/meta";
import { pingAmo, fetchPipelines } from "../../../lib/amo";
import { missingStages } from "../../../lib/stages";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const slug = new URL(req.url).searchParams.get("p") || cfg.projects[0].slug;
  const p = cfg.projects.find((x) => x.slug === slug);
  if (!p) return Response.json({ error: "Bunday loyiha yo'q", mavjud: cfg.projects.map((x) => x.slug) }, { status: 404 });
  const e = p.env;
  const env = {
    META_TOKEN: !!process.env["META_TOKEN_" + e], META_ACCOUNT: !!process.env["META_ACCOUNT_" + e],
    AMO_SUBDOMAIN: !!process.env["AMO_SUBDOMAIN_" + e], AMO_TOKEN: !!process.env["AMO_TOKEN_" + e]
  };
  const out = { loyiha: p.name, kiritilgan_o_zgaruvchilar: env };
  try {
    out.meta = env.META_TOKEN && env.META_ACCOUNT ? { ok: true, ...(await pingMeta({ token: process.env["META_TOKEN_" + e], account: process.env["META_ACCOUNT_" + e] })) } : { ok: false, sabab: "Token yoki akkaunt ID kiritilmagan" };
  } catch (err) { out.meta = { ok: false, sabab: String(err.message) }; }
  try {
    if (env.AMO_SUBDOMAIN && env.AMO_TOKEN) {
      const sub = process.env["AMO_SUBDOMAIN_" + e], tok = process.env["AMO_TOKEN_" + e];
      const acc = await pingAmo(sub, tok);
      const st = await fetchPipelines(sub, tok);
      const missing = missingStages(st.statuses, cfg.stages);
      out.amocrm = { ok: true, akkaunt: acc.name, voronkalar: st.pipelines, topilmagan_bosqichlar: missing };
    } else out.amocrm = { ok: false, sabab: "Subdomen yoki token kiritilmagan" };
  } catch (err) { out.amocrm = { ok: false, sabab: String(err.message) }; }
  return Response.json(out);
}
