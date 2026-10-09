// Birinchi javob vaqti (operator lidga qancha vaqtda javob bergani).
//
// Qanday hisoblanadi:
//  - Kuniga bir marta (09:00 avtomatik ishga tushishda) KECHA tushgan lidlar uchun hisoblanadi va saqlanadi.
//    Panel saqlangan natijani o'qiydi: amoCRM'ga har ochilishda qo'shimcha so'rov ketmaydi. Bugungi lidlar ertaga chiqadi.
//  - Soat lid tushganda boshlanadi. Lid ish vaqtidan tashqari tushsa: operatorning keyingi smenasi boshlanganda.
//  - Soat operatorning birinchi harakatida to'xtaydi: bosqichni o'zgartirish, chiquvchi qo'ng'iroq (telefoniya ulangan bo'lsa),
//    izoh yozish yoki chatda javob. Robot va avtomatik harakatlar (created_by = 0) hisobga kirmaydi.
//  - Javob vaqti birinchi harakatni qilgan operatorga yoziladi. Ko'rsatkich: mediana (o'rtadagi qiymat), bitta uzoq kutilgan lid
//    butun natijani buzmasligi uchun.
//
// Saqlash (Upstash):
//  - "reply:<loyiha>" hash: maydon = "YYYY-MM-DD" (lid tushgan kun), qiymat = {"ops": {"<userId>": {"name": "...", "m": [daqiqalar]}}, "none": javobsiz lidlar}
//  - "sched:<loyiha>": ish grafiklari {"def": {"week": [...]}, "ops": {"<userId>": {"name", "week", "off": ["YYYY-MM-DD", ...]}}}
//    week: 7 ta element (0 = dushanba ... 6 = yakshanba), har biri ["09:00", "18:00"] yoki null (dam olish kuni)
import cfg from "../projects.config";
import { projectEnv } from "./env";
import { fetchUsers, fetchLeads, fetchEvents, fetchPipelines } from "./amo";
import { nkey } from "./stages";
import { replyRead, replyWrite, schedRead } from "./store";

const OFFSET = (cfg.timezoneOffsetHours || 5) * 3600;
export const DEFAULT_WEEK = [["09:00", "18:00"], ["09:00", "18:00"], ["09:00", "18:00"], ["09:00", "18:00"], ["09:00", "18:00"], ["09:00", "18:00"], null];
const ACTION_TYPES = ["lead_status_changed", "outgoing_call", "outgoing_chat_message", "common_note_added"];

const pad = (n) => String(n).padStart(2, "0");
export const ymdOfTs = (ts) => new Date((ts + OFFSET) * 1000).toISOString().slice(0, 10);
const dayStartTs = (ymd) => Math.floor(Date.parse(ymd + "T00:00:00Z") / 1000) - OFFSET;
const hm = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "")); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

// Grafikni tekshirib tozalash (paneldan kelgan ma'lumot)
export function cleanWeek(w) {
  if (!Array.isArray(w) || w.length !== 7) return null;
  return w.map((d) => {
    if (!Array.isArray(d)) return null;
    const a = hm(d[0]), b = hm(d[1]);
    return a != null && b != null && a < b && b <= 24 * 60 ? [pad(Math.floor(a / 60)) + ":" + pad(a % 60), pad(Math.floor(b / 60)) + ":" + pad(b % 60)] : null;
  });
}

// Operatorning lid tushgan paytdan keyingi birinchi ish daqiqasi (unix soniya).
// Lid smena ichida tushsa: lid vaqtining o'zi. Smenadan keyin yoki dam olish kunida: keyingi smena boshlanishi.
export function workStart(ts, sched) {
  const week = (sched && sched.week) || DEFAULT_WEEK;
  const off = new Set((sched && sched.off) || []);
  if (!week.some(Boolean)) return ts; // grafik umuman yo'q: soat darhol boshlanadi
  for (let i = 0; i < 21; i++) {
    const ymd = ymdOfTs(ts + i * 86400);
    if (off.has(ymd)) continue;
    const dow = (new Date(ymd + "T00:00:00Z").getUTCDay() + 6) % 7;
    const d = week[dow];
    if (!d) continue;
    const s = dayStartTs(ymd) + hm(d[0]) * 60, e = dayStartTs(ymd) + hm(d[1]) * 60;
    if (i === 0) { if (ts < s) return s; if (ts < e) return ts; continue; }
    return s;
  }
  return ts;
}

export const median = (arr) => {
  if (!arr || !arr.length) return null;
  const a = arr.slice().sort((x, y) => x - y), k = Math.floor(a.length / 2);
  return a.length % 2 ? a[k] : Math.round((a[k - 1] + a[k]) / 2);
};

// Bitta kun (lid tushgan kun) uchun hisoblash. ymd: "YYYY-MM-DD". schedules: sched:<loyiha> qiymati.
// untilTs: harakatlar shu vaqtgacha qidiriladi (javob bermagan lid uchun shu vaqtgacha kutilgan deb olinadi).
export async function computeDay(p, ymd, schedules, untilTs) {
  const c = projectEnv(p);
  if (!c.amoSub || !c.amoToken) throw new Error("amoCRM ulanmagan");
  const from = dayStartTs(ymd), to = from + 86399;
  const until = Math.min(untilTs || Math.floor(Date.now() / 1000), to + 2 * 86400); // lid kunidan keyin 2 kungacha kutiladi
  const skip = new Set((p.ignorePipelines || cfg.ignorePipelines || []).map(nkey));
  const [users, leadsAll, events, pipes] = await Promise.all([
    fetchUsers(c.amoSub, c.amoToken),
    fetchLeads(c.amoSub, c.amoToken, from, to, true),
    fetchEvents(c.amoSub, c.amoToken, ACTION_TYPES, from, until),
    skip.size ? fetchPipelines(c.amoSub, c.amoToken) : null
  ]);
  const leads = leadsAll.filter((l) => !pipes || !skip.has(nkey(pipes.pipelineNames[l.pipeline_id] || "")));
  // Kontakt -> lidlar (qo'ng'iroq va izohlar ko'pincha kontaktga yoziladi)
  const byContact = {}, leadIds = new Set();
  leads.forEach((l) => {
    leadIds.add(l.id);
    ((l._embedded && l._embedded.contacts) || []).forEach((ct) => { (byContact[ct.id] = byContact[ct.id] || []).push(l.id); });
  });
  // Har bir lid uchun birinchi inson harakati
  const first = {};
  events.forEach((e) => {
    if (!e.created_by) return; // robot, integratsiya, avtomatik o'tkazish
    const ids = e.entity_type === "lead" ? (leadIds.has(e.entity_id) ? [e.entity_id] : []) : e.entity_type === "contact" ? byContact[e.entity_id] || [] : [];
    ids.forEach((id) => { if (!first[id] || e.created_at < first[id].t) first[id] = { t: e.created_at, by: e.created_by }; });
  });
  const ops = {}; let none = 0;
  // Operatorning o'z grafigi bo'lmasa standart grafik; dam olish kunlari (off) doim operatorniki
  const schedOf = (uid) => {
    const own = (schedules && schedules.ops && schedules.ops[uid]) || {};
    return { week: own.week || (schedules && schedules.def && schedules.def.week) || DEFAULT_WEEK, off: own.off || [] };
  };
  leads.forEach((l) => {
    const f = first[l.id] && first[l.id].t >= l.created_at - 60 ? first[l.id] : null;
    const uid = String(f ? f.by : l.responsible_user_id);
    const start = workStart(l.created_at, schedOf(uid));
    if (!f) { none++; return; }
    const min = Math.max(0, Math.round((f.t - start) / 60));
    const o = ops[uid] || (ops[uid] = { name: users[uid] || "Noma'lum", m: [] });
    o.m.push(min);
  });
  return { ops, none, leads: leads.length, at: Date.now() };
}

// Davr uchun natija: { "<userId>": { name, median, n } }, jami mediana va qamrab olingan kunlar
export function aggregate(daysMap) {
  const ops = {}; let all = [], none = 0;
  const days = Object.keys(daysMap).sort();
  days.forEach((d) => {
    const v = daysMap[d];
    if (!v) return;
    none += v.none || 0;
    Object.keys(v.ops || {}).forEach((uid) => {
      const o = ops[uid] || (ops[uid] = { name: v.ops[uid].name, m: [] });
      o.m = o.m.concat(v.ops[uid].m || []);
    });
  });
  const out = {};
  Object.keys(ops).forEach((uid) => { out[uid] = { name: ops[uid].name, median: median(ops[uid].m), n: ops[uid].m.length }; all = all.concat(ops[uid].m); });
  return { ops: out, median: median(all), n: all.length, none, days: days.filter((d) => daysMap[d]) };
}

// Saqlab qo'yish: kunlarni navbat bilan hisoblaydi, vaqt chegarasiga yetganda to'xtaydi (keyingi chaqiruvda davom etadi).
// days: ["YYYY-MM-DD", ...]. force: saqlangan bo'lsa ham qayta hisoblash. budgetMs: shu vaqtdan oshsa yangi kun boshlanmaydi.
// Kun "yakuniy" (final) bo'ladi, agar hisoblash paytida lid kunidan keyin 2 kun o'tgan bo'lsa: shundan keyin qayta hisoblanmaydi.
export async function storeDays(p, days, opts) {
  const o = opts || {}, T0 = Date.now(), budget = o.budgetMs || 40000;
  const [have, sched] = await Promise.all([replyRead(p.slug, days), schedRead(p.slug)]);
  const done = [], skipped = [], left = [];
  for (const d of days) {
    if (!o.force && have[d] && have[d].final) { skipped.push(d); continue; }
    if (Date.now() - T0 > budget) { left.push(d); continue; }
    const r = await computeDay(p, d, sched);
    r.final = Math.floor(Date.now() / 1000) >= dayStartTs(d) + 86400 + 2 * 86400;
    await replyWrite(p.slug, d, r);
    done.push(d);
  }
  return { hisoblandi: done, oldin_bor: skipped.length, qoldi: left };
}

export function lastDays(n, includeToday) {
  const now = Math.floor(Date.now() / 1000), out = [];
  for (let i = includeToday ? 0 : 1; i <= n; i++) out.push(ymdOfTs(now - i * 86400));
  return out;
}
