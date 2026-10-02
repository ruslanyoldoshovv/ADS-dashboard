// Ma'lumotni yig'ish: Meta + amoCRM -> panel uchun bitta tuzilma.
import cfg from "../projects.config";
import { fetchAds, fetchTodaySpend, fetchCurrency } from "./meta";
import { fetchPipelines, fetchUsers, fetchLeads, fetchStatusEvents, fetchCompaniesByIds } from "./amo";
import { idsOf, idsOfPipelines, nkey } from "./stages";
import { demoData } from "./mock";
import { tashkentNow, hourShareNow } from "./calc";
import { buildDailyPlan } from "./plan";
import { projectEnv } from "./env";
import { resolveRange } from "./range";

const WON_ID = 142, LOST_ID = 143; // amoCRM'da hamma voronkada bir xil: muvaffaqiyatli va yopilgan
const EVENTS_MAX_AGE_DAYS = 62;    // bundan eski davr uchun bosqich tarixi o'qilmaydi (juda ko'p so'rov), joriy holatga qaraladi
const cache = new Map(); // oddiy 60 soniyalik kesh (Meta/amoCRM limitini asrash uchun)

const creds = (p) => projectEnv(p); // qiymatlar tozalanadi: "act_" qo'shiladi, subdomen ajratib olinadi

export function projectStatus(p) {
  const c = creds(p);
  return { meta: !!(c.metaToken && c.metaAccount), amo: !!(c.amoSub && c.amoToken), ok: c.ok };
}

const norm = (s) => String(s || "").toLowerCase().trim();

// range: resolveRange() natijasi (yoki eski usulda kunlar soni: 1, 7, 30)
// opts: { planToday: bugungi lid rejasi, rate: 1$ necha so'm, tolerant: Meta xato bersa ham amoCRM qismini qaytarish }
export async function getProjectData(p, range, opts) {
  if (!opts) opts = {};
  const now = tashkentNow(cfg);
  if (!range || typeof range !== "object") range = resolveRange({ r: range === 1 ? "today" : range === 30 ? "30d" : "7d" }, now);
  if (typeof opts.planToday !== "number") opts.planToday = buildDailyPlan(p, now, null).byDay[now.day] || 0;
  if (!(opts.rate > 0)) opts.rate = cfg.usdRateFallback || 12000;
  const k = p.slug + ":" + range.fromStr + ":" + range.toStr + ":" + opts.planToday + (opts.tolerant ? ":t" : "");
  const hit = cache.get(k);
  if (hit && Date.now() - hit.t < 60000) return hit.v;
  const v = await load(p, range, opts);
  if (cache.size > 200) cache.clear();
  cache.set(k, { t: Date.now(), v });
  return v;
}

// Lid yoki kompaniyaning qo'shimcha maydonidan qiymat olish (maydon nomi bo'yicha, yumshoq solishtirish)
function fieldValue(entity, names) {
  if (!entity || !names || !names.length) return "";
  const want = names.map(nkey);
  const f = (entity.custom_fields_values || []).find((x) => want.includes(nkey(x.field_name)));
  const v = f && f.values && f.values[0] ? f.values[0].value : "";
  return v == null ? "" : String(v).trim();
}

const top = (map, n) => Object.keys(map).map((k) => ({ nom: k, soni: map[k] })).sort((a, b) => b.soni - a.soni).slice(0, n);

async function load(p, range, opts) {
  const now = tashkentNow(cfg);
  const share = hourShareNow(cfg);
  const planToday = opts.planToday;
  const c = creds(p);
  const periodLabel = range.shortLabel;

  if (!c.ok) {
    if (process.env.DEMO === "1") {
      const d = demoData(p, { today: now.day, share, planToday, dayBudget: p.dayBudget || planToday * p.thresholds.cpl, rate: opts.rate });
      if (d) return Object.assign(d, { periodLabel });
    }
    throw new Error("Bu loyiha uchun Vercel'da META_TOKEN_" + p.env + ", META_ACCOUNT_" + p.env + ", AMO_SUBDOMAIN_" + p.env + ", AMO_TOKEN_" + p.env + " kiritilmagan.");
  }

  // Sana oralig'i (Toshkent vaqti bilan)
  const offset = cfg.timezoneOffsetHours * 3600;
  const dayStartTs = (o) => Math.floor(Date.UTC(o.y, o.m, o.d) / 1000) - offset;
  const nowTs = Math.floor(Date.now() / 1000);
  const periodStartTs = dayStartTs(range.from);
  const periodEndTs = Math.min(dayStartTs(range.to) + 86399, nowTs);
  // Oylik reja kalendari uchun: davr tugagan oyning boshi va oxiri
  const pm = range.planMonth;
  const monthStartTs = dayStartTs({ y: pm.y, m: pm.m, d: 1 });
  const monthEndTs = Math.min(dayStartTs({ y: pm.y, m: pm.m + 1, d: 1 }) - 1, nowTs);
  const fetchFrom = Math.min(monthStartTs, periodStartTs), fetchTo = Math.max(monthEndTs, periodEndTs);
  const useEvents = nowTs - fetchFrom <= EVENTS_MAX_AGE_DAYS * 86400;

  // Har bir qism qancha vaqt olganini o'lchash (tekshiruv sahifasida ko'rinadi)
  const T0 = Date.now(), took = {};
  const timed = (name, promise) => Promise.resolve(promise).then((v) => { took[name] = Date.now() - T0; return v; });

  // Meta: tolerant rejimda (tekshiruv sahifasi) xato bo'lsa ham amoCRM qismi ishlaydi
  let metaError = null;
  const metaPart = Promise.all([
    fetchAds({ token: c.metaToken, account: c.metaAccount, since: range.fromStr, until: range.toStr }),
    range.includesToday ? fetchTodaySpend({ token: c.metaToken, account: c.metaAccount }) : 0,
    fetchCurrency({ token: c.metaToken, account: c.metaAccount })
  ]).catch((e) => { if (!opts.tolerant) throw e; metaError = String(e.message || e); return [[], 0, null]; });

  // Avval voronkalar: bosqich kalitlari voqealarni filtrlash uchun kerak
  const pipes = await timed("voronkalar", fetchPipelines(c.amoSub, c.amoToken));

  // Bosqich nomlaridan kalitlar ("voronkaId:bosqichId")
  const statuses = pipes.statuses;
  const S = cfg.stages;
  const visitIds = idsOf(statuses, S.visit);
  idsOfPipelines(statuses, S.visitPipelines).forEach((id) => visitIds.add(id));
  const ST = { contacted: idsOf(statuses, S.contacted), info: idsOf(statuses, S.info), offer: idsOf(statuses, S.offer), visit: visitIds, sale: idsOf(statuses, S.sale) };
  if (cfg.useWonStatus) Object.keys(pipes.pipelineNames).forEach((pid) => ST.sale.add(pid + ":" + WON_ID));
  // Hisobda ishlatiladigan bosqichlar: faqat shularga o'tish voqealari kerak
  const wanted = new Set();
  Object.keys(ST).forEach((k) => ST[k].forEach((id) => wanted.add(id)));

  const [[metaAds, todaySpend, accountCurrency], users, leads, events] = await Promise.all([
    timed("meta", metaPart),
    timed("xodimlar", fetchUsers(c.amoSub, c.amoToken)),
    timed("lidlar", fetchLeads(c.amoSub, c.amoToken, fetchFrom, fetchTo)),
    timed("voqealar", useEvents ? fetchStatusEvents(c.amoSub, c.amoToken, fetchFrom, Array.from(wanted)) : {})
  ]);
  const hasAny = (reached, set) => { for (const id of reached) if (set.has(id)) return true; return false; };

  // LOST lidlar sifati: maydon qiymatiga qarab (masalan "Lid holati")
  const LQ = p.lostQuality || cfg.lostQuality || null;
  const lqGood = new Set(((LQ && LQ.good) || []).map(nkey)), lqBad = new Set(((LQ && LQ.bad) || []).map(nkey));

  // Hisobga olinmaydigan voronkalar (masalan eski baza, mavjud mijozlar)
  const skipPipes = new Set((p.ignorePipelines || cfg.ignorePipelines || []).map(nkey));
  const pipeName = (l) => pipes.pipelineNames[l.pipeline_id] || "Noma'lum";
  const counted = leads.filter((l) => !skipPipes.has(nkey(pipeName(l))));

  // Sutkalik lidlar (barcha manba), reja oyi bo'yicha
  const daily = {};
  counted.forEach((l) => {
    if (l.created_at >= monthStartTs && l.created_at <= monthEndTs) {
      const day = new Date((l.created_at + offset) * 1000).getUTCDate();
      daily[day] = (daily[day] || 0) + 1;
    }
  });

  // Reklamalar bo'yicha qatorlar
  const blank = () => ({ spend: 0, leads: 0, good: 0, bad: 0, prog: 0, visits: 0, sales: 0, noAns: 0, lost: 0, dup: 0, revenue: 0 });
  const adRows = metaAds.map((a) => Object.assign(blank(), { id: a.id, name: a.name, format: "ID " + a.id, campaign: a.campaign, adset: a.adset, spend: a.spend }));
  const extraRows = {}; // Meta'da topilmagan reklama nomlari: nom -> qator
  const unmatched = Object.assign(blank(), { id: "unmatched", name: "Reklamasi aniqlanmagan lidlar", format: "Reklama nomi Meta'dagi nom yoki ID bilan mos kelmadi", campaign: "—", adset: "—" });
  const calls = { leads: 0, good: 0, bad: 0, prog: 0, visits: 0, sales: 0, tag: 0, noTag: 0, revenue: 0 };
  const mid = { contacted: 0, offered: 0 };
  const ops = {}; const reasonCount = {};
  const ignore = (cfg.ignoreTags || []).map(norm);

  // Lid manbasi: "tags" (teg bo'yicha, standart) yoki "fields" (lid/kompaniya maydonidagi reklama nomi bo'yicha)
  const SRC = p.source || cfg.source || { by: "tags" };
  const byFields = SRC.by === "fields" || SRC.by === "both";
  const byTags = SRC.by !== "fields";

  const periodLeads = counted.filter((l) => l.created_at >= periodStartTs && l.created_at <= periodEndTs);

  // Reklama nomi lid maydonida bo'lmasa, bog'langan kompaniya maydonidan olinadi
  const companyOf = (l) => { const cs = l._embedded && l._embedded.companies; return cs && cs[0] ? cs[0].id : null; };
  let companies = {};
  if (byFields) {
    const need = Array.from(new Set(periodLeads.filter((l) => !fieldValue(l, SRC.ad) && companyOf(l)).map(companyOf)));
    if (need.length) { try { companies = await timed("kompaniyalar", fetchCompaniesByIds(c.amoSub, c.amoToken, need.slice(0, 6000))); } catch (e) { companies = {}; } }
  }
  const adInfo = (l) => {
    const co = companies[companyOf(l)];
    const pick = (names) => fieldValue(l, names) || fieldValue(co, names);
    const info = { ad: pick(SRC.ad), adset: pick(SRC.adset), campaign: pick(SRC.campaign) };
    info.from = fieldValue(l, SRC.ad) ? "lid" : fieldValue(co, SRC.ad) ? "kompaniya" : "";
    return info;
  };

  const matchTags = (tagNames) => {
    for (const t of tagNames) {
      const tn = norm(t);
      const hitAd = adRows.find((r) => norm(r.name) === tn || (r.id && tn.includes(String(r.id))) || norm(r.name).includes(tn));
      if (hitAd) return hitAd;
    }
    return null;
  };
  // Reklama nomi bir nechta ad set'da takrorlansa, ad set va kampaniya nomi bilan aniqlashtiriladi
  const byName = {};
  adRows.forEach((r) => { const k = nkey(r.name); (byName[k] = byName[k] || []).push(r); if (r.id) byName["id:" + r.id] = [r]; });
  const matchFields = (info) => {
    const A = nkey(info.ad);
    if (!A) return null;
    let hits = byName[A] || byName["id:" + info.ad] || [];
    if (hits.length > 1 && info.adset) { const s = hits.filter((r) => nkey(r.adset) === nkey(info.adset)); if (s.length) hits = s; }
    if (hits.length > 1 && info.campaign) { const s = hits.filter((r) => nkey(r.campaign) === nkey(info.campaign)); if (s.length) hits = s; }
    return hits[0] || null;
  };
  const extraRow = (info) => {
    const key = nkey(info.ad) || "—";
    if (!extraRows[key]) {
      if (Object.keys(extraRows).length >= 15) return unmatched;
      extraRows[key] = Object.assign(blank(), { id: "x" + key, name: info.ad || "Reklama nomi yo'q", format: "Meta'da shu davrda topilmadi (sarf yo'q yoki nom boshqacha)", campaign: info.campaign || "—", adset: info.adset || "—" });
    }
    return extraRows[key];
  };
  const metaSet = new Set(adRows);

  // Tekshiruv uchun statistika
  const diag = { davr: range.label, jami_lid: periodLeads.length, voronka_boyicha: {}, reklama_nomi_lid_maydonida: 0, reklama_nomi_kompaniya_maydonida: 0, reklama_nomi_yoq: 0, metaga_mos_keldi: 0, metaga_mos_kelmadi: 0, tegi_bor: 0, lost_jami: 0, sifat: { sifatli: 0, sifatsiz: 0, jarayonda: 0 } };
  const dTags = {}, dAds = {}, dMiss = {};
  const diagFields = ["Lid holati", "Lid sifati"], dField = {};
  diagFields.forEach((f) => { dField[f] = { lost: {}, ochiq: {} }; });

  periodLeads.forEach((l) => {
    const tagNames = ((l._embedded && l._embedded.tags) || []).map((t) => t.name);
    const adTags = tagNames.filter((t) => !ignore.includes(norm(t)));
    const hasCallTag = tagNames.some((t) => ignore.includes(norm(t)));
    const reached = new Set(events[l.id] ? Array.from(events[l.id]) : []);
    reached.add(l.pipeline_id + ":" + l.status_id);
    const isLost = l.status_id === LOST_ID;
    const isSale = hasAny(reached, ST.sale);
    const isVisit = isSale || hasAny(reached, ST.visit);           // "Suhbatga keldi" voronkasiga o'tgan
    const isOffer = isVisit || hasAny(reached, ST.offer);
    const reachedGood = isOffer || hasAny(reached, ST.info);       // sifatli bosqichga yetgan
    const isContacted = reachedGood || hasAny(reached, ST.contacted);

    // Lid sifati: sifatli / sifatsiz / jarayonda
    //  - "Suhbatga keldi" voronkasidagi har qanday lid sifatli
    //  - LOST lid: maydon ("Lid holati") qiymatiga qarab; maydon bo'sh yoki notanish bo'lsa bosqich tarixiga qarab
    //  - ochiq lid: sifatli bosqichda bo'lsa sifatli, aks holda jarayonda
    const lostVal = isLost && LQ ? fieldValue(l, [LQ.field]) : "";
    let cls;
    if (isVisit) cls = "good";
    else if (isLost) {
      const k = nkey(lostVal);
      if (k && lqGood.has(k)) cls = "good";
      else if (k && lqBad.has(k)) cls = "bad";
      else cls = reachedGood ? "good" : "bad";
    } else cls = reachedGood ? "good" : "prog";
    const isGood = cls === "good";

    const lossName = isLost && l._embedded && l._embedded.loss_reason && l._embedded.loss_reason[0] ? l._embedded.loss_reason[0].name : null;
    const reasonName = isLost && cls === "bad" ? (lostVal || lossName || "Sabab kiritilmagan") : null;
    const rn = norm(lostVal) + " " + norm(lossName);
    const isNoAns = isLost && cfg.reasonWords.noAnswer.some((w) => rn.includes(w));
    const isDup = isLost && cfg.reasonWords.duplicate.some((w) => rn.includes(w));
    const revenue = isSale ? Number(l.price) || 0 : 0;

    // Qaysi reklamaga tegishli
    let target = null;
    const info = byFields ? adInfo(l) : { ad: "", adset: "", campaign: "", from: "" };
    const hasField = !!(info.ad || info.adset || info.campaign);
    if (byFields && hasField) target = matchFields(info) || extraRow(info);
    if (!target && byTags && adTags.length) target = matchTags(adTags) || unmatched;

    // statistika
    diag.voronka_boyicha[pipeName(l)] = (diag.voronka_boyicha[pipeName(l)] || 0) + 1;
    diag.sifat[cls === "good" ? "sifatli" : cls === "bad" ? "sifatsiz" : "jarayonda"]++;
    if (isLost) diag.lost_jami++;
    diagFields.forEach((f) => { const v = fieldValue(l, [f]) || "(bo'sh)"; const m = dField[f][isLost ? "lost" : "ochiq"]; m[v] = (m[v] || 0) + 1; });
    if (tagNames.length) diag.tegi_bor++;
    tagNames.forEach((t) => { dTags[t] = (dTags[t] || 0) + 1; });
    if (byFields) {
      if (info.from === "lid") diag.reklama_nomi_lid_maydonida++; else if (info.from === "kompaniya") diag.reklama_nomi_kompaniya_maydonida++; else diag.reklama_nomi_yoq++;
      if (info.ad) { dAds[info.ad] = (dAds[info.ad] || 0) + 1; if (target && metaSet.has(target)) diag.metaga_mos_keldi++; else { diag.metaga_mos_kelmadi++; dMiss[info.ad] = (dMiss[info.ad] || 0) + 1; } }
    }

    const apply = (o) => {
      o.leads++; if (isGood) o.good++; else if (cls === "bad") o.bad++; else o.prog++;
      if (isVisit) o.visits++; if (isSale) { o.sales++; o.revenue += revenue; }
      if (cls === "bad") { if (isNoAns) o.noAns++; else if (isDup) o.dup++; else o.lost++; }
    };
    if (target) apply(target);
    else {
      calls.leads++; if (hasCallTag) calls.tag++; else calls.noTag++;
      if (isGood) calls.good++; else if (cls === "bad") calls.bad++; else calls.prog++;
      if (isVisit) calls.visits++; if (isSale) { calls.sales++; calls.revenue += revenue; }
    }
    if (isContacted) mid.contacted++;
    if (isOffer) mid.offered++;
    const uname = users[l.responsible_user_id] || "Noma'lum";
    if (!ops[uname]) ops[uname] = { name: uname, leads: 0, good: 0, visits: 0, replyMin: null };
    ops[uname].leads++; if (isGood) ops[uname].good++; if (isVisit) ops[uname].visits++;
    if (reasonName) reasonCount[reasonName] = (reasonCount[reasonName] || 0) + 1;
  });
  Object.values(extraRows).forEach((r) => adRows.push(r));
  if (unmatched.leads > 0) adRows.push(unmatched);

  // Vaqt: har bir qism boshidan necha ms o'tib tugagan; sonlar: nechta yozuv o'qilgan
  diag.vaqt_ms = Object.assign({}, took, { jami: Date.now() - T0 });
  diag.oqilgan = { lidlar: leads.length, voqeali_lidlar: Object.keys(events).length, kompaniyalar: Object.keys(companies).length, meta_reklamalar: metaAds.length };
  diag.manba_usuli = SRC.by;
  diag.bosqich_tarixi_oqildi = useEvents;
  diag.maydon_qiymatlari = {};
  diagFields.forEach((f) => { diag.maydon_qiymatlari[f] = { lost_lidlarda: top(dField[f].lost, 15), ochiq_lidlarda: top(dField[f].ochiq, 6) }; });
  diag.eng_kop_teglar = top(dTags, 10);
  diag.eng_kop_reklama_nomlari = top(dAds, 12);
  diag.metada_topilmagan_nomlar = top(dMiss, 12);
  diag.meta_xato = metaError;
  diag.meta_reklamalar = metaAds.slice().sort((a, b) => b.spend - a.spend).slice(0, 15).map((a) => ({ nom: a.name, adset: a.adset, kampaniya: a.campaign, sarf: a.spend, meta_lid: a.metaLeads }));
  diag.keldi = adRows.reduce((s, r) => s + r.visits, 0) + calls.visits;
  diag.sotuv = adRows.reduce((s, r) => s + r.sales, 0) + calls.sales;

  return {
    mode: "live", periodLabel,
    freshness: "Ma'lumot yangilandi: " + String(now.hour).padStart(2, "0") + ":" + String(now.min).padStart(2, "0") + " (Meta va amoCRM, har so'rovda yangilanadi, 60 soniya kesh).",
    ads: adRows, calls, mid,
    operators: Object.values(ops).sort((a, b) => b.leads - a.leads),
    reasons: Object.keys(reasonCount).map((k) => ({ label: k, count: reasonCount[k] })).sort((a, b) => b.count - a.count).slice(0, 8),
    daily, todaySpend, accountCurrency, diag, historyUsed: useEvents
  };
}
