"use client";
// Natijalar jadvali:
//  - "Ustunlar" tugmasi: tartibni o'zgartirish (kompyuterda sudrab, telefonda ↑↓), yashirish, "Standartga qaytarish".
//    Tartib hamma uchun bir xil saqlanadi (Upstash) va Kreativ / Kampaniya / Ad set ko'rinishlarida bir xil.
//  - Ustun nomini bosish: kamayish → o'sish → asl tartib. Bo'sh qiymatlar doim pastda. Sahifa yangilansa asl tartibga qaytadi.
//  - Sarlavha sahifa aylantirilganda tepada qadalib turadi, nom ustuni chapda qotib turadi.
import { useMemo, useRef, useState } from "react";

const PILL = { minHeight: 28, padding: "0 10px", fontSize: 12 };
const ACT = { green: ["#05603A", "Yoniq"], yellow: ["#8A4B08", "Yoniq"], grey: ["#566573", "O'chirilgan"], red: ["#A12116", "Rad etilgan"] };

function Two({ a, b, c, bold }) {
  return <div className="r" style={{ display: "flex", flexDirection: "column" }}><span>{a}</span><span style={{ fontSize: 12, fontWeight: bold ? 700 : 400, color: c }}>{b}</span></div>;
}

// Har bir ustun: kalit, sarlavha, eni (px), o'ngga tekislanganmi, katak ko'rinishi
function columns(h) {
  return [
    { k: "spend", label: h.spend, w: 72, r: true, cell: (r) => <div className="r">{r.spend}</div> },
    { k: "leads", label: "Lid", w: 44, r: true, cell: (r) => <div className="r" style={{ fontWeight: 700 }}>{r.leads}</div> },
    { k: "good", label: "Sifatli", w: 92, cell: (r) => (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ color: r.goodColor, whiteSpace: "nowrap" }}><b>{r.goodPct}</b> · {r.good}</span>
        <div style={{ height: 8, borderRadius: 999, background: "#E6EBEF", overflow: "hidden" }}><div style={{ height: 8, borderRadius: 999, width: r.goodPct, background: r.barColor }} /></div>
      </div>) },
    { k: "noAns", label: "Nedozvon", w: 66, r: true, cell: (r) => <Two a={r.noAns} b={r.noAnsPct} c={r.noAnsColor} bold /> },
    { k: "inProg", label: "Jarayonda", w: 70, r: true, cell: (r) => <Two a={r.inProg} b={r.inProgPct} c="#566573" /> },
    { k: "lost", label: "Yo'qotilgan", w: 76, r: true, cell: (r) => <Two a={r.lost} b={r.lostPct} c="#566573" /> },
    { k: "visits", label: "Keldi", w: 44, r: true, cell: (r) => <div className="r">{r.visits}</div> },
    { k: "sales", label: "Sotuv", w: 44, r: true, cell: (r) => <div className="r" style={{ fontWeight: 700 }}>{r.sales}</div> },
    { k: "cr", label: "Lid → sotuv", w: 58, r: true, cell: (r) => <div className="r" style={{ fontWeight: 700, color: r.crColor }}>{r.cr}</div> },
    { k: "revenue", label: h.revenue, w: 92, r: true, cell: (r) => <div className="r">{r.revenue}</div> },
    { k: "roas", label: "ROAS", w: 48, r: true, cell: (r) => <div className="r" style={{ fontWeight: 800, color: r.roasColor }}>{r.roas}</div> },
    { k: "metaCpl", label: "Meta CPL", w: 60, r: true, cell: (r) => <div className="r" style={{ fontWeight: 700, color: r.cplColor }}>{r.metaCpl}</div> },
    { k: "qCpl", label: "Sifatli lid narxi", w: 66, r: true, cell: (r) => <div className="r" style={{ fontWeight: 800, color: r.qcplColor }}>{r.qCpl}</div> },
    { k: "saleCpl", label: "Sotuv narxi", w: 66, r: true, cell: (r) => <div className="r" style={{ fontWeight: 800 }}>{r.saleCpl}</div> },
    { k: "dup", label: "Dubl", w: 50, r: true, cell: (r) => <Two a={r.dup} b={r.dupPct} c={r.dupColor} bold /> },
    { k: "rec", label: "Tavsiya", w: 118, cell: (r) => (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
        {r.isOff && <span className="pill" style={Object.assign({ background: "#FDECEA", color: "#A12116" }, PILL)}>✕ O'chirish</span>}
        {r.isScale && <span className="pill" style={Object.assign({ background: "#E4F5EA", color: "#05603A" }, PILL)}>↗ Kuchaytirish</span>}
        {r.isWatch && <span className="pill" style={Object.assign({ background: "#FEF3C7", color: "#8A4B08" }, PILL)}>◉ Kuzatish</span>}
        {r.trust && <span style={{ fontSize: 12, fontWeight: 600, color: "#8A4B08" }}>{r.trust}</span>}
      </div>) }
  ];
}

// Saqlangan tartibni joriy ustunlar ro'yxatiga moslash (yangi qo'shilgan ustun oxiriga tushadi)
function normalize(layout, keys) {
  const order = ((layout && layout.order) || []).filter((k) => keys.includes(k));
  keys.forEach((k) => { if (!order.includes(k)) order.push(k); });
  const hidden = ((layout && layout.hidden) || []).filter((k) => keys.includes(k));
  return { order, hidden };
}

export default function ResultsTable({ rows, nameHeader, headers, slug, layout, canSave }) {
  const COLS = useMemo(() => columns(headers), [headers]);
  const keys = COLS.map((c) => c.k);
  const [lay, setLay] = useState(() => normalize(layout, keys));
  const [sort, setSort] = useState(null); // { k, dir: -1 kamayish | 1 o'sish }
  const [open, setOpen] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [drag, setDrag] = useState(null);
  const headRef = useRef(null);
  const timer = useRef(null);

  const visible = lay.order.filter((k) => !lay.hidden.includes(k)).map((k) => COLS.find((c) => c.k === k));
  const grid = { "--cols": "var(--namecol) " + visible.map((c) => c.w + "px").join(" ") };
  const minW = 16 * 2 + 8 * visible.length + visible.reduce((s, c) => s + c.w, 0);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    return rows.slice().sort((a, b) => {
      const x = a.sv ? a.sv[sort.k] : null, y = b.sv ? b.sv[sort.k] : null;
      if (x == null && y == null) return 0;
      if (x == null) return 1; if (y == null) return -1; // bo'sh qiymat doim pastda
      return (x - y) * sort.dir;
    });
  }, [rows, sort]);

  const clickSort = (k) => setSort((s) => (!s || s.k !== k ? { k, dir: -1 } : s.dir === -1 ? { k, dir: 1 } : null));

  const persist = (next) => {
    setLay(next);
    if (!canSave) { setSaveMsg("Saqlash joyi ulanmagan: tartib faqat shu sahifada qoladi"); return; }
    clearTimeout(timer.current);
    setSaveMsg("Saqlanmoqda...");
    timer.current = setTimeout(() => {
      fetch("/api/columns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next.reset ? { p: slug, reset: true } : { p: slug, order: next.order, hidden: next.hidden }) })
        .then((r) => r.json()).then((j) => setSaveMsg(j.ok ? "Saqlandi" : "Saqlanmadi: " + (j.error || ""))).catch(() => setSaveMsg("Saqlanmadi: aloqa yo'q"));
    }, 500);
  };
  const move = (k, d) => {
    const o = lay.order.slice(), i = o.indexOf(k), j = i + d;
    if (j < 0 || j >= o.length) return;
    o.splice(i, 1); o.splice(j, 0, k);
    persist({ order: o, hidden: lay.hidden });
  };
  const dropOn = (target) => {
    if (!drag || drag === target) return;
    const o = lay.order.filter((k) => k !== drag);
    o.splice(o.indexOf(target), 0, drag);
    persist({ order: o, hidden: lay.hidden });
  };
  const toggle = (k) => {
    const hidden = lay.hidden.includes(k) ? lay.hidden.filter((x) => x !== k) : lay.hidden.concat(k);
    if (hidden.length >= keys.length) return; // kamida bitta ustun qolsin
    persist({ order: lay.order, hidden });
  };
  const reset = () => { const n = normalize(null, keys); setLay(n); persist(Object.assign({ reset: true }, n)); };
  const labelOf = (c) => c.label;

  return (
    <>
      <div className="colbar">
        <button type="button" className="colbtn" onClick={() => setOpen((x) => !x)} aria-expanded={open}>⚙ Ustunlar{lay.hidden.length ? " · " + lay.hidden.length + " yashirin" : ""}</button>
        {sort && <button type="button" className="colbtn" onClick={() => setSort(null)}>Saralash: {labelOf(COLS.find((c) => c.k === sort.k))} {sort.dir === -1 ? "↓" : "↑"} · bekor qilish</button>}
        {saveMsg && <span className="muted">{saveMsg}</span>}
      </div>
      {open && (
        <div className="colpanel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <b>Ustunlar tartibi</b>
            <button type="button" className="colbtn" onClick={reset}>Standartga qaytarish</button>
          </div>
          <div className="muted">Sudrab yoki ↑↓ bilan tartiblang, belgini olib tashlab yashiring. "{nameHeader}" ustuni doim birinchi turadi.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {lay.order.map((k, i) => {
              const c = COLS.find((x) => x.k === k);
              return (
                <div key={k} className="colitem" draggable onDragStart={() => setDrag(k)} onDragEnd={() => setDrag(null)} onDragOver={(e) => e.preventDefault()} onDrop={() => dropOn(k)} style={{ opacity: drag === k ? 0.4 : 1 }}>
                  <span className="grip" aria-hidden="true">⋮⋮</span>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, cursor: "pointer" }}>
                    <input type="checkbox" checked={!lay.hidden.includes(k)} onChange={() => toggle(k)} /> {labelOf(c)}
                  </label>
                  <button type="button" className="arr" onClick={() => move(k, -1)} disabled={i === 0} aria-label="Yuqoriga">↑</button>
                  <button type="button" className="arr" onClick={() => move(k, 1)} disabled={i === lay.order.length - 1} aria-label="Pastga">↓</button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div ref={headRef} className="tblhead">
        <div style={{ minWidth: "calc(var(--namew) + " + minW + "px)" }}>
          <div className="tbl head" style={grid}>
            <div className="sticky">{nameHeader}</div>
            {visible.map((c) => (
              <button type="button" key={c.k} className={"sorth" + (c.r ? " r" : "")} onClick={() => clickSort(c.k)} title="Saralash">
                {c.label}{sort && sort.k === c.k ? <span className="sarr">{sort.dir === -1 ? " ↓" : " ↑"}</span> : null}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="tblbody" onScroll={(e) => { if (headRef.current) headRef.current.scrollLeft = e.currentTarget.scrollLeft; }}>
        <div style={{ minWidth: "calc(var(--namew) + " + minW + "px)" }}>
          {sorted.map((r, i) => (
            <div key={i} className="tbl" style={Object.assign({ background: r.rowBg }, grid)}>
              <div className="sticky" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontWeight: 700 }}>{r.name}</span>
                {r.act && <span className={"act act-" + r.act.k} style={{ color: ACT[r.act.k][0] }} title={ACT[r.act.k][1]}><i className="dot" />{r.act.t}</span>}
                <span className="muted">{r.sub}</span>
              </div>
              {visible.map((c) => <div key={c.k} style={{ minWidth: 0 }}>{c.cell(r)}</div>)}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
