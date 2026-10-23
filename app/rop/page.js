// Sotuv bo'limi rahbari (ROP) uchun panel: har bir ROP faqat o'z loyihasini ko'radi (lib/rop.js: rop -> Nexus, polaris -> Polaris).
// Reklamalar jadvali, reklama akkauntlari va oylik rejani o'zgartirish ko'rinmaydi. Ish grafigini o'zgartira oladi.
// Kirish: login "rop" + ROP_PASSWORD (Nexus) yoki "polaris" + ROP_PASSWORD_P4 (Polaris).
import Panel from "../Panel";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default function RopPage(props) {
  return <Panel {...props} mode="rop" />;
}
