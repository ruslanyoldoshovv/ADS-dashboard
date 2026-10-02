// Barcha hisob-kitoblar shu yerda: ogohlantirish, tavsiya, reja, prognoz.
// AI ishlatilmaydi, hammasi oddiy qoidalar.
export const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
export const r100 = (n) => Math.round(n / 100) * 100;
export const pct = (x) => (isFinite(x) ? Math.round(x * 100) + "%" : "—");
export const sgn = (x) => (x >= 0 ? "+" : "−") + Math.abs(Math.round(x * 100)) + "%";
const up = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const div = (a, b) => (b > 0 ? a / b : 0);

export function tashkentNow(cfg) {
  const d = new Date(Date.now() + cfg.timezoneOffsetHours * 3600 * 1000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), day: d.getUTCDate(), hour: d.getUTCHours(), min: d.getUTCMinutes() };
}

export function hourShareNow(cfg) {
  const n = tashkentNow(cfg), hs = cfg.hourlyShare;
  const prev = n.hour === 0 ? 0 : hs[n.hour - 1];
  return Math.max(prev + (hs[n.hour] - prev) * (n.min / 60), 0.05);
}

export function buildView(P, D, cfg, by) {
  const T = P.thresholds;
  const now = tashkentNow(cfg);
  const TODAY = now.day;
  const MONTH_DAYS = new Date(Date.UTC(now.y, now.m + 1, 0)).getUTCDate();
  const dow = (d) => new Date(Date.UTC(now.y, now.m, d)).getUTCDay();
  const key = (d) => `${now.y}-${String(now.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const planFor = (d) => {
    const o = P.plan.overrides && P.plan.overrides[key(d)];
    if (typeof o === "number") return o;
    return dow(d) === 0 ? P.plan.sunday : P.plan.weekday;
  };
  const MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
  const monthTitle = MONTHS[now.m] + " " + now.y;

  // Soat bo'yicha kutilgan ulush
  const hs = cfg.hourlyShare;
  const prev = now.hour === 0 ? 0 : hs[now.hour - 1];
  const HOUR_SHARE = Math.max(prev + (hs[now.hour] - prev) * (now.min / 60), 0.05);
  const nowLabel = String(now.hour).padStart(2, "0") + ":" + String(now.min).padStart(2, "0");

  const enrich = (a) => {
    const cpl = div(a.spend, a.leads) || Infinity;
    const qcpl = a.good > 0 ? a.spend / a.good : Infinity;
    const q = div(a.good, a.leads);
    const roas = div(a.revenue, a.spend);
    const inProg = Math.max(a.leads - a.noAns - a.lost - a.sales, 0);
    let rec = "watch";
    if (a.leads < T.minLeads) rec = "watch";
    else if (q < T.qualityWarn && qcpl > T.qcpl) rec = "off";
    else if (q >= 0.7 && qcpl <= T.qcpl) rec = "scale";
    return Object.assign({}, a, {
      cpl, qcpl, q, rec, roas, inProg,
      noAnsPct: div(a.noAns, a.leads), lostPct: div(a.lost, a.leads), inProgPct: div(inProg, a.leads),
      dupPct: div(a.dup, a.leads), cr: div(a.sales, a.leads),
      cplBad: a.leads > 0 && cpl > T.cpl, qcplBad: a.leads > 0 && qcpl > T.qcpl, roasBad: a.spend > 0 && roas < T.roas,
      qBad: a.leads > 0 && q < T.quality, qWarn: a.leads > 0 && q >= T.quality && q < T.qualityWarn,
      goodPct: pct(q)
    });
  };
  const KEYS = ["spend", "leads", "good", "visits", "sales", "noAns", "lost", "dup", "revenue"];
  const groupBy = (field) => {
    const map = {}, order = [];
    D.ads.forEach((a) => {
      const k = a[field] || "—";
      if (!map[k]) { map[k] = { name: k, count: 0 }; KEYS.forEach((x) => { map[k][x] = 0; }); order.push(k); }
      KEYS.forEach((x) => { map[k][x] += a[x]; });
      map[k].count += 1;
    });
    return order.map((n) => enrich(Object.assign(map[n], { format: map[n].count + " ta reklama" })));
  };

  const ads = D.ads.map(enrich);
  const sum = (k) => ads.reduce((s, a) => s + a[k], 0);
  const totSpend = sum("spend"), totLeads = sum("leads"), totGood = sum("good"), totVisits = sum("visits"), totSales = sum("sales"), totRevenue = sum("revenue");
  const calls = D.calls;
  const allLeads = totLeads + calls.leads, allGood = totGood + calls.good, allVisits = totVisits + calls.visits, allSales = totSales + calls.sales;
  const roasTot = div(totRevenue, totSpend);
  const romiTot = totSpend > 0 ? (totRevenue - totSpend) / totSpend : 0;
  const metaCpl = div(totSpend, totLeads), qCplTot = totGood > 0 ? totSpend / totGood : 0, qTot = div(totGood, totLeads);

  const okStyle = { bg: "#FFFFFF", border: "#E2E8EE", ink: "#14212B", sub: "#566573", isBad: false, flag: "" };
  const badStyle = { bg: "#FDECEA", border: "#F0B4AC", ink: "#A12116", sub: "#7A2018", isBad: true };
  const kpis = [
    Object.assign({ label: "Umumiy sarf", value: fmt(totSpend) + " so'm", note: D.periodLabel + " reklama sarfi" }, okStyle),
    Object.assign({ label: "Jami lid", value: String(allLeads), note: totLeads + " reklama + " + calls.leads + " kiruvchi qo'ng'iroq" }, okStyle),
    Object.assign({ label: "Meta CPL", value: totLeads ? fmt(r100(metaCpl)) + " so'm" : "—", note: "Chegara: " + fmt(T.cpl) + " so'm" }, metaCpl > T.cpl ? Object.assign({ flag: "Chegaradan oshdi" }, badStyle) : okStyle),
    Object.assign({ label: "Sifatli lid narxi", value: totGood ? fmt(r100(qCplTot)) + " so'm" : "—", note: (totGood && qCplTot > T.qcpl ? "Chegara " + fmt(T.qcpl) + " so'mdan " + Math.round((qCplTot / T.qcpl - 1) * 100) + "% oshgan. " : "Chegara: " + fmt(T.qcpl) + " so'm. ") + (allGood ? "Qo'ng'iroqlar bilan: " + fmt(r100(totSpend / allGood)) : "") }, totGood && qCplTot > T.qcpl ? Object.assign({ flag: "Chegaradan oshdi" }, badStyle) : okStyle),
    Object.assign({ label: "Sifatli lid ulushi", value: pct(qTot), note: "Chegara: " + pct(T.quality) + " dan past tushmasin" }, totLeads && qTot < T.quality ? Object.assign({ flag: "Chegaradan past" }, badStyle) : okStyle),
    Object.assign({ label: "Sotuv narxi", value: totSales > 0 ? fmt(r100(totSpend / totSales)) + " so'm" : "—", note: "Reklamadan " + totSales + " sotuv · kelgan mijoz narxi " + (totVisits > 0 ? fmt(r100(totSpend / totVisits)) : "—") }, okStyle),
    Object.assign({ label: "Daromad", value: fmt(totRevenue) + " so'm", note: totSales + " sotuv · amoCRM bitim summasi" }, okStyle),
    Object.assign({ label: "ROAS", value: roasTot.toFixed(1) + "x", note: "ROMI " + sgn(romiTot) + " · chegara " + T.roas + "x dan past tushmasin" }, totSpend > 0 && roasTot < T.roas ? Object.assign({ flag: "Chegaradan past" }, badStyle) : okStyle)
  ];

  // Oylik reja
  const facts = (d) => D.daily[d] || 0;
  let monthPlan = 0, planDone = 0, factDone = 0;
  for (let d = 1; d <= MONTH_DAYS; d++) {
    monthPlan += planFor(d);
    if (d < TODAY) { planDone += planFor(d); factDone += facts(d); }
  }
  const todayLeads = facts(TODAY);
  const factAll = factDone + todayLeads;
  const paceVal = planDone > 0 ? factDone / planDone : 1;
  const remaining = Math.max(monthPlan - factAll, 0);
  const daysLeft = MONTH_DAYS - TODAY;
  const perDay = Math.round(remaining / Math.max(daysLeft, 1));
  const forecast = Math.round(paceVal * monthPlan);
  let paceBg = "#E4F5EA", paceInk = "#05603A", paceWord = "Rejada";
  if (paceVal < T.pace) { paceBg = "#FDECEA"; paceInk = "#A12116"; paceWord = "Juda orqada"; }
  else if (paceVal < 1) { paceBg = "#FEF3C7"; paceInk = "#7A3F06"; paceWord = "Orqada"; }
  const plan = {
    monthTitle, monthPlan: fmt(monthPlan), fact: fmt(factAll), monthPct: pct(factAll / monthPlan),
    expectedPct: pct(planDone / monthPlan), planToDate: fmt(planDone), pace: pct(paceVal), paceBg, paceInk, paceWord,
    remaining: fmt(remaining), daysLeft: String(daysLeft), perDay: String(perDay), forecast: fmt(forecast), forecastPct: pct(forecast / monthPlan)
  };

  // Kalendar (dushanbadan boshlanadi)
  const lead = (new Date(Date.UTC(now.y, now.m, 1)).getUTCDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push({ blank: true });
  for (let d = 1; d <= MONTH_DAYS; d++) {
    const p = planFor(d), isToday = d === TODAY, isDone = d < TODAY, f = d <= TODAY ? facts(d) : 0;
    const ratio = isDone && p > 0 ? f / p : 0;
    let bg = "#F7F9FA", border = "#E6EBEF", ink = "#566573";
    if (isDone) {
      if (ratio >= 1) { bg = "#E4F5EA"; border = "#BFE3CC"; ink = "#05603A"; }
      else if (ratio >= 0.8) { bg = "#FEF3C7"; border = "#F3DC8B"; ink = "#7A3F06"; }
      else { bg = "#FDECEA"; border = "#F0B4AC"; ink = "#A12116"; }
    }
    if (isToday) { bg = "#E8EEF9"; ink = "#1D4ED8"; }
    cells.push({ day: d, plan: p, fact: f, showFact: d <= TODAY, showPct: isDone, pct: pct(ratio), factLabel: isToday ? "Hozircha" : "Fakt", isToday, bg, border: isToday ? "#14212B" : border, borderW: isToday ? 2 : 1, ink });
  }
  while (cells.length % 7 !== 0) cells.push({ blank: true });
  const planNote = "Reja kunlar bo'yicha projects.config.js faylida o'zgartiriladi. Hozir dushanba-shanba " + P.plan.weekday + " lid, yakshanba " + P.plan.sunday + " lid. Bugungi katak kun tugamaguncha rangga bo'yalmaydi.";

  // Bugun
  const planDay = planFor(TODAY);
  const dayBudget = P.dayBudget || planDay * T.cpl;
  const expLeads = planDay * HOUR_SHARE, expSpend = dayBudget * HOUR_SHARE;
  const spendNow = D.todaySpend;
  const leadDev = expLeads > 0 ? todayLeads / expLeads - 1 : 0;
  const spendDev = expSpend > 0 ? spendNow / expSpend - 1 : 0;
  const eodLeads = todayLeads / HOUR_SHARE, eodSpend = spendNow / HOUR_SHARE;
  const cplNow = todayLeads > 0 ? spendNow / todayLeads : 0, planCpl = planDay > 0 ? dayBudget / planDay : 0;
  const leadCol = leadDev >= 0 ? ["#E4F5EA", "#05603A"] : leadDev >= -0.15 ? ["#FEF3C7", "#7A3F06"] : ["#FDECEA", "#A12116"];
  const spendCol = Math.abs(spendDev) <= 0.1 ? ["#E6EBEF", "#2B3A46"] : spendDev > 0 ? ["#FEF3C7", "#7A3F06"] : ["#E6EBEF", "#2B3A46"];
  const eodCol = eodLeads >= planDay ? ["#E4F5EA", "#05603A"] : eodLeads >= planDay * T.pace ? ["#FEF3C7", "#7A3F06"] : ["#FDECEA", "#A12116"];
  const eodSpendCol = eodSpend > dayBudget * 1.1 ? ["#FEF3C7", "#7A3F06"] : ["#E6EBEF", "#2B3A46"];
  const todayTiles = [
    { label: "Lid (hozircha)", value: String(todayLeads), dev: sgn(leadDev), devBg: leadCol[0], devInk: leadCol[1], sub: "kutilgan " + Math.round(expLeads) + " · kun rejasi " + planDay },
    { label: "Sarf (hozircha)", value: fmt(spendNow) + " so'm", dev: sgn(spendDev), devBg: spendCol[0], devInk: spendCol[1], sub: "kutilgan " + fmt(r100(expSpend)) + " so'm" },
    { label: "Kun oxiri · lid", value: "≈ " + Math.round(eodLeads), dev: eodLeads >= planDay ? "reja bajariladi" : "reja bajarilmaydi", devBg: eodCol[0], devInk: eodCol[1], sub: Math.round(eodLeads * 0.93) + " ... " + Math.round(eodLeads * 1.07) + " · reja " + planDay },
    { label: "Kun oxiri · sarf", value: "≈ " + fmt(r100(eodSpend)) + " so'm", dev: eodSpend > dayBudget * 1.1 ? "byudjetdan oshadi" : "byudjet ichida", devBg: eodSpendCol[0], devInk: eodSpendCol[1], sub: "kunlik byudjet " + fmt(dayBudget) + " so'm" }
  ];
  let tVerdict, tBg, tInk, tBorder;
  if (leadDev <= -0.15 && spendDev >= -0.1) { tVerdict = "Sarf rejada, lid ortda: CPL yomonlashgan."; tBg = "#FDF3F2"; tInk = "#A12116"; tBorder = "#F0B4AC"; }
  else if (spendDev > 0.1) { tVerdict = "Sarf rejadan oshgan: CPL yomonlashgan, byudjetni tekshiring."; tBg = "#FFF8E6"; tInk = "#7A3F06"; tBorder = "#F3DC8B"; }
  else if (leadDev >= -0.1 && spendDev >= -0.1) { tVerdict = "Kun rejada: lid ham, sarf ham kutilgan darajada."; tBg = "#F1FAF4"; tInk = "#05603A"; tBorder = "#BFE3CC"; }
  else { tVerdict = "Sarf ham, lid ham rejadan past: reklama kam sarflayapti."; tBg = "#FFF8E6"; tInk = "#7A3F06"; tBorder = "#F3DC8B"; }
  const gap = Math.round(planDay - eodLeads);
  const todayLines = [
    "Bugungi CPL: " + (cplNow ? fmt(r100(cplNow)) + " so'm" : "—") + " (kun rejasi " + fmt(planCpl) + " so'm" + (cplNow > planCpl ? ", " + sgn(cplNow / planCpl - 1) + " qimmat" : "") + ").",
    gap > 0 ? "Joriy sur'atda kun oxirigacha ≈ " + Math.round(eodLeads) + " lid, rejaga " + gap + " ta yetmaydi." : gap === 0 ? "Joriy sur'atda kun oxirigacha ≈ " + Math.round(eodLeads) + " lid, aynan reja bo'yicha." : "Joriy sur'atda kun oxirigacha ≈ " + Math.round(eodLeads) + " lid, reja " + Math.abs(gap) + " taga oshadi.",
    "Rejaga yetish uchun kun oxirigacha yana " + Math.max(planDay - todayLeads, 0) + " lid kerak." + (cplNow > planCpl ? " Tavsiya: sarfi baland, sifati past reklamalarni tekshiring." : "")
  ];
  const todayFresh = D.freshness + " Kutilgan qiymat = kun rejasi × shu soatgacha odatdagi ulush (" + pct(HOUR_SHARE) + ").";

  // Operatorlar
  const operators = D.operators.map((o) => ({
    name: o.name, leads: String(o.leads), good: String(o.good), goodPct: pct(div(o.good, o.leads)), visits: String(o.visits),
    reply: o.replyMin == null ? "—" : o.replyMin + " daq", isSlow: o.replyMin != null && o.replyMin > T.reply, replyMin: o.replyMin
  }));
  const withReply = D.operators.filter((o) => o.replyMin != null);
  const opAvg = withReply.length ? Math.round(withReply.reduce((s, o) => s + o.replyMin * o.leads, 0) / withReply.reduce((s, o) => s + o.leads, 0)) : null;
  const anySlow = operators.some((o) => o.isSlow);
  const opNote = opAvg == null ? "Birinchi javob vaqti keyingi bosqichda ulanadi." : anySlow ? "Sifatli lid ulushiga reklama bilan birga operatorning javob tezligi ham ta'sir qiladi. Sekin javob bergan operatorni nazorat qiling." : "Hamma operator birinchi javob chegarasida (" + T.reply + " daqiqa).";

  // Ogohlantirishlar
  const redBg = "#FDF3F2", amberBg = "#FFF8E6";
  const adAlerts = [];
  ads.forEach((a) => {
    if (a.leads === 0 && a.spend === 0) return;
    const parts = [];
    if (a.leads === 0) parts.push("sarf " + fmt(a.spend) + " so'm, lid yo'q");
    if (a.cplBad) parts.push("Meta CPL " + fmt(r100(a.cpl)) + " so'm (chegara " + fmt(T.cpl) + ")");
    if (a.qcplBad) parts.push("sifatli lid narxi " + fmt(r100(a.qcpl)) + " so'm (chegara " + fmt(T.qcpl) + ")");
    if (a.qBad) parts.push("sifatli ulush " + a.goodPct + " (chegara " + pct(T.quality) + ")");
    else if (a.qWarn) parts.push("sifatli ulush " + a.goodPct + ", chegaraga yaqin");
    if (a.noAnsPct > T.noAns) parts.push("nedozvon " + pct(a.noAnsPct) + " (chegara " + pct(T.noAns) + ")");
    if (a.leads >= T.minLeads && a.roasBad) parts.push("ROAS " + a.roas.toFixed(1) + "x (chegara " + T.roas + "x)");
    if (!parts.length) return;
    const red = a.qBad || a.rec === "off" || (a.leads === 0 && a.spend > 0);
    let action;
    if (a.rec === "off") action = "sifat ham, narx ham yomon: reklamani to'xtatish.";
    else if (a.leads === 0) action = "lid kelmayapti: reklama yoki tegni tekshiring.";
    else if (a.leads < T.minLeads) action = "lid kam (" + a.leads + " ta): kunlik byudjetni cheklab, " + T.minLeads + " lidga yetguncha kuzating.";
    else action = "kreativ yoki auditoriyani yangilab, 3 kun kuzating.";
    adAlerts.push({ red, off: a.rec === "off", item: { isRed: red, isAmber: !red, bg: red ? redBg : amberBg, title: a.name, text: up(parts.join(", ")) + ".", action } });
  });
  adAlerts.sort((x, y) => (x.red === y.red ? 0 : x.red ? -1 : 1) || Number(y.off) - Number(x.off));
  const alerts = adAlerts.map((x) => x.item);
  if (totSpend > 0 && roasTot < T.roas) alerts.unshift({ isRed: true, isAmber: false, bg: redBg, title: "ROAS chegaradan past", text: "ROAS " + roasTot.toFixed(1) + "x (chegara " + T.roas + "x). Daromad " + fmt(totRevenue) + " so'm, sarf " + fmt(totSpend) + " so'm.", action: "sifatli lid narxi baland reklamalarni o'chiring, mahsulot narxi va o'rtacha chekni tekshiring." });
  if (paceVal < 1) alerts.push({ isRed: paceVal < T.pace, isAmber: paceVal >= T.pace, bg: paceVal < T.pace ? redBg : amberBg, title: "Oylik reja ortda qolmoqda", text: "Reja tezligi " + pct(paceVal) + " (kechagacha " + factDone + " fakt, " + planDone + " reja). Oy oxiriga prognoz: " + forecast + " lid.", action: "rejaga yetish uchun qolgan " + daysLeft + " kunda kuniga o'rtacha " + perDay + " lid kerak." });
  if (leadDev <= -0.15 && spendDev >= -0.1) alerts.push({ isRed: false, isAmber: true, bg: amberBg, title: "Bugun: lid ortda", text: "Soat " + nowLabel + " holatiga " + todayLeads + " lid, kutilgan " + Math.round(expLeads) + ". Bugungi CPL " + (cplNow ? fmt(r100(cplNow)) : "—") + " so'm.", action: "kun oxirigacha reklamalar va forma ishlashini tekshiring." });
  operators.forEach((o) => { if (o.isSlow) alerts.push({ isRed: false, isAmber: true, bg: amberBg, title: o.name + ": javob sekin", text: "Birinchi javob vaqti " + o.replyMin + " daqiqa (chegara " + T.reply + ").", action: "lidlarni qayta taqsimlang yoki javob tezligini nazorat qiling." }); });
  if (!alerts.length) alerts.push({ isRed: false, isAmber: false, bg: "#F1FAF4", title: "Hammasi chegarada", text: "Hech bir ko'rsatkich chegarani buzmagan.", action: "o'zgartirish shart emas." });
  const redCount = alerts.filter((x) => x.isRed).length, amberCount = alerts.filter((x) => x.isAmber).length;
  const alertSummary = "Xavf: " + redCount + " · Diqqat: " + amberCount + " · chegaralar asosida avtomatik aniqlanadi";
  const thresholdsText = "Chegaralar: Meta CPL " + fmt(T.cpl) + " so'mdan oshmasin · sifatli lid narxi " + fmt(T.qcpl) + " so'mdan oshmasin · sifatli ulush " + pct(T.quality) + " dan past tushmasin · nedozvon " + pct(T.noAns) + " dan oshmasin · ROAS " + T.roas + "x dan past tushmasin · reja tezligi " + pct(T.pace) + " dan past tushmasin · birinchi javob " + T.reply + " daqiqadan oshmasin";

  // Voronka
  const pre = "#9AA8B5", qc = "#1D4ED8", win = "#05603A";
  const steps = [
    { label: "Yangi lid", count: allLeads, color: pre, qStart: false },
    { label: "Aloqaga chiqildi", count: D.mid.contacted, color: pre, qStart: false },
    { label: "Ma'lumot berildi", count: allGood, color: qc, qStart: true },
    { label: "Taklif qilindi", count: D.mid.offered, color: qc, qStart: false },
    { label: "Suhbatga keldi", count: allVisits, color: qc, qStart: false },
    { label: "Sotuv", count: allSales, color: win, qStart: false }
  ];
  const funnel = steps.map((s, i) => ({ label: s.label, count: String(s.count), color: s.color, qStart: s.qStart, rate: i === 0 ? "boshlanish" : pct(div(s.count, steps[i - 1].count)), width: pct(div(s.count, allLeads)) }));
  const dataWarn = allSales > allVisits ? "Diqqat: sotuv soni 'Suhbatga keldi'dan ko'p. Operator bosqichni o'tkazib yuborgan bo'lishi mumkin." : "";

  const sources = [
    { name: "Reklama", note: "Reklama tegi bor lidlar", leads: String(totLeads), quality: String(totGood), qualityPct: pct(div(totGood, totLeads)), visits: String(totVisits), sales: String(totSales) },
    { name: "Kiruvchi qo'ng'iroq", note: "incoming_call tegi: " + calls.tag + " · tegsiz: " + calls.noTag, leads: String(calls.leads), quality: String(calls.good), qualityPct: pct(div(calls.good, calls.leads)), visits: String(calls.visits), sales: String(calls.sales) }
  ];

  // Jadval
  const list = by === "campaign" ? groupBy("campaign") : by === "adset" ? groupBy("adset") : ads;
  const rows = list.map((a) => {
    const isOff = a.rec === "off", isScale = a.rec === "scale", low = a.leads < T.minLeads;
    return {
      name: a.name, sub: a.format || "", spend: fmt(a.spend), leads: String(a.leads),
      good: String(a.good), goodPct: a.goodPct, visits: String(a.visits), sales: String(a.sales),
      noAns: String(a.noAns), noAnsPct: pct(a.noAnsPct), noAnsColor: a.noAnsPct > T.noAns ? "#A12116" : "#566573",
      inProg: String(a.inProg), inProgPct: pct(a.inProgPct), lost: String(a.lost), lostPct: pct(a.lostPct),
      cr: pct(a.cr), crColor: a.sales === 0 && a.leads > 0 ? "#A12116" : "#14212B",
      revenue: fmt(a.revenue), roas: a.roas.toFixed(1) + "x", roasColor: a.roasBad ? "#A12116" : "#14212B",
      dup: String(a.dup), dupPct: pct(a.dupPct), dupColor: a.dupPct > 0.05 ? "#A12116" : "#566573",
      metaCpl: a.leads ? fmt(r100(a.cpl)) : "—", qCpl: a.good > 0 ? fmt(r100(a.qcpl)) : "—",
      saleCpl: a.sales > 0 ? fmt(r100(a.spend / a.sales)) : "—",
      isOff, isScale, isWatch: !isOff && !isScale, trust: low ? "Ma'lumot kam" : "",
      rowBg: isOff || a.qBad ? "#FFF8F7" : "#FFFFFF",
      barColor: a.q >= 0.7 ? "#12945A" : a.q >= T.quality ? "#D97706" : "#D92D20",
      goodColor: a.qBad ? "#A12116" : "#14212B", cplColor: a.cplBad ? "#A12116" : "#566573", qcplColor: a.qcplBad ? "#A12116" : "#14212B"
    };
  });
  const tableTitle = by === "campaign" ? "Kampaniyalar bo'yicha natija" : by === "adset" ? "Ad set (auditoriya) bo'yicha natija" : "Reklamalar (kreativ) bo'yicha haqiqiy natija";
  const nameHeader = by === "campaign" ? "Kampaniya" : by === "adset" ? "Ad set" : "Reklama";

  // Sabablar
  const rTotal = D.reasons.reduce((s, r) => s + r.count, 0);
  const rMax = Math.max(1, ...D.reasons.map((r) => r.count));
  const reasons = D.reasons.map((r) => ({ label: r.label, count: String(r.count), share: pct(div(r.count, rTotal)), width: pct(r.count / rMax) }));
  const reasonsNote = D.reasons.length ? "Eng ko'p sabab: \"" + D.reasons[0].label + "\" (" + pct(div(D.reasons[0].count, rTotal)) + "). Telefon ko'tarilmagan va noto'g'ri raqam sabablari ko'p bo'lsa, bu odatda kreativ emas, forma sifati va javob tezligi muammosi." : "Lost qilingan lid yo'q.";

  const rules = [
    { title: "Sifatli lid", text: "amoCRM'da \"Ma'lumot berildi\", \"Taklif qilindi\", \"Suhbatga keldi\" yoki sotuv bosqichiga bir marta bo'lsa ham o'tgan lid. Keyin lost bo'lsa ham sifatli hisoblanadi, chunki bosqich tarixiga qaraladi." },
    { title: "Lid manbasi", text: "Reklama tegi bor lid reklama hisoblanadi. incoming_call tegi bor yoki umuman tegi yo'q lid kiruvchi qo'ng'iroq deb olinadi." },
    { title: "Lid holatlari", text: "Nedozvon: telefon ko'tarilmagan sababli lost. Yo'qotilgan: boshqa sabab bilan lost. Jarayonda: hali ochiq lid. Sotuv: sotuv holatidagi lid. Dubl: takroriy lid." },
    { title: "Daromad va ROAS", text: "Daromad = sotuv bo'lgan lidlarning amoCRM bitim summasi. ROAS = daromad ÷ sarf. ROMI = (daromad − sarf) ÷ sarf. Sotuv bo'lgan lid avtomatik \"Suhbatga keldi\" hisoblanadi." },
    { title: "Ogohlantirish chegaralari", text: "Meta CPL, sifatli lid narxi, sifatli ulush, nedozvon, ROAS, reja tezligi yoki javob vaqti chegarani buzsa, ko'rsatkich qizaradi va ogohlantirishlar ro'yxatiga tushadi. Chegaralar har loyiha uchun alohida." },
    { title: "Tavsiya qoidasi", text: "O'chirish: sifatli ulush 50% dan past va sifatli lid narxi chegaradan baland. Kuchaytirish: ulush 70% va undan yuqori, narx chegarada. Qolgan holatlar va " + T.minLeads + " tadan kam lid bo'lsa: Kuzatish." },
    { title: "Bugungi prognoz", text: "Kun oxiri lid = hozirgi lid ÷ shu soatgacha odatdagi ulush. Kutilgan qiymat = kun rejasi × shu ulush. Og'ish −15% dan past bo'lsa qizil, 0 dan −15% gacha sariq." },
    { title: "Oylik reja", text: "Tezlik = kechagacha fakt ÷ kechagacha reja. Prognoz = tezlik × oylik reja. Kuniga kerak lid = qolgan reja ÷ qolgan kunlar." }
  ];

  return { redCount, amberCount, kpis, alerts, alertSummary, thresholdsText, plan, planNote, cells, funnel, dataWarn, sources, rows, tableTitle, nameHeader, reasons, reasonsTotal: String(rTotal), reasonsNote, operators, opAvg, opNote, rules, todayTiles, todayLines, todayVerdict: tVerdict, todayBg: tBg, todayInk: tInk, todayBorder: tBorder, todaySub: nowLabel + " holatiga · kunlik byudjet " + fmt(dayBudget) + " so'm · kunlik lid reja " + planDay, todayFresh };
}
