// Jadval ustunlari tartibi va yashirilganlari (hamma uchun bir xil, loyiha bo'yicha saqlanadi)
// GET /api/columns?p=nexus-school   POST {p, order: [...], hidden: [...]} yoki {p, reset: true}
import cfg from "../../../projects.config";
import { colsRead, colsWrite, storeReady } from "../../../lib/store";

export const dynamic = "force-dynamic";
const KEY = /^[a-zA-Z]{2,12}$/;

export async function GET(req) {
  const slug = new URL(req.url).searchParams.get("p");
  if (!cfg.projects.some((x) => x.slug === slug)) return Response.json({ ok: false }, { status: 404 });
  return Response.json({ ok: true, layout: storeReady() ? await colsRead(slug) : null });
}

export async function POST(req) {
  let b = {};
  try { b = await req.json(); } catch (e) { return Response.json({ ok: false, error: "JSON xato" }, { status: 400 }); }
  if (!cfg.projects.some((x) => x.slug === b.p)) return Response.json({ ok: false, error: "Loyiha yo'q" }, { status: 404 });
  if (!storeReady()) return Response.json({ ok: false, error: "Saqlash joyi ulanmagan" }, { status: 503 });
  try {
    if (b.reset) { await colsWrite(b.p, null); return Response.json({ ok: true }); }
    const clean = (a) => (Array.isArray(a) ? a.filter((k) => typeof k === "string" && KEY.test(k)).slice(0, 40) : []);
    await colsWrite(b.p, { order: clean(b.order), hidden: clean(b.hidden) });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
