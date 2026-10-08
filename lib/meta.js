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

function leadsFromActions(actions) {
  if (!actions) return 0;
  const keys = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"];
  for (const k of keys) {
    const a = actions.find((x) => x.action_type === k);
    if (a) return Number(a.value) || 0;
  }
  return 0;
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

// Reklamalar holati (yoniq, pauza, rad etilgan...): { adId: effective_status }. 50 tadan so'raladi.
export async function fetchAdStatuses({ token, ids }) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const j = await get(`${API}/?ids=${chunk.join(",")}&fields=effective_status`, token);
    Object.keys(j || {}).forEach((id) => { out[id] = j[id] && j[id].effective_status; });
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
