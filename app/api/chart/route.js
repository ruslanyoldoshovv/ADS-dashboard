// Grafik ma'lumoti: /api/chart?p=nexus-school&k=month
// k: week (shu hafta), lastweek (o'tgan hafta), month (shu oy), lastmonth (o'tgan oy), m-2026-08 (istalgan oy)
// Panelning asosiy sana tanlagichiga bog'liq emas: faqat grafik yuklanadi.
import cfg from "../../../projects.config";
import { getChartData } from "../../../lib/data";
import { tashkentNow } from "../../../lib/calc";
import { getPlans, planEntry } from "../../../lib/store";
import { buildDailyPlan } from "../../../lib/plan";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
const pad = (n) => String(n).padStart(2, "0");
const ymd = (dt) => dt.getUTCFullYear() + "-" + pad(dt.getUTCMonth() + 1) + "-" + pad(dt.getUTCDate());

// Tanlash mumkin bo'lgan davrlar: haftalar va oylar (joriy oydan 6 oy orqaga)
function periods(now) {
  const today = new Date(Date.UTC(now.y, now.m, now.day));
  const dow = (today.getUTCDay() + 6) % 7; // dushanba = 0
  const day = (n) => new Date(today.getTime() + n * 86400000);
  const list = [
    { k: "week", label: "Shu hafta", from: ymd(day(-dow)), to: ymd(day(6 - dow)) },
    { k: "lastweek", label: "O'tgan hafta", from: ymd(day(-dow - 7)), to: ymd(day(-dow - 1)) }
  ];
  for (let i = 0; i <= 6; i++) {
    const s = new Date(Date.UTC(now.y, now.m - i, 1)), e = new Date(Date.UTC(now.y, now.m - i + 1, 0));
    const name = MONTHS[s.getUTCMonth()] + (s.getUTCFullYear() !== now.y ? " " + s.getUTCFullYear() : "");
    list.push({ k: i === 0 ? "month" : i === 1 ? "lastmonth" : "m-" + s.getUTCFullYear() + "-" + pad(s.getUTCMonth() + 1), label: i === 0 ? "Shu oy" : i === 1 ? "O'tgan oy (" + name + ")" : name, from: ymd(s), to: ymd(e) });
  }
  return list;
}

export async function GET(req) {
  const u = new URL(req.url);
  const p = cfg.projects.find((x) => x.slug === u.searchParams.get("p")) || cfg.projects[0];
  const now = tashkentNow(cfg);
  const todayStr = now.y + "-" + pad(now.m + 1) + "-" + pad(now.day);
  const list = periods(now);
  const sel = list.find((x) => x.k === u.searchParams.get("k")) || list.find((x) => x.k === "month");
  try {
    // Kelajak kunlar uchun ma'lumot so'ralmaydi, lekin o'q (va reja chizig'i) butun davr bo'ylab chiziladi
    const until = sel.to < todayStr ? sel.to : todayStr;
    const [data, plans] = await Promise.all([sel.from <= todayStr ? getChartData(p, sel.from, until) : { days: [] }, getPlans()]);
    const got = {}; (data.days || []).forEach((x) => { got[x.d] = x; });
    const planCache = {};
    const planOf = (d) => {
      const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)) - 1, key = d.slice(0, 7);
      if (!planCache[key]) planCache[key] = buildDailyPlan(p, { y, m }, planEntry(plans, p, key));
      return planCache[key].byDay[Number(d.slice(8, 10))] || 0;
    };
    const days = [];
    for (let t = Date.parse(sel.from + "T00:00:00Z"); t <= Date.parse(sel.to + "T00:00:00Z"); t += 86400000) {
      const d = new Date(t).toISOString().slice(0, 10);
      const x = got[d];
      days.push(Object.assign({ d, plan: planOf(d), future: d > todayStr }, x || {}));
    }
    return Response.json({
      ok: true, k: sel.k, label: sel.label, periods: list.map(({ k, label }) => ({ k, label })),
      currency: p.currency, planBy: p.planBy || "leads", thresholds: { cpl: p.thresholds.cpl, qcpl: p.thresholds.qcpl },
      today: todayStr, demo: !!data.demo, historyUsed: data.historyUsed !== false, days
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e), periods: list.map(({ k, label }) => ({ k, label })), k: sel.k }, { status: 200 });
  }
}
