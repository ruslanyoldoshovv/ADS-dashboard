// Sotuv bo'limi rahbari (ROP) uchun panel: faqat bitta loyiha (projects.config.js > ropProject, standart Nexus School).
// Reklamalar jadvali, reklama akkauntlari va oylik rejani o'zgartirish ko'rinmaydi. Ish grafigini o'zgartira oladi.
// Kirish: login "rop", parol Vercel'dagi ROP_PASSWORD.
import Panel from "../Panel";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default function RopPage(props) {
  return <Panel {...props} mode="rop" />;
}
