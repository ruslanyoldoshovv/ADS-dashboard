// Telegram bot webhook (parolsiz, Telegram yuborgan maxfiy kalit bilan tekshiriladi).
// Shaxsiy chat (faqat admin): /start, /kecha, /bugun, /guruhlar, /yubor, /yordam
// Guruh (faqat admin buyrug'i): /ulash (loyiha tanlanadi), /uzish
import cfg from "../../../../projects.config";
import { tashkentNow } from "../../../../lib/calc";
import { tg, tgSend, tgSecret, tgReady, tgDest, esc } from "../../../../lib/telegram";
import { tgRead, tgSet, tgDel, storeReady } from "../../../../lib/store";
import { buildReport, buildGroupReport, reportProjects, digestLine } from "../../../../lib/report";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// "/kun 13.11", "/kun 13.11.2026", "/kun 10.11-14.11" -> { from, to } ("YYYY-MM-DD"). Yil yozilmasa: joriy yil
// (sana kelajakda bo'lib qolsa o'tgan yil). Noto'g'ri bo'lsa null.
function parseKun(text, now) {
  const arg = String(text || "").trim().split(/\s+/).slice(1).join("");
  const m = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?:[-–—](\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?)?$/.exec(arg);
  if (!m) return null;
  const today = Date.UTC(now.y, now.m, now.day);
  const mk = (d, mo, y) => {
    let yy = y ? Number(y.length === 2 ? "20" + y : y) : now.y;
    let t = Date.UTC(yy, Number(mo) - 1, Number(d));
    const dt = new Date(t);
    if (dt.getUTCDate() !== Number(d) || dt.getUTCMonth() !== Number(mo) - 1) return null;
    if (!y && t > today) { yy -= 1; t = Date.UTC(yy, Number(mo) - 1, Number(d)); }
    return new Date(t).toISOString().slice(0, 10);
  };
  const from = mk(m[1], m[2], m[3]);
  const to = m[4] ? mk(m[4], m[5], m[6] || m[3]) : from;
  if (!from || !to) return null;
  return from <= to ? { from, to } : { from: to, to: from };
}
const KUN_HINT = "Sanani yozing: <b>/kun 13.11</b> (bitta kun) yoki <b>/kun 10.11-14.11</b> (oraliq).";

const HELP = [
  "🤖 <b>Hisobot bot</b>",
  "",
  "<b>Shaxsiy chatda:</b>",
  "/kecha — kechagi hisobot (loyiha tanlanadi)",
  "/bugun — bugun hozirgacha",
  "/guruh — guruhga boradigan qisqa hisobot ko'rinishi (kecha)",
  "/guruhlar — qaysi loyiha qaysi guruhga ulangan",
  "/yubor — kechagi hisobotlarni hozir guruhlarga yuborish",
  "/kun 13.11 — o'tgan kun hisoboti (guruh ko'rinishida), /kun 10.11-14.11 — oraliq bo'yicha",
  "",
  "<b>Guruhda:</b>",
  "/ulash — shu guruhga (mavzuga) loyiha hisobotini ulash",
  "/uzish — guruhni uzish",
  "/kecha — shu guruhga ulangan loyihaning kechagi hisoboti (sana bilan)",
  "/bugun — bugun hozirgacha (sanasiz)",
  "/kun 13.11 — o'sha kun hisoboti (masalan, bot yubormay qolgan kun uchun), /kun 10.11-14.11 — oraliq",
  "",
  "Har kuni 09:00–10:00 oralig'ida kechagi hisobot guruhlarga avtomatik keladi."
].join("\n");

const keyboardOf = (list, prefix, suffix) => ({ inline_keyboard: list.map((p) => [{ text: p.short, callback_data: prefix + p.slug + (suffix || "") }]) });
const projectKeyboard = (prefix, suffix) => keyboardOf(reportProjects(), prefix, suffix);
// /ulash uchun: nomi berilgan barcha loyihalar (hali to'liq ulanmaganlari ham). "bo'sh" slotlar ko'rsatilmaydi.
// To'liq ulanmagan loyiha guruhga oldindan bog'lab qo'yiladi, hisobot esa ulangandan keyin keladi.
const linkKeyboard = (suffix) => keyboardOf(cfg.projects.filter((p) => !/bo'sh/i.test(p.niche || "")), "u:", suffix);
// Xabarni o'chirish (o'chira olmasa jim o'tadi: masalan botda guruhda "xabarlarni o'chirish" huquqi bo'lmasa)
const del = (chat, id) => (id ? tg("deleteMessage", { chat_id: chat, message_id: Number(id) }).catch(() => null) : null);

export async function POST(req) {
  if (!tgReady() || req.headers.get("x-telegram-bot-api-secret-token") !== tgSecret()) return new Response("forbidden", { status: 403 });
  if (!storeReady()) return Response.json({ ok: true });
  let u = {};
  try { u = await req.json(); } catch (e) { return Response.json({ ok: true }); }
  const S = await tgRead().catch(() => ({}));
  const admin = S.admin ? String(S.admin) : "";
  try {
    // Tugma bosildi
    if (u.callback_query) {
      const q = u.callback_query, from = String(q.from.id), chat = q.message && q.message.chat ? q.message.chat.id : q.from.id, data = String(q.data || "");
      // Mavzuli guruh: tugma qaysi mavzuda bo'lsa, javob ham o'sha mavzuga
      const to = tgDest(chat, q.message && q.message.is_topic_message ? q.message.message_thread_id : null);
      if (from !== admin) { await tg("answerCallbackQuery", { callback_query_id: q.id, text: "Faqat admin uchun" }); return Response.json({ ok: true }); }
      // callback_data: "u:<loyiha>:<buyruq xabari id>" yoki "r:<kecha|bugun>:<loyiha>"
      const parts = data.split(":");
      const p = cfg.projects.find((x) => x.slug === (parts[0] === "u" || parts[0] === "g" ? parts[1] : parts[0] === "k" ? parts[3] : parts[2]));
      if (parts[0] === "u" && p) {
        await tgSet("group:" + p.slug, to);
        await tg("answerCallbackQuery", { callback_query_id: q.id, text: "Ulandi" });
        // Guruhda boshqa loyiha nomlari ko'rinmasligi uchun: tugmali xabar va /ulash buyrug'i o'chiriladi
        await del(chat, q.message && q.message.message_id);
        await del(chat, parts[2]);
        await tgSend(to, "✅ Ulandi: bu " + (to.includes(":") ? "mavzuga" : "guruhga") + " <b>" + esc(p.name) + "</b> hisobotlari keladi (har kuni 09:00–10:00)." + (reportProjects().some((x) => x.slug === p.slug) ? "" : "\n⏳ Loyiha hali to'liq ulanmagan: hisobotlar ulangandan keyin keladi."));
      } else if (data.startsWith("g:") && p) {
        await tg("answerCallbackQuery", { callback_query_id: q.id, text: "Tayyorlanmoqda..." });
        await tgSend(to, (await buildGroupReport(p, "yesterday")).text);
      } else if (data.startsWith("k:") && p) {
        await tg("answerCallbackQuery", { callback_query_id: q.id, text: "Tayyorlanmoqda..." });
        await tgSend(to, (await buildGroupReport(p, null, { from: parts[1], to: parts[2] })).text);
      } else if ((data.startsWith("r:yesterday:") || data.startsWith("r:today:")) && p) {
        await tg("answerCallbackQuery", { callback_query_id: q.id, text: "Tayyorlanmoqda..." });
        const r = await buildReport(p, data.split(":")[1], { panel: S.panel });
        await tgSend(to, r.text);
      } else await tg("answerCallbackQuery", { callback_query_id: q.id });
      return Response.json({ ok: true });
    }
    const m = u.message;
    if (!m || !m.text || !m.from) return Response.json({ ok: true });
    const from = String(m.from.id), chat = m.chat.id, isPrivate = m.chat.type === "private";
    const cmd = m.text.trim().split(/\s+/)[0].split("@")[0].toLowerCase();
    if (isPrivate) {
      if (!admin && cmd === "/start") {
        await tgSet("admin", from);
        await tgSend(chat, "✅ Siz bot admini sifatida ro'yxatdan o'tdingiz. Boshqa odamlar botdan foydalana olmaydi.\n\n" + HELP);
        return Response.json({ ok: true });
      }
      if (from !== admin) { await tgSend(chat, "Bu bot shaxsiy."); return Response.json({ ok: true }); }
      if (cmd === "/start" || cmd === "/yordam" || cmd === "/help") await tgSend(chat, HELP);
      else if (cmd === "/kecha") await tgSend(chat, "Qaysi loyiha (kecha)?", { reply_markup: projectKeyboard("r:yesterday:") });
      else if (cmd === "/bugun") await tgSend(chat, "Qaysi loyiha (bugun hozirgacha)?", { reply_markup: projectKeyboard("r:today:") });
      else if (cmd === "/kun") {
        const k = parseKun(m.text, tashkentNow(cfg));
        if (!k) await tgSend(chat, KUN_HINT);
        else await tgSend(chat, "Qaysi loyiha (" + k.from.split("-").reverse().join(".") + (k.to !== k.from ? " – " + k.to.split("-").reverse().join(".") : "") + ")? Hisobot shu yerga, guruh ko'rinishida keladi.", { reply_markup: projectKeyboard("k:" + k.from + ":" + k.to + ":") });
      }
      else if (cmd === "/guruh") await tgSend(chat, "Guruhga boradigan hisobot ko'rinishi (kecha). Qaysi loyiha?", { reply_markup: projectKeyboard("g:") });
      else if (cmd === "/guruhlar") {
        const rows = cfg.projects.filter((p) => S["group:" + p.slug]).map((p) => "• " + esc(p.short) + " → guruh " + String(S["group:" + p.slug]).replace(":", ", mavzu "));
        await tgSend(chat, rows.length ? "<b>Ulangan guruhlar:</b>\n" + rows.join("\n") : "Hali hech bir guruh ulanmagan. Botni guruhga qo'shib, guruhda /ulash deb yozing.");
      } else if (cmd === "/yubor") {
        await tgSend(chat, "⏳ Kechagi hisobotlar tayyorlanmoqda...");
        const lines = [];
        for (const p of reportProjects()) {
          try {
            const r = await buildReport(p, "yesterday", { panel: S.panel });
            if (S["group:" + p.slug]) await tgSend(S["group:" + p.slug], (await buildGroupReport(p, "yesterday")).text);
            lines.push(digestLine(p, r) + (S["group:" + p.slug] ? "" : " <i>(guruh ulanmagan)</i>"));
          } catch (e) { lines.push("• " + esc(p.short) + ": xato — " + esc(String(e.message || e).slice(0, 120))); }
        }
        await tgSend(chat, "<b>Yuborildi:</b>\n" + lines.join("\n"));
      } else await tgSend(chat, HELP);
      return Response.json({ ok: true });
    }
    // Guruh: faqat admin buyruqlari
    if (from !== admin) return Response.json({ ok: true });
    // Mavzuli guruh (forum): buyruq yozilgan mavzu eslab qolinadi, hisobot faqat shu mavzuga boradi
    const to = tgDest(chat, m.chat.is_forum && m.is_topic_message ? m.message_thread_id : null);
    const where = to.includes(":") ? "mavzu" : "guruh";
    if (cmd === "/ulash") await tgSend(to, "Bu " + where + "ga qaysi loyiha hisoboti kelsin?", { reply_markup: linkKeyboard(":" + m.message_id) });
    else if (cmd === "/kecha" || cmd === "/bugun") {
      // Faqat shu guruhga (mavzuga) ulangan loyiha(lar) hisoboti
      const linked = cfg.projects.filter((p) => String(S["group:" + p.slug]) === to);
      if (!linked.length) await tgSend(to, "Bu " + where + "ga hech qaysi loyiha ulanmagan. Avval /ulash buyrug'ini yozing.");
      for (const p of linked) {
        try { await tgSend(to, (await buildGroupReport(p, cmd === "/kecha" ? "yesterday" : "today")).text); }
        catch (e) { await tgSend(to, "⚠️ " + esc(p.short) + ": hisobot tayyorlanmadi — " + esc(String(e.message || e).slice(0, 150))); }
      }
    }
    else if (cmd === "/kun") {
      const k = parseKun(m.text, tashkentNow(cfg));
      const linked = cfg.projects.filter((p) => String(S["group:" + p.slug]) === to);
      if (!k) await tgSend(to, KUN_HINT);
      else if (!linked.length) await tgSend(to, "Bu " + where + "ga hech qaysi loyiha ulanmagan. Avval /ulash buyrug'ini yozing.");
      for (const p of (k ? linked : [])) {
        try { await tgSend(to, (await buildGroupReport(p, null, k)).text); }
        catch (e) { await tgSend(to, "⚠️ " + esc(p.short) + ": hisobot tayyorlanmadi — " + esc(String(e.message || e).slice(0, 150))); }
      }
    }
    else if (cmd === "/uzish") {
      const gone = cfg.projects.filter((p) => String(S["group:" + p.slug]) === to);
      for (const p of gone) await tgDel("group:" + p.slug);
      await tgSend(to, gone.length ? "Uzildi: " + gone.map((p) => esc(p.short)).join(", ") : "Bu " + where + "ga hech qaysi loyiha ulanmagan.");
    }
  } catch (e) {
    try { if (admin) await tgSend(admin, "⚠️ Bot xatosi: " + esc(String(e.message || e).slice(0, 300))); } catch (x) { /* o'tkazib yuboriladi */ }
  }
  return Response.json({ ok: true });
}
