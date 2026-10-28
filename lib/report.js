// Telegram hisoboti: panel hisoblagan ko'rsatkichlardan qisqa matn (HTML). Panel bilan bir xil raqamlar chiqadi.
import cfg from "../projects.config";
import { getProjectData, projectStatus } from "./data";
import { buildView, tashkentNow } from "./calc";
import { getUsdRate } from "./rate";
import { getPlans, planEntry, projectWithThresholds } from "./store";
import { buildDailyPlan, monthKey } from "./plan";
import { resolveRange } from "./range";
import { esc } from "./telegram";
import { projectEnv } from "./env";
import { fetchLeadDirectSplit } from "./meta";

export const reportProjects = () => cfg.projects.filter((p) => projectStatus(p).ok);

// key: "yesterday" (kecha) yoki "today" (bugun hozirgacha). opts.ads: reklamalar bo'yicha eng yaxshi/yomon ro'yxati
export async function loadView(p0, key) {
  const p = await projectWithThresholds(p0); // paneldan saqlangan chegaralar
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
  // CRM uzilishi bo'lsa: hisobot boshida ogohlantirish (CRM'ga asoslangan raqamlar to'liq emas)
  if (v.crmGap && v.crmGap.bad) { L.push(""); L.push("🚨 <b>CRM'ga " + v.crmGap.gap + " ta lid tushmagan</b> (Meta formasida " + v.crmGap.meta + ", CRM'da reklamadan " + v.crmGap.crm + "). Sarf, lid va Meta CPL Meta bo'yicha to'g'ri; sifat ko'rsatkichlari CRM to'ldirilgach hisoblanadi."); }
  L.push("");
  L.push(line("💰", "Sarf", k("Umumiy sarf")));
  const jl = k("Jami lid"), G = v.crmGap, GAP = !!(G && G.bad);
  // Lid: Meta forma lidlari (Ads Manager bilan bir xil) va CRM'dagi soni yonma-yon
  if (G && G.meta != null) L.push("👥 Lid: <b>" + G.meta + "</b> (Meta formasi) · CRM'da <b>" + esc(jl ? jl.value : "—") + "</b>" + (jl && jl.note ? " <i>(" + esc(jl.note.split(" · ")[0]) + ")</i>" : ""));
  else L.push(jl ? "👥 Lid: <b>" + esc(jl.value) + "</b>" + (jl.note ? " <i>(" + esc(jl.note) + ")</i>" : "") : null);
  L.push(line("💵", "Meta CPL", k("Meta CPL")));
  const fn = v.funnel || [];
  const sq = k("Sifatli lid ulushi"), good = p.crm === "bitrix" ? (fn[1] || {}).count : (fn[2] || {}).count;
  if (GAP) L.push("✅ Sifatli lid va 🎯 sifatli lid narxi: ⏳ <i>CRM to'liq emas, hisoblanmadi</i>");
  else {
    L.push(sq ? "✅ Sifatli lid: <b>" + esc(good || "—") + "</b> (" + esc(sq.value) + ")" + (sq.flag ? " ⚠️" : "") : null);
    L.push(line("🎯", "Sifatli lid narxi", k("Sifatli lid narxi")));
  }
  // Voronka qadamlari tartibi bo'yicha (bosqich nomlari loyihada har xil bo'lishi mumkin)
  const visit = p.crm === "bitrix" ? null : fn[4] ? fn[4].count : null, sale = fn.length ? fn[fn.length - 1].count : null;
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
  if (o.ads !== false && !GAP) { // CRM to'liq bo'lmasa sifat bo'yicha reklamalar reytingi berilmaydi
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
  const al = (v.alerts || []).filter((a) => (a.isRed || a.isAmber) && !/^CRM.ga \d+ ta lid/.test(a.title)); // CRM uzilishi yuqorida alohida yozilgan
  if (al.length) {
    L.push("");
    L.push("⚠️ <b>Ogohlantirishlar</b>:");
    al.slice(0, 5).forEach((a) => { const t = String(a.text || "").replace(/\s+/g, " "); L.push((a.isRed ? "🔴 <b>" : "🟡 <b>") + esc(a.title) + "</b>" + (t ? " — " + esc(t.length > 140 ? t.slice(0, 137) + "..." : t) : "")); });
  }
  if (o.panel) { L.push(""); L.push('🔗 <a href="' + esc(o.panel) + '?p=' + p.slug + '&r=' + key + '">Panelda ochish</a>'); }
  return { text: L.filter((x) => x !== null).join("\n"), red: v.redCount, amber: v.amberCount, kpis: v.kpis, crmGap: v.crmGap };
}

// Admin uchun qisqa umumiy xulosa: har loyiha bir qator
export function digestLine(p, r) {
  const g = (label) => { const x = r.kpis.find((k) => k.label === label || k.label.startsWith(label)); return x ? x.value : "—"; };
  return "• <b>" + esc(p.short) + "</b>: sarf " + esc(g("Umumiy sarf")) + ", lid " + esc(g("Jami lid")) + ", sifatli lid narxi " + esc(g("Sifatli lid narxi")) + (r.red ? " · 🔴 " + r.red : "") + (r.amber ? " · 🟡 " + r.amber : "") + (r.crmGap && r.crmGap.bad ? " · 🚨 CRM'ga " + r.crmGap.gap + " ta lid tushmagan" : "");
}

// ---------------------------------------------------------------------
// GURUH uchun qisqa hisobot: lid forma (sarf, lid, lid narxi), Direct (sarf, yozishmalar, narxi), jami kunlik.
// Lid soni = Meta lid formalari (Ads Manager bilan bir xil). Kiruvchi qo'ng'iroqlar qo'shilmaydi.
// ---------------------------------------------------------------------

export async function buildGroupReport(p, key) {
  const now = tashkentNow(cfg);
  const range = resolveRange({ r: key }, now);
  const c = projectEnv(p);
  const parts = await Promise.all(c.metaAccounts.map((account) => fetchLeadDirectSplit({ token: c.metaToken, account, since: range.fromStr, until: range.toStr }).catch((e) => ({ err: String(e.message || e) }))));
  const ok = parts.filter((x) => !x.err);
  if (!ok.length) throw new Error(parts.map((x) => x.err).join(" | "));
  const sum = (f) => Math.round(ok.reduce((s, x) => s + f(x), 0) * 100) / 100;
  const L = { spend: sum((x) => x.lead.spend), n: sum((x) => x.lead.leads) };
  const D = { spend: sum((x) => x.direct.spend), n: sum((x) => x.direct.msgs) };
  const usd = p.currency === "USD";
  const money = (v) => usd ? "$" + Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(v).toLocaleString("ru-RU").replace(/,/g, " ") + " so'm";
  const per = (s, n) => (n > 0 ? money(s / n) : "—");
  const T = [];
  T.push("📊 <b>" + esc(p.name) + "</b>");
  // Bugun: sana yozilmaydi (eski hisobotlar bilan adashtirmaslik uchun). Kecha va boshqa davrlar: sana bilan.
  T.push(key === "today" ? "🗓 Bugun (hozirgacha)" : "🗓 " + esc(range.label));
  const hasLead = L.spend > 0 || L.n > 0, hasDirect = D.spend > 0 || D.n > 0;
  if (hasLead || !hasDirect) {
    T.push("");
    T.push("📝 <b>LID FORMA</b>");
    T.push("💰 Sarf: <b>" + money(L.spend) + "</b>");
    T.push("👥 Lid: <b>" + L.n + "</b>");
    T.push("💵 Lid narxi: <b>" + per(L.spend, L.n) + "</b>");
  }
  if (hasDirect) {
    T.push("");
    T.push("💬 <b>DIRECT (yozishmalar)</b>");
    T.push("💰 Sarf: <b>" + money(D.spend) + "</b>");
    T.push("✉️ Yozishmalar: <b>" + D.n + "</b>");
    T.push("💵 1 yozishma narxi: <b>" + per(D.spend, D.n) + "</b>");
  }
  T.push("");
  T.push("━━━━━━━━━━━━");
  T.push("📌 <b>JAMI KUNLIK</b>");
  T.push("💰 Xarajat: <b>" + money(L.spend + D.spend) + "</b>");
  T.push(hasDirect ? "👥 Lid + yozishma: <b>" + L.n + " + " + D.n + " = " + (L.n + D.n) + "</b>" : "👥 Lid: <b>" + L.n + "</b>");
  if (parts.length > ok.length) T.push("<i>Eslatma: " + (parts.length - ok.length) + " ta reklama akkaunti o'qilmadi.</i>");
  return { text: T.join("\n"), lead: L, direct: D };
}
