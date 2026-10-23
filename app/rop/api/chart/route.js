// ROP uchun grafik: faqat kirgan ROP'ning o'z loyihasi (middleware sarlavhasi). Admin ?p= bilan tanlaydi.
import cfg from "../../../../projects.config";
import { GET as chartGET } from "../../../api/chart/route";
import { ropSlug, ROP_HEADER } from "../../../../lib/rop";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req) {
  const u = new URL(req.url);
  u.searchParams.set("p", ropSlug(req.headers.get(ROP_HEADER), u.searchParams.get("p"), cfg.projects));
  return chartGET(new Request(u.toString(), { headers: req.headers }));
}
