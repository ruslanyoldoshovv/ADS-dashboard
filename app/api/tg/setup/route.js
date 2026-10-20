// Botni ulash (faqat admin, panel paroli bilan): /api/tg/setup
// Telegram'ga webhook manzilini va buyruqlar ro'yxatini o'rnatadi, holatni ko'rsatadi. Token ko'rsatilmaydi.
import cfg from "../../../../projects.config";
import { tg, tgSecret, tgReady } from "../../../../lib/telegram";
import { tgRead, tgSet, storeReady } from "../../../../lib/store";

export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!tgReady()) return Response.json({ ok: false, sabab: "Vercel'da TELEGRAM_BOT_TOKEN kiritilmagan" });
  if (!storeReady()) return Response.json({ ok: false, sabab: "Upstash ulanmagan" });
  const url = new URL(req.url);
  const base = "https://" + (req.headers.get("x-forwarded-host") || url.host);
  try {
    const me = await tg("getMe");
    await tg("setWebhook", { url: base + "/api/tg/webhook", secret_token: tgSecret(), allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
    await tg("setMyCommands", { commands: [
      { command: "kecha", description: "Kechagi hisobot" }, { command: "bugun", description: "Bugun hozirgacha" }, { command: "guruh", description: "Guruh hisoboti ko'rinishi" },
      { command: "guruhlar", description: "Ulangan guruhlar" }, { command: "yubor", description: "Hisobotlarni hozir guruhlarga yuborish" },
      { command: "yordam", description: "Yordam" }], scope: { type: "all_private_chats" } });
    await tg("setMyCommands", { commands: [{ command: "kecha", description: "Kechagi hisobot (sana bilan)" }, { command: "bugun", description: "Bugun hozirgacha" }, { command: "ulash", description: "Guruhga loyiha hisobotini ulash" }, { command: "uzish", description: "Guruhni uzish" }], scope: { type: "all_group_chats" } });
    await tgSet("panel", base + "/");
    const S = await tgRead();
    return Response.json({
      ok: true, bot: "@" + me.username, webhook: "o'rnatildi",
      admin: S.admin ? "bor" : "yo'q — botga shaxsiy chatda /start yozing (birinchi yozgan odam admin bo'ladi)",
      guruhlar: Object.fromEntries(cfg.projects.filter((p) => S["group:" + p.slug]).map((p) => [p.short, S["group:" + p.slug]]))
    });
  } catch (e) {
    return Response.json({ ok: false, sabab: String(e.message || e).slice(0, 300) });
  }
}
