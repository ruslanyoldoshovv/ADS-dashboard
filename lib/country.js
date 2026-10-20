// Davlat filtri (masalan Polaris: Italiya, Malayziya, Kipr).
// Lid davlati: amoCRM tegi "<DAVLAT>_LEADS" (sozlamada tagSuffix). Reklama davlati: Meta kampaniya nomining birinchi so'zi.
// Sozlama: projects.config.js > countries: { tagSuffix: "_LEADS" }. Sozlama bo'lmasa filtr ishlamaydi.

export const OTHER = "BOSHQA";

const up = (s) => String(s || "").trim().toUpperCase().replace(/[‘’ʻʼ`]/g, "'");

// "ITALIYA 2 - LEADS - VID" -> "ITALIYA"; "MALAYZIYA 1  - 2ADSET" -> "MALAYZIYA"
export function campaignCountry(name) {
  const w = up(name).split(/[\s\-_|.,:;/]+/).filter(Boolean)[0] || "";
  const k = w.replace(/\d+$/, "");
  return k.length >= 2 ? k : OTHER;
}

// Lid tegi bo'yicha: "ITALIYA_LEADS" -> "ITALIYA". Teg bo'lmasa: lid maydonidagi kampaniya nomidan.
export function leadCountry(l, cc, campaignOf) {
  const suf = up(cc.tagSuffix || "_LEADS");
  const tags = ((l._embedded && l._embedded.tags) || []).map((t) => up(t.name));
  for (const t of tags) if (t.endsWith(suf) && t.length > suf.length) return t.slice(0, -suf.length).replace(/[\s_\-]+$/, "");
  const camp = campaignOf ? campaignOf(l) : "";
  return camp ? campaignCountry(camp) : OTHER;
}

// Ko'rinadigan nom: "ITALIYA" -> "Italiya"
export const countryLabel = (k) => (k === OTHER ? "Boshqa (tegsiz)" : k.charAt(0) + k.slice(1).toLowerCase());

// Cookie: "cty_<loyiha>" = "ITALIYA-KIPR". Bo'sh: hammasi.
export const ctyCookie = (slug) => "cty_" + String(slug).replace(/[^a-z0-9_-]/gi, "");
export function pickCountries(raw) {
  let r = String(raw || "");
  try { r = decodeURIComponent(r); } catch (e) { /* o'zgarishsiz */ }
  return Array.from(new Set(r.split(/[-,]+/).map(up).filter((x) => x.length >= 2 && x.length <= 30 && !/\s/.test(x)))).sort();
}

// Davlatlar ro'yxati (ko'pidan ozigacha), "Boshqa" oxirida
export function countryList(counts) {
  return Object.keys(counts).sort((a, b) => (a === OTHER) - (b === OTHER) || counts[b] - counts[a]).map((k) => ({ id: k, name: countryLabel(k), n: counts[k] }));
}
