// amoCRM API v4: lidlar, bosqichlar tarixi, teglar, lost sabablari.
import { nkey } from "./stages";
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
  const statuses = {}; // "voronkaId:bosqichId" -> { name, pipeline } (yumshoq solishtirish uchun nkey qilingan)
  const pipelines = [], pipelineNames = {};
  p.forEach((pl) => {
    pipelines.push(pl.name);
    pipelineNames[pl.id] = pl.name;
    (pl._embedded.statuses || []).forEach((st) => {
      statuses[pl.id + ":" + st.id] = { name: nkey(st.name), pipeline: nkey(pl.name) };
    });
  });
  return { statuses, pipelines, pipelineNames };
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

// Lidlar bosqichga o'tgan voqealar: leadId -> Set("voronkaId:bosqichId")
export async function fetchStatusEvents(sub, token, fromTs) {
  const q = `/events?filter[type][]=lead_status_changed&filter[entity][]=lead&filter[created_at][from]=${fromTs}`;
  const events = await all(sub, token, q, "events", 100, 200);
  const reached = {};
  events.forEach((e) => {
    const after = (e.value_after || []).map((v) => v.lead_status && v.lead_status.id ? v.lead_status.pipeline_id + ":" + v.lead_status.id : null).filter(Boolean);
    if (!reached[e.entity_id]) reached[e.entity_id] = new Set();
    after.forEach((id) => reached[e.entity_id].add(id));
  });
  return reached;
}

// Kompaniyalar id bo'yicha (reklama nomi kompaniya maydonida turgan lidlar uchun). Natija: id -> kompaniya
export async function fetchCompaniesByIds(sub, token, ids) {
  const out = {};
  const chunks = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
  // amoCRM limiti sekundiga 7 so'rov: bir vaqtda 3 tadan ko'p yubormaymiz
  for (let i = 0; i < chunks.length; i += 3) {
    const part = await Promise.all(chunks.slice(i, i + 3).map((ch) =>
      all(sub, token, "/companies?" + ch.map((id) => "filter[id][]=" + id).join("&"), "companies", 250, 2)));
    part.forEach((list) => list.forEach((co) => { out[co.id] = co; }));
  }
  return out;
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
