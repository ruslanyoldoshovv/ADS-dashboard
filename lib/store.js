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

// Hamma loyihalarning saqlangan rejalari: { "nexus-school:2026-10": { n: 800, sun: 1 }, ... }
export async function getPlans() {
  if (!storeReady()) return { ready: false, error: null, items: {} };
  try {
    const flat = (await cmd(["HGETALL", HASH])) || [];
    const items = {};
    for (let i = 0; i + 1 < flat.length; i += 2) {
      try {
        const v = JSON.parse(flat[i + 1]);
        if (v && Number(v.n) > 0) items[flat[i]] = { n: Math.round(Number(v.n)), sun: [0, 0.65, 1].includes(Number(v.sun)) ? Number(v.sun) : 1 };
      } catch (e) { /* buzilgan yozuv o'tkazib yuboriladi */ }
    }
    return { ready: true, error: null, items };
  } catch (e) {
    return { ready: true, error: String(e.message || e), items: {} };
  }
}

export async function setPlan(slug, ym, entry) {
  await cmd(["HSET", HASH, slug + ":" + ym, JSON.stringify(entry)]);
}
