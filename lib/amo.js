// amoCRM API v4: lidlar, bosqichlar tarixi, teglar, lost sabablari.
function base(sub) {
  const domain = String(process.env.AMO_DOMAIN || "amocrm.ru").trim().replace(/^https?:\/\//i, "").replace(/^\./, "").replace(/\/.*$/, "") || "amocrm.ru";
  return `https://${sub}.${domain}/api/v4`;
}

async function get(sub, token, path) {
  const res = await fetch(base(sub) + path, { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
  if (res.status === 204) return null;
  if (!res.ok) {
    const t = await res.text();
    throw new Error("amoCRM " + res.status + ": " + t.slice(0, 200));
  }
  return res.json();
}

// Barcha sahifalarni yig'ish. key: _embedded ichidagi massiv nomi
async function all(sub, token, pathWithQuery, key, limit, maxPages) {
  let page = 1, out = [];
  while (page <= (maxPages || 40)) {
    const sep = pathWithQuery.includes("?") ? "&" : "?";
    const j = await get(sub, token, `${pathWithQuery}${sep}limit=${limit}&page=${page}`);
    if (!j || !j._embedded || !j._embedded[key] || j._embedded[key].length === 0) break;
    out = out.concat(j._embedded[key]);
    if (!j._links || !j._links.next) break;
    page++;
  }
  return out;
}

export async function fetchPipelines(sub, token) {
  const p = await all(sub, token, "/leads/pipelines", "pipelines", 250, 3);
  const statuses = {}; // id -> { name, pipeline } (kichik harfda)
  const pipelines = [];
  p.forEach((pl) => {
    pipelines.push(pl.name);
    (pl._embedded.statuses || []).forEach((st) => {
      statuses[st.id] = { name: String(st.name).toLowerCase().trim(), pipeline: String(pl.name).toLowerCase().trim() };
    });
  });
  return { statuses, pipelines };
}

export async function fetchUsers(sub, token) {
  const u = await all(sub, token, "/users", "users", 250, 3);
  const map = {};
  u.forEach((x) => { map[x.id] = x.name; });
  return map;
}

// fromTs/toTs: unix sekund
export async function fetchLeads(sub, token, fromTs, toTs) {
  const q = `/leads?filter[created_at][from]=${fromTs}&filter[created_at][to]=${toTs}&with=loss_reason`;
  return all(sub, token, q, "leads", 250, 40);
}

// Lidlar bosqichga o'tgan voqealar: leadId -> Set(statusId)
export async function fetchStatusEvents(sub, token, fromTs) {
  const q = `/events?filter[type][]=lead_status_changed&filter[entity][]=lead&filter[created_at][from]=${fromTs}`;
  const events = await all(sub, token, q, "events", 100, 200);
  const reached = {};
  events.forEach((e) => {
    const after = (e.value_after || []).map((v) => v.lead_status && v.lead_status.id).filter(Boolean);
    if (!reached[e.entity_id]) reached[e.entity_id] = new Set();
    after.forEach((id) => reached[e.entity_id].add(id));
  });
  return reached;
}

// Qo'shimcha maydonlar ro'yxati (faqat nomlari). entity: "leads" | "contacts" | "companies"
export async function fetchCustomFields(sub, token, entity) {
  const f = await all(sub, token, "/" + entity + "/custom_fields", "custom_fields", 250, 3);
  return f.map((x) => ({ id: x.id, nom: x.name, tur: x.type }));
}

// Voronkalar va ularning bosqich nomlari (amoCRM'da qanday yozilgan bo'lsa, shunday)
export async function fetchPipelineStages(sub, token) {
  const p = await all(sub, token, "/leads/pipelines", "pipelines", 250, 3);
  const out = {};
  p.forEach((pl) => { out[pl.name] = (pl._embedded.statuses || []).map((st) => st.name); });
  return out;
}

export async function pingAmo(sub, token) {
  const j = await get(sub, token, "/account");
  return { name: j.name, subdomain: j.subdomain };
}
