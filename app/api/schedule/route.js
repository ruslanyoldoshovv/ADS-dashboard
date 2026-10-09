// Operatorlar ish grafigi: GET /api/schedule?p=nexus-school, POST {p, def: {week}, ops: {userId: {name, week, off}}}
// week: 7 kun (dushanba ... yakshanba), har biri ["09:00","18:00"] yoki null (dam olish). off: ["YYYY-MM-DD", ...] (ta'til, kasal)
import cfg from "../../../projects.config";
import { storeReady, schedRead, schedWrite } from "../../../lib/store";
import { cleanWeek, DEFAULT_WEEK } from "../../../lib/reply";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const slug = new URL(req.url).searchParams.get("p");
  if (!cfg.projects.some((x) => x.slug === slug)) return Response.json({ ok: false }, { status: 404 });
  const s = storeReady() ? await schedRead(slug) : null;
  return Response.json({ ok: true, sched: s || { def: { week: DEFAULT_WEEK }, ops: {} } });
}

export async function POST(req) {
  let b = {};
  try { b = await req.json(); } catch (e) { return Response.json({ ok: false, error: "JSON xato" }, { status: 400 }); }
  if (!cfg.projects.some((x) => x.slug === b.p)) return Response.json({ ok: false, error: "Loyiha yo'q" }, { status: 404 });
  if (!storeReady()) return Response.json({ ok: false, error: "Saqlash joyi ulanmagan" }, { status: 503 });
  const out = { def: { week: cleanWeek(b.def && b.def.week) || DEFAULT_WEEK }, ops: {} };
  Object.keys(b.ops || {}).slice(0, 100).forEach((uid) => {
    if (!/^\d{1,12}$/.test(uid)) return;
    const o = b.ops[uid] || {};
    const off = Array.isArray(o.off) ? Array.from(new Set(o.off.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))).sort().slice(-120) : [];
    const week = cleanWeek(o.week);
    out.ops[uid] = { name: String(o.name || "").slice(0, 80) };
    if (week && !o.useDef) out.ops[uid].week = week;
    if (off.length) out.ops[uid].off = off;
  });
  try { await schedWrite(b.p, out); return Response.json({ ok: true, sched: out }); }
  catch (e) { return Response.json({ ok: false, error: String(e.message || e) }, { status: 500 }); }
}
