// Barcha hisob-kitoblar shu yerda: ogohlantirish, tavsiya, reja, prognoz.
// AI ishlatilmaydi, hammasi oddiy qoidalar.
import { buildDailyPlan } from "./plan";
export const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
export const r100 = (n) => Math.round(n / 100) * 100;
export const pct = (x) => (isFinite(x) ? Math.round(x * 100) + "%" : "—");
// Bir xonali kasr bilan foiz (0,4%): kichik konversiyalar uchun
export const pct1 = (x) => (isFinite(x) ? (Math.round(x * 1000) / 10).toFixed(1).replace(".", ",") + "%" : "—");
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

// Dollar: 1000 dan kichik son ikki xona bilan ($5.70), kattasi butun ($1 240)
const usdNum = (x) => {
  const v = Math.round(x * 100) / 100;
  if (Math.abs(v) >= 1000) return fmt(v);
  const t = v.toFixed(2);
  return t.endsWith(".00") ? t.slice(0, -3) : t;
};

// ctx: { rate: {rate, source, date}, plan: buildDailyPlan() natijasi, planMonth: {y, m}, showToday: davr bugunni o'z ichiga oladimi }
export function buildView(P, D, cfg, by, ctx) {
  const T = P.thresholds;
  const now = tashkentNow(cfg);
  // Reklama sarfi valyutasi: "USD" yoki "UZS". Tushum (amoCRM bitim summasi) doim so'mda.
  const USD = P.currency === "USD";
  const rateInfo = (ctx && ctx.rate) || { rate: cfg.usdRateFallback || 12000, source: "fallback", date: null };
  const RATE = USD ? rateInfo.rate : 1; // sarfni so'mga o'girish uchun
  const money = (x) => (USD ? "$" + usdNum(x) : fmt(x) + " so'm");        // aniq summa
  const moneyR = (x) => (USD ? "$" + usdNum(x) : fmt(r100(x)) + " so'm"); // yaxlitlangan (CPL va h.k.)
  const moneyDan = (x) => (USD ? "$" + usdNum(x) + " dan" : fmt(x) + " so'mdan");                // "... dan oshmasin"
  const cell = (x) => (USD ? "$" + usdNum(x) : fmt(x));                   // jadval katagi
  const cellR = (x) => (USD ? "$" + usdNum(x) : fmt(r100(x)));
  const BY_FIELDS = !!(P.source && (P.source.by === "fields" || P.source.by === "both")); // lid manbasi maydon bo'yicha aniqlanadimi
  const HAS_ROAS = typeof T.roas === "number" && T.roas > 0;              // ROAS chegarasi qo'yilganmi
  // Oylik reja qaysi oy uchun ko'rsatiladi (tanlangan davr tugagan oy). Berilmasa: joriy oy.
  const PM = (ctx && ctx.planMonth) || { y: now.y, m: now.m };
  const IS_CUR_MONTH = PM.y === now.y && PM.m === now.m;
  const IS_PAST_MONTH = PM.y < now.y || (PM.y === now.y && PM.m < now.m);
  const SHOW_TODAY = IS_CUR_MONTH && !(ctx && ctx.showToday === false); // "Bugun" bloki faqat davr bugunni qamraganda
  const DP = (ctx && ctx.plan) || buildDailyPlan(P, PM, null); // reja berilmasa: sozlamadagi standart reja
  const MONTH_DAYS = new Date(Date.UTC(PM.y, PM.m + 1, 0)).getUTCDate();
  const TODAY = IS_CUR_MONTH ? now.day : IS_PAST_MONTH ? MONTH_DAYS + 1 : 0; // o'tgan oyda hamma kun tugagan
  // Daromad hisobi: avgCheck berilgan bo'lsa, 1-oy daromadi = sotuv soni × avgCheck, LTV = shu × ltvMultiplier
  const CHECK = typeof P.avgCheck === "number" && P.avgCheck > 0 ? P.avgCheck : 0;
  const LTV_K = typeof P.ltvMultiplier === "number" && P.ltvMultiplier > 0 ? P.ltvMultiplier : 5;
  const planFor = (d) => DP.byDay[d] || 0;
  // Reja nimada o'lchanadi: "quality" = sifatli lid soni (barcha manba), aks holda jami lid soni
  const PLAN_Q = P.planBy === "quality";
  const UNIT = PLAN_Q ? "sifatli lid" : "lid";
  const COSTW = PLAN_Q ? "sifatli lid narxi" : "CPL";
  // Sifatli lid narxi (umumiy ko'rsatkich): "all" = sarf ÷ barcha sifatli lidlar (qo'ng'iroqlar bilan), aks holda faqat reklamaga bog'langanlari
  // callsFromAds: kiruvchi qo'ng'iroqlar (reklama nomi yozilmagan lidlar) ham reklamadan kelgan deb hisoblanadi.
  // Shunda umumiy ko'rsatkichlar (sifatli lid narxi va ulushi, sotuv narxi, daromad, ROAS, LTV) barcha lidlar bo'yicha chiqadi.
  // Jadvaldagi har bir reklama qatori o'zgarmaydi: qo'ng'iroqni aniq bitta reklamaga bog'lab bo'lmaydi.
  const CALLS_ADS = P.callsFromAds === true;
  // Sifatli ulush hamma joyda JAMI lidga nisbatan hisoblanadi (chegara va tavsiyalar ham shunga qarab).
  // Qayta ishlangan lidlarga nisbatan sifat (jarayondagilarsiz) faqat alohida ma'lumot kartochkasida ko'rsatiladi.
  // 2-rejim (to'lov sanasi bo'yicha): sotuv soni to'lov shu davrga tushgan lidlar bo'yicha. Sarfi yo'q (oldingi davr) reklamalarning sotuvi
  // jadvalga qo'shilmaydi, alohida blokda turadi, lekin yuqoridagi umumiy kartochkalarga (sotuv, daromad, ROAS, LTV) qo'shiladi.
  const PAY_MODE = D.saleMode === "pay";
  const HIDDEN = PAY_MODE ? D.hiddenSales || [] : [];
  const hidSales = HIDDEN.reduce((s, h) => s + h.sales, 0), hidRevenue = HIDDEN.reduce((s, h) => s + (h.revenue || 0), 0);
  const QCOST_ALL = CALLS_ADS || P.qualityCostBy === "all";
  const MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
  const monthTitle = MONTHS[PM.m] + " " + PM.y;

  // Soat bo'yicha kutilgan ulush
  const hs = cfg.hourlyShare;
  const prev = now.hour === 0 ? 0 : hs[now.hour - 1];
  const HOUR_SHARE = Math.max(prev + (hs[now.hour] - prev) * (now.min / 60), 0.05);
  const nowLabel = String(now.hour).padStart(2, "0") + ":" + String(now.min).padStart(2, "0");

  const enrich = (a) => {
    // Sarfi yo'q qator (Meta'da topilmagan reklama nomi): narx hisoblanmaydi, faqat sifat ko'rsatiladi
    const noSpend = !(a.spend > 0);
    const cpl = noSpend ? 0 : div(a.spend, a.leads) || Infinity;
    const qcpl = noSpend ? 0 : a.good > 0 ? a.spend / a.good : Infinity;
    const inProg = typeof a.prog === "number" ? a.prog : Math.max(a.leads - a.noAns - a.lost - a.sales, 0);
    const done = Math.max(a.leads - inProg, 0); // sifati aniqlangan (qayta ishlangan) lidlar
    const q = div(a.good, a.leads);
    const rev = CHECK ? a.sales * CHECK : a.revenue; // 1-oy daromadi
    const roas = div(rev, a.spend * RATE);
    let rec = "watch";
    if (a.leads < T.minLeads) rec = "watch";
    else if (noSpend) rec = "watch";
    else if (q < T.qualityWarn && qcpl > T.qcpl) rec = "off";
    else if (q >= 0.7 && qcpl <= T.qcpl) rec = "scale";
    return Object.assign({}, a, {
      cpl, qcpl, q, rec, roas, inProg, rev, done,
      noAnsPct: div(a.noAns, a.leads), lostPct: div(a.lost, a.leads), inProgPct: div(inProg, a.leads),
      dupPct: div(a.dup, a.leads), cr: div(a.sales, a.leads), qDone: div(a.good, done),
      cplBad: a.leads > 0 && cpl > T.cpl, qcplBad: a.leads > 0 && qcpl > T.qcpl, roasBad: HAS_ROAS && a.spend > 0 && roas < T.roas,
      qBad: a.leads > 0 && q < T.quality, qWarn: a.leads > 0 && q >= T.quality && q < T.qualityWarn,
      goodPct: pct(q)
    });
  };
  const KEYS = ["spend", "leads", "good", "bad", "prog", "visits", "sales", "noAns", "lost", "dup", "revenue"];
  const groupBy = (field) => {
    const map = {}, order = [];
    D.ads.forEach((a) => {
      const k = a[field] || "—";
      if (!map[k]) { map[k] = { name: k, count: 0, acts: [] }; KEYS.forEach((x) => { map[k][x] = 0; }); order.push(k); }
      KEYS.forEach((x) => { map[k][x] += a[x] || 0; });
      map[k].count += 1;
      if (a.act) map[k].acts.push(a.act);
    });
    return order.map((n) => enrich(Object.assign(map[n], { format: map[n].count + " ta reklama", act: groupAct(map[n].acts) })));
  };

  // Reklama faolligi: Meta holati (effective_status) va sarf qilgan birinchi/oxirgi kun
  //  🟢 yoniq va oxirgi 2 kunda sarf bor: "N kundan beri" (birinchi sarf kunidan)
  //  🟡 yoniq, lekin sarf yo'q (yoki ko'rib chiqilmoqda)   ⚪ o'chirilgan: "N kun ishladi · dd.mm–dd.mm"   🔴 rad etilgan
  const TODAY_STR = D.todayStr || (now.y + "-" + String(now.m + 1).padStart(2, "0") + "-" + String(now.day).padStart(2, "0"));
  const dayN = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
  const dm = (x) => x.slice(8, 10) + "." + x.slice(5, 7);
  const YDAY = new Date(Date.parse(TODAY_STR + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);
  function actKind(a) {
    if (!a || !a.st) return null;
    const st = a.st;
    if (st === "DISAPPROVED") return { k: "red", t: "Rad etilgan" };
    if (st === "WITH_ISSUES") return { k: "red", t: "Muammo bor" };
    if (st === "IN_PROCESS" || st === "PENDING_REVIEW" || st === "PREAPPROVED") return { k: "yellow", t: "Ko'rib chiqilmoqda" };
    if (st === "ACTIVE") {
      if (a.f && a.l && a.l >= YDAY) { const nd = dayN(a.f, TODAY_STR) + 1; return { k: "green", t: nd + " kundan beri", f: a.f, l: a.l }; }
      return { k: "yellow", t: "Yoniq, sarf yo'q" };
    }
    if (a.f && a.l) return { k: "grey", t: (dayN(a.f, a.l) + 1) + " kun ishladi · " + dm(a.f) + "–" + dm(a.l), f: a.f, l: a.l };
    return { k: "grey", t: "O'chirilgan" };
  }
  function groupAct(acts) {
    const ks = acts.map(actKind).filter(Boolean);
    if (!ks.length) return null;
    const fs = (list) => list.map((x) => x.f).filter(Boolean).sort();
    const green = ks.filter((x) => x.k === "green");
    if (green.length) { const f = fs(green)[0]; return { st: "ACTIVE", f, l: TODAY_STR }; }
    if (ks.some((x) => x.k === "yellow")) return { st: "ACTIVE", f: null, l: null };
    const grey = ks.filter((x) => x.k === "grey");
    if (grey.length) { const f = fs(grey)[0], l = grey.map((x) => x.l).filter(Boolean).sort().pop(); return { st: "PAUSED", f, l }; }
    return { st: "DISAPPROVED" };
  }

  const ads = D.ads.map(enrich);
  const sum = (k) => ads.reduce((s, a) => s + a[k], 0);
  const totSpend = sum("spend"), totLeads = sum("leads"), totGood = sum("good"), totVisits = sum("visits"), totSales = sum("sales"), totRevenue = sum("revenue");
  const calls = D.calls;
  const allLeads = totLeads + calls.leads, allGood = totGood + calls.good, allVisits = totVisits + calls.visits, allSales = totSales + calls.sales;
  const spendUzs = totSpend * RATE; // sarf so'mda (ROAS va ROMI uchun)
  // Umumiy ko'rsatkichlar uchun asos: qo'ng'iroqlar reklamadan deb olinsa barcha lidlar, aks holda faqat reklamaga bog'langanlari
  const baseLeads = CALLS_ADS ? allLeads : totLeads, baseGood = CALLS_ADS ? allGood : totGood;
  const baseVisits = CALLS_ADS ? allVisits : totVisits, baseSales = (CALLS_ADS ? allSales : totSales) + hidSales;
  const baseRevenue = (CALLS_ADS ? totRevenue + (calls.revenue || 0) : totRevenue) + hidRevenue;
  const SRCW = CALLS_ADS ? "Reklama va qo'ng'iroqlardan " : "Reklamadan ";
  const totRev = CHECK ? baseSales * CHECK : baseRevenue; // 1-oy daromadi (so'm)
  const totLtv = totRev * LTV_K;
  const roasTot = div(totRev, spendUzs);
  const romiTot = spendUzs > 0 ? (totRev - spendUzs) / spendUzs : 0;
  const ltvRoas = div(totLtv, spendUzs);
  const roasLow = HAS_ROAS && totSpend > 0 && roasTot < T.roas;
  const metaCpl = div(totSpend, totLeads), qCplAds = totGood > 0 ? totSpend / totGood : 0, totProg = ads.reduce((x, a) => x + a.inProg, 0), allProg = totProg + (calls.prog || 0);
  const baseProg = CALLS_ADS ? allProg : totProg;
  const baseDone = Math.max(baseLeads - baseProg, 0); // qayta ishlangan lidlar (sifatli + sifatsiz)
  const qTot = div(baseGood, baseLeads), qTotAds = div(totGood, totLeads);  // sifatli ulush: jami lidga nisbatan
  const qProc = div(baseGood, baseDone);                                      // qayta ishlangan lidlar sifati
  // Jarayondagi lidlar ham qayta ishlanganlar sifatida sifatliga o'tsa kutiladigan sifatli lid soni va narxi
  const expGood = baseGood + baseProg * qProc;
  const qCplAll = allGood > 0 ? totSpend / allGood : 0;
  const qCplTot = QCOST_ALL ? qCplAll : qCplAds, qCplBase = QCOST_ALL ? allGood : totGood;

  const okStyle = { bg: "#FFFFFF", border: "#E2E8EE", ink: "#14212B", sub: "#566573", isBad: false, flag: "" };
  const badStyle = { bg: "#FDECEA", border: "#F0B4AC", ink: "#A12116", sub: "#7A2018", isBad: true };
  const kpis = [
    Object.assign({ label: "Umumiy sarf", value: money(totSpend), note: D.periodLabel + " reklama sarfi" + (USD ? " · ≈ " + fmt(spendUzs) + " so'm" : "") }, okStyle),
    Object.assign({ label: "Jami lid", value: String(allLeads), note: totLeads + " reklama + " + calls.leads + " kiruvchi qo'ng'iroq" }, okStyle),
    Object.assign({ label: "Meta CPL", value: totLeads ? moneyR(metaCpl) : "—", note: "Chegara: " + money(T.cpl) + (CALLS_ADS ? ". Sarf ÷ " + totLeads + " forma lidi. Qo'ng'iroqlar bilan: " + (allLeads ? moneyR(totSpend / allLeads) : "—") : "") }, metaCpl > T.cpl ? Object.assign({ flag: "Chegaradan oshdi" }, badStyle) : okStyle),
    Object.assign({ label: "Sifatli lid narxi", value: qCplBase ? moneyR(qCplTot) : "—", note: (qCplBase && qCplTot > T.qcpl ? "Chegara " + moneyDan(T.qcpl) + " " + Math.round((qCplTot / T.qcpl - 1) * 100) + "% oshgan. " : "Chegara: " + money(T.qcpl) + ". ") + (QCOST_ALL ? "Sarf ÷ " + allGood + " sifatli lid (barcha manba)." + (totGood ? " Faqat reklamaga bog'langan " + totGood + " ta bo'yicha: " + moneyR(qCplAds) + "." : "") : (allGood ? "Qo'ng'iroqlar bilan: " + moneyR(qCplAll) : "")) + (baseProg > 0 && expGood > 0 ? " Jarayondagi " + baseProg + " lid ishlangach kutiladigan narx: ≈ " + moneyR(totSpend / expGood) + "." : "") }, qCplBase && qCplTot > T.qcpl ? Object.assign({ flag: "Chegaradan oshdi" }, badStyle) : okStyle),
    Object.assign({ label: "Sifatli lid ulushi", value: pct(qTot), note: "Chegara: " + pct(T.quality) + " dan past tushmasin. " + baseGood + " sifatli / " + baseLeads + " jami lid." + (CALLS_ADS ? " Faqat forma lidlari: " + pct(qTotAds) : "") }, baseLeads > 0 && qTot < T.quality ? Object.assign({ flag: "Chegaradan past" }, badStyle) : okStyle),
    Object.assign({ label: "Qayta ishlangan lidlar sifati", value: baseDone > 0 ? pct(qProc) : "—", note: baseGood + "/" + baseDone + (baseProg > 0 ? " · ⏳ " + baseProg + " ta jarayonda" : "") + ". Jarayondagi lidlarsiz: sifatli ÷ (sifatli + sifatsiz). Ma'lumot uchun, chegara qo'yilmagan." }, okStyle),
    Object.assign({ label: "Sotuv narxi", value: baseSales > 0 ? moneyR(totSpend / baseSales) : "—", note: SRCW + baseSales + " sotuv" + (PAY_MODE ? " (to'lov sanasi bo'yicha" + (hidSales ? ", " + hidSales + " tasi oldingi davr reklamalaridan" : "") + ")" : "") + " · kelgan mijoz narxi " + (baseVisits > 0 ? moneyR(totSpend / baseVisits) : "—") }, okStyle),
    Object.assign({ label: CHECK ? "Daromad (1-oy)" : "Daromad", value: fmt(totRev) + " so'm", note: CHECK ? baseSales + " sotuv × " + fmt(CHECK) + " so'm · amoCRM'dagi to'lov: " + fmt(baseRevenue) + " so'm" : baseSales + " sotuv · amoCRM bitim summasi" }, okStyle),
    Object.assign({ label: CHECK ? "ROAS (1-oy)" : "ROAS", value: roasTot.toFixed(1) + "x", note: "ROMI " + sgn(romiTot) + (HAS_ROAS ? " · chegara " + T.roas + "x dan past tushmasin" : " · chegara qo'yilmagan") }, roasLow ? Object.assign({ flag: "Chegaradan past" }, badStyle) : okStyle)
  ].concat(CHECK ? [
    Object.assign({ label: "LTV", value: fmt(totLtv) + " so'm", note: "1-oy daromadi × " + LTV_K + " · LTV ROAS " + ltvRoas.toFixed(1) + "x" }, okStyle)
  ] : []);

  // Oylik reja
  const totalOf = (d) => (D.daily && D.daily[d]) || 0;                 // shu kuni tushgan jami lid
  const goodOf = (d) => (D.dailyGood && D.dailyGood[d]) || 0;          // shulardan sifatlisi
  const progOf = (d) => (D.dailyProg && D.dailyProg[d]) || 0;          // hali jarayonda turganlari
  const facts = PLAN_Q && D.dailyGood ? goodOf : totalOf;
  let monthPlan = 0, planDone = 0, factDone = 0;
  for (let d = 1; d <= MONTH_DAYS; d++) {
    monthPlan += planFor(d);
    if (d < TODAY) { planDone += planFor(d); factDone += facts(d); }
  }
  const todayLeads = IS_CUR_MONTH ? facts(TODAY) : 0;
  const factAll = factDone + todayLeads;
  const NO_PLAN = monthPlan <= 0;
  const paceVal = planDone > 0 ? factDone / planDone : 1;
  const remaining = Math.max(monthPlan - factAll, 0);
  const daysLeft = Math.max(MONTH_DAYS - TODAY, 0);
  const perDay = Math.round(remaining / Math.max(daysLeft, 1));
  const forecast = Math.round(paceVal * monthPlan);
  let paceBg = "#E4F5EA", paceInk = "#05603A", paceWord = "Rejada";
  if (paceVal < T.pace) { paceBg = "#FDECEA"; paceInk = "#A12116"; paceWord = "Juda orqada"; }
  else if (paceVal < 1) { paceBg = "#FEF3C7"; paceInk = "#7A3F06"; paceWord = "Orqada"; }
  if (IS_PAST_MONTH) paceWord = paceVal >= 1 ? "Bajarildi" : "Bajarilmadi";
  if (NO_PLAN) { paceBg = "#F3F5F7"; paceInk = "#566573"; paceWord = "Reja kiritilmagan"; }
  const plan = {
    monthTitle, monthPlan: fmt(monthPlan), fact: fmt(factAll), monthPct: pct(factAll / monthPlan),
    expectedPct: pct(planDone / monthPlan), planToDate: fmt(planDone), pace: NO_PLAN ? "—" : pct(paceVal), paceBg, paceInk, paceWord,
    remaining: fmt(remaining), daysLeft: String(daysLeft), perDay: IS_PAST_MONTH || NO_PLAN ? "—" : String(perDay), isPast: IS_PAST_MONTH, forecast: fmt(forecast), forecastPct: pct(forecast / monthPlan)
  };

  // Kalendar (dushanbadan boshlanadi)
  const lead = (new Date(Date.UTC(PM.y, PM.m, 1)).getUTCDay() + 6) % 7;
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
    cells.push({ day: d, plan: p, fact: f, showFact: d <= TODAY, showPct: isDone, pct: pct(ratio), factLabel: isToday ? "Hozircha" : "Fakt", isToday, bg, border: isToday ? "#14212B" : border, borderW: isToday ? 2 : 1, ink,
      extra: PLAN_Q && d <= TODAY ? "Jami lid: " + totalOf(d) + (progOf(d) ? " · jarayonda " + progOf(d) : "") : "" });
  }
  while (cells.length % 7 !== 0) cells.push({ blank: true });
  const sunWord = DP.sun === 0 ? "yakshanba dam olish kuni" : DP.sun < 1 ? "yakshanbaga oddiy kunning " + pct(DP.sun) + " i" : "hamma kunga teng";
  const planNote = (DP.source === "panel"
    ? "Oylik reja (" + fmt(monthPlan) + " " + UNIT + ") panelda kiritilgan va kunlarga avtomatik bo'lingan: " + sunWord + "."
    : NO_PLAN ? "Bu oy uchun reja kiritilmagan. Yuqoridagi \"Oylik reja\" tugmasi orqali oylik " + UNIT + " sonini kiriting."
    : "Bu oy uchun reja panelda kiritilmagan: projects.config.js dagi standart reja (" + fmt(monthPlan) + " " + UNIT + ") ishlatilmoqda.")
    + " Bugungi katak kun tugamaguncha rangga bo'yalmaydi."
    + (PLAN_Q ? " Sifatli lid lid tushgan kuniga yoziladi (barcha manba: reklama va qo'ng'iroqlar). Jarayondagi lidlar operator ishlagach sifatliga o'tishi mumkin, shuning uchun oxirgi kunlar soni keyin oshadi." : "");

  // Bugun
  const planDay = IS_CUR_MONTH ? planFor(TODAY) : 0;
  const dayBudget = P.dayBudget || planDay * (PLAN_Q ? T.qcpl : T.cpl);
  const todayAll = IS_CUR_MONTH ? totalOf(TODAY) : 0, todayProg = IS_CUR_MONTH ? progOf(TODAY) : 0;
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
    { label: up(UNIT) + " (hozircha)", value: String(todayLeads), dev: sgn(leadDev), devBg: leadCol[0], devInk: leadCol[1], sub: "kutilgan " + Math.round(expLeads) + " · kun rejasi " + planDay + (PLAN_Q ? " · jami lid " + todayAll : "") },
    { label: "Sarf (hozircha)", value: money(spendNow), dev: sgn(spendDev), devBg: spendCol[0], devInk: spendCol[1], sub: "kutilgan " + moneyR(expSpend) },
    { label: "Kun oxiri · " + UNIT, value: "≈ " + Math.round(eodLeads), dev: eodLeads >= planDay ? "reja bajariladi" : "reja bajarilmaydi", devBg: eodCol[0], devInk: eodCol[1], sub: Math.round(eodLeads * 0.93) + " ... " + Math.round(eodLeads * 1.07) + " · reja " + planDay },
    { label: "Kun oxiri · sarf", value: "≈ " + moneyR(eodSpend), dev: eodSpend > dayBudget * 1.1 ? "byudjetdan oshadi" : "byudjet ichida", devBg: eodSpendCol[0], devInk: eodSpendCol[1], sub: "kunlik byudjet " + money(dayBudget) }
  ];
  let tVerdict, tBg, tInk, tBorder;
  if (leadDev <= -0.15 && spendDev >= -0.1) { tVerdict = "Sarf rejada, " + UNIT + " ortda: " + COSTW + " yomonlashgan."; tBg = "#FDF3F2"; tInk = "#A12116"; tBorder = "#F0B4AC"; }
  else if (spendDev > 0.1) { tVerdict = "Sarf rejadan oshgan: " + COSTW + " yomonlashgan, byudjetni tekshiring."; tBg = "#FFF8E6"; tInk = "#7A3F06"; tBorder = "#F3DC8B"; }
  else if (leadDev >= -0.1 && spendDev >= -0.1) { tVerdict = "Kun rejada: " + UNIT + " ham, sarf ham kutilgan darajada."; tBg = "#F1FAF4"; tInk = "#05603A"; tBorder = "#BFE3CC"; }
  else { tVerdict = "Sarf ham, " + UNIT + " ham rejadan past: reklama kam sarflayapti."; tBg = "#FFF8E6"; tInk = "#7A3F06"; tBorder = "#F3DC8B"; }
  if (planDay <= 0) { tVerdict = "Bugun uchun " + UNIT + " rejasi yo'q: og'ish hisoblanmaydi."; tBg = "#F3F5F7"; tInk = "#2B3A46"; tBorder = "#E2E8EE"; }
  const gap = Math.round(planDay - eodLeads);
  const todayLines = [
    "Bugungi " + COSTW + ": " + (cplNow ? moneyR(cplNow) : "—") + " (kun rejasi " + money(planCpl) + (cplNow > planCpl ? ", " + sgn(cplNow / planCpl - 1) + " qimmat" : "") + ")." + (PLAN_Q ? " Bugungi Meta CPL: " + (todayAll > 0 ? moneyR(spendNow / todayAll) : "—") + " (chegara " + money(T.cpl) + ")." : ""),
    gap > 0 ? "Joriy sur'atda kun oxirigacha ≈ " + Math.round(eodLeads) + " " + UNIT + ", rejaga " + gap + " ta yetmaydi." : gap === 0 ? "Joriy sur'atda kun oxirigacha ≈ " + Math.round(eodLeads) + " " + UNIT + ", aynan reja bo'yicha." : "Joriy sur'atda kun oxirigacha ≈ " + Math.round(eodLeads) + " " + UNIT + ", reja " + Math.abs(gap) + " taga oshadi.",
    "Rejaga yetish uchun kun oxirigacha yana " + Math.max(planDay - todayLeads, 0) + " " + UNIT + " kerak." + (cplNow > planCpl ? " Tavsiya: sarfi baland, sifati past reklamalarni tekshiring." : "")
  ].concat(PLAN_Q && todayProg > 0 ? ["Bugungi lidlarning " + todayProg + " tasi hali jarayonda: operator ishlagach sifatli lid soni oshishi mumkin."] : []);
  const todayFresh = D.freshness + (D.historyUsed === false ? " Davr eski bo'lgani uchun bosqich tarixi o'qilmadi: lid sifati joriy holatiga qarab hisoblandi." : "") + " Kutilgan qiymat = kun rejasi × shu soatgacha odatdagi ulush (" + pct(HOUR_SHARE) + ").";

  // Operatorlar
  const operators = D.operators.map((o) => ({
    name: o.name, leads: String(o.leads), good: String(o.good), goodPct: pct(div(o.good, o.leads)), visits: String(o.visits),
    offer: String(o.offerNow || 0), sales: String(o.sales || 0),
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
    if (a.leads === 0) parts.push("sarf " + money(a.spend) + ", lid yo'q");
    if (a.cplBad) parts.push("Meta CPL " + moneyR(a.cpl) + " (chegara " + money(T.cpl) + ")");
    if (a.qcplBad) parts.push("sifatli lid narxi " + (isFinite(a.qcpl) ? moneyR(a.qcpl) : "hisoblanmaydi (sifatli lid yo'q)") + " (chegara " + money(T.qcpl) + ")");
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
  if (roasLow) alerts.unshift({ isRed: true, isAmber: false, bg: redBg, title: "ROAS chegaradan past", text: "ROAS " + roasTot.toFixed(1) + "x (chegara " + T.roas + "x). Daromad " + fmt(totRev) + " so'm, sarf " + money(totSpend) + ".", action: "sifatli lid narxi baland reklamalarni o'chiring, mahsulot narxi va o'rtacha chekni tekshiring." });
  if (D.accountCurrency && D.accountCurrency !== (USD ? "USD" : "UZS")) alerts.unshift({ isRed: true, isAmber: false, bg: redBg, title: "Valyuta mos emas", text: "Meta reklama akkaunti valyutasi " + D.accountCurrency + ", sozlamada esa " + (USD ? "USD" : "UZS") + ". CPL va chegaralar noto'g'ri solishtirilmoqda.", action: "projects.config.js da shu loyihaning currency qiymatini to'g'rilang." });
  if (NO_PLAN) alerts.push({ isRed: false, isAmber: true, bg: amberBg, title: "Oylik " + UNIT + " rejasi kiritilmagan", text: "Bu oy uchun reja yo'q, shuning uchun reja tezligi va kunlik og'ish hisoblanmayapti.", action: "yuqoridagi \"Oylik reja\" tugmasi orqali oylik " + UNIT + " rejasini kiriting." });
  if (!NO_PLAN && paceVal < 1 && IS_PAST_MONTH) alerts.push({ isRed: paceVal < T.pace, isAmber: paceVal >= T.pace, bg: paceVal < T.pace ? redBg : amberBg, title: monthTitle + ": oylik reja bajarilmadi", text: "Reja " + fmt(monthPlan) + " " + UNIT + ", fakt " + fmt(factAll) + " (" + pct(paceVal) + ").", action: "keyingi oy rejasini shu natijaga qarab belgilang." });
  if (!NO_PLAN && paceVal < 1 && !IS_PAST_MONTH) alerts.push({ isRed: paceVal < T.pace, isAmber: paceVal >= T.pace, bg: paceVal < T.pace ? redBg : amberBg, title: "Oylik reja ortda qolmoqda", text: "Reja tezligi " + pct(paceVal) + " (kechagacha " + factDone + " fakt, " + planDone + " reja). Oy oxiriga prognoz: " + forecast + " " + UNIT + ".", action: "rejaga yetish uchun qolgan " + daysLeft + " kunda kuniga o'rtacha " + perDay + " " + UNIT + " kerak." });
  if (SHOW_TODAY && !NO_PLAN && leadDev <= -0.15 && spendDev >= -0.1) alerts.push({ isRed: false, isAmber: true, bg: amberBg, title: "Bugun: " + UNIT + " ortda", text: "Soat " + nowLabel + " holatiga " + todayLeads + " " + UNIT + ", kutilgan " + Math.round(expLeads) + ". Bugungi " + COSTW + " " + (cplNow ? moneyR(cplNow) : "—") + ".", action: "kun oxirigacha reklamalar va forma ishlashini tekshiring." });
  operators.forEach((o) => { if (o.isSlow) alerts.push({ isRed: false, isAmber: true, bg: amberBg, title: o.name + ": javob sekin", text: "Birinchi javob vaqti " + o.replyMin + " daqiqa (chegara " + T.reply + ").", action: "lidlarni qayta taqsimlang yoki javob tezligini nazorat qiling." }); });
  if (!alerts.length) alerts.push({ isRed: false, isAmber: false, bg: "#F1FAF4", title: "Hammasi chegarada", text: "Hech bir ko'rsatkich chegarani buzmagan.", action: "o'zgartirish shart emas." });
  const redCount = alerts.filter((x) => x.isRed).length, amberCount = alerts.filter((x) => x.isAmber).length;
  const alertSummary = "Xavf: " + redCount + " · Diqqat: " + amberCount + " · chegaralar asosida avtomatik aniqlanadi";
  const thresholdsText = "Chegaralar: Meta CPL " + moneyDan(T.cpl) + " oshmasin · sifatli lid narxi " + moneyDan(T.qcpl) + " oshmasin · sifatli ulush " + pct(T.quality) + " dan past tushmasin · nedozvon " + pct(T.noAns) + " dan oshmasin · " + (HAS_ROAS ? "ROAS " + T.roas + "x dan past tushmasin" : "ROAS: chegara qo'yilmagan, faqat ko'rsatiladi") + " · reja tezligi " + pct(T.pace) + " dan past tushmasin · birinchi javob " + T.reply + " daqiqadan oshmasin";

  // Voronka
  const pre = "#9AA8B5", qc = "#1D4ED8", win = "#05603A";
  const steps = [
    { label: "Yangi lid", count: allLeads, color: pre, qStart: false },
    { label: "Aloqaga chiqildi", count: D.mid.contacted, color: pre, qStart: false },
    { label: "Ma'lumot berildi", count: allGood, color: qc, qStart: true },
    { label: "Taklif qilindi", count: D.mid.offered, color: qc, qStart: false },
    { label: "Suhbatga keldi", count: allVisits, color: qc, qStart: false },
    { label: "Sotuv", count: typeof D.cohortSales === "number" ? D.cohortSales : allSales, color: win, qStart: false }
  ];
  const funnel = steps.map((s, i) => ({ label: s.label, count: String(s.count), color: s.color, qStart: s.qStart, rate: i === 0 ? "boshlanish" : pct(div(s.count, steps[i - 1].count)), width: pct(div(s.count, allLeads)) }));
  const dataWarn = (typeof D.cohortSales === "number" ? D.cohortSales : allSales) > allVisits ? "Diqqat: sotuv soni 'Suhbatga keldi'dan ko'p. Operator bosqichni o'tkazib yuborgan bo'lishi mumkin." : "";

  const sources = [
    { name: "Reklama", note: BY_FIELDS ? "Reklama nomi maydoni to'ldirilgan lidlar" : "Reklama tegi bor lidlar", leads: String(totLeads), quality: String(totGood), qualityPct: pct(div(totGood, totLeads)), visits: String(totVisits), sales: String(totSales + hidSales) },
    { name: "Kiruvchi qo'ng'iroq", note: "incoming_call tegi: " + calls.tag + " · tegsiz: " + calls.noTag, leads: String(calls.leads), quality: String(calls.good), qualityPct: pct(div(calls.good, calls.leads)), visits: String(calls.visits), sales: String(calls.sales) }
  ];

  // Jadval
  const list = by === "campaign" ? groupBy("campaign") : by === "adset" ? groupBy("adset") : ads;
  const rows = list.map((a) => {
    const isOff = a.rec === "off", isScale = a.rec === "scale", low = a.leads < T.minLeads;
    const num = (x) => (isFinite(x) ? Math.round(x * 10000) / 10000 : null);
    return {
      act: actKind(a.act),
      // Saralash uchun xom qiymatlar (bo'sh qiymat = null, saralashda doim pastda turadi)
      sv: { spend: a.spend, leads: a.leads, good: a.leads ? num(a.q) : null, noAns: a.noAns, inProg: a.inProg, lost: a.lost, visits: a.visits, sales: a.sales,
        cr: a.leads ? num(a.cr) : null, revenue: a.rev, roas: a.spend > 0 ? num(a.roas) : null, metaCpl: a.leads && a.spend > 0 ? num(a.cpl) : null,
        qCpl: a.good > 0 && a.spend > 0 ? num(a.qcpl) : null, saleCpl: a.sales > 0 && a.spend > 0 ? num(a.spend / a.sales) : null, dup: a.dup, rec: isOff ? 0 : isScale ? 2 : 1 },
      name: a.name, sub: a.format || "", spend: cell(a.spend), leads: String(a.leads),
      good: String(a.good), goodPct: a.goodPct, visits: String(a.visits), sales: String(a.sales),
      noAns: String(a.noAns), noAnsPct: pct(a.noAnsPct), noAnsColor: a.noAnsPct > T.noAns ? "#A12116" : "#566573",
      inProg: String(a.inProg), inProgPct: pct(a.inProgPct), lost: String(a.lost), lostPct: pct(a.lostPct),
      cr: pct1(a.cr), crColor: a.sales === 0 && a.leads > 0 ? "#A12116" : "#14212B",
      revenue: fmt(a.rev), roas: a.roas.toFixed(1) + "x", roasColor: a.roasBad ? "#A12116" : "#14212B",
      dup: String(a.dup), dupPct: pct(a.dupPct), dupColor: a.dupPct > 0.05 ? "#A12116" : "#566573",
      metaCpl: a.leads && a.spend > 0 ? cellR(a.cpl) : "—", qCpl: a.good > 0 && a.spend > 0 ? cellR(a.qcpl) : "—",
      saleCpl: a.sales > 0 ? cellR(a.spend / a.sales) : "—",
      isOff, isScale, isWatch: !isOff && !isScale, trust: low ? "Ma'lumot kam" : "",
      rowBg: isOff || a.qBad ? "#FFF8F7" : "#FFFFFF",
      barColor: a.q >= 0.7 ? "#12945A" : a.q >= T.quality ? "#D97706" : "#D92D20",
      goodColor: a.qBad ? "#A12116" : "#14212B", cplColor: a.cplBad ? "#A12116" : "#566573", qcplColor: a.qcplBad ? "#A12116" : "#14212B"
    };
  });
  const tableTitle = by === "campaign" ? "Kampaniyalar bo'yicha natija" : by === "adset" ? "Ad set (auditoriya) bo'yicha natija" : "Reklamalar (kreativ) bo'yicha haqiqiy natija";
  const nameHeader = by === "campaign" ? "Kampaniya" : by === "adset" ? "Ad set" : "Reklama";

  // LOST sabablari: hamma lost lidlar, sabab bo'yicha (soni, lost ichidagi ulushi, sifatli/sifatsiz)
  const rTotal = D.reasons.reduce((s, r) => s + r.count, 0);
  const rGood = D.reasons.reduce((s, r) => s + (r.good || 0), 0);
  const rMax = Math.max(1, ...D.reasons.map((r) => r.count));
  const reasons = D.reasons.map((r) => ({ label: r.label, count: String(r.count), share: pct(div(r.count, rTotal)), width: pct(r.count / rMax), good: String(r.good || 0), bad: String(r.bad == null ? r.count : r.bad) }));
  const rEmpty = D.reasons.find((r) => r.label === "Sabab kiritilmagan");
  const rTop = D.reasons.find((r) => r.label !== "Sabab kiritilmagan");
  const reasonsSub = fmt(rTotal) + " ta lost lid · jami lidning " + pct(div(rTotal, allLeads)) + " · sifatli " + rGood + " · sifatsiz " + (rTotal - rGood);
  const reasonsNote = !D.reasons.length ? "Bu davrda lost qilingan lid yo'q."
    : (rTop ? "Eng ko'p sabab: \"" + rTop.label + "\" (" + rTop.count + " ta, lost lidlarning " + pct(div(rTop.count, rTotal)) + ")." : "")
      + (rEmpty && rEmpty.count / rTotal > 0.2 ? " Diqqat: " + rEmpty.count + " ta lidda (" + pct(rEmpty.count / rTotal) + ") sabab kiritilmagan. amoCRM'da lost qilishda sababni majburiy qiling, aks holda tahlil to'liq bo'lmaydi." : "")
      + " Sabab amoCRM'dagi \"Причина отказа\" maydonidan olinadi.";

  // 2-rejim: sarfi shu davrda bo'lmagan (oldingi davr) reklamalardan kelgan sotuvlar, alohida yashirin blok
  const hidden = {
    show: PAY_MODE, count: hidSales, revenue: fmt(CHECK ? hidSales * CHECK : hidRevenue),
    rows: HIDDEN.map((h) => ({ name: h.name, sub: [h.campaign, h.adset].filter((x) => x && x !== "—").join(" · ") || "—", leadFrom: h.leadFrom || "", sales: String(h.sales), revenue: fmt(CHECK ? h.sales * CHECK : h.revenue || 0) }))
  };
  const payInfo = D.payInfo || null;
  const saleModeNote = PAY_MODE
    ? "Sotuv to'lov sanasi bo'yicha: \"To'lov sanasi\" shu davrga tushgan sotuvlar (lid qachon tushganidan qat'i nazar). Maydon bo'sh bo'lsa lid \"Чек\" bosqichiga o'tgan sana olinadi." + (payInfo ? " Jami " + payInfo.total + " ta: " + payInfo.byField + " tasi maydondan, " + payInfo.byChek + " tasi Чек sanasidan." : "") + " Lid, sifatli, keldi va voronka o'zgarmaydi."
    : "Sotuv lid sanasi bo'yicha: faqat shu davrda tushgan lidlarning sotuvlari.";

  const rules = [
    { title: "Sifatli lid", text: P.lostQuality ? "Sifatli: \"Ma'lumot berildi\" yoki \"Taklif qilindi\" bosqichidagi lid va \"Suhbatga keldi\" voronkasidagi har qanday lid. LOST qilingan lid \"" + P.lostQuality.field + "\" maydonidagi qiymatga qarab sifatli yoki sifatsiz hisoblanadi. Boshqa ochiq bosqichdagi lid (LID, Bog'lanilmadi) jarayonda turadi." + " Sifatli ulush = sifatli ÷ jami lid. Alohida kartochkada qayta ishlangan lidlar sifati ham ko'rsatiladi: sifatli ÷ (sifatli + sifatsiz), jarayondagilarsiz." : "amoCRM'da \"Ma'lumot berildi\", \"Taklif qilindi\", \"Suhbatga keldi\" yoki sotuv bosqichiga bir marta bo'lsa ham o'tgan lid. Keyin lost bo'lsa ham sifatli hisoblanadi, chunki bosqich tarixiga qaraladi." },
    { title: "Lid manbasi", text: BY_FIELDS ? "Lidda (yoki unga bog'langan kompaniyada) reklama nomi maydoni to'ldirilgan bo'lsa, lid shu nom bo'yicha Meta reklamasiga bog'lanadi. Maydon bo'sh lid kiruvchi qo'ng'iroq deb olinadi." + (CALLS_ADS ? " Kiruvchi qo'ng'iroqlar ham reklamadan kelgan deb hisoblanadi: umumiy sifatli lid narxi, sifatli ulush, sotuv narxi, daromad, ROAS va LTV barcha lidlar bo'yicha chiqadi. Jadvaldagi reklama qatorlarida esa faqat shu reklamaga bog'langan lidlar sanaladi."  : "") : "Reklama tegi bor lid reklama hisoblanadi. incoming_call tegi bor yoki umuman tegi yo'q lid kiruvchi qo'ng'iroq deb olinadi." },
    { title: "Sotuv hisobi", text: "Ikki rejim bor. Lid sanasi bo'yicha (standart): shu davrda tushgan lidlardan nechtasi sotuvga aylangani. To'lov sanasi bo'yicha: \"To'lov sanasi\" maydoni shu davrga tushgan barcha sotuvlar (maydon bo'sh bo'lsa lid Чек bosqichiga o'tgan sana). 2-rejim faqat Sotuv, Daromad, ROAS, LTV, Sotuv narxi va Lid → sotuv ko'rsatkichlarini o'zgartiradi. Shu davrda sarfi bo'lmagan oldingi reklamalardan kelgan sotuvlar jadvalga qo'shilmaydi, alohida blokda turadi, lekin yuqoridagi umumiy kartochkalarga kiradi." },
    { title: "Lid holatlari", text: "Jarayonda: sifati hali aniqlanmagan ochiq lid. Nedozvon: telefon ko'tarilmagan sababli sifatsiz. Yo'qotilgan: boshqa sabab bilan sifatsiz. Dubl: takroriy lid. Sotuv: sotuv bosqichidagi lid." },
    { title: "Daromad va ROAS", text: (CHECK ? "Daromad (1-oy) = " + (CALLS_ADS ? "barcha sotuvlar soni (reklama va kiruvchi qo'ng'iroqlar)" : "reklamadan kelgan sotuv soni") + " × " + fmt(CHECK) + " so'm. ROAS = shu daromad ÷ sarf. LTV = 1-oy daromadi × " + LTV_K + ". amoCRM'dagi haqiqiy to'lov summasi alohida ko'rsatiladi." : "Daromad = sotuv bo'lgan lidlarning amoCRM bitim summasi. ROAS = daromad ÷ sarf.") + " ROMI = (daromad − sarf) ÷ sarf. Sotuv bo'lgan lid avtomatik \"Suhbatga keldi\" hisoblanadi." + (USD ? " Sarf dollarda, daromad so'mda: solishtirish uchun sarf so'mga o'giriladi, kurs 1$ = " + fmt(RATE) + " so'm (" + (rateInfo.source === "cbu" ? "Markaziy bank" + (rateInfo.date ? ", " + rateInfo.date : "") : rateInfo.source === "config" ? "sozlamada yozilgan" : "zaxira kurs, Markaziy bank javob bermadi") + ")." : "") },
    { title: "Ogohlantirish chegaralari", text: "Meta CPL, sifatli lid narxi, sifatli ulush, nedozvon, " + (HAS_ROAS ? "ROAS, " : "") + "reja tezligi yoki javob vaqti chegarani buzsa, ko'rsatkich qizaradi va ogohlantirishlar ro'yxatiga tushadi. Chegaralar har loyiha uchun alohida." },
    { title: "Tavsiya qoidasi", text: "O'chirish: sifatli ulush " + pct(T.qualityWarn) + " dan past va sifatli lid narxi chegaradan baland. Kuchaytirish: ulush 70% va undan yuqori, narx chegarada. Qolgan holatlar va " + T.minLeads + " tadan kam lid bo'lsa: Kuzatish." },
    { title: "Bugungi prognoz", text: "Kun oxiri " + UNIT + " = hozirgi " + UNIT + " ÷ shu soatgacha odatdagi ulush. Kutilgan qiymat = kun rejasi × shu ulush. Og'ish −15% dan past bo'lsa qizil, 0 dan −15% gacha sariq." },
    { title: "Oylik reja", text: "Oylik " + UNIT + " rejasi panelda kiritiladi va kunlarga avtomatik bo'linadi." + (PLAN_Q ? " Reja barcha manbadagi sifatli lidlar soni bilan solishtiriladi; lid o'zi tushgan kunga yoziladi." : "") + " Tezlik = kechagacha fakt ÷ kechagacha reja. Prognoz = tezlik × oylik reja. Kuniga kerak lid = qolgan reja ÷ qolgan kunlar." }
  ];

  return { redCount, amberCount, kpis, alerts, alertSummary, thresholdsText, plan, planNote, cells, funnel, dataWarn, sources, rows, tableTitle, nameHeader, reasons, reasonsTotal: String(rTotal), reasonsNote, operators, opAvg, opNote, rules, reasonsSub, planUnit: UNIT, planByQuality: PLAN_Q, todayTiles, todayLines, todayVerdict: tVerdict, todayBg: tBg, todayInk: tInk, todayBorder: tBorder, todaySub: nowLabel + " holatiga · kunlik byudjet " + money(dayBudget) + " · kunlik " + UNIT + " reja " + planDay, todayFresh,
    showToday: SHOW_TODAY, saleMode: PAY_MODE ? "pay" : "lead", saleModeNote, hidden, revenueHeader: CHECK ? "Daromad (1-oy), so'm" : "Daromad, so'm",
    sourceNote: BY_FIELDS ? "Reklama nomi maydoni to'ldirilgan lid reklamadan. Maydoni bo'sh lid kiruvchi qo'ng'iroq deb olinadi." : "Reklama tegi bor lid reklamadan. incoming_call tegli yoki tegsiz lid kiruvchi qo'ng'iroq deb olinadi.",
    spendHeader: "Sarf, " + (USD ? "$" : "so'm"), planSource: DP.source, planTotal: monthPlan, planSun: DP.sun, noPlan: NO_PLAN };
}
