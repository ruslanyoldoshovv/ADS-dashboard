"use client";
// Reklama akkauntlarini tanlash (loyihada bir nechta Meta akkaunti bo'lsa).
// Galochka bilan: 1-akkaunt, 2-akkaunt yoki ikkalasi. Tanlov brauzerda (cookie) saqlanadi va
// panel hamda grafik shu akkauntlar sarfi va reklamalari bilan qayta hisoblanadi. Kamida bittasi tanlangan bo'lishi shart.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const STATUS = { 1: null, 2: "o'chirilgan", 3: "to'lov qarzi", 7: "tekshiruvda", 9: "to'lov kutilmoqda", 101: "yopilgan" };

export default function AccountPicker({ slug, cookie, list, selected }) {
  const router = useRouter();
  const [sel, setSel] = useState(() => new Set(selected));
  const [pending, start] = useTransition();

  const toggle = (id) => {
    const next = new Set(sel);
    if (next.has(id)) { if (next.size === 1) return; next.delete(id); } else next.add(id);
    setSel(next);
    const ids = list.map((a) => a.id).filter((x) => next.has(x));
    // Hammasi tanlangan bo'lsa cookie o'chiriladi (yangi akkaunt qo'shilsa u ham avtomatik kiradi)
    document.cookie = ids.length === list.length
      ? cookie + "=; path=/; max-age=0; samesite=lax"
      : cookie + "=" + ids.join("-") + "; path=/; max-age=31536000; samesite=lax";
    start(() => router.refresh());
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#566573" }}>Reklama akkauntlari {pending && <span className="muted">· yuklanmoqda...</span>}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} role="group" aria-label="Reklama akkauntlari">
        {list.map((a) => {
          const on = sel.has(a.id), st = a.error ? "ruxsat yo'q" : STATUS[a.status] || (a.status && a.status !== 1 ? "faol emas" : null);
          return (
            <label key={a.id} className="chip" title={(a.error || a.name) + " · ID " + a.id}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", opacity: pending ? 0.6 : 1, background: on ? "#E8EEF9" : undefined, borderColor: on ? "#1D4ED8" : undefined }}>
              <input type="checkbox" checked={on} disabled={pending} onChange={() => toggle(a.id)} />
              <span><b>{a.no}-akkaunt</b> · {a.name}</span>
              {st && <span style={{ fontSize: 11, fontWeight: 700, color: a.error ? "#A12116" : "#8A4B08" }}>({st})</span>}
            </label>
          );
        })}
      </div>
    </div>
  );
}
