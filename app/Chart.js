"use client";
// Dinamika grafigi: ikki qavat, sana o'qi umumiy.
//  Tepada: pul (sarf, Meta CPL, sifatli lid narxi). Pastda: lidlar (lid, sifatli lid, keldi, sotuv, reja).
// O'zining davr tanlagichi bor (haftalar va oylar), panelning asosiy sanasiga bog'liq emas: faqat grafik qayta yuklanadi.
import { useEffect, useMemo, useRef, useState } from "react";

const WD = ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];
const FADE_DAYS = 3; // oxirgi kunlar: lidlar hali ishlanmoqda, sifatli/keldi/sotuv keyin oshadi

const TOP = [
  { k: "spend", label: "Sarf", color: "#1D4ED8", axis: "L", on: true },
  { k: "cpl", label: "Meta CPL", color: "#D97706", axis: "R", on: false, th: "cpl" },
  { k: "qcpl", label: "Sifatli lid narxi", color: "#7C3AED", axis: "R", on: false, th: "qcpl", fade: true }
];
const BOT = [
  { k: "leads", label: "Lid", color: "#64748B", on: true },
  { k: "good", label: "Sifatli lid", color: "#059669", on: true, fade: true },
  { k: "visits", label: "Suhbatga keldi", color: "#D97706", on: false, fade: true },
  { k: "sales", label: "Sotuv", color: "#DC2626", on: false, fade: true },
  { k: "plan", label: "Reja (sifatli lid)", color: "#14212B", on: false, dash: "6 5" }
];

const fmtN = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
function niceMax(v) {
  if (!(v > 0)) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(v))), f = v / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
}

export default function Chart({ slug }) {
  const [k, setK] = useState("month");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [onTop, setOnTop] = useState(() => Object.fromEntries(TOP.map((s) => [s.k, s.on])));
  const [onBot, setOnBot] = useState(() => Object.fromEntries(BOT.map((s) => [s.k, s.on])));
  const [hover, setHover] = useState(null);
  const [W, setW] = useState(800);
  const box = useRef(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => setW(Math.max(300, Math.floor(e[0].contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let dead = false;
    setLoading(true); setErr("");
    fetch(`/api/chart?p=${encodeURIComponent(slug)}&k=${encodeURIComponent(k)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (dead) return; if (!j.ok) setErr(j.error || "Ma'lumot olinmadi"); setData(j); setLoading(false); })
      .catch((e) => { if (!dead) { setErr(String(e.message || e)); setLoading(false); } });
    return () => { dead = true; };
  }, [slug, k]);

  const USD = data && data.currency === "USD";
  const money = (x) => (x == null ? "—" : USD ? "$" + (x >= 100 ? fmtN(x) : (Math.round(x * 100) / 100).toString()) : fmtN(x) + " so'm");
  const moneyAxis = (x) => (USD ? "$" + fmtN(x) : x >= 1e6 ? (Math.round(x / 1e5) / 10) + " mln" : fmtN(x / 1000) + " k");

  // Kunlik qatorlar: kelajak kunlar uchun qiymat yo'q (chiziq bugun to'xtaydi), reja esa butun davr bo'ylab
  const rows = useMemo(() => {
    const days = (data && data.days) || [];
    const last = days.reduce((m, x, i) => (!x.future && x.leads != null ? i : m), -1);
    return days.map((x, i) => {
      const has = !x.future && x.leads != null;
      return {
        d: x.d, i, has, fade: has && i > last - FADE_DAYS,
        spend: has ? x.spend || 0 : null,
        cpl: has && x.adLeads > 0 ? x.spend / x.adLeads : null,
        qcpl: has && x.good > 0 ? x.spend / x.good : null,
        leads: has ? x.leads : null, good: has ? x.good : null, visits: has ? x.visits : null, sales: has ? x.sales : null,
        plan: x.plan || 0, adLeads: has ? x.adLeads : null, prog: has ? x.prog : null
      };
    });
  }, [data]);

  const n = rows.length || 1;
  const padL = 46, padR = 46, H1 = 190, H2 = 210, top = 12, bottom = 26;
  const plotW = Math.max(W - padL - padR, 50);
  const X = (i) => padL + (i + 0.5) * (plotW / n);
  const fadeFrom = rows.findIndex((r) => r.fade);

  // Y o'qi faqat yoqilgan chiziqlarga moslashadi
  const maxOf = (keys) => Math.max(0, ...rows.flatMap((r) => keys.map((kk) => (r[kk] == null ? 0 : r[kk]))));
  const T = (data && data.thresholds) || {};
  const leftMax = niceMax(maxOf(onTop.spend ? ["spend"] : []));
  const rightKeys = TOP.filter((s) => s.axis === "R" && onTop[s.k]).map((s) => s.k);
  const rightMax = niceMax(Math.max(maxOf(rightKeys), ...TOP.filter((s) => s.th && onTop[s.k]).map((s) => (T[s.th] || 0) * 1.15)));
  const botKeys = BOT.filter((s) => onBot[s.k]).map((s) => s.k);
  const botMax = niceMax(maxOf(botKeys));

  const yOf = (v, max, H) => top + (H - top - bottom) * (1 - v / max);
  const path = (key, max, H, from, to) => {
    let d = "", pen = false;
    for (let i = from; i <= to && i < rows.length; i++) {
      const v = rows[i][key];
      if (v == null) { pen = false; continue; }
      d += (pen ? "L" : "M") + X(i).toFixed(1) + "," + yOf(v, max, H).toFixed(1);
      pen = true;
    }
    return d;
  };
  // Oxirgi kunlar och rangda: chiziq ikki bo'lakka bo'linadi
  const lines = (s, max, H) => {
    const end = rows.length - 1;
    if (!s.fade || fadeFrom < 0) return <path d={path(s.k, max, H, 0, end)} fill="none" stroke={s.color} strokeWidth={2.2} strokeDasharray={s.dash} strokeLinejoin="round" strokeLinecap="round" />;
    return (
      <g>
        <path d={path(s.k, max, H, 0, Math.max(fadeFrom - 1, 0))} fill="none" stroke={s.color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
        <path d={path(s.k, max, H, Math.max(fadeFrom - 1, 0), end)} fill="none" stroke={s.color} strokeWidth={2.2} strokeOpacity={0.35} strokeDasharray="4 4" strokeLinejoin="round" />
      </g>
    );
  };
  const ticks = (max) => [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const step = Math.max(1, Math.ceil(n / Math.max(4, Math.floor(plotW / 44))));
  const xLabel = (r) => {
    const dt = new Date(r.d + "T00:00:00Z");
    return n <= 7 ? WD[dt.getUTCDay()] + " " + dt.getUTCDate() : String(dt.getUTCDate());
  };

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor(((e.clientX - rect.left) - padL) / (plotW / n));
    setHover(i >= 0 && i < rows.length ? i : null);
  };
  const hv = hover != null ? rows[hover] : null;
  const dmy = (s) => s.slice(8, 10) + "." + s.slice(5, 7) + "." + s.slice(0, 4);

  const Grid = ({ max, H, fmt, side }) => ticks(max).map((t, j) => (
    <g key={side + j}>
      {side === "L" && <line x1={padL} x2={W - padR} y1={yOf(t, max, H)} y2={yOf(t, max, H)} stroke="#E9EEF2" />}
      <text x={side === "L" ? padL - 6 : W - padR + 6} y={yOf(t, max, H) + 4} fontSize="11" fill="#566573" textAnchor={side === "L" ? "end" : "start"}>{fmt(t)}</text>
    </g>
  ));
  const fadeBand = (H) => fadeFrom >= 0 && (
    <g>
      <rect x={X(fadeFrom) - plotW / n / 2} y={top} width={(rows.filter((r) => r.fade).length) * plotW / n} height={H - top - bottom} fill="#F3F5F7" />
      <text x={X(fadeFrom) - plotW / n / 2 + 4} y={top + 12} fontSize="10" fill="#7A8B99">ishlanmoqda</text>
    </g>
  );
  const hoverLine = (H) => hv && <line x1={X(hv.i)} x2={X(hv.i)} y1={top} y2={H - bottom} stroke="#14212B" strokeOpacity="0.35" />;
  const dots = (list, on, maxFn, H) => hv && list.filter((s) => on[s.k] && hv[s.k] != null).map((s) => <circle key={s.k} cx={X(hv.i)} cy={yOf(hv[s.k], maxFn(s), H)} r="4" fill="#FFFFFF" stroke={s.color} strokeWidth="2" />);

  const Toggle = ({ s, on, set }) => (
    <button type="button" onClick={() => set((o) => Object.assign({}, o, { [s.k]: !o[s.k] }))} aria-pressed={on[s.k]} className="ctog" style={{ borderColor: on[s.k] ? s.color : "#E2E8EE", background: on[s.k] ? s.color + "14" : "#FFFFFF", color: on[s.k] ? "#14212B" : "#7A8B99" }}>
      <span style={{ width: 14, height: 3, borderRadius: 2, background: s.color, opacity: on[s.k] ? 1 : 0.35, display: "inline-block" }} />{s.label}
    </button>
  );
  const months = (data && data.periods || []).filter((p) => p.k !== "week" && p.k !== "lastweek");
  const weeks = (data && data.periods || []).filter((p) => p.k === "week" || p.k === "lastweek");
  const totals = rows.reduce((a, r) => { if (r.has) { a.spend += r.spend; a.leads += r.leads; a.good += r.good; a.ad += r.adLeads; } return a; }, { spend: 0, leads: 0, good: 0, ad: 0 });

  return (
    <div className="card" style={{ gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 className="h2">Dinamika</h2>
          <div className="muted">{data && data.ok ? (data.label + " · sarf " + money(totals.spend) + " · lid " + fmtN(totals.leads) + " · sifatli " + fmtN(totals.good)) : "Kunlik sarf va lidlar"}</div>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700, color: "#566573" }}>Davr
          <select className="field" style={{ minWidth: 200 }} value={k} onChange={(e) => { setK(e.target.value); setHover(null); }}>
            {!data && <option value="month">Shu oy</option>}
            {weeks.length > 0 && <optgroup label="Haftalar">{weeks.map((p) => <option key={p.k} value={p.k}>{p.label}</option>)}</optgroup>}
            {months.length > 0 && <optgroup label="Oylar">{months.map((p) => <option key={p.k} value={p.k}>{p.label}</option>)}</optgroup>}
          </select>
        </label>
      </div>

      <div ref={box} style={{ position: "relative", opacity: loading ? 0.45 : 1, transition: "opacity .2s" }}>
        {err && <div style={{ padding: "10px 14px", borderRadius: 10, background: "#FDECEA", color: "#A12116", fontSize: 13, marginBottom: 8 }}>Grafik yuklanmadi: {err}</div>}
        {/* Tepa: pul */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>{TOP.map((s) => <Toggle key={s.k} s={s} on={onTop} set={setOnTop} />)}</div>
        <svg width={W} height={H1} onPointerMove={onMove} onPointerLeave={() => setHover(null)} style={{ display: "block", touchAction: "pan-y" }} role="img" aria-label="Kunlik sarf grafigi">
          {fadeBand(H1)}
          {onTop.spend ? <Grid max={leftMax} H={H1} fmt={moneyAxis} side="L" /> : ticks(1).map((t, j) => <line key={j} x1={padL} x2={W - padR} y1={yOf(t, 1, H1)} y2={yOf(t, 1, H1)} stroke="#E9EEF2" />)}
          {rightKeys.length > 0 && <Grid max={rightMax} H={H1} fmt={moneyAxis} side="R" />}
          {TOP.filter((s) => s.th && onTop[s.k] && T[s.th]).map((s) => (
            <g key={"th" + s.k}>
              <line x1={padL} x2={W - padR} y1={yOf(T[s.th], rightMax, H1)} y2={yOf(T[s.th], rightMax, H1)} stroke={s.color} strokeDasharray="3 4" strokeOpacity="0.8" />
              <text x={W - padR - 4} y={yOf(T[s.th], rightMax, H1) - 4} fontSize="10" fill={s.color} textAnchor="end">chegara {money(T[s.th])}</text>
            </g>
          ))}
          {TOP.filter((s) => onTop[s.k]).map((s) => <g key={s.k}>{lines(s, s.axis === "L" ? leftMax : rightMax, H1)}</g>)}
          {hoverLine(H1)}
          {dots(TOP, onTop, (s) => (s.axis === "L" ? leftMax : rightMax), H1)}
        </svg>
        {/* Past: lidlar */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "6px 0 4px" }}>{BOT.map((s) => <Toggle key={s.k} s={s} on={onBot} set={setOnBot} />)}</div>
        <svg width={W} height={H2} onPointerMove={onMove} onPointerLeave={() => setHover(null)} style={{ display: "block", touchAction: "pan-y" }} role="img" aria-label="Kunlik lidlar grafigi">
          {fadeBand(H2)}
          <Grid max={botMax} H={H2} fmt={(t) => fmtN(t)} side="L" />
          {BOT.filter((s) => onBot[s.k]).map((s) => <g key={s.k}>{lines(s, botMax, H2)}</g>)}
          {hoverLine(H2)}
          {dots(BOT, onBot, () => botMax, H2)}
          {rows.map((r) => (r.i % step === 0 ? <text key={r.d} x={X(r.i)} y={H2 - 8} fontSize="11" fill={r.has ? "#566573" : "#B5C0CA"} textAnchor="middle">{xLabel(r)}</text> : null))}
        </svg>
        {hv && (
          <div className="ctip" style={{ left: Math.min(Math.max(X(hv.i) + 12, 0), W - 200) }}>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>{dmy(hv.d)}{hv.fade ? " · ishlanmoqda" : ""}</div>
            {!hv.has && <div className="muted">Hali kelmagan kun · reja {hv.plan}</div>}
            {hv.has && TOP.filter((s) => onTop[s.k]).map((s) => <Row key={s.k} c={s.color} l={s.label} v={money(hv[s.k])} />)}
            {hv.has && BOT.filter((s) => onBot[s.k]).map((s) => <Row key={s.k} c={s.color} l={s.label} v={hv[s.k] == null ? "—" : fmtN(hv[s.k])} />)}
            {hv.has && hv.prog > 0 && <div className="muted" style={{ marginTop: 4 }}>⏳ {hv.prog} ta lid hali jarayonda</div>}
          </div>
        )}
      </div>
      <div className="muted">Lid, sifatli lid, keldi va sotuv lid tushgan kunga yoziladi. Oxirgi {FADE_DAYS} kun och rangda: bu kunlarning lidlari hali ishlanmoqda, sifatli lid soni keyin oshadi. Meta CPL = sarf ÷ forma lidlari, sifatli lid narxi = sarf ÷ sifatli lid (barcha manba).{data && data.historyUsed === false ? " Davr eski bo'lgani uchun bosqich tarixi o'qilmadi: lid holati joriy bosqichiga qarab olindi." : ""}</div>
    </div>
  );
}

function Row({ c, l, v }) {
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 3, background: c, borderRadius: 2 }} />{l}</span><b>{v}</b></div>;
}
