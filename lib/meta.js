// Meta Marketing API: reklama darajasidagi sarf va lidlar.
const API = "https://graph.facebook.com/v21.0";

async function get(url, token) {
  const res = await fetch(url, { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
  const json = await res.json();
  if (!res.ok || json.error) {
    const msg = json.error ? json.error.message : "HTTP " + res.status;
    throw new Error("Meta: " + msg);
  }
  return json;
}

async function paged(firstUrl, token) {
  let url = firstUrl, out = [], guard = 0;
  while (url && guard++ < 20) {
    const j = await get(url, token);
    out = out.concat(j.data || []);
    url = j.paging && j.paging.next ? j.paging.next : null;
  }
  return out;
}

// Lid forma lidlari (Ads Manager'dagi "Лиды (форма)" bilan bir xil).
// Diqqat: "lead" turi barcha lid hodisalarini qo'shadi, jumladan CRM'dan Conversions API orqali qaytarilgan
// "Lead" hodisalarini ham (Nexus). Shuning uchun avval faqat forma lidlari olinadi, aks holda lid 2 marta sanalardi.
function leadsFromActions(actions) {
  if (!actions) return 0;
  const val = (k) => { const a = actions.find((x) => x.action_type === k); return a ? Number(a.value) || 0 : null; };
  const form = val("onsite_conversion.lead_grouped");
  if (form != null) return form;
  const all = val("lead"), pixel = val("offsite_conversion.fb_pixel_lead");
  if (all != null) return Math.max(all - (pixel || 0), 0) || (pixel || 0);
  return pixel || 0;
}

// since/until: "YYYY-MM-DD"
export async function fetchAds({ token, account, since, until }) {
  const fields = "ad_id,ad_name,campaign_name,adset_name,spend,actions";
  const range = encodeURIComponent(JSON.stringify({ since, until }));
  const url = `${API}/${account}/insights?level=ad&fields=${fields}&time_range=${range}&limit=500`;
  const rows = await paged(url, token);
  return rows.map((r) => ({
    id: r.ad_id,
    name: r.ad_name,
    campaign: r.campaign_name,
    adset: r.adset_name,
    spend: Math.round((Number(r.spend) || 0) * 100) / 100, // akkaunt valyutasida ($ bo'lsa tiyinlari bilan)
    metaLeads: leadsFromActions(r.actions)
  }));
}

// Kunlik sarf (akkaunt bo'yicha): { "YYYY-MM-DD": sarf }. Grafik uchun.
export async function fetchDailySpend({ token, account, since, until }) {
  const range = encodeURIComponent(JSON.stringify({ since, until }));
  const rows = await paged(`${API}/${account}/insights?level=account&fields=spend&time_increment=1&time_range=${range}&limit=500`, token);
  const out = {};
  rows.forEach((r) => { out[r.date_start] = Math.round((Number(r.spend) || 0) * 100) / 100; });
  return out;
}

// Kampaniyalar bo'yicha kunlik sarf (davlat filtri uchun): [{ d: "YYYY-MM-DD", campaign, spend }]
export async function fetchDailySpendByCampaign({ token, account, since, until }) {
  const range = encodeURIComponent(JSON.stringify({ since, until }));
  const rows = await paged(`${API}/${account}/insights?level=campaign&fields=campaign_name,spend&time_increment=1&time_range=${range}&limit=500`, token);
  return rows.map((r) => ({ d: r.date_start, campaign: r.campaign_name, spend: Number(r.spend) || 0 }));
}

// Bugungi sarf kampaniyalar bo'yicha (davlat filtri uchun): [{ campaign, spend }]
export async function fetchTodaySpendByCampaign({ token, account }) {
  const rows = await paged(`${API}/${account}/insights?level=campaign&fields=campaign_name,spend&date_preset=today&limit=500`, token);
  return rows.map((r) => ({ campaign: r.campaign_name, spend: Number(r.spend) || 0 }));
}

// Reklamalar holati (yoniq, pauza, rad etilgan...): { adId: effective_status }.
// Akkaunt reklamalari ro'yxatidan ID bo'yicha filtr bilan olinadi (100 tadan).
export async function fetchAdStatuses({ token, account, ids }) {
  const out = {};
  for (let i = 0; i < ids.length; i += 100) {
    const filt = encodeURIComponent(JSON.stringify([{ field: "id", operator: "IN", value: ids.slice(i, i + 100) }]));
    const rows = await paged(`${API}/${account}/ads?fields=id,effective_status&filtering=${filt}&limit=500`, token);
    rows.forEach((r) => { out[r.id] = r.effective_status; });
  }
  return out;
}

// Reklamalar sarf qilgan kunlar: { adId: { f: birinchi kun, l: oxirgi kun } } (faqat sarf > 0 kunlar)
export async function fetchAdSpendSpan({ token, account, ids, since, until }) {
  const out = {};
  const range = encodeURIComponent(JSON.stringify({ since, until }));
  for (let i = 0; i < ids.length; i += 100) {
    const filt = encodeURIComponent(JSON.stringify([{ field: "ad.id", operator: "IN", value: ids.slice(i, i + 100) }]));
    const rows = await paged(`${API}/${account}/insights?level=ad&fields=ad_id,spend&time_increment=1&time_range=${range}&filtering=${filt}&limit=500`, token);
    rows.forEach((r) => {
      if (!(Number(r.spend) > 0)) return;
      const o = out[r.ad_id] || (out[r.ad_id] = { f: r.date_start, l: r.date_start });
      if (r.date_start < o.f) o.f = r.date_start;
      if (r.date_start > o.l) o.l = r.date_start;
    });
  }
  return out;
}

export async function fetchTodaySpend({ token, account }) {
  const url = `${API}/${account}/insights?level=account&fields=spend&date_preset=today`;
  const j = await get(url, token);
  const row = (j.data || [])[0];
  return row ? Math.round((Number(row.spend) || 0) * 100) / 100 : 0;
}

// Reklama akkaunti valyutasi ("USD", "UZS"...). Xato bo'lsa null: panel ishlashda davom etadi.
export async function fetchCurrency({ token, account }) {
  try {
    const j = await get(`${API}/${account}?fields=currency`, token);
    return j.currency || null;
  } catch (e) { return null; }
}

export async function pingMeta({ token, account }) {
  const j = await get(`${API}/${account}?fields=name,currency,account_status`, token);
  return { name: j.name, currency: j.currency, status: j.account_status };
}

// Token ko'ra oladigan reklama akkauntlari (tekshiruv uchun): [{ id, name, status }]
export async function fetchMyAccounts({ token }) {
  const rows = await paged(`${API}/me/adaccounts?fields=account_id,name,account_status&limit=100`, token);
  return rows.map((r) => ({ id: r.account_id, name: r.name, status: r.account_status }));
}

// ---------------------------------------------------------------------
// Guruh hisoboti uchun: sarfni "lid forma" va "Direct (yozishmalar)" ga ajratish.
// Reklama to'plamining yo'nalishi (destination_type) yoki optimallashtirish maqsadi yozishma bo'lsa: Direct.
// Natija: { lead: { spend, leads }, direct: { spend, msgs } }
// ---------------------------------------------------------------------
const MSG_ACTION = "onsite_conversion.messaging_conversation_started_7d";
const isMessagingSet = (s) => {
  const d = String((s && s.destination_type) || "").toUpperCase(), g = String((s && s.optimization_goal) || "").toUpperCase();
  return /MESSENG|WHATSAPP|INSTAGRAM_DIRECT|MESSAGING/.test(d) || g === "CONVERSATIONS" || g === "REPLIES";
};
export async function fetchLeadDirectSplit({ token, account, since, until }) {
  const range = encodeURIComponent(JSON.stringify({ since, until }));
  const rows = await paged(`${API}/${account}/insights?level=adset&fields=adset_id,spend,actions&time_range=${range}&limit=500`, token);
  const out = { lead: { spend: 0, leads: 0 }, direct: { spend: 0, msgs: 0 } };
  if (!rows.length) return out;
  // Reklama to'plamlari turi (100 tadan)
  const ids = rows.map((r) => r.adset_id), info = {};
  for (let i = 0; i < ids.length; i += 100) {
    const filt = encodeURIComponent(JSON.stringify([{ field: "id", operator: "IN", value: ids.slice(i, i + 100) }]));
    (await paged(`${API}/${account}/adsets?fields=id,destination_type,optimization_goal&filtering=${filt}&limit=500`, token)).forEach((s) => { info[s.id] = s; });
  }
  rows.forEach((r) => {
    const spend = Number(r.spend) || 0;
    const msgs = Number(((r.actions || []).find((a) => a.action_type === MSG_ACTION) || {}).value) || 0;
    if (isMessagingSet(info[r.adset_id]) || (msgs > 0 && !leadsFromActions(r.actions))) { out.direct.spend += spend; out.direct.msgs += msgs; }
    else { out.lead.spend += spend; out.lead.leads += leadsFromActions(r.actions); }
  });
  out.lead.spend = Math.round(out.lead.spend * 100) / 100;
  out.direct.spend = Math.round(out.direct.spend * 100) / 100;
  return out;
}
