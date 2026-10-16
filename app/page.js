// Asosiy panel (to'liq): barcha loyihalar, reklamalar jadvali. Kirish: login admin, parol DASH_PASSWORD.
import Panel from "./Panel";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // amoCRM'dan ko'p lid o'qilganda vaqt yetishi uchun

export default function Page(props) {
  return <Panel {...props} mode="admin" />;
}
