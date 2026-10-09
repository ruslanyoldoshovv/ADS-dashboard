// Birinchi javob vaqtini hisoblash (admin):
//   /api/reply?p=nexus-school&days=30        -> oxirgi 30 kun (bugundan tashqari), hali hisoblanmagan kunlar. Vaqt yetmasa "qoldi" ko'rsatiladi: qayta oching.
//   /api/reply?p=nexus-school&day=2026-10-08&force=1 -> bitta kunni qayta hisoblash
// Har kuni 09:00 da avtomatik ham hisoblanadi (kechagi kun), /api/capi/sync orqali.
import cfg from "../../../projects.config";
import { storeReady, replyRead } from "../../../lib/store";
import { storeDays, lastDays, aggregate } from "../../../lib/reply";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req) {
  const u = new URL(req.url);
  const p = cfg.projects.find((x) => x.slug === (u.searchParams.get("p") || cfg.projects[0].slug));
  if (!p) return Response.json({ error: "Bunday loyiha yo'q" }, { status: 404 });
  if (!storeReady()) return Response.json({ ok: false, sabab: "Saqlash joyi (Upstash) ulanmagan" }, { status: 503 });
  const day = u.searchParams.get("day");
  const days = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? [day] : lastDays(Math.min(Math.max(Number(u.searchParams.get("days")) || 7, 1), 60), false);
  try {
    const r = await storeDays(p, days, { force: u.searchParams.get("force") === "1", budgetMs: 40000 });
    const agg = aggregate(await replyRead(p.slug, days));
    return Response.json(Object.assign({ ok: true }, r, {
      natija: { mediana_daqiqa: agg.median, javob_berilgan_lid: agg.n, javobsiz_lid: agg.none, kunlar: agg.days.length,
        operatorlar: Object.values(agg.ops).sort((a, b) => b.n - a.n).map((o) => ({ operator: o.name, mediana_daqiqa: o.median, lid: o.n })) }
    }, r.qoldi.length ? { eslatma: "Vaqt yetmadi: " + r.qoldi.length + " kun qoldi. Sahifani yana bir marta oching." } : {}));
  } catch (e) {
    return Response.json({ ok: false, sabab: String(e.message || e).slice(0, 300) }, { status: 500 });
  }
}
