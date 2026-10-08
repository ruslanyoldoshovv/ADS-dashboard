// NAMUNA ma'lumot (DEMO=1 bo'lganda, haqiqiy ulanish yo'q loyihalar uchun)
const DEMO = {
  P1: {
    check: 2500000, leadK: 1.0, spendK: 1.15,
    ads: [
      ["Video · Bepul sinov dars", "Video · Meta Lead", "Sinov dars", "Toshkent 18-35", 2100000, 44, 33, 14, 6, 8, 9, 2],
      ["Reels · O'quvchi fikri", "Reels · Sayt", "Sinov dars", "Toshkent 25-40", 1200000, 26, 19, 8, 3, 5, 5, 1],
      ["Karusel · Grantlar va stipendiya", "Karusel · Sayt", "Grantlar", "Toshkent 22-40", 1800000, 36, 22, 8, 2, 9, 11, 2],
      ["Lead forma · Bepul konsultatsiya", "Lead forma", "Grantlar", "Butun O'zbekiston", 1650000, 41, 17, 3, 1, 15, 14, 3],
      ["Statik · Chegirma 30%", "Rasm · Sayt", "Aksiya", "Toshkent 18-35", 900000, 17, 4, 0, 0, 8, 6, 1]
    ],
    calls: { leads: 30, good: 17, visits: 8, sales: 5, tag: 19, noTag: 11 },
    mid: { contacted: 170, offered: 78 },
    operators: [["Operator 1", 78, 52, 19, 18], ["Operator 2", 69, 39, 14, 41], ["Operator 3", 47, 21, 8, 96]],
    reasons: [["Telefon ko'tarmadi", 29], ["Noto'g'ri raqam yoki bot", 17], ["Qiziqmadi", 14], ["Mos emas (shahar, yosh)", 12], ["Takroriy lid", 10]],
    facts: [24, 27, 22, 15, 26, 29, 24, 20, 27, 23, 17, 30, 32, 26, 21, 34, 31, 20]
  },
  P2: {
    check: 12000000, leadK: 0.9, spendK: 0.85,
    ads: [
      ["Video · Grantlar haqida", "Video · Meta Lead", "Grantlar", "Toshkent 20-30", 4200000, 28, 23, 11, 2, 3, 6, 1],
      ["Lead forma · Bepul konsultatsiya", "Lead forma", "Konsultatsiya", "Butun O'zbekiston", 3600000, 31, 17, 4, 0, 10, 12, 2],
      ["Karusel · Universitetlar", "Karusel · Sayt", "Grantlar", "Toshkent 18-25", 2800000, 19, 16, 7, 2, 2, 4, 0],
      ["Reels · Talaba hikoyasi", "Reels · Sayt", "Konsultatsiya", "Samarqand va Buxoro", 1800000, 8, 8, 3, 1, 0, 1, 0]
    ],
    calls: { leads: 14, good: 11, visits: 6, sales: 2, tag: 9, noTag: 5 },
    mid: { contacted: 91, offered: 49 },
    operators: [["Operator 1", 58, 45, 19, 22], ["Operator 2", 42, 30, 12, 35]],
    reasons: [["Telefon ko'tarmadi", 8], ["Noto'g'ri raqam yoki bot", 4], ["Qiziqmadi", 5], ["Mos emas (shahar, yosh)", 3], ["Takroriy lid", 5]],
    facts: [12, 15, 11, 7, 13, 14, 12, 10, 14, 9, 11, 15, 16, 13, 12, 17, 15, 12]
  },
  P3: {
    check: 1000000, leadK: 0.64, spendK: 1.0,
    ads: [
      ["Video · Mahsulot taqdimoti", "Video · Meta Lead", "Taqdimot", "Ayollar 35-55", 2100000, 62, 26, 9, 4, 14, 18, 3],
      ["Lead forma · Bepul maslahat", "Lead forma", "Maslahat", "Butun O'zbekiston", 1500000, 78, 14, 3, 1, 30, 28, 6],
      ["Karusel · Foydalanuvchi sharhlari", "Karusel · Sayt", "Taqdimot", "Erkaklar 40-60", 1300000, 34, 19, 6, 3, 6, 9, 1],
      ["Statik · Aksiya", "Rasm · Sayt", "Maslahat", "Ayollar 35-55", 1000000, 21, 5, 1, 0, 9, 7, 2]
    ],
    calls: { leads: 15, good: 9, visits: 4, sales: 2, tag: 10, noTag: 5 },
    mid: { contacted: 160, offered: 51 },
    operators: [["Operator 1", 80, 33, 10, 25], ["Operator 2", 70, 26, 8, 52], ["Operator 3", 60, 14, 5, 118]],
    reasons: [["Telefon ko'tarmadi", 52], ["Noto'g'ri raqam yoki bot", 31], ["Qiziqmadi", 24], ["Mos emas (shahar, yosh)", 12], ["Takroriy lid", 18]],
    facts: [32, 35, 30, 21, 33, 37, 31, 28, 36, 32, 25, 33, 35, 30, 26, 37, 32, 17]
  }
};

export function demoData(project, ctx) {
  const d = DEMO[project.env];
  if (!d) return null;
  // Namuna sarf so'mda yozilgan. Loyiha dollarda bo'lsa, kurs bo'yicha $ ga o'giriladi.
  const usd = project.currency === "USD";
  const conv = (v) => (usd ? Math.round((v / ctx.rate) * 100) / 100 : v);
  const ads = d.ads.map((a, i) => ({
    id: "demo" + i, name: a[0], format: a[1], campaign: a[2], adset: a[3], spend: conv(a[4]), leads: a[5], good: a[6], visits: a[7], sales: a[8],
    noAns: a[9], lost: a[10], dup: a[11], revenue: a[8] * d.check,
    bad: Math.min(a[9] + a[10] + a[11], a[5] - a[6]), prog: Math.max(a[5] - a[6] - Math.min(a[9] + a[10] + a[11], a[5] - a[6]), 0)
  }));
  const daily = {};
  for (let day = 1; day < ctx.today; day++) daily[day] = d.facts[(day - 1) % d.facts.length];
  const planDay = ctx.planToday;
  daily[ctx.today] = Math.round(planDay * ctx.share * d.leadK);
  return {
    mode: "demo",
    periodLabel: "7 kunlik",
    freshness: "Namuna ma'lumot (haqiqiy ulanish yo'q).",
    ads,
    calls: Object.assign({ revenue: 0 }, d.calls),
    mid: d.mid,
    operators: d.operators.map((o) => ({ name: o[0], leads: o[1], good: o[2], visits: o[3], replyMin: o[4], offerNow: Math.round(o[2] * 0.3), sales: Math.round(o[3] * 0.35) })),
    reasons: d.reasons.map((r) => ({ label: r[0], count: r[1], good: 0, bad: r[1] })),
    daily,
    todaySpend: usd ? Math.round(ctx.dayBudget * ctx.share * d.spendK * 100) / 100 : Math.round(ctx.dayBudget * ctx.share * d.spendK / 1000) * 1000
  };
}
