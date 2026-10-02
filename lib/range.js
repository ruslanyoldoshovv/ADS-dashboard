// Sana oralig'ini aniqlash: tayyor davrlar (bugun, shu hafta, shu oy ...) yoki ixtiyoriy oraliq (from/to).
// Hamma sanalar Toshkent vaqti bo'yicha. Kunlar { y, m (0-11), d } ko'rinishida.
const MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
const MAX_DAYS = 92; // bitta so'rovda eng ko'pi (amoCRM va Vercel vaqt chegarasi uchun)

const pad = (n) => String(n).padStart(2, "0");
const toDate = (o) => new Date(Date.UTC(o.y, o.m, o.d));
const fromDate = (dt) => ({ y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() });
const addDays = (o, n) => fromDate(new Date(toDate(o).getTime() + n * 86400000));
const cmp = (a, b) => toDate(a).getTime() - toDate(b).getTime();
export const ymdStr = (o) => o.y + "-" + pad(o.m + 1) + "-" + pad(o.d);
const dmy = (o) => pad(o.d) + "." + pad(o.m + 1) + "." + o.y;

function parse(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return null;
  const o = { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
  const back = fromDate(toDate(o));
  return back.y === o.y && back.m === o.m && back.d === o.d && o.y >= 2020 && o.y <= 2100 ? o : null;
}

export const PRESETS = [
  ["today", "Bugun"], ["yesterday", "Kecha"], ["week", "Shu hafta"], ["lastweek", "O'tgan hafta"],
  ["month", "Shu oy"], ["lastmonth", "O'tgan oy"], ["7d", "Oxirgi 7 kun"], ["30d", "Oxirgi 30 kun"]
];

function presetRange(key, today) {
  const dow = (toDate(today).getUTCDay() + 6) % 7; // dushanba = 0
  if (key === "today") return [today, today];
  if (key === "yesterday") return [addDays(today, -1), addDays(today, -1)];
  if (key === "week") return [addDays(today, -dow), today];
  if (key === "lastweek") return [addDays(today, -dow - 7), addDays(today, -dow - 1)];
  if (key === "month") return [{ y: today.y, m: today.m, d: 1 }, today];
  if (key === "lastmonth") { const end = addDays({ y: today.y, m: today.m, d: 1 }, -1); return [{ y: end.y, m: end.m, d: 1 }, end]; }
  if (key === "7d") return [addDays(today, -6), today];
  if (key === "30d") return [addDays(today, -29), today];
  return null;
}

// sp: URL parametrlari (r = tayyor davr, yoki from/to). now: tashkentNow()
export function resolveRange(sp, now) {
  const today = { y: now.y, m: now.m, d: now.day };
  let from, to, preset = "", note = "";
  const pf = parse(sp && sp.from), pt = parse(sp && sp.to);
  if (pf || pt) {
    from = pf || pt; to = pt || pf;
    if (cmp(from, to) > 0) { const t = from; from = to; to = t; }
  } else {
    preset = PRESETS.some((x) => x[0] === (sp && sp.r)) ? sp.r : "month";
    [from, to] = presetRange(preset, today);
  }
  if (cmp(to, today) > 0) to = today;          // kelajak sanalar kesiladi
  if (cmp(from, to) > 0) from = to;
  const span = Math.round(cmp(to, from) / 86400000) + 1;
  if (span > MAX_DAYS) { from = addDays(to, -(MAX_DAYS - 1)); note = "Davr " + MAX_DAYS + " kundan uzun bo'lgani uchun oxirgi " + MAX_DAYS + " kun ko'rsatildi."; }
  const days = Math.round(cmp(to, from) / 86400000) + 1;
  const presetName = preset ? PRESETS.find((x) => x[0] === preset)[1] : "";
  const span1 = days === 1 ? dmy(from) : dmy(from) + " – " + dmy(to);
  return {
    from, to, days, preset, note,
    fromStr: ymdStr(from), toStr: ymdStr(to),
    label: (presetName ? presetName + " · " : "") + span1,
    shortLabel: presetName || span1,
    query: preset ? "r=" + preset : "from=" + ymdStr(from) + "&to=" + ymdStr(to),
    includesToday: cmp(to, today) === 0,
    // Oylik reja qaysi oy uchun ko'rsatiladi: davr tugagan oy
    planMonth: { y: to.y, m: to.m },
    planMonthKey: to.y + "-" + pad(to.m + 1),
    planMonthLabel: MONTHS[to.m] + " " + to.y,
    todayStr: ymdStr(today)
  };
}
