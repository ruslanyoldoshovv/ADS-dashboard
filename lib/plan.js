// Oylik lid rejasini kunlarga bo'lish.
// 1) Panelda shu oy uchun reja kiritilgan bo'lsa: oylik son kunlarga avtomatik bo'linadi.
// 2) Kiritilmagan bo'lsa: projects.config.js dagi standart reja ishlatiladi.
const MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];

// add = 0: joriy oy, add = 1: keyingi oy. Natija: "2026-10"
export function monthKey(now, add) {
  const d = new Date(Date.UTC(now.y, now.m + (add || 0), 1));
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0");
}

export function monthLabel(now, add) {
  const d = new Date(Date.UTC(now.y, now.m + (add || 0), 1));
  return MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear();
}

// Oylik sonni kunlarga bo'lish. sun: yakshanba ulushi (1 = oddiy kun, 0.65 = kamroq, 0 = dam olish).
// Kunlik rejalar yig'indisi aynan oylik rejaga teng chiqadi.
function split(total, y, m, sun) {
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const w = [];
  for (let d = 1; d <= days; d++) w.push(new Date(Date.UTC(y, m, d)).getUTCDay() === 0 ? sun : 1);
  const W = w.reduce((s, x) => s + x, 0) || 1;
  const raw = w.map((x) => (total * x) / W);
  const out = raw.map((x) => Math.floor(x));
  let rest = total - out.reduce((s, x) => s + x, 0);
  // Qoldiqni kasr qismi eng katta kunlarga bittadan qo'shamiz
  const order = raw.map((x, i) => ({ i, f: x - Math.floor(x), w: w[i] })).filter((o) => o.w > 0).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; rest > 0 && order.length; k = (k + 1) % order.length) { out[order[k].i]++; rest--; }
  return out;
}

// Natija: { byDay: [_, 1-kun, 2-kun, ...], total, source: "panel" | "config", sun }
export function buildDailyPlan(P, now, entry) {
  const days = new Date(Date.UTC(now.y, now.m + 1, 0)).getUTCDate();
  const plan = P.plan || {};
  let arr, source, sun = 1;
  if (entry && entry.n > 0) {
    sun = typeof entry.sun === "number" ? entry.sun : 1;
    arr = split(entry.n, now.y, now.m, sun);
    source = "panel";
  } else if (typeof plan.month === "number" && plan.month > 0) {
    sun = typeof plan.sundayWeight === "number" ? plan.sundayWeight : 1;
    arr = split(plan.month, now.y, now.m, sun);
    source = "config";
  } else {
    arr = [];
    for (let d = 1; d <= days; d++) {
      const key = now.y + "-" + String(now.m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      const o = plan.overrides && plan.overrides[key];
      arr.push(typeof o === "number" ? o : new Date(Date.UTC(now.y, now.m, d)).getUTCDay() === 0 ? plan.sunday || 0 : plan.weekday || 0);
    }
    source = "config";
  }
  return { byDay: [0].concat(arr), total: arr.reduce((s, x) => s + x, 0), source, sun };
}
