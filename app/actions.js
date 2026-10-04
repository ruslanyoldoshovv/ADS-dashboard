"use server";
// Paneldagi "Oylik lid rejasi" formasi shu yerga keladi va reja saqlanadi (har oy uchun alohida).
import { redirect } from "next/navigation";
import cfg from "../projects.config";
import { setPlan, storeReady } from "../lib/store";

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
