import Link from "next/link";
import cfg from "../projects.config";
import { getProjectData } from "../lib/data";
import { buildView, tashkentNow } from "../lib/calc";
import { getUsdRate } from "../lib/rate";
import { getPlans, planEntry } from "../lib/store";
import { buildDailyPlan, monthKey } from "../lib/plan";
import { resolveRange, PRESETS } from "../lib/range";
import { savePlan } from "./actions";
import StickyTable from "./StickyTable";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // amoCRM'dan ko'p lid o'qilganda vaqt yetishi uchun

const DOW = ["Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"];
const COL = { red: "#A12116", amber: "#8A4B08", green: "#05603A" };

// rq: davr parametri, masalan "r=month" yoki "from=2026-09-01&to=2026-09-30". sm: sotuv hisobi ("pay" = to'lov sanasi bo'yicha)
function href(slug, rq, by, sm) { return `/?p=${slug}&${rq}&by=${by}` + (sm === "pay" ? "&sm=pay" : ""); }

async function loadAll(range, bySel, selSlug, now, plans, rate, sm) {
  const isCur = range.planMonth.y === now.y && range.planMonth.m === now.m;
  return Promise.all(cfg.projects.map(async (p) => {
    try {
      // Tanlangan davr oyi uchun panelda kiritilgan reja bo'lsa o'sha, bo'lmasa sozlamadagi standart reja
      const plan = buildDailyPlan(p, range.planMonth, planEntry(plans, p, range.planMonthKey));
      const todayPlan = isCur ? plan : buildDailyPlan(p, now, planEntry(plans, p, monthKey(now, 0)));
      // Sotuv hisobi rejimi faqat tanlangan loyihaga qo'llanadi (qolganlari uchun ortiqcha so'rov yuborilmaydi)
      const D = await getProjectData(p, range, { planToday: todayPlan.byDay[now.day] || 0, rate: rate.rate, saleMode: p.slug === selSlug ? sm : "lead" });
      const view = buildView(p, D, cfg, p.slug === selSlug ? bySel : "ad", { rate, plan, planMonth: range.planMonth, showToday: range.includesToday });
      return { p, view, D, error: null };
    } catch (e) {
      return { p, view: null, D: null, error: String(e.message || e) };
    }
  }));
}

export default async function Page({ searchParams }) {
  const sp = searchParams || {};
  const by = ["ad", "campaign", "adset"].includes(sp.by) ? sp.by : "ad";
  const sm = sp.sm === "pay" ? "pay" : "lead";
  const sel = cfg.projects.find((x) => x.slug === sp.p) || cfg.projects[0];
  const now = tashkentNow(cfg);
  const range = resolveRange(sp, now);
  const [plans, rate] = await Promise.all([getPlans(), getUsdRate(cfg)]);
  const all = await loadAll(range, by, sel.slug, now, plans, rate, sm);
  const cur = all.find((x) => x.p.slug === sel.slug);
  const v = cur.view;

  // Oylik lid rejasi formasi: tanlangan davr oyi uchun (har oy alohida saqlanadi)
  const entry = planEntry(plans, sel, range.planMonthKey);
  const oldEntry = !entry && plans.items[sel.slug + ":" + range.planMonthKey] ? plans.items[sel.slug + ":" + range.planMonthKey] : null; // eski o'lchovda (jami lid) kiritilgan reja
  const unit = sel.planBy === "quality" ? "sifatli lid" : "lid";
  const planForm = {
    ready: plans.ready, storeError: plans.error,
    ym: range.planMonthKey, label: range.planMonthLabel, n: entry ? entry.n : null, sun: entry ? entry.sun : 1,
    total: v ? v.planTotal : null, unit, oldN: oldEntry ? oldEntry.n : null,
    saved: typeof sp.saved === "string" ? sp.saved : "", err: typeof sp.err === "string" ? sp.err : ""
  };
  const ERR = {
    input: "Reja saqlanmadi: son 1 dan 100 000 gacha butun bo'lishi kerak.",
    nostore: "Reja saqlanmadi: saqlash joyi hali ulanmagan.",
    store: "Reja saqlanmadi: saqlash joyi javob bermadi. Birozdan keyin qayta urinib ko'ring."
  };

  return (
    <div style={{ maxWidth: 1296, margin: "0 auto", padding: "32px clamp(16px, 4vw, 32px) 48px", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Loyiha tanlash */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#566573", letterSpacing: "0.04em", textTransform: "uppercase" }}>Reklama va lidlar paneli · loyihani tanlang</div>
        <nav className="tabs" aria-label="Loyihani tanlash">
          {all.map(({ p, view, error }) => {
            let pill = { bg: "#E4F5EA", ink: "#05603A", text: "Joyida" };
            if (error) pill = { bg: "#E6EBEF", ink: "#2B3A46", text: "Ulanmagan" };
            else if (view.redCount > 0) pill = { bg: "#FDECEA", ink: "#A12116", text: view.redCount + " xavf" };
            else if (view.amberCount > 0) pill = { bg: "#FEF3C7", ink: "#7A3F06", text: view.amberCount + " diqqat" };
            return (
              <Link key={p.slug} href={href(p.slug, range.query, "ad")} className="tab" aria-current={p.slug === sel.slug ? "true" : undefined}>
                <span style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontWeight: 800, fontSize: 15 }}>{p.short}</span>
                  <span className="sub">{p.niche}</span>
                </span>
                <span className="pill" style={{ background: pill.bg, color: pill.ink }}>{pill.text}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Sarlavha, sana va oylik reja */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h1 style={{ fontSize: 28, lineHeight: 1.2, fontWeight: 800, letterSpacing: "-0.01em" }}>{sel.name}</h1>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            <span className="muted" style={{ fontSize: 14 }}>Meta Ads + amoCRM · {range.label}</span>
            {cur.D && (
              <span className="pill" style={{ background: cur.D.mode === "demo" ? "#E8EEF9" : "#E4F5EA", color: cur.D.mode === "demo" ? "#1D4ED8" : "#05603A" }}>
                {cur.D.mode === "demo" ? "Namuna ma'lumotlar" : "Jonli ma'lumot"}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 12 }}>
          <SaleMode sel={sel} rq={range.query} by={by} sm={sm} />
          <DatePicker range={range} sel={sel} by={by} sm={sm} />
          <PlanForm f={planForm} sel={sel} by={by} range={range} />
        </div>
      </div>

      {range.note && <div style={{ padding: "10px 14px", borderRadius: 10, background: "#FFF8E6", color: "#7A3F06", fontSize: 13 }}>{range.note}</div>}
      {planForm.saved === planForm.ym && planForm.n && <div style={{ padding: "10px 14px", borderRadius: 10, background: "#E4F5EA", color: "#05603A", fontSize: 13, fontWeight: 600 }}>Saqlandi: {planForm.label} uchun oylik reja {planForm.n} {planForm.unit}.</div>}
      {planForm.err && ERR[planForm.err] && <div style={{ padding: "10px 14px", borderRadius: 10, background: "#FDECEA", color: "#A12116", fontSize: 13, fontWeight: 600 }}>{ERR[planForm.err]}</div>}
      {planForm.storeError && <div style={{ padding: "10px 14px", borderRadius: 10, background: "#FFF8E6", color: "#7A3F06", fontSize: 13 }}>Saqlangan rejalar o'qilmadi ({planForm.storeError}). Hozircha standart reja ko'rsatilmoqda.</div>}

      {cur.error && (
        <div className="card" style={{ borderColor: "#F0B4AC", background: "#FDF3F2" }}>
          <h2 className="h2" style={{ color: "#A12116" }}>Ma'lumot olinmadi</h2>
          <div style={{ fontSize: 14 }}>{cur.error}</div>
          <div className="muted">Tekshirish uchun: /api/check?p={sel.slug}</div>
        </div>
      )}

      {v && <Body v={v} sel={sel} rq={range.query} by={by} sm={sm} />}
    </div>
  );
}

// Sana tanlash: tayyor davrlar yoki kalendar orqali ixtiyoriy oraliq
function DatePicker({ range, sel, by, sm }) {
  const cap = { fontSize: 12, fontWeight: 700, color: "#566573", letterSpacing: "0.03em", textTransform: "uppercase" };
  const lab = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700, color: "#566573" };
  return (
    <details className="pop">
      <summary className="popbtn">
        <span style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#566573" }}>Sana</span>
          <span style={{ fontWeight: 700 }}>{range.label}</span>
        </span>
        <span aria-hidden="true" style={{ color: "#566573" }}>▾</span>
      </summary>
      <div className="poppanel">
        <div style={cap}>Tayyor davrlar</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
          {PRESETS.map(([k, l]) => (
            <Link key={k} href={href(sel.slug, "r=" + k, by, sm)} className="chip" aria-current={range.preset === k ? "true" : undefined}>{l}</Link>
          ))}
        </div>
        <div style={cap}>Sana oralig'i</div>
        <form method="get" action="/" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input type="hidden" name="p" value={sel.slug} />
          <input type="hidden" name="by" value={by} />
          {sm === "pay" && <input type="hidden" name="sm" value="pay" />}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
            <label style={lab}>Boshlanishi
              <input className="field" type="date" name="from" defaultValue={range.fromStr} max={range.todayStr} required />
            </label>
            <label style={lab}>Tugashi
              <input className="field" type="date" name="to" defaultValue={range.toStr} max={range.todayStr} required />
            </label>
          </div>
          <button type="submit" className="btn">Qo'llash</button>
        </form>
        <div className="muted">Bir martada eng ko'pi 92 kun. Oylik reja davr tugagan oy bo'yicha ko'rsatiladi.</div>
      </div>
    </details>
  );
}

// Sotuv hisobi: lid sanasi bo'yicha (standart) yoki to'lov sanasi bo'yicha
function SaleMode({ sel, rq, by, sm }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#566573" }}>Sotuv hisobi</span>
      <div className="seg" role="group" aria-label="Sotuv hisobi">
        <Link href={href(sel.slug, rq, by, "lead")} aria-current={sm !== "pay" ? "true" : undefined}>Lid sanasi bo'yicha</Link>
        <Link href={href(sel.slug, rq, by, "pay")} aria-current={sm === "pay" ? "true" : undefined}>To'lov sanasi bo'yicha</Link>
      </div>
    </div>
  );
}

// Oylik lid rejasi: tanlangan davr oyi uchun kiritiladi, har oy alohida saqlanadi va kunlarga avtomatik bo'linadi
function PlanForm({ f, sel, by, range }) {
  const lab = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700, color: "#566573" };
  return (
    <details className="pop">
      <summary className="popbtn">
        <span style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#566573" }}>Oylik reja · {f.label}</span>
          <span style={{ fontWeight: 700 }}>{f.n ? f.n + " " + f.unit : "kiritilmagan" + (f.total ? " (standart " + f.total + ")" : "")}</span>
        </span>
        <span aria-hidden="true" style={{ color: "#566573" }}>▾</span>
      </summary>
      <div className="poppanel">
        <div>
          <div style={{ fontWeight: 700 }}>{f.label} uchun {f.unit} rejasi</div>
          <div className="muted">{f.unit === "sifatli lid" ? "Oy davomida olinishi kerak bo'lgan SIFATLI lidlar soni kiritiladi (jami lid emas). " : "Oylik son kiritiladi. "}Son kunlarga avtomatik bo'linadi. Har oy alohida saqlanadi: boshqa oyni tanlasangiz, o'sha oyning rejasi chiqadi.</div>
          {f.oldN && <div className="muted" style={{ color: "#7A3F06" }}>Bu oy uchun avval jami lid bo'yicha {f.oldN} kiritilgan edi. Endi reja sifatli lid sonida o'lchanadi, shuning uchun sonni qayta kiriting.</div>}
        </div>
        {!f.ready && <div style={{ padding: "10px 14px", borderRadius: 10, background: "#FFF8E6", color: "#7A3F06", fontSize: 13 }}>Forma ishlamaydi: rejani saqlash joyi ulanmagan (Vercel, Storage, Upstash for Redis).</div>}
        <form action={savePlan} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input type="hidden" name="slug" value={sel.slug} />
          <input type="hidden" name="by" value={by} />
          <input type="hidden" name="rq" value={range.query} />
          <input type="hidden" name="month" value={f.ym} />
          <label style={lab}>Oylik {f.unit} rejasi
            <input className="field" name="plan" type="number" min="1" max="100000" step="1" required inputMode="numeric" placeholder={f.unit === "sifatli lid" ? "masalan 600" : "masalan 1200"} defaultValue={f.n || ""} disabled={!f.ready} />
          </label>
          <label style={lab}>Yakshanba
            <select className="field" name="sun" defaultValue={String(f.sun)} disabled={!f.ready}>
              <option value="1">Oddiy kun (teng)</option>
              <option value="0.65">Kamroq (65%)</option>
              <option value="0">Dam olish (0)</option>
            </select>
          </label>
          <button type="submit" className="btn" disabled={!f.ready}>Rejani saqlash</button>
        </form>
      </div>
    </details>
  );
}

function Body({ v, sel, rq, by, sm }) {
  return (
    <>
      {/* Bugun: faqat tanlangan davr bugunni o'z ichiga olganda */}
      {v.showToday && <div className="card" style={{ borderColor: v.todayBorder }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <h2 className="h2">Bugun · kun oxirigacha prognoz</h2>
          <span className="muted">{v.todaySub}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {v.todayTiles.map((t) => (
            <div key={t.label} style={{ padding: "14px 16px", borderRadius: 12, background: "#F3F5F7", display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#566573", letterSpacing: "0.03em", textTransform: "uppercase" }}>{t.label}</div>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 24, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{t.value}</span>
                <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: t.devBg, color: t.devInk }}>{t.dev}</span>
              </div>
              <div className="muted">{t.sub}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: "14px 16px", borderRadius: 12, background: v.todayBg, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: v.todayInk }}>{v.todayVerdict}</div>
          {v.todayLines.map((l, i) => <div key={i} style={{ fontSize: 14, color: "#2B3A46" }}>{l}</div>)}
        </div>
        <div style={{ fontSize: 12, color: "#566573" }}>{v.todayFresh}</div>
      </div>}

      {/* KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        {v.kpis.map((k) => (
          <div key={k.label} style={{ padding: 20, borderRadius: 16, display: "flex", flexDirection: "column", gap: 6, border: `1px solid ${k.border}`, background: k.bg, color: k.ink }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: k.sub }}>{k.label}</div>
            {k.isBad && <span className="pill" style={{ alignSelf: "flex-start", background: "#FFFFFF", color: "#A12116" }}>⚠ {k.flag}</span>}
            <div style={{ fontSize: 28, lineHeight: 1.15, fontWeight: 800, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{k.value}</div>
            <div style={{ fontSize: 13, color: k.sub }}>{k.note}</div>
          </div>
        ))}
      </div>

      {/* Ogohlantirishlar: yopiq turadi, bosilganda ochiladi */}
      <details className="card fold">
        <summary>
          <span className="h2">Ogohlantirishlar</span>
          <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <span className="pill" style={{ background: "#FDECEA", color: COL.red }}>Xavf: {v.redCount}</span>
            <span className="pill" style={{ background: "#FEF3C7", color: COL.amber }}>Diqqat: {v.amberCount}</span>
            <span className="muted foldhint" />
          </span>
        </summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
        <div style={{ padding: "10px 14px", borderRadius: 10, background: "#F3F5F7", fontSize: 13, color: "#2B3A46" }}>{v.thresholdsText}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(360px, 100%), 1fr))", gap: 12 }}>
          {v.alerts.map((a, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16, borderRadius: 12, background: a.bg }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                {a.isRed && <span className="pill" style={{ background: "#FFFFFF", color: COL.red }}>Xavf</span>}
                {a.isAmber && <span className="pill" style={{ background: "#FFFFFF", color: COL.amber }}>Diqqat</span>}
                <span style={{ fontWeight: 700 }}>{a.title}</span>
              </div>
              <div style={{ color: "#2B3A46", fontSize: 14 }}>{a.text}</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Tavsiya: {a.action}</div>
            </div>
          ))}
        </div>
        </div>
      </details>

      {/* Oylik reja + kalendar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "stretch" }}>
        <div id="reja" className="card" style={{ flex: "1 1 300px", minWidth: 0, gap: 20 }}>
          <div>
            <h2 className="h2">Oylik reja</h2>
            <div className="muted">{v.plan.monthTitle} · {v.planByQuality ? "sifatli lidlar (barcha manba)" : "barcha lidlar"}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontSize: 44, lineHeight: 1, fontWeight: 800, letterSpacing: "-0.03em" }}>{v.plan.monthPct}</span>
              <span style={{ fontSize: 14, color: "#566573" }}><b style={{ color: "#14212B" }}>{v.plan.fact}</b> / {v.plan.monthPlan} {v.planUnit}</span>
            </div>
            <div style={{ position: "relative", height: 14, borderRadius: 999, background: "#E6EBEF" }}>
              <div style={{ height: 14, borderRadius: 999, background: "#1D4ED8", width: `min(${v.plan.monthPct}, 100%)` }} />
              <div style={{ position: "absolute", top: -4, width: 3, height: 22, borderRadius: 2, background: "#14212B", left: v.plan.expectedPct }} />
            </div>
            <div style={{ fontSize: 12, color: "#566573" }}>Qora chiziq: kechagacha bajarilishi kerak bo'lgan ulush ({v.plan.expectedPct})</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
            <Tile t="Kechagacha reja" v={v.plan.planToDate} s={v.planUnit} />
            <Tile t="Reja tezligi" v={v.plan.pace} s={v.plan.paceWord} bg={v.plan.paceBg} ink={v.plan.paceInk} />
            <Tile t="Qolgan reja" v={v.plan.remaining} s={v.planUnit + " · " + v.plan.daysLeft + " kun qoldi"} />
            <Tile t="Kuniga kerak" v={v.plan.perDay} s={v.planUnit + " · rejaga yetish uchun"} />
            <Tile t="Oy oxiriga prognoz" v={v.plan.forecast} s={v.planUnit + " · rejaning " + v.plan.forecastPct} />
          </div>
        </div>

        <div className="card" style={{ flex: "2 1 560px", minWidth: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <h2 className="h2">Kunlik reja{v.planByQuality ? " (sifatli lid)" : ""}: {v.plan.monthTitle}</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12, fontWeight: 700 }}>
              <span style={{ padding: "4px 10px", borderRadius: 999, background: "#E4F5EA", color: "#05603A" }}>100% va undan yuqori</span>
              <span style={{ padding: "4px 10px", borderRadius: 999, background: "#FEF3C7", color: "#7A3F06" }}>80-99%</span>
              <span style={{ padding: "4px 10px", borderRadius: 999, background: "#FDECEA", color: "#A12116" }}>80% dan past</span>
              <span style={{ padding: "4px 10px", borderRadius: 999, background: "#F3F5F7", color: "#566573" }}>Kelgusi kun</span>
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 640, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 8, color: "#566573", fontSize: 12, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", textAlign: "center" }}>
                {DOW.map((d) => <div key={d}>{d}</div>)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 8 }}>
                {v.cells.map((c, i) => c.blank ? <div key={i} /> : (
                  <div key={i} style={{ minHeight: 96, padding: 10, borderRadius: 12, display: "flex", flexDirection: "column", gap: 2, fontVariantNumeric: "tabular-nums", border: `${c.borderW}px solid ${c.border}`, background: c.bg, color: c.ink }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                      <span style={{ fontSize: 15, fontWeight: 800 }}>{c.day}</span>
                      {c.isToday && <span style={{ fontSize: 11, fontWeight: 800, padding: "1px 8px", borderRadius: 999, background: "#14212B", color: "#FFFFFF" }}>Bugun</span>}
                    </div>
                    <div style={{ fontSize: 12 }}>Reja: <b>{c.plan}</b></div>
                    {c.showFact && <div style={{ fontSize: 12 }}>{c.factLabel}: <b>{c.fact}</b></div>}
                    {c.showPct && <div style={{ fontSize: 16, fontWeight: 800 }}>{c.pct}</div>}
                    {c.extra && <div style={{ fontSize: 11, opacity: 0.8, marginTop: "auto" }}>{c.extra}</div>}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: "#566573" }}>{v.planNote}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Voronka + manba */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))", gap: 16 }}>
        <div className="card">
          <div><h2 className="h2">Sotuv voronkasi (amoCRM bosqichlari)</h2><div className="muted">Foiz: oldingi bosqichdan o'tgan lidlar ulushi</div></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {v.funnel.map((f) => (
              <div key={f.label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {f.qStart && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", color: "#1D4ED8", fontSize: 12, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase" }}>
                    <span style={{ flexGrow: 1, borderTop: "2px dashed #1D4ED8" }} /><span>Shu yerdan boshlab lid sifatli</span><span style={{ flexGrow: 1, borderTop: "2px dashed #1D4ED8" }} />
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
                  <span style={{ fontWeight: 600 }}>{f.label}</span>
                  <span style={{ color: "#566573", fontVariantNumeric: "tabular-nums" }}><b style={{ color: "#14212B" }}>{f.count}</b> · {f.rate}</span>
                </div>
                <div style={{ height: 10, borderRadius: 999, background: "#E6EBEF", overflow: "hidden" }}><div style={{ height: 10, borderRadius: 999, width: f.width, background: f.color }} /></div>
              </div>
            ))}
          </div>
          {v.dataWarn && <div style={{ padding: "10px 14px", borderRadius: 10, background: "#FFF8E6", fontSize: 13, color: "#7A3F06" }}>{v.dataWarn}</div>}
        </div>

        <div className="card">
          <div><h2 className="h2">Lid manbasi</h2><div className="muted">{v.sourceNote || "Reklama tegi bor lid reklamadan. incoming_call tegli yoki tegsiz lid kiruvchi qo'ng'iroq deb olinadi."}</div></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {v.sources.map((s) => (
              <div key={s.name} style={{ padding: 16, borderRadius: 12, background: "#F3F5F7", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>{s.name}</span><span className="muted">{s.note}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                  <Stat l="Lid" v={s.leads} /><Stat l="Sifatli" v={s.quality} s={s.qualityPct} /><Stat l="Keldi" v={s.visits} /><Stat l="Sotuv" v={s.sales} />
                </div>
              </div>
            ))}
          </div>
          <div className="muted">Ogohlantirish: reklama ta'sirida qo'ng'iroq qilgan, lekin teg olmagan mijozlar "Kiruvchi qo'ng'iroq"da turadi. Shu sabab reklamaning haqiqiy natijasi jadvaldagidan biroz yuqori bo'lishi mumkin.</div>
        </div>
      </div>

      {/* Jadval */}
      <div className="tblcard">
        <div style={{ padding: "20px 24px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <h2 className="h2">{v.tableTitle}</h2>
            <div className="muted">Qizil raqam: chegaradan oshgan yoki past ko'rsatkich. Sifatli lid = "Ma'lumot berildi" va undan keyingi bosqichga o'tgan lid</div>
            <div className="muted" style={{ color: v.saleMode === "pay" ? "#5B21B6" : undefined }}>{v.saleModeNote}</div>
          </div>
          <div className="seg soft" role="group" aria-label="Guruhlash">
            {[["ad", "Kreativ"], ["campaign", "Kampaniya"], ["adset", "Ad set"]].map(([k, l]) => (
              <Link key={k} href={href(sel.slug, rq, k, sm)} aria-current={k === by ? "true" : undefined}>{l}</Link>
            ))}
          </div>
        </div>
        <StickyTable head={
          <div className="tbl head">
            <div className="sticky">{v.nameHeader}</div><div className="r">{v.spendHeader}</div><div className="r">Lid</div><div>Sifatli</div><div className="r">Nedozvon</div><div className="r">Jarayonda</div><div className="r">Yo'qotilgan</div><div className="r">Keldi</div><div className="r">Sotuv</div><div className="r">Lid → sotuv</div><div className="r">{v.revenueHeader || "Daromad, so'm"}</div><div className="r">ROAS</div><div className="r">Meta CPL</div><div className="r">Sifatli lid narxi</div><div className="r">Sotuv narxi</div><div className="r">Dubl</div><div>Tavsiya</div>
          </div>
        }>
          {v.rows.map((r, i) => (
            <div key={i} className="tbl" style={{ background: r.rowBg }}>
              <div className="sticky" style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontWeight: 700 }}>{r.name}</span><span className="muted">{r.sub}</span></div>
              <div className="r">{r.spend}</div>
              <div className="r" style={{ fontWeight: 700 }}>{r.leads}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ color: r.goodColor, whiteSpace: "nowrap" }}><b>{r.goodPct}</b> · {r.good}</span>
                <div style={{ height: 8, borderRadius: 999, background: "#E6EBEF", overflow: "hidden" }}><div style={{ height: 8, borderRadius: 999, width: r.goodPct, background: r.barColor }} /></div>
              </div>
              <Two a={r.noAns} b={r.noAnsPct} c={r.noAnsColor} bold />
              <Two a={r.inProg} b={r.inProgPct} c="#566573" />
              <Two a={r.lost} b={r.lostPct} c="#566573" />
              <div className="r">{r.visits}</div>
              <div className="r" style={{ fontWeight: 700 }}>{r.sales}</div>
              <div className="r" style={{ fontWeight: 700, color: r.crColor }}>{r.cr}</div>
              <div className="r">{r.revenue}</div>
              <div className="r" style={{ fontWeight: 800, color: r.roasColor }}>{r.roas}</div>
              <div className="r" style={{ fontWeight: 700, color: r.cplColor }}>{r.metaCpl}</div>
              <div className="r" style={{ fontWeight: 800, color: r.qcplColor }}>{r.qCpl}</div>
              <div className="r" style={{ fontWeight: 800 }}>{r.saleCpl}</div>
              <Two a={r.dup} b={r.dupPct} c={r.dupColor} bold />
              <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                {r.isOff && <span className="pill" style={{ minHeight: 28, padding: "0 10px", fontSize: 12, background: "#FDECEA", color: "#A12116" }}>✕ O'chirish</span>}
                {r.isScale && <span className="pill" style={{ minHeight: 28, padding: "0 10px", fontSize: 12, background: "#E4F5EA", color: "#05603A" }}>↗ Kuchaytirish</span>}
                {r.isWatch && <span className="pill" style={{ minHeight: 28, padding: "0 10px", fontSize: 12, background: "#FEF3C7", color: "#8A4B08" }}>◉ Kuzatish</span>}
                {r.trust && <span style={{ fontSize: 12, fontWeight: 600, color: "#8A4B08" }}>{r.trust}</span>}
              </div>
            </div>
          ))}
        </StickyTable>
        {v.hidden.show && <HiddenSales h={v.hidden} />}
      </div>

      {/* Sabablar + operatorlar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))", gap: 16 }}>
        <div className="card">
          <div><h2 className="h2">LOST sabablari</h2><div className="muted">{v.reasonsSub}</div></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {v.reasons.map((x) => (
              <div key={x.label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
                  <span style={{ fontWeight: 600 }}>{x.label}</span><span style={{ color: "#566573", whiteSpace: "nowrap" }}><b style={{ color: "#14212B" }}>{x.count} ta</b> · {x.share} <span style={{ fontSize: 12 }}>(sifatli {x.good} · sifatsiz {x.bad})</span></span>
                </div>
                <div style={{ height: 10, borderRadius: 999, background: "#E6EBEF", overflow: "hidden" }}><div style={{ height: 10, borderRadius: 999, background: "#7A8B99", width: x.width }} /></div>
              </div>
            ))}
          </div>
          <div style={{ padding: "12px 16px", borderRadius: 12, background: "#F3F5F7", fontSize: 14, color: "#2B3A46" }}>{v.reasonsNote}</div>
        </div>

        <div className="card">
          <div><h2 className="h2">Operatorlar</h2><div className="muted">{(v.opAvg == null ? "" : "O'rtacha birinchi javob vaqti: " + v.opAvg + " daqiqa. ") + "Taklif qilindi: shu davrda tushib, hozir shu bosqichda turgan lidlar." + (v.saleMode === "pay" ? " Sotuv: to'lov sanasi bo'yicha." : "")}</div></div>
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 500 }}>
              <OpRow head cells={["Operator", "Javob vaqti", "Lid", "Sifatli", "Taklif qilindi", "Keldi", "Sotuv"]} />
              {v.operators.map((o) => (
                <OpRow key={o.name} cells={[<b key="n">{o.name}</b>, <span key="r" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{o.isSlow && <span className="pill" style={{ background: "#FDECEA", color: "#A12116", minHeight: 22 }}>Sekin</span>}<b>{o.reply}</b></span>, o.leads, <span key="g" style={{ whiteSpace: "nowrap" }}><b>{o.goodPct}</b> · {o.good}</span>, o.offer, o.visits, <b key="s">{o.sales}</b>]} />
              ))}
            </div>
          </div>
          <div style={{ padding: "12px 16px", borderRadius: 12, background: "#F3F5F7", fontSize: 14, color: "#2B3A46" }}>{v.opNote}</div>
        </div>
      </div>

      {/* Qoidalar */}
      <div className="card">
        <h2 className="h2">Hisoblash qoidalari</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          {v.rules.map((u) => (
            <div key={u.title} style={{ padding: 16, borderRadius: 12, background: "#F3F5F7", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontWeight: 700 }}>{u.title}</div><div style={{ fontSize: 14, color: "#2B3A46" }}>{u.text}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// 2-rejim: oldingi davr reklamalaridan kelgan sotuvlar. Standart yopiq, bosilganda ochiladi; jadval jamisiga qo'shilmaydi.
function HiddenSales({ h }) {
  return (
    <details className="fold hidsale">
      <summary>
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontWeight: 800 }}>Oldingi davr reklamalari sotuvi ({h.count} ta)</span>
          <span style={{ fontSize: 12 }}>Shu davrda sarfi bo'lmagan reklamalardan kelgan lidlar to'lovi. Jadval jamisiga kirmaydi, yuqoridagi umumiy kartochkalarga kiradi.</span>
        </span>
        <span className="muted foldhint" />
      </summary>
      {h.rows.length === 0 ? <div style={{ padding: "8px 0", fontSize: 14 }}>Bu davrda bunday sotuv yo'q.</div> : (
        <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
          <div className="hidrow head"><div>Reklama</div><div>Lid tushgan</div><div className="r">Sotuv</div><div className="r">Daromad, so'm</div></div>
          {h.rows.map((r, i) => (
            <div key={i} className="hidrow"><div style={{ display: "flex", flexDirection: "column" }}><b>{r.name}</b><span style={{ fontSize: 12 }}>{r.sub}</span></div><div>{r.leadFrom}</div><div className="r"><b>{r.sales}</b></div><div className="r">{r.revenue}</div></div>
          ))}
          <div className="hidrow total"><div>Jami</div><div /><div className="r">{h.count}</div><div className="r">{h.revenue}</div></div>
        </div>
      )}
    </details>
  );
}

function Tile({ t, v, s, bg, ink }) {
  return (
    <div style={{ padding: "12px 14px", borderRadius: 12, background: bg || "#F3F5F7" }}>
      <div style={{ fontSize: 12, color: ink || "#566573" }}>{t}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: ink, fontVariantNumeric: "tabular-nums" }}>{v}</div>
      {s && <div style={{ fontSize: 12, fontWeight: ink ? 700 : 400, color: ink || "#566573" }}>{s}</div>}
    </div>
  );
}
function Stat({ l, v, s }) {
  return <div><div style={{ fontSize: 12, color: "#566573" }}>{l}</div><div style={{ fontSize: 20, fontWeight: 800 }}>{v}</div>{s && <div style={{ fontSize: 12, color: "#566573" }}>{s}</div>}</div>;
}
function Two({ a, b, c, bold }) {
  return <div className="r" style={{ display: "flex", flexDirection: "column" }}><span>{a}</span><span style={{ fontSize: 12, fontWeight: bold ? 700 : 400, color: c }}>{b}</span></div>;
}
function OpRow({ cells, head }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(96px, 1.3fr) 80px 40px 76px 62px 44px 44px", gap: 8, alignItems: "center", padding: head ? "8px 0" : "12px 0", borderTop: head ? 0 : "1px solid #E9EEF2", fontVariantNumeric: "tabular-nums", color: head ? "#566573" : undefined, fontSize: head ? 12 : undefined, fontWeight: head ? 700 : undefined, textTransform: head ? "uppercase" : undefined, letterSpacing: head ? "0.03em" : undefined }}>
      {cells.map((c, i) => <div key={i} style={{ textAlign: i === 0 ? "left" : "right" }}>{c}</div>)}
    </div>
  );
}
