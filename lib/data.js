// Ma'lumotni yig'ish: Meta + amoCRM -> panel uchun bitta tuzilma.
import cfg from "../projects.config";
import { fetchAds, fetchTodaySpend, fetchCurrency } from "./meta";
import { fetchPipelines, fetchUsers, fetchLeads, fetchStatusEvents } from "./amo";
import { idsOf, idsOfPipelines } from "./stages";
import { demoData } from "./mock";
import { tashkentNow, hourShareNow } from "./calc";
import { buildDailyPlan } from "./plan";

const WON_ID = 142, LOST_ID = 143;
const cache = new Map(); // oddiy 60 soniyalik kesh (Meta/amoCRM limitini asrash uchun)

function creds(p) {
  const e = p.env;
  const c = {
    metaToken: process.env["META_TOKEN_" + e], metaAccount: process.env["META_ACCOUNT_" + e],
    amoSub: process.env["AMO_SUBDOMAIN_" + e], amoToken: process.env["AMO_TOKEN_" + e]
  };
  c.ok = !!(c.metaToken && c.metaAccount && c.amoSub && c.amoToken);
  return c;
}

export function projectStatus(p) {
  const c = creds(p);
  return { meta: !!(c.metaToken && c.metaAccount), amo: !!(c.amoSub && c.amoToken), ok: c.ok };
}

const norm = (s) => String(s || "").toLowerCase().trim();

// opts: { planToday: bugungi lid rejasi, rate: 1$ necha so'm }
export async function getProjectData(p, days, opts) {
  if (!opts) opts = {};
  if (typeof opts.planToday !== "number") { const n = tashkentNow(cfg); opts.planToday = buildDailyPlan(p, n, null).byDay[n.day] || 0; }
  if (!(opts.rate > 0)) opts.rate = cfg.usdRateFallback || 12000;
  const k = p.slug + ":" + days + ":" + opts.planToday;
  const hit = cache.get(k);
  if (hit && Date.now() - hit.t < 60000) return hit.v;
  const v = await load(p, days, opts);
  cache.set(k, { t: Date.now(), v });
  return v;
}

async function load(p, days, opts) {
  const now = tashkentNow(cfg);
  const share = hourShareNow(cfg);
  const planToday = opts.planToday;
  const c = creds(p);
  const periodLabel = days === 1 ? "bugungi" : days + " kunlik";

  if (!c.ok) {
    if (process.env.DEMO === "1") {
      const d = demoData(p, { today: now.day, share, planToday, dayBudget: p.dayBudget || planToday * p.thresholds.cpl, rate: opts.rate });
      if (d) return Object.assign(d, { periodLabel });
    }
    throw new Error("Bu loyiha uchun Vercel'da META_TOKEN_" + p.env + ", META_ACCOUNT_" + p.env + ", AMO_SUBDOMAIN_" + p.env + ", AMO_TOKEN_" + p.env + " kiritilmagan.");
  }

  // Sana oralig'i (Toshkent vaqti bilan)
  const offset = cfg.timezoneOffsetHours * 3600;
  const dayStartTs = (y, m, d) => Math.floor(Date.UTC(y, m, d) / 1000) - offset;
  const nowTs = Math.floor(Date.now() / 1000);
  const monthStartTs = dayStartTs(now.y, now.m, 1);
  const todayStartTs = dayStartTs(now.y, now.m, now.day);
  const periodStartTs = days === 1 ? todayStartTs : todayStartTs - (days - 1) * 86400;
  const fromTs = Math.min(monthStartTs, periodStartTs);
  const ymd = (ts) => new Date((ts + offset) * 1000).toISOString().slice(0, 10);

  const [metaAds, todaySpend, accountCurrency, pipes, users, leads, events] = await Promise.all([
    fetchAds({ token: c.metaToken, account: c.metaAccount, since: ymd(periodStartTs), until: ymd(nowTs) }),
    fetchTodaySpend({ token: c.metaToken, account: c.metaAccount }),
    fetchCurrency({ token: c.metaToken, account: c.metaAccount }),
    fetchPipelines(c.amoSub, c.amoToken),
    fetchUsers(c.amoSub, c.amoToken),
    fetchLeads(c.amoSub, c.amoToken, fromTs, nowTs),
    fetchStatusEvents(c.amoSub, c.amoToken, fromTs)
  ]);

  // Bosqich nomlaridan id'lar
  const statuses = pipes.statuses;
  const S = cfg.stages;
  const visitIds = idsOf(statuses, S.visit);
  idsOfPipelines(statuses, S.visitPipelines).forEach((id) => visitIds.add(id));
  const ST = { contacted: idsOf(statuses, S.contacted), info: idsOf(statuses, S.info), offer: idsOf(statuses, S.offer), visit: visitIds, sale: idsOf(statuses, S.sale) };
  if (cfg.useWonStatus) ST.sale.add(WON_ID);
  const hasAny = (reached, set) => { for (const id of reached) if (set.has(id)) return true; return false; };

  // Sutkalik lidlar (barcha manba), oy bo'yicha
  const daily = {};
  leads.forEach((l) => {
    if (l.created_at >= monthStartTs) {
      const day = new Date((l.created_at + offset) * 1000).getUTCDate();
      daily[day] = (daily[day] || 0) + 1;
    }
  });

  // Reklamalar bo'yicha qatorlar
  const adRows = metaAds.map((a) => ({ id: a.id, name: a.name, format: "ID " + a.id, campaign: a.campaign, adset: a.adset, spend: a.spend, leads: 0, good: 0, visits: 0, sales: 0, noAns: 0, lost: 0, dup: 0, revenue: 0 }));
  const unmatched = { id: "unmatched", name: "Tegi Meta reklamasiga mos kelmagan lidlar", format: "Teg nomi reklama nomi yoki ID bilan bir xil emas", campaign: "—", adset: "—", spend: 0, leads: 0, good: 0, visits: 0, sales: 0, noAns: 0, lost: 0, dup: 0, revenue: 0 };
  const calls = { leads: 0, good: 0, visits: 0, sales: 0, tag: 0, noTag: 0, revenue: 0 };
  const mid = { contacted: 0, offered: 0 };
  const ops = {}; const reasonCount = {};
  const ignore = (cfg.ignoreTags || []).map(norm);

  const matchAd = (tagNames) => {
    for (const t of tagNames) {
      const tn = norm(t);
      const hitAd = adRows.find((r) => norm(r.name) === tn || (r.id && tn.includes(String(r.id))) || norm(r.name).includes(tn));
      if (hitAd) return hitAd;
    }
    return null;
  };

  const periodLeads = leads.filter((l) => l.created_at >= periodStartTs);
  periodLeads.forEach((l) => {
    const tagNames = ((l._embedded && l._embedded.tags) || []).map((t) => t.name);
    const adTags = tagNames.filter((t) => !ignore.includes(norm(t)));
    const hasCallTag = tagNames.some((t) => ignore.includes(norm(t)));
    const reached = new Set(events[l.id] ? Array.from(events[l.id]) : []);
    reached.add(l.status_id);
    const isSale = hasAny(reached, ST.sale);
    const isVisit = isSale || hasAny(reached, ST.visit);
    const isOffer = isVisit || hasAny(reached, ST.offer);
    const isGood = isOffer || hasAny(reached, ST.info);
    const isContacted = isGood || hasAny(reached, ST.contacted);
    const isLost = l.status_id === LOST_ID;
    const reasonName = isLost && l._embedded && l._embedded.loss_reason && l._embedded.loss_reason[0] ? l._embedded.loss_reason[0].name : null;
    const rn = norm(reasonName);
    const isNoAns = isLost && cfg.reasonWords.noAnswer.some((w) => rn.includes(w));
    const isDup = isLost && cfg.reasonWords.duplicate.some((w) => rn.includes(w));
    const revenue = isSale ? Number(l.price) || 0 : 0;

    const target = adTags.length ? (matchAd(adTags) || unmatched) : null;
    const apply = (o) => {
      o.leads++; if (isGood) o.good++; if (isVisit) o.visits++; if (isSale) { o.sales++; o.revenue += revenue; }
      if (isNoAns) o.noAns++; else if (isDup) o.dup++; else if (isLost) o.lost++;
    };
    if (target) apply(target);
    else {
      calls.leads++; if (hasCallTag) calls.tag++; else calls.noTag++;
      if (isGood) calls.good++; if (isVisit) calls.visits++; if (isSale) { calls.sales++; calls.revenue += revenue; }
    }
    if (isContacted) mid.contacted++;
    if (isOffer) mid.offered++;
    const uname = users[l.responsible_user_id] || "Noma'lum";
    if (!ops[uname]) ops[uname] = { name: uname, leads: 0, good: 0, visits: 0, replyMin: null };
    ops[uname].leads++; if (isGood) ops[uname].good++; if (isVisit) ops[uname].visits++;
    if (reasonName) reasonCount[reasonName] = (reasonCount[reasonName] || 0) + 1;
  });
  if (unmatched.leads > 0) adRows.push(unmatched);

  return {
    mode: "live", periodLabel,
    freshness: "Ma'lumot yangilandi: " + String(now.hour).padStart(2, "0") + ":" + String(now.min).padStart(2, "0") + " (Meta va amoCRM, har so'rovda yangilanadi, 60 soniya kesh).",
    ads: adRows, calls, mid,
    operators: Object.values(ops).sort((a, b) => b.leads - a.leads),
    reasons: Object.keys(reasonCount).map((k) => ({ label: k, count: reasonCount[k] })).sort((a, b) => b.count - a.count).slice(0, 6),
    daily, todaySpend, accountCurrency
  };
}
