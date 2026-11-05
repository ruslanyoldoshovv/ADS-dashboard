// Google Sheets eksporti: jadvaldagi Apps Script har kuni shu manzildan kunlik raqamlarni oladi.
// Himoya: parol o'rniga Google hisobi tokeni (Apps Script'dagi ScriptApp.getOAuthToken()).
// Token Google'da tekshiriladi va egasining emaili ruxsat etilganlar ro'yxatida bo'lishi shart
// (ro'yxatda emailning o'zi emas, SHA-256 xeshi saqlanadi: repozitoriy ochiq).
// So'rov: GET /api/export?p=loyiha-3&from=2026-11-01&to=2026-11-05  (Authorization: Bearer <token>)
import crypto from "crypto";
import cfg from "../../../projects.config";
import { projectEnv } from "../../../lib/env";
import { fetchDailyFull } from "../../../lib/meta";
import { getChartData } from "../../../lib/data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Ruxsat etilgan Google hisoblari (email SHA-256). Qo'shimcha: Vercel'da EXPORT_EMAIL_SHA256 (vergul bilan)
const ALLOWED = ["ebd262816c5e2bee6c5e692a1fb373ecfc07a1417fa581d8d28fc540a2163b2f"]
  .concat(String(process.env.EXPORT_EMAIL_SHA256 || "").split(/[,\s]+/).filter(Boolean));
const seen = new Map(); // tekshirilgan tokenlar: 10 daqiqa (har so'rovda Google'ga murojaat qilmaslik uchun)

async function checkToken(token) {
  if (!token || token.length < 20) return false;
  const k = crypto.createHash("sha256").update(token).digest("hex");
  const hit = seen.get(k);
  if (hit && Date.now() - hit < 600000) return true;
  const r = await fetch("https://oauth2.googleapis.com/tokeninfo?access_token=" + encodeURIComponent(token), { cache: "no-store" });
  if (!r.ok) return false;
  const j = await r.json().catch(() => ({}));
  const email = String(j.email || "").trim().toLowerCase();
  if (!email || String(j.email_verified) !== "true") return false;
  const h = crypto.createHash("sha256").update(email).digest("hex");
  if (!ALLOWED.includes(h)) return false;
  if (seen.size > 100) seen.clear();
  seen.set(k, Date.now());
  return true;
}

const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

export async function GET(req) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  let ok = false;
  try { ok = await checkToken(token); } catch (e) { ok = false; }
  if (!ok) return Response.json({ ok: false, error: "Ruxsat yo'q: Google hisobi tasdiqlanmadi" }, { status: 401 });

  const q = new URL(req.url).searchParams;
  const p = cfg.projects.find((x) => x.slug === q.get("p"));
  if (!p) return Response.json({ ok: false, error: "Bunday loyiha yo'q" }, { status: 404 });
  const from = q.get("from"), to = q.get("to");
  if (!isDay(from) || !isDay(to) || from > to) return Response.json({ ok: false, error: "from/to: YYYY-MM-DD" }, { status: 400 });
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 62) return Response.json({ ok: false, error: "Davr 62 kundan oshmasin" }, { status: 400 });

  const c = projectEnv(p);
  if (!c.ok) return Response.json({ ok: false, error: "Loyiha ulanmagan" }, { status: 400 });
  // Meta: barcha akkauntlar qo'shiladi; o'qilmagan akkaunt xatosi qaytariladi (jadvalga noto'g'ri raqam yozilmasligi uchun)
  const metaErr = [];
  const parts = await Promise.all(c.metaAccounts.map((account) => fetchDailyFull({ token: c.metaToken, account, since: from, until: to }).catch((e) => { metaErr.push(account.replace("act_", "") + ": " + String(e.message || e).slice(0, 160)); return null; })));
  const good = parts.filter(Boolean);
  if (!good.length) return Response.json({ ok: false, error: "Meta o'qilmadi: " + metaErr.join(" | ") }, { status: 502 });
  // CRM: kunlik lid, sifatli, keldi, sotuv, summa (panel grafigi bilan bir xil qoida)
  let crm = null, crmErr = null;
  if (!c.metaOnly) {
    try { crm = await getChartData(p, from, to, "", ""); } catch (e) { crmErr = String(e.message || e).slice(0, 200); }
  }
  const byDay = {};
  (crm && crm.days || []).forEach((x) => { byDay[x.d] = x; });
  const days = [];
  for (let t = Date.parse(from + "T00:00:00Z"); t <= Date.parse(to + "T00:00:00Z"); t += 86400000) {
    const d = new Date(t).toISOString().slice(0, 10);
    const m = { ls: 0, ln: 0, ds: 0, dn: 0, cs: 0, cn: 0, im: 0, cl: 0, v3: 0, tp: 0 };
    good.forEach((g) => { const x = g[d]; if (x) Object.keys(m).forEach((k) => { m[k] += x[k] || 0; }); });
    ["ls", "ds", "cs"].forEach((k) => { m[k] = Math.round(m[k] * 100) / 100; });
    const x = byDay[d];
    const row = Object.assign({ d }, m);
    if (x) Object.assign(row, { crmLeads: x.leads, crmCalls: Math.max((x.leads || 0) - (x.adLeads || 0), 0), good: x.good, visits: x.visits, sales: x.sales, revenue: Math.round(x.revenue || 0) });
    days.push(row);
  }
  return Response.json({ ok: true, project: p.slug, name: p.name, currency: p.currency, crm: !c.metaOnly, crmError: crmErr, metaErrors: metaErr, days }, { headers: { "Cache-Control": "no-store" } });
}
