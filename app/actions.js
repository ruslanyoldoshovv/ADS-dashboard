"use server";
// Paneldagi "Oylik lid rejasi" formasi shu yerga keladi va reja saqlanadi (har oy uchun alohida).
import { redirect } from "next/navigation";
import cfg from "../projects.config";
import { setPlan, storeReady, thrWrite } from "../lib/store";

export async function savePlan(formData) {
  const slug = String(formData.get("slug") || "");
  const by = ["ad", "campaign", "adset"].includes(String(formData.get("by"))) ? String(formData.get("by")) : "ad";
  // Qaysi davr ko'rib turilgan bo'lsa, saqlangandan keyin o'sha davrga qaytadi
  const rq = String(formData.get("rq") || "");
  const range = /^(r=[a-z0-9]{2,12}|from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2})$/.test(rq) ? rq : "r=month";
  const back = (q) => "/?p=" + encodeURIComponent(slug) + "&" + range + "&by=" + by + "&" + q;

  const project = cfg.projects.find((x) => x.slug === slug);
  if (!project) redirect("/");

  const ym = String(formData.get("month") || "");
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  const okMonth = !!m && Number(m[1]) >= 2024 && Number(m[1]) <= 2100 && Number(m[2]) >= 1 && Number(m[2]) <= 12;
  const n = Math.round(Number(String(formData.get("plan") || "").replace(/\s/g, "")));
  const sun = Number(formData.get("sun"));

  if (!okMonth || !Number.isFinite(n) || n < 1 || n > 100000 || ![0, 0.65, 1].includes(sun)) redirect(back("err=input"));
  if (!storeReady()) redirect(back("err=nostore"));

  let ok = true;
  try { await setPlan(slug, ym, { n, sun, k: project.planBy === "quality" ? "q" : "l", at: new Date().toISOString() }); } catch (e) { ok = false; }
  redirect(back(ok ? "saved=" + ym : "err=store"));
}

// "Chegaralar" formasi: ogohlantirish chegaralari loyiha bo'yicha saqlanadi (Upstash), sozlamadagi standartni almashtiradi
export async function saveThresholds(formData) {
  const slug = String(formData.get("slug") || "");
  const by = ["ad", "campaign", "adset"].includes(String(formData.get("by"))) ? String(formData.get("by")) : "ad";
  const rq = String(formData.get("rq") || "");
  const range = /^(r=[a-z0-9]{2,12}|from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2})$/.test(rq) ? rq : "r=month";
  const back = (q) => "/?p=" + encodeURIComponent(slug) + "&" + range + "&by=" + by + "&" + q;
  const project = cfg.projects.find((x) => x.slug === slug);
  if (!project) redirect("/");
  const num = (k) => { const s = String(formData.get(k) || "").replace(/\s/g, "").replace(",", "."); return s === "" ? undefined : Number(s); };
  const v = { cpl: num("cpl"), qcpl: num("qcpl"), quality: num("quality"), noAns: num("noAns"), reply: num("reply"), roas: num("roas") };
  const bad = (x, lo, hi) => x !== undefined && !(isFinite(x) && x >= lo && x <= hi);
  if (bad(v.cpl, 0.01, 10000000) || bad(v.qcpl, 0.01, 10000000) || bad(v.quality, 1, 100) || bad(v.noAns, 1, 100) || bad(v.reply, 1, 1440) || bad(v.roas, 0.1, 100)) redirect(back("terr=input"));
  if (!storeReady()) redirect(back("terr=nostore"));
  const out = {};
  if (v.cpl !== undefined) out.cpl = v.cpl;
  if (v.qcpl !== undefined) out.qcpl = v.qcpl;
  if (v.quality !== undefined) { out.quality = Math.round(v.quality) / 100; out.qualityWarn = Math.min(1, Math.round(v.quality + 10) / 100); }
  if (v.noAns !== undefined) out.noAns = Math.round(v.noAns) / 100;
  if (v.reply !== undefined) out.reply = Math.round(v.reply);
  out.roas = v.roas !== undefined ? v.roas : null; // bo'sh = ROAS chegarasi yo'q
  out.at = new Date().toISOString();
  let ok = true;
  try { await thrWrite(slug, out); } catch (e) { ok = false; }
  redirect(back(ok ? "tsaved=1" : "terr=store"));
}
