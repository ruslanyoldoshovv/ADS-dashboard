"use client";
// Davlat tanlash (masalan Polaris: Italiya, Malayziya, Kipr). Galochka bilan: bitta, bir nechta yoki hammasi.
// Hammasi belgilangan bo'lsa: umumiy natija. Tanlov brauzerda (cookie) saqlanadi; butun panel va grafik shu davlatlar bo'yicha hisoblanadi.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function CountryPicker({ cookie, list, selected, label }) {
  const router = useRouter();
  const all = list.map((c) => c.id);
  const [sel, setSel] = useState(() => new Set(selected && selected.length ? selected : all));
  const [pending, start] = useTransition();

  const save = (next) => {
    setSel(next);
    const ids = all.filter((x) => next.has(x));
    // Hammasi tanlangan bo'lsa cookie o'chiriladi (yangi davlat qo'shilsa u ham avtomatik kiradi)
    document.cookie = ids.length === all.length
      ? cookie + "=; path=/; max-age=0; samesite=lax"
      : cookie + "=" + encodeURIComponent(ids.join("-")) + "; path=/; max-age=31536000; samesite=lax";
    start(() => router.refresh());
  };
  const toggle = (id) => {
    const next = new Set(sel);
    if (next.has(id)) { if (next.size === 1) return; next.delete(id); } else next.add(id);
    save(next);
  };
  const isAll = sel.size === all.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#566573" }}>{label || "Davlatlar"} {pending && <span className="muted">· yuklanmoqda...</span>}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} role="group" aria-label={label || "Davlatlar"}>
        <button type="button" className="chip" disabled={pending || isAll} onClick={() => save(new Set(all))}
          style={{ cursor: isAll ? "default" : "pointer", background: isAll ? "#E8EEF9" : undefined, borderColor: isAll ? "#1D4ED8" : undefined, fontWeight: 700 }}>
          Hammasi
        </button>
        {list.map((c) => {
          const on = sel.has(c.id);
          return (
            <label key={c.id} className="chip" title={c.n + " ta lid (tanlangan davrda)"}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", opacity: pending ? 0.6 : 1, background: on ? "#E8EEF9" : undefined, borderColor: on ? "#1D4ED8" : undefined }}>
              <input type="checkbox" checked={on} disabled={pending} onChange={() => toggle(c.id)} />
              <span><b>{c.name}</b> <span className="muted">{c.n}</span></span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
