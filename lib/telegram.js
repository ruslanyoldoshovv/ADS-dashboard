// Telegram Bot API: xabar yuborish va sozlash. Token: Vercel > TELEGRAM_BOT_TOKEN (maxfiy).
import crypto from "crypto";

const token = () => String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
export const tgReady = () => !!token();

// Webhook maxfiy kaliti: tokendan hosil qilinadi (alohida o'zgaruvchi kerak emas). Telegram har so'rovda shu kalitni yuboradi.
export const tgSecret = () => crypto.createHash("sha256").update("tg:" + token()).digest("hex").slice(0, 48);

export async function tg(method, params) {
  const res = await fetch("https://api.telegram.org/bot" + token() + "/" + method, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params || {}), cache: "no-store"
  });
  const j = await res.json().catch(() => ({}));
  if (!j.ok) throw new Error("Telegram: " + (j.description || "HTTP " + res.status));
  return j.result;
}

// Manzil: "chatId" yoki "chatId:mavzuId" (mavzuli guruhda faqat shu mavzuga yoziladi)
export function tgDest(chat, thread) { return thread ? String(chat) + ":" + thread : String(chat); }
export function tgParse(dest) {
  const [chat, thread] = String(dest).split(":");
  return thread ? { chat_id: chat, message_thread_id: Number(thread) } : { chat_id: chat };
}

// Matn 4096 belgidan uzun bo'lsa bo'lib yuboriladi. chatId o'rniga "chatId:mavzuId" ham berilishi mumkin.
export async function tgSend(chatId, text, extra) {
  const parts = [];
  let s = String(text || "");
  while (s.length > 4000) { const cut = s.lastIndexOf("\n", 4000); parts.push(s.slice(0, cut > 0 ? cut : 4000)); s = s.slice(cut > 0 ? cut : 4000); }
  parts.push(s);
  let last = null;
  for (let i = 0; i < parts.length; i++) {
    last = await tg("sendMessage", Object.assign(tgParse(chatId), { text: parts[i], parse_mode: "HTML", disable_web_page_preview: true }, i === parts.length - 1 ? extra || {} : {}));
  }
  return last;
}

export const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
