"use client";
// Operatorlar ish grafigi: har bir operatorga haftalik grafik (har kun soati yoki dam olish), standart grafik
// (o'z grafigi kiritilmagan va yangi operatorlarga) va bir martalik "ishlamaydi" kunlari (ta'til, kasal).
// Javob vaqti shu grafik bo'yicha hisoblanadi: lid ish vaqtidan tashqari tushsa, soat operatorning keyingi smenasidan boshlanadi.
import { useState } from "react";

const DAYS = ["Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"];
const DEF = [["09:00", "18:00"], ["09:00", "18:00"], ["09:00", "18:00"], ["09:00", "18:00"], ["09:00", "18:00"], ["09:00", "18:00"], null];
const dmy = (d) => d.slice(8, 10) + "." + d.slice(5, 7) + "." + d.slice(0, 4);

function Week({ week, onChange, disabled }) {
  const set = (i, v) => onChange(week.map((d, j) => (j === i ? v : d)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, opacity: disabled ? 0.5 : 1 }}>
      {DAYS.map((name, i) => {
        const d = week[i];
        return (
          <div key={i} className="schrow">
            <span style={{ fontWeight: 600 }}>{name}</span>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={!!d} disabled={disabled} onChange={(e) => set(i, e.target.checked ? ["09:00", "18:00"] : null)} /> {d ? "Ishlaydi" : "Dam olish"}
            </label>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <input className="tfield" type="time" value={d ? d[0] : ""} disabled={disabled || !d} onChange={(e) => set(i, [e.target.value, d[1]])} aria-label={name + " boshlanishi"} />
              <span>–</span>
              <input className="tfield" type="time" value={d ? d[1] : ""} disabled={disabled || !d} onChange={(e) => set(i, [d[0], e.target.value])} aria-label={name + " tugashi"} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function ScheduleEditor({ slug, operators }) {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState("");
  const [range, setRange] = useState({});

  const load = () => {
    setOpen((x) => !x);
    if (s) return;
    fetch("/api/schedule?p=" + encodeURIComponent(slug), { cache: "no-store" }).then((r) => r.json())
      .then((j) => setS(j.sched || { def: { week: DEF }, ops: {} })).catch(() => setMsg("Grafik o'qilmadi"));
  };
  const opOf = (uid) => (s.ops && s.ops[uid]) || {};
  const setOp = (uid, name, patch) => setS((x) => Object.assign({}, x, { ops: Object.assign({}, x.ops, { [uid]: Object.assign({ name }, (x.ops || {})[uid], patch) }) }));
  const addOff = (uid, name) => {
    const r = range[uid] || {};
    if (!r.from) return;
    const to = r.to && r.to >= r.from ? r.to : r.from, list = (opOf(uid).off || []).slice();
    for (let t = Date.parse(r.from + "T00:00:00Z"); t <= Date.parse(to + "T00:00:00Z") && list.length < 400; t += 86400000) {
      const d = new Date(t).toISOString().slice(0, 10);
      if (!list.includes(d)) list.push(d);
    }
    setOp(uid, name, { off: list.sort() });
    setRange((x) => Object.assign({}, x, { [uid]: {} }));
  };
  const save = () => {
    setMsg("Saqlanmoqda...");
    const ops = {};
    operators.forEach((o) => {
      const v = opOf(o.uid);
      ops[o.uid] = { name: o.name, week: v.week || null, useDef: !v.week, off: v.off || [] };
    });
    // Ro'yxatda hozir ko'rinmagan (shu davrda lidi yo'q) operatorlarning grafigi ham saqlanib qoladi
    Object.keys(s.ops || {}).forEach((uid) => { if (!ops[uid]) ops[uid] = Object.assign({ useDef: !s.ops[uid].week }, s.ops[uid]); });
    fetch("/api/schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ p: slug, def: s.def, ops }) })
      .then((r) => r.json()).then((j) => { if (j.ok) { setS(j.sched); setMsg("Saqlandi. Yangi grafik keyingi hisoblashdan (ertaga 09:00) boshlab ishlatiladi."); } else setMsg("Saqlanmadi: " + (j.error || "")); })
      .catch(() => setMsg("Saqlanmadi: aloqa yo'q"));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <button type="button" className="colbtn" onClick={load} aria-expanded={open}>🕘 Ish grafigi</button>
        {msg && <span className="muted">{msg}</span>}
      </div>
      {open && !s && <div className="muted">Yuklanmoqda...</div>}
      {open && s && (
        <div className="colpanel" style={{ margin: 0, maxWidth: "none" }}>
          <div className="muted">Javob vaqti shu grafik bo'yicha hisoblanadi: lid ish vaqtidan tashqari tushsa, soat operatorning keyingi smenasi boshlanganda yuradi.</div>
          <details className="schblock" open>
            <summary><b>Standart grafik</b> <span className="muted">· o'z grafigi kiritilmagan va yangi operatorlar uchun</span></summary>
            <Week week={(s.def && s.def.week) || DEF} onChange={(w) => setS((x) => Object.assign({}, x, { def: { week: w } }))} />
          </details>
          {operators.map((o) => {
            const v = opOf(o.uid), own = !!v.week, r = range[o.uid] || {};
            return (
              <details key={o.uid} className="schblock">
                <summary><b>{o.name}</b> <span className="muted">· {own ? "o'z grafigi" : "standart grafik"}{v.off && v.off.length ? " · ishlamaydigan kunlar: " + v.off.length : ""}</span></summary>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, margin: "6px 0" }}>
                  <input type="checkbox" checked={!own} onChange={(e) => setOp(o.uid, o.name, { week: e.target.checked ? null : ((s.def && s.def.week) || DEF).slice() })} /> Standart grafik bo'yicha ishlaydi
                </label>
                {own && <Week week={v.week} onChange={(w) => setOp(o.uid, o.name, { week: w })} />}
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  <b style={{ fontSize: 13 }}>Ishlamaydigan kunlar (ta'til, kasal)</b>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                    <input className="tfield" type="date" value={r.from || ""} onChange={(e) => setRange((x) => Object.assign({}, x, { [o.uid]: Object.assign({}, r, { from: e.target.value }) }))} aria-label="Boshlanishi" />
                    <span>–</span>
                    <input className="tfield" type="date" value={r.to || ""} onChange={(e) => setRange((x) => Object.assign({}, x, { [o.uid]: Object.assign({}, r, { to: e.target.value }) }))} aria-label="Tugashi (ixtiyoriy)" />
                    <button type="button" className="colbtn" onClick={() => addOff(o.uid, o.name)}>Qo'shish</button>
                  </div>
                  {v.off && v.off.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {v.off.map((d) => <button type="button" key={d} className="offchip" onClick={() => setOp(o.uid, o.name, { off: v.off.filter((x) => x !== d) })} title="Olib tashlash">{dmy(d)} ×</button>)}
                    </div>
                  )}
                </div>
              </details>
            );
          })}
          <div><button type="button" className="btn" onClick={save}>Grafikni saqlash</button></div>
        </div>
      )}
    </div>
  );
}
