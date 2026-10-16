// ROP uchun grafik: faqat ruxsat berilgan loyiha (so'rovdagi p e'tiborga olinmaydi)
import cfg from "../../../../projects.config";
import { GET as chartGET } from "../../../api/chart/route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req) {
  const u = new URL(req.url);
  u.searchParams.set("p", cfg.ropProject || "nexus-school");
  return chartGET(new Request(u.toString(), { headers: req.headers }));
}
