// amoCRM webhook qabul qiluvchi: lid qo'shilganda yoki bosqichi o'zgarganda amoCRM shu manzilga xabar yuboradi,
// panel esa tegishli hodisani Meta Conversions API'ga uzatadi.
// Manzil (kaliti bilan) /api/capi sahifasida tayyor holda ko'rsatiladi.
// Har kelgan xabar hisoblanadi va natijasi yozib boriladi (/api/capi sahifasidagi "webhook" bo'limi).
import cfg from "../../../projects.config";
import { projectEnv } from "../../../lib/env";
import { capiEnv, hookKey, safeEqual, pushByIds } from "../../../lib/capi";
import { hookMark, hookNote, storeReady } from "../../../lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// amoCRM javobni 2 soniyada kutadi. Ish shu vaqtga sig'masa, javob qaytariladi va ish fonda davom etadi (Vercel waitUntil).
const REPLY_MS = 1500;
function runInBackground(promise) {
  try {
    const ctx = globalThis[Symbol.for("@vercel/request-context")];
    const c = ctx && ctx.get && ctx.get();
    if (c && typeof c.waitUntil === "function") { c.waitUntil(promise); return true; }
  } catch (e) { /* Vercel'dan tashqarida */ }
  return false;
}
const note = (slug, entry) => (storeReady() ? hookNote(slug, Object.assign({ t: new Date().toISOString() }, entry)).catch(() => {}) : Promise.resolve());

export async function POST(req) {
  const T0 = Date.now();
  const url = new URL(req.url);
  const p = cfg.projects.find((x) => x.slug === url.searchParams.get("p"));
  if (!p || !safeEqual(url.searchParams.get("k"), hookKey())) return Response.json({ ok: false, xato: "kalit noto'g'ri" }, { status: 403 });
  const form = new URLSearchParams(await req.text());
  const c = projectEnv(p);

  // Xabardagi lid id'lari va (bosqich o'zgargan bo'lsa) oldingi bosqichi
  const ids = new Set(), reached = {}, kinds = new Set();
  for (const [key, val] of form.entries()) {
    const m = /^leads\[(add|status|update)\]\[(\d+)\]\[id\]$/.exec(key);
    if (!m) continue;
    ids.add(String(val));
    kinds.add(m[1]);
    if (m[1] === "status") {
      const oldS = form.get(`leads[status][${m[2]}][old_status_id]`), oldP = form.get(`leads[status][${m[2]}][old_pipeline_id]`);
      if (oldS && oldP) reached[val] = new Set([oldP + ":" + oldS]);
    }
  }
  if (!ids.size) return Response.json({ ok: true, lid: 0 }); // bo'sh xabar (tekshiruv so'rovi)

  const base = { lid: Array.from(ids).slice(0, 5).join(","), tur: Array.from(kinds).join("+") };
  if (storeReady()) { try { await hookMark(p.slug); } catch (e) { /* hisoblagich yozilmasa ham ish davom etadi */ } }

  const sub = String(form.get("account[subdomain]") || "").toLowerCase();
  if (sub && c.amoSub && sub !== c.amoSub) { await note(p.slug, Object.assign({ natija: "rad etildi: boshqa amoCRM akkaunti" }, base)); return Response.json({ ok: false, xato: "boshqa amoCRM akkaunti" }, { status: 403 }); }
  if (!capiEnv(p).ok || !c.amoSub || !c.amoToken) { await note(p.slug, Object.assign({ natija: "o'tkazildi: Conversions API sozlanmagan" }, base)); return Response.json({ ok: true, otkazildi: "Conversions API sozlanmagan" }); }

  const attempt = async (tag) => {
    try {
      const r = await pushByIds(p, Array.from(ids), { reached, src: "hook" });
      const skip = Object.keys(r.otkazildi || {}).filter((k) => r.otkazildi[k] > 0);
      await note(p.slug, Object.assign({ natija: r.yuborildi > 0 ? "yuborildi" : r.xato > 0 ? "xato" : "hodisa ketmadi", yuborildi: r.yuborildi, bosqichlar: r.bosqichlar, sabab: skip, xato: r.xatolar && r.xatolar.length ? r.xatolar[0].xato : undefined, ms: Date.now() - T0 }, base, tag ? { urinish: tag } : {}));
      return r;
    } catch (e) {
      await note(p.slug, Object.assign({ natija: "xato", xato: String(e.message || e).slice(0, 200), ms: Date.now() - T0 }, base, tag ? { urinish: tag } : {}));
      return null;
    }
  };
  const job = (async () => {
    const r = await attempt("");
    // Yangi lidga kompaniya/kontakt bir necha soniyadan keyin bog'lanishi mumkin: reklama lidi deb tanilmagan bo'lsa, bir marta qayta uriniladi
    if (kinds.has("add") && r && r.yuborildi === 0 && (r.otkazildi.reklama_lidi_emas > 0 || r.otkazildi.telefon_va_lid_id_yoq > 0)) {
      await new Promise((res) => setTimeout(res, 5000));
      await attempt("qayta");
    }
  })();

  // Ish 1.5 soniyada tugasa, natija bilan javob qaytadi. Tugamasa, javob darhol qaytadi va ish fonda davom etadi.
  const done = await Promise.race([job.then(() => true), new Promise((res) => setTimeout(() => res(false), REPLY_MS))]);
  // Fonda davom ettirib bo'lmasa ham javob kechiktirilmaydi (amoCRM sekin javob beradigan hookni o'chirib qo'yadi); qolganini kunlik zaxira yo'li yuboradi
  if (!done) runInBackground(job);
  return Response.json({ ok: true, lid: ids.size, fonda: !done });
}

export async function GET() {
  return Response.json({ ok: true, izoh: "Bu manzil amoCRM webhook uchun (POST)." });
}
