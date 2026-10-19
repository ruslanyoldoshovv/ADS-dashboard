// Kunlik hisobot: Vercel har kuni 09:00–10:00 (Toshkent) oralig'ida ishga tushiradi (vercel.json > crons).
// Har loyihaning kechagi hisoboti o'z guruhiga, adminga esa qisqa umumiy xulosa yuboriladi. Bir kunda bir marta.
import cfg from "../../../../projects.config";
import { tgSend, tgReady, esc } from "../../../../lib/telegram";
import { tgRead, lockTry, storeReady } from "../../../../lib/store";
import { buildReport, buildGroupReport, reportProjects, digestLine } from "../../../../lib/report";
import { tashkentNow } from "../../../../lib/calc";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  if (!tgReady() || !storeReady()) return Response.json({ ok: false });
  const n = tashkentNow(cfg);
  const day = n.y + "-" + (n.m + 1) + "-" + n.day;
  let free = false;
  try { free = await lockTry("tg-daily:" + day, 20 * 3600); } catch (e) { free = false; }
  if (!free) return Response.json({ ok: true, band: true });
  const S = await tgRead();
  const list = reportProjects();
  const res = await Promise.all(list.map(async (p) => {
    try {
      const r = await buildReport(p, "yesterday", { panel: S.panel });
      // Guruhga: qisqa hisobot (lid forma, Direct, jami). Sizga: to'liq xulosa
      if (S["group:" + p.slug]) await tgSend(S["group:" + p.slug], (await buildGroupReport(p, "yesterday")).text);
      return digestLine(p, r) + (S["group:" + p.slug] ? "" : " <i>(guruh ulanmagan)</i>");
    } catch (e) { return "• " + esc(p.short) + ": xato — " + esc(String(e.message || e).slice(0, 120)); }
  }));
  if (S.admin) { try { await tgSend(S.admin, "🌅 <b>Kechagi umumiy natija</b>\n" + res.join("\n") + "\n\nBatafsil: /kecha"); } catch (e) { /* o'tkazib yuboriladi */ } }
  return Response.json({ ok: true, loyihalar: list.length });
}
