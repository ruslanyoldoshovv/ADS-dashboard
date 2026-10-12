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
    // Loyihaning o'z tokeni bo'lmasa, sozlamadagi boshqa loyiha tokeni (masalan "P1") ishlatiladi
    metaToken: clean(process.env["META_TOKEN_" + e]) || (p.metaTokenFrom ? clean(process.env["META_TOKEN_" + p.metaTokenFrom]) : ""),
    // Bir nechta reklama akkaunti vergul bilan yozilishi mumkin: "1514572179232535,2610483762722192"
    metaAccounts: Array.from(new Set(clean(process.env["META_ACCOUNT_" + e]).split(/[,;\s]+/).map(normAccount).filter(Boolean))),
    amoSub: normSubdomain(process.env["AMO_SUBDOMAIN_" + e]),
    amoToken: clean(process.env["AMO_TOKEN_" + e])
  };
  c.metaAccount = c.metaAccounts[0] || "";
  // CRM turi: "amo" (standart) yoki "bitrix" (BITRIX_WEBHOOK_<env>)
  c.crm = p.crm === "bitrix" ? "bitrix" : "amo";
  c.bitrix = clean(process.env["BITRIX_WEBHOOK_" + e]);
  c.crmOk = c.crm === "bitrix" ? !!c.bitrix : !!(c.amoSub && c.amoToken);
  c.ok = !!(c.metaToken && c.metaAccount && c.crmOk);
  return c;
}

// Panelda tanlangan akkauntlar (cookie "acc_<loyiha>" = "1514572179232535-2610483762722192").
// Tanlov bo'sh yoki noto'g'ri bo'lsa: barcha akkauntlar.
export const accCookie = (slug) => "acc_" + String(slug).replace(/[^a-z0-9_-]/gi, "");
export function pickAccounts(c, raw) {
  const all = c.metaAccounts || [];
  const want = new Set(String(raw || "").split(/[-,]+/).map(normAccount).filter(Boolean));
  const sel = all.filter((a) => want.has(a));
  return sel.length ? sel : all;
}
