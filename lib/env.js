// Vercel'dagi o'zgaruvchilarni o'qish va kiritishdagi mayda xatolarni to'g'rilash.
// Masalan: akkaunt ID "act_" siz yozilgan yoki subdomen o'rniga to'liq manzil qo'yilgan bo'lsa ham ishlaydi.
const clean = (v) => String(v || "").trim();

// "1234567890", "act=1234567890", "act_1234567890" -> "act_1234567890"
export function normAccount(v) {
  const s = clean(v).replace(/\s/g, "");
  if (!s) return "";
  const digits = s.replace(/^act[_=]?/i, "");
  return /^\d+$/.test(digits) ? "act_" + digits : s;
}

// "https://nexus.amocrm.ru/leads" yoki "nexus.amocrm.ru" -> "nexus"
export function normSubdomain(v) {
  return clean(v).replace(/^https?:\/\//i, "").split("/")[0].split(".")[0].toLowerCase();
}

export function projectEnv(p) {
  const e = p.env;
  const c = {
    metaToken: clean(process.env["META_TOKEN_" + e]),
    metaAccount: normAccount(process.env["META_ACCOUNT_" + e]),
    amoSub: normSubdomain(process.env["AMO_SUBDOMAIN_" + e]),
    amoToken: clean(process.env["AMO_TOKEN_" + e])
  };
  c.ok = !!(c.metaToken && c.metaAccount && c.amoSub && c.amoToken);
  return c;
}
