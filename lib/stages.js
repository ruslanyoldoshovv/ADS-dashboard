// Bosqich nomlarini amoCRM bosqichlariga bog'lash.
// Yozish usullari:
//   "Ma'lumot berildi"          -> shu nomli bosqich (istalgan voronkada)
//   "Suhbatga keldi > Чек"      -> faqat "Suhbatga keldi" voronkasidagi "Чек" bosqichi
// pipelines: ["Suhbatga keldi"] -> shu voronkaning BARCHA bosqichlari
//
// Nomlar "yumshoq" solishtiriladi: katta-kichik harf, emoji, tinish belgisi, bo'sh joy va
// kirill-lotin o'xshash harflar farqi hisobga olinmaydi.
// Masalan "⏳MA'LUMOT BERILDI" = "Ma'lumot berildi", "ЧEK" (aralash harf) = "Чек".
const LOOKALIKE = { "а": "a", "в": "b", "е": "e", "ё": "e", "к": "k", "м": "m", "н": "h", "о": "o", "р": "p", "с": "c", "т": "t", "у": "y", "х": "x" };

export function nkey(s) {
  return String(s || "").toLowerCase().replace(/[авеёкмнорстух]/g, (ch) => LOOKALIKE[ch]).replace(/[^\p{L}\p{N}]/gu, "");
}

// statuses: { "voronkaId:bosqichId": { name, pipeline } }  (name va pipeline nkey qilingan)
// Natija: "voronkaId:bosqichId" kalitlari to'plami.
// Kalitda voronka bo'lishi shart: amoCRM'da "muvaffaqiyatli" (142) va "yopilgan" (143) bosqich id'lari hamma voronkada bir xil.
export function idsOf(statuses, specs) {
  const set = new Set();
  (specs || []).forEach((spec) => {
    const parts = String(spec).split(">");
    const stage = nkey(parts[parts.length - 1]);
    const pipe = parts.length > 1 ? nkey(parts[0]) : null;
    Object.keys(statuses).forEach((k) => {
      const s = statuses[k];
      if (s.name === stage && (pipe === null || s.pipeline === pipe)) set.add(k);
    });
  });
  return set;
}

export function idsOfPipelines(statuses, pipelines) {
  const set = new Set();
  const want = (pipelines || []).map(nkey);
  Object.keys(statuses).forEach((k) => { if (want.includes(statuses[k].pipeline)) set.add(k); });
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
