// Bosqich nomlarini amoCRM bosqich id'lariga aylantirish.
// Yozish usullari:
//   "Ma'lumot berildi"          -> shu nomli bosqich (istalgan voronkada)
//   "Suhbatga keldi > Чек"      -> faqat "Suhbatga keldi" voronkasidagi "Чек" bosqichi
// pipelines: ["Suhbatga keldi"] -> shu voronkaning BARCHA bosqichlari
const norm = (s) => String(s || "").toLowerCase().trim();

export function idsOf(statuses, specs) {
  const set = new Set();
  (specs || []).forEach((spec) => {
    const parts = String(spec).split(">");
    const stage = norm(parts[parts.length - 1]);
    const pipe = parts.length > 1 ? norm(parts[0]) : null;
    Object.keys(statuses).forEach((id) => {
      const s = statuses[id];
      if (s.name === stage && (pipe === null || s.pipeline === pipe)) set.add(Number(id));
    });
  });
  return set;
}

export function idsOfPipelines(statuses, pipelines) {
  const set = new Set();
  const want = (pipelines || []).map(norm);
  Object.keys(statuses).forEach((id) => { if (want.includes(statuses[id].pipeline)) set.add(Number(id)); });
  return set;
}

// Sozlamada yozilgan, lekin amoCRM'da topilmagan bosqich/voronkalar (tekshirish uchun)
export function missingStages(statuses, stages) {
  const missing = [];
  ["contacted", "info", "offer", "visit", "sale"].forEach((k) => {
    (stages[k] || []).forEach((spec) => { if (idsOf(statuses, [spec]).size === 0) missing.push(spec); });
  });
  (stages.visitPipelines || []).forEach((n) => { if (idsOfPipelines(statuses, [n]).size === 0) missing.push("voronka: " + n); });
  return missing;
}
