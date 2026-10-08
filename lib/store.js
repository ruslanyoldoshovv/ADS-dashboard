// Paneldan kiritilgan oylik lid rejasini saqlash joyi.
// Vercel > Storage > Upstash (Redis) ulanganda Vercel o'zi KV_REST_API_URL va KV_REST_API_TOKEN ni qo'shadi.
// Kutubxona kerak emas: Upstash REST API'ga oddiy so'rov yuboriladi.
const HASH = "plans"; // maydon: "<loyiha slug>:<YYYY-MM>", qiymat: {"n":800,"sun":1}

function conf() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

export function storeReady() { return !!conf(); }

async function cmd(args) {
  const c = conf();
  if (!c) throw new Error("Saqlash joyi ulanmagan");
  const res = await fetch(c.url, {
    method: "POST",
    headers: { Authorization: "Bearer " + c.token, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
    signal: AbortSignal.timeout(5000)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error("Saqlash joyi: " + (json.error || "HTTP " + res.status));
  return json.result;
}

// Hamma loyihalarning saqlangan rejalari: { "nexus-school:2026-10": { n: 800, sun: 1, k: "q" }, ... }
export async function getPlans() {
  if (!storeReady()) return { ready: false, error: null, items: {} };
  try {
    const flat = (await cmd(["HGETALL", HASH])) || [];
    const items = {};
    for (let i = 0; i + 1 < flat.length; i += 2) {
      try {
        const v = JSON.parse(flat[i + 1]);
        // k: reja nimada o'lchangan ("q" = sifatli lid soni, "l" yoki bo'sh = jami lid soni)
        if (v && Number(v.n) > 0) items[flat[i]] = { n: Math.round(Number(v.n)), sun: [0, 0.65, 1].includes(Number(v.sun)) ? Number(v.sun) : 1, k: v.k === "q" ? "q" : "l" };
      } catch (e) { /* buzilgan yozuv o'tkazib yuboriladi */ }
    }
    return { ready: true, error: null, items };
  } catch (e) {
    return { ready: true, error: String(e.message || e), items: {} };
  }
}

// Loyiha rejasi sifatli lidda o'lchansa, faqat "q" belgili yozuv olinadi (va aksincha).
// Shunda eski "jami lid" rejasi adashib "sifatli lid" rejasi sifatida ishlatilmaydi.
export function planEntry(plans, project, ym) {
  const e = plans && plans.items ? plans.items[project.slug + ":" + ym] : null;
  if (!e) return null;
  return (project.planBy === "quality") === (e.k === "q") ? e : null;
}

export async function setPlan(slug, ym, entry) {
  await cmd(["HSET", HASH, slug + ":" + ym, JSON.stringify(entry)]);
}

// ---------------------------------------------------------------------
// Conversions API: qaysi lidning qaysi bosqichi Meta'ga yuborilganini eslab qolish (takror yubormaslik uchun)
// To'plam: "capi:sent:<loyiha>", a'zo: "<lid id>:<bosqich>". Jurnal: "capi:log:<loyiha>" (oxirgi 200 ta yozuv).
// ---------------------------------------------------------------------
const sentKey = (slug) => "capi:sent:" + slug;
const logKey = (slug) => "capi:log:" + slug;

// members: ["123:lead", "123:quality"] -> [true, false] (yuborilganmi)
export async function sentCheck(slug, members) {
  if (!members.length) return [];
  let out = [];
  for (let i = 0; i < members.length; i += 500) {
    const r = await cmd(["SMISMEMBER", sentKey(slug)].concat(members.slice(i, i + 500)));
    out = out.concat((r || []).map((x) => Number(x) === 1));
  }
  return out;
}

export async function sentAdd(slug, members) {
  for (let i = 0; i < members.length; i += 500) await cmd(["SADD", sentKey(slug)].concat(members.slice(i, i + 500)));
}

export async function sentCount(slug) { return Number(await cmd(["SCARD", sentKey(slug)])) || 0; }

export async function logPush(slug, entries) {
  if (!entries.length) return;
  await cmd(["LPUSH", logKey(slug)].concat(entries.slice(-100).map((e) => JSON.stringify(e))));
  await cmd(["LTRIM", logKey(slug), "0", "199"]);
}

export async function logRead(slug, n) {
  const r = (await cmd(["LRANGE", logKey(slug), "0", String((n || 30) - 1)])) || [];
  return r.map((x) => { try { return JSON.parse(x); } catch (e) { return null; } }).filter(Boolean);
}

// Bir vaqtda ikki marta ishga tushmaslik uchun qulf. true = qulf olindi.
export async function lockTry(name, seconds) {
  const r = await cmd(["SET", "lock:" + name, "1", "NX", "EX", String(seconds)]);
  return r === "OK";
}

// ---------------------------------------------------------------------
// Webhook diagnostikasi: amoCRM'dan nechta xabar kelgani va har biri bilan nima bo'lgani.
// Hisoblagich: "capi:hook:<loyiha>" (jami, oxirgi). Yozuvlar: "capi:hooklog:<loyiha>" (oxirgi 40 ta).
// ---------------------------------------------------------------------
export async function hookMark(slug) {
  await Promise.all([
    cmd(["HINCRBY", "capi:hook:" + slug, "jami", "1"]),
    cmd(["HSET", "capi:hook:" + slug, "oxirgi", new Date().toISOString()])
  ]);
}

export async function hookNote(slug, entry) {
  await cmd(["LPUSH", "capi:hooklog:" + slug, JSON.stringify(entry)]);
  await cmd(["LTRIM", "capi:hooklog:" + slug, "0", "39"]);
}

export async function hookRead(slug, n) {
  const [flat, rows] = await Promise.all([
    cmd(["HGETALL", "capi:hook:" + slug]),
    cmd(["LRANGE", "capi:hooklog:" + slug, "0", String((n || 15) - 1)])
  ]);
  const h = {};
  for (let i = 0; i + 1 < (flat || []).length; i += 2) h[flat[i]] = flat[i + 1];
  return {
    jami_kelgan: Number(h.jami) || 0,
    oxirgi_kelgan: h.oxirgi || null,
    oxirgi_xabarlar: (rows || []).map((x) => { try { return JSON.parse(x); } catch (e) { return null; } }).filter(Boolean)
  };
}

// ---------------------------------------------------------------------
// Reklama faolligi keshi: "adact:<loyiha>" hash, maydon = reklama ID,
// qiymat = {"st": holat, "f": birinchi sarf kuni, "l": oxirgi sarf kuni, "at": yangilangan vaqt (ms)}
// ---------------------------------------------------------------------
export async function actRead(slug, ids) {
  if (!ids.length) return {};
  const vals = await cmd(["HMGET", "adact:" + slug].concat(ids));
  const out = {};
  ids.forEach((id, i) => { try { if (vals && vals[i]) out[id] = JSON.parse(vals[i]); } catch (e) { /* buzilgan yozuv o'tkazib yuboriladi */ } });
  return out;
}
export async function actWrite(slug, map) {
  const args = ["HSET", "adact:" + slug];
  Object.keys(map).forEach((id) => args.push(id, JSON.stringify(map[id])));
  if (args.length > 2) await cmd(args);
}

// ---------------------------------------------------------------------
// Jadval ustunlari tartibi va yashirilganlari: "cols:<loyiha>" = {"order": [...], "hidden": [...]}
// ---------------------------------------------------------------------
export async function colsRead(slug) {
  try { const v = await cmd(["GET", "cols:" + slug]); return v ? JSON.parse(v) : null; } catch (e) { return null; }
}
export async function colsWrite(slug, layout) {
  if (!layout) return cmd(["DEL", "cols:" + slug]);
  return cmd(["SET", "cols:" + slug, JSON.stringify(layout)]);
}
