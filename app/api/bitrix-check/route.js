// Bitrix24 ulanishini tekshirish va tuzilmani ko'rish: /api/bitrix-check?p=loyiha-3
// Webhook kaliti ko'rsatilmaydi. Faqat voronka/bosqich/maydon nomlari va sonlar.
import cfg from "../../../projects.config";
import { bitrixEnv, bitrixDiscover } from "../../../lib/bitrix";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req) {
  const slug = new URL(req.url).searchParams.get("p") || "loyiha-3";
  const p = cfg.projects.find((x) => x.slug === slug);
  if (!p) return Response.json({ error: "Bunday loyiha yo'q", mavjud: cfg.projects.map((x) => x.slug) }, { status: 404 });
  const base = bitrixEnv(p);
  if (!base) return Response.json({ loyiha: p.name, ok: false, sabab: "Vercel'da BITRIX_WEBHOOK_" + p.env + " kiritilmagan" });
  const host = base.replace(/^https?:\/\//, "").split("/")[0];
  try {
    return Response.json({ loyiha: p.name, ok: true, portal: host, ...(await bitrixDiscover(base)) });
  } catch (e) {
    return Response.json({ loyiha: p.name, ok: false, portal: host, sabab: String(e.message || e) });
  }
}
