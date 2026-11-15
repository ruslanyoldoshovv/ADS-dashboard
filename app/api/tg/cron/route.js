// Kunlik hisobot: Vercel har kuni 09:00–10:00 (Toshkent) oralig'ida ishga tushiradi (vercel.json > crons).
// Har loyihaning kechagi hisoboti o'z guruhiga, adminga esa qisqa umumiy xulosa yuboriladi. Bir kunda bir marta.
import cfg from "../../../../projects.config";
import { tgSend, tgReady, esc } from "../../../../lib/telegram";
import { tgRead, lockTry, storeReady } from "../../../../lib/store";
import { buildReport, buildGroupReport, reportProjects, digestLine } from "../../../../lib/report";
import { tashkentNow } from "../../../../lib/calc";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Xato matnini tushunarli sababga aylantirish
function reason(m) {
  const s = String(m || "");
  if (/API access blocked/i.test(s)) return "Meta tokeni bloklangan: yangi system user tokeni kerak (Vercel'da META_TOKEN_...).";
  if (/expired|Session has|invalid.*token|OAuth/i.test(s)) return "Meta tokeni eskirgan yoki noto'g'ri: yangi token kerak.";
  if (/permission|not authorized|does not exist|Unsupported get request/i.test(s)) return "Token reklama akkauntiga ruxsatga ega emas: akkauntni system userga biriktiring.";
  if (/disabled|unsettled|payment/i.test(s)) return "Reklama akkaunti to'xtatilgan yoki to'lov muammosi.";
  if (/amo|bitrix|crm/i.test(s)) return "CRM'dan ma'lumot o'qilmadi.";
  return "Ma'lumot o'qilmadi.";
}

export async function GET() {
  if (!tgReady() || !storeReady()) return Response.json({ ok: false });
  const n = tashkentNow(cfg);
  const day = n.y + "-" + (n.m + 1) + "-" + n.day;
  let free = false;
  try { free = await lockTry("tg-daily:" + day, 20 * 3600); } catch (e) { free = false; }
  if (!free) return Response.json({ ok: true, band: true });
  const S = await tgRead();
  const list = reportProjects();
  const fails = []; // hisobot tayyorlanmagan loyihalar: adminga alohida ogohlantirish ketadi
  const res = await Promise.all(list.map(async (p) => {
    try {
      const r = await buildReport(p, "yesterday", { panel: S.panel });
      // Guruhga: qisqa hisobot (lid forma, Direct, jami). Sizga: to'liq xulosa
      if (S["group:" + p.slug]) await tgSend(S["group:" + p.slug], (await buildGroupReport(p, "yesterday")).text);
      return digestLine(p, r) + (S["group:" + p.slug] ? "" : " <i>(guruh ulanmagan)</i>");
    } catch (e) {
      const msg = String(e.message || e);
      fails.push({ p, msg, group: !!S["group:" + p.slug] });
      return "• " + esc(p.short) + ": ❌ " + esc(reason(msg));
    }
  }));
  if (S.admin) { try { await tgSend(S.admin, "🌅 <b>Kechagi umumiy natija</b>\n" + res.join("\n") + "\n\nBatafsil: /kecha"); } catch (e) { /* o'tkazib yuboriladi */ } }
  // Xato bo'lgan har bir loyiha uchun alohida, ko'zga tashlanadigan ogohlantirish (guruhga hech narsa ketmagani aytiladi)
  if (S.admin) {
    for (const f of fails) {
      const t = "🚨 <b>" + esc(f.p.name) + "</b>: kechagi hisobot tayyorlanmadi" + (f.group ? ", guruhga <b>yuborilmadi</b>" : "") + ".\n"
        + "Sabab: " + esc(reason(f.msg)) + "\n"
        + "<i>" + esc(f.msg.slice(0, 200)) + "</i>\n"
        + (S.panel ? "Tekshirish: " + esc(S.panel) + "/api/check?p=" + f.p.slug : "");
      try { await tgSend(S.admin, t); } catch (e) { /* o'tkazib yuboriladi */ }
    }
  }
  return Response.json({ ok: true, loyihalar: list.length });
}
