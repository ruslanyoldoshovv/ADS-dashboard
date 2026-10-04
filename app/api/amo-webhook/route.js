// amoCRM webhook qabul qiluvchi: lid qo'shilganda yoki bosqichi o'zgarganda amoCRM shu manzilga xabar yuboradi,
// panel esa tegishli hodisani Meta Conversions API'ga uzatadi.
// Manzil (kaliti bilan) /api/capi sahifasida tayyor holda ko'rsatiladi.
import cfg from "../../../projects.config";
import { projectEnv } from "../../../lib/env";
import { capiEnv, hookKey, safeEqual, pushByIds } from "../../../lib/capi";
import { logPush } from "../../../lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// amoCRM javobni 2 soniyada kutadi. Shuning uchun darhol "ok" qaytariladi, ish esa fonda davom etadi (Vercel waitUntil).
function runInBackground(promise) {
  try {
    const ctx = globalThis[Symbol.for("@vercel/request-context")];
    const c = ctx && ctx.get && ctx.get();
    if (c && typeof c.waitUntil === "function") { c.waitUntil(promise); return true; }
  } catch (e) { /* Vercel'dan tashqarida */ }
  return false;
}

export async function POST(req) {
  const url = new URL(req.url);
  const p = cfg.projects.find((x) => x.slug === url.searchParams.get("p"));
  if (!p || !safeEqual(url.searchParams.get("k"), hookKey())) return Response.json({ ok: false, xato: "kalit noto'g'ri" }, { status: 403 });
  const form = new URLSearchParams(await req.text());
  const c = projectEnv(p);
  const sub = String(form.get("account[subdomain]") || "").toLowerCase();
  if (sub && c.amoSub && sub !== c.amoSub) return Response.json({ ok: false, xato: "boshqa amoCRM akkaunti" }, { status: 403 });

  // Xabardagi lid id'lari va (bosqich o'zgargan bo'lsa) oldingi bosqichi
  const ids = new Set(), reached = {};
  let added = false;
  for (const [key, val] of form.entries()) {
    const m = /^leads\[(add|status|update)\]\[(\d+)\]\[id\]$/.exec(key);
    if (!m) continue;
    ids.add(String(val));
    if (m[1] === "add") added = true;
    if (m[1] === "status") {
      const oldS = form.get(`leads[status][${m[2]}][old_status_id]`), oldP = form.get(`leads[status][${m[2]}][old_pipeline_id]`);
      if (oldS && oldP) reached[val] = new Set([oldP + ":" + oldS]);
    }
  }
  if (!ids.size) return Response.json({ ok: true, lid: 0 });
  if (!capiEnv(p).ok || !c.amoSub || !c.amoToken) return Response.json({ ok: true, otkazildi: "Conversions API sozlanmagan" });

  const job = (async () => {
    // Yangi lidga kompaniya/kontakt bir necha soniyadan keyin bog'lanishi mumkin, shuning uchun biroz kutiladi
    if (added) await new Promise((r) => setTimeout(r, 4000));
    try { await pushByIds(p, Array.from(ids), { reached, src: "hook" }); }
    catch (e) { try { await logPush(p.slug, [{ t: new Date().toISOString(), lid: Array.from(ids).slice(0, 5).join(","), b: [], ok: false, x: String(e.message || e).slice(0, 200), s: "hook" }]); } catch (x) { /* jurnal ham yozilmadi */ } }
  })();
  if (!runInBackground(job)) await job;
  return Response.json({ ok: true, lid: ids.size });
}

export async function GET() {
  return Response.json({ ok: true, izoh: "Bu manzil amoCRM webhook uchun (POST)." });
}
