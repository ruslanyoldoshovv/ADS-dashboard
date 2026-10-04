// Conversions API zaxira yo'li: /api/capi/sync?p=nexus-school&days=3
// Webhook biror hodisani o'tkazib yuborgan bo'lsa ham, shu yerda topilib Meta'ga yuboriladi.
//   &dry=1        -> hech narsa yuborilmaydi, faqat nechta hodisa ketishi ko'rsatiladi
//   &test=TEST123 -> hodisalar Events Manager > Test events bo'limiga tushadi (asosiy hisobga kirmaydi)
// Vercel har kuni ikki marta o'zi ham ishga tushiradi (vercel.json > crons).
import cfg from "../../../../projects.config";
import { projectEnv } from "../../../../lib/env";
import { capiEnv, syncProject, isAdmin } from "../../../../lib/capi";
import { lockTry, storeReady } from "../../../../lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req) {
  const url = new URL(req.url);
  const admin = isAdmin(req);

  // Avtomatik ishga tushish (parolsiz): hamma sozlangan loyihalar, 10 daqiqada ko'pi bilan bir marta, natija tafsilotsiz
  if (!admin) {
    if (!storeReady()) return Response.json({ ok: false });
    let free = false;
    try { free = await lockTry("capi-sync", 600); } catch (e) { free = false; }
    if (!free) return Response.json({ ok: true, band: true });
    let sent = 0;
    for (const p of cfg.projects) {
      const c = projectEnv(p);
      if (!capiEnv(p).ok || !c.amoSub || !c.amoToken) continue;
      try { sent += (await syncProject(p, { days: 7, src: "cron" })).yuborildi || 0; } catch (e) { /* keyingi safar qayta uriniladi */ }
    }
    return Response.json({ ok: true, yuborildi: sent });
  }

  const p = cfg.projects.find((x) => x.slug === (url.searchParams.get("p") || cfg.projects[0].slug));
  if (!p) return Response.json({ error: "Bunday loyiha yo'q" }, { status: 404 });
  const dry = url.searchParams.get("dry") === "1";
  const test = String(url.searchParams.get("test") || "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 40);
  if (!dry && !capiEnv(p).ok) return Response.json({ ok: false, sabab: "CAPI_DATASET_" + p.env + " va CAPI_TOKEN_" + p.env + " kiritilmagan. Avval &dry=1 bilan sinab ko'rishingiz mumkin." }, { status: 400 });
  try {
    const sum = await syncProject(p, { days: url.searchParams.get("days"), dry, testCode: test, src: "sync" });
    return Response.json(Object.assign({ ok: true, rejim: dry ? "faqat hisoblash (hech narsa yuborilmadi)" : test ? "sinov" : "yuborish" }, sum));
  } catch (e) {
    return Response.json({ ok: false, sabab: String(e.message || e).slice(0, 300) }, { status: 500 });
  }
}
