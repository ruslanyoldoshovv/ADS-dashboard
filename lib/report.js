// Telegram hisoboti: panel hisoblagan ko'rsatkichlardan qisqa matn (HTML). Panel bilan bir xil raqamlar chiqadi.
import cfg from "../projects.config";
import { getProjectData, projectStatus } from "./data";
import { buildView, tashkentNow } from "./calc";
import { getUsdRate } from "./rate";
import { getPlans, planEntry } from "./store";
import { buildDailyPlan, monthKey } from "./plan";
import { resolveRange } from "./range";
import { esc } from "./telegram";

export const reportProjects = () => cfg.projects.filter((p) => projectStatus(p).ok);

// key: "yesterday" (kecha) yoki "today" (bugun hozirgacha). opts.ads: reklamalar bo'yicha eng yaxshi/yomon ro'yxati
export async function loadView(p, key) {
  const now = tashkentNow(cfg);
  const range = resolveRange({ r: key }, now);
  const [plans, rate] = await Promise.all([getPlans(), getUsdRate(cfg)]);
  const plan = buildDailyPlan(p, range.planMonth, planEntry(plans, p, range.planMonthKey));
  const isCur = range.planMonth.y === now.y && range.planMonth.m === now.m;
  const todayPlan = isCur ? plan : buildDailyPlan(p, now, planEntry(plans, p, monthKey(now, 0)));
  const D = await getProjectData(p, range, { planToday: todayPlan.byDay[now.day] || 0, rate: rate.rate });
  const v = buildView(p, D, cfg, "ad", { rate, plan, planMonth: range.planMonth, showToday: range.includesToday });
  return { v, D, range };
}

export async function buildReport(p, key, opts) {
  const o = opts || {};
  const { v, range } = await loadView(p, key);
  const k = (label) => v.kpis.find((x) => x.label === label || x.label.startsWith(label));
  const line = (icon, label, kpi, extra) => kpi ? icon + " " + label + ": <b>" + esc(kpi.value) + "</b>" + (extra || "") + (kpi.flag ? " ⚠️" : "") : null;
  const f = (label) => { const s = v.funnel.find((x) => x.label === label); return s ? s.count : null; };
  const L = [];
  L.push("📊 <b>" + esc(p.name) + "</b>");
  L.push("🗓 " + esc(range.label));
  L.push("");
  L.push(line("💰", "Sarf", k("Umumiy sarf")));
  const jl = k("Jami lid");
  L.push(jl ? "👥 Lid: <b>" + esc(jl.value) + "</b>" + (jl.note ? " <i>(" + esc(jl.note) + ")</i>" : "") : null);
  L.push(line("💵", "Meta CPL", k("Meta CPL")));
  const sq = k("Sifatli lid ulushi"), good = f("Ma'lumot berildi") || f("Sifatli lid");
  L.push(sq ? "✅ Sifatli lid: <b>" + esc(good || "—") + "</b> (" + esc(sq.value) + ")" + (sq.flag ? " ⚠️" : "") : null);
  L.push(line("🎯", "Sifatli lid narxi", k("Sifatli lid narxi")));
  const visit = f("Suhbatga keldi"), sale = f("Sotuv") || f("Buyurtma");
  if (p.crm === "bitrix") L.push("📦 Buyurtma: <b>" + esc(sale || 0) + "</b>");
  else L.push("🤝 Keldi: <b>" + esc(visit || 0) + "</b> · 💳 Sotuv: <b>" + esc(sale || 0) + "</b>");
  const sn = k("Sotuv narxi");
  if (sn && sn.value !== "—") L.push("🧾 " + (p.crm === "bitrix" ? "Buyurtma narxi" : "Sotuv narxi") + ": <b>" + esc(sn.value) + "</b>");
  const roas = k("ROAS");
  if (roas && Number(String(roas.value).replace("x", "")) > 0) L.push("📈 ROAS: <b>" + esc(roas.value) + "</b> · " + esc(roas.note.split(" · ")[0]));
  // Oylik reja
  if (v.plan && v.plan.monthPlan !== "0") {
    L.push("");
    L.push("📅 <b>" + esc(v.plan.monthTitle) + " rejasi</b>: " + esc(v.plan.fact) + " / " + esc(v.plan.monthPlan) + " " + esc(v.planUnit) + " (" + esc(v.plan.monthPct) + ")" + (v.plan.pace !== "—" ? " · tezlik " + esc(v.plan.pace) : ""));
  }
  // Reklamalar: sifatli lid narxi bo'yicha eng yaxshi va eng yomon (kamida 3 lid bo'lganlar)
  if (o.ads !== false) {
    const ads = v.rows.filter((r) => r.sv && r.sv.spend > 0 && r.sv.leads >= 3);
    const withQ = ads.filter((r) => r.sv.qCpl != null).sort((a, b) => a.sv.qCpl - b.sv.qCpl);
    const zero = ads.filter((r) => r.sv.qCpl == null && r.sv.spend > 0).sort((a, b) => b.sv.spend - a.sv.spend);
    const nm = (r) => esc(String(r.name).slice(0, 40));
    if (withQ.length) {
      L.push("");
      L.push("🏆 <b>Eng yaxshi reklamalar</b> (sifatli lid narxi):");
      withQ.slice(0, 3).forEach((r, i) => L.push((i + 1) + ". " + nm(r) + " — <b>" + esc(r.qCpl) + "</b> · " + r.leads + " lid, " + r.good + " sifatli"));
    }
    const worst = zero.concat(withQ.slice(3).reverse()).slice(0, 3);
    if (worst.length) {
      L.push("🔻 <b>E'tibor kerak:</b>");
      worst.forEach((r) => L.push("• " + nm(r) + " — " + (r.sv.qCpl == null ? "<b>sifatli lid yo'q</b>" : "<b>" + esc(r.qCpl) + "</b>") + " · sarf " + esc(r.spend) + ", " + r.leads + " lid"));
    }
  }
  // Ogohlantirishlar (qizil va sariq)
  const al = (v.alerts || []).filter((a) => a.isRed || a.isAmber);
  if (al.length) {
    L.push("");
    L.push("⚠️ <b>Ogohlantirishlar</b>:");
    al.slice(0, 5).forEach((a) => { const t = String(a.text || "").replace(/\s+/g, " "); L.push((a.isRed ? "🔴 <b>" : "🟡 <b>") + esc(a.title) + "</b>" + (t ? " — " + esc(t.length > 140 ? t.slice(0, 137) + "..." : t) : "")); });
  }
  if (o.panel) { L.push(""); L.push('🔗 <a href="' + esc(o.panel) + '?p=' + p.slug + '&r=' + key + '">Panelda ochish</a>'); }
  return { text: L.filter((x) => x !== null).join("\n"), red: v.redCount, amber: v.amberCount, kpis: v.kpis };
}

// Admin uchun qisqa umumiy xulosa: har loyiha bir qator
export function digestLine(p, r) {
  const g = (label) => { const x = r.kpis.find((k) => k.label === label || k.label.startsWith(label)); return x ? x.value : "—"; };
  return "• <b>" + esc(p.short) + "</b>: sarf " + esc(g("Umumiy sarf")) + ", lid " + esc(g("Jami lid")) + ", sifatli lid narxi " + esc(g("Sifatli lid narxi")) + (r.red ? " · 🔴 " + r.red : "") + (r.amber ? " · 🟡 " + r.amber : "");
}
