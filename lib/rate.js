// Dollar kursi: reklama sarfi $ da, tushum so'mda bo'lgan loyihalarda ROAS hisoblash uchun.
// Manba: O'zbekiston Markaziy banki (cbu.uz) rasmiy kursi, 6 soatda bir yangilanadi.
// Markaziy bank javob bermasa, projects.config.js dagi usdRateFallback ishlatiladi.
const CBU_URL = "https://cbu.uz/ru/arkhiv-kursov-valyut/json/";
const SIX_HOURS = 6 * 3600 * 1000;
let memo = null; // { t, v }

export async function getUsdRate(cfg) {
  // Sozlamada aniq son yozilgan bo'lsa (masalan usdRate: 12800), o'sha ishlatiladi
  if (typeof cfg.usdRate === "number" && cfg.usdRate > 0) return { rate: cfg.usdRate, source: "config", date: null };
  if (memo && Date.now() - memo.t < SIX_HOURS) return memo.v;
  try {
    const res = await fetch(CBU_URL, { signal: AbortSignal.timeout(4000), next: { revalidate: 21600 } });
    if (res.ok) {
      const list = await res.json();
      const usd = Array.isArray(list) ? list.find((x) => x && x.Ccy === "USD") : null;
      const rate = usd ? Number(usd.Rate) : 0;
      if (rate > 1000) {
        const v = { rate, source: "cbu", date: usd.Date || null };
        memo = { t: Date.now(), v };
        return v;
      }
    }
  } catch (e) { /* Markaziy bank javob bermadi: zaxira kursga o'tamiz */ }
  return { rate: cfg.usdRateFallback || 12000, source: "fallback", date: null };
}
