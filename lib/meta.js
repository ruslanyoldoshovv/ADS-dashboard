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
