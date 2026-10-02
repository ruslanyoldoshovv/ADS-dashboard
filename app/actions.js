"use server";
// Paneldagi "Oylik lid rejasi" formasi shu yerga keladi va reja saqlanadi.
import { redirect } from "next/navigation";
import cfg from "../projects.config";
import { setPlan, storeReady } from "../lib/store";
import { tashkentNow } from "../lib/calc";
import { monthKey } from "../lib/plan";

export async function savePlan(formData) {
  const slug = String(formData.get("slug") || "");
  const days = [1, 7, 30].includes(Number(formData.get("days"))) ? Number(formData.get("days")) : 7;
  const by = ["ad", "campaign", "adset"].includes(String(formData.get("by"))) ? String(formData.get("by")) : "ad";
  const back = (q) => "/?p=" + encodeURIComponent(slug) + "&days=" + days + "&by=" + by + "&" + q + "#reja";

  const project = cfg.projects.find((x) => x.slug === slug);
  if (!project) redirect("/");

  const now = tashkentNow(cfg);
  const allowed = [monthKey(now, 0), monthKey(now, 1)]; // faqat joriy va keyingi oy
  const ym = String(formData.get("month") || "");
  const n = Math.round(Number(String(formData.get("plan") || "").replace(/\s/g, "")));
  const sun = Number(formData.get("sun"));

  if (!allowed.includes(ym) || !Number.isFinite(n) || n < 1 || n > 100000 || ![0, 0.65, 1].includes(sun)) redirect(back("err=input"));
  if (!storeReady()) redirect(back("err=nostore"));

  let ok = true;
  try { await setPlan(slug, ym, { n, sun, at: new Date().toISOString() }); } catch (e) { ok = false; }
  redirect(back(ok ? "saved=" + ym : "err=store"));
}
