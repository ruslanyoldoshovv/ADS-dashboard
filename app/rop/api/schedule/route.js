// ROP uchun ish grafigi: o'qish va saqlash faqat kirgan ROP'ning o'z loyihasi uchun (middleware sarlavhasi).
// Siz ham, ROP ham bir xil grafikni ko'radi. Admin ?p= (yoki so'rovdagi p) bilan tanlaydi.
import cfg from "../../../../projects.config";
import { GET as schedGET, POST as schedPOST } from "../../../api/schedule/route";
import { ropSlug, ROP_HEADER } from "../../../../lib/rop";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const u = new URL(req.url);
  u.searchParams.set("p", ropSlug(req.headers.get(ROP_HEADER), u.searchParams.get("p"), cfg.projects));
  return schedGET(new Request(u.toString()));
}

export async function POST(req) {
  let b = {};
  try { b = await req.json(); } catch (e) { return Response.json({ ok: false, error: "JSON xato" }, { status: 400 }); }
  b.p = ropSlug(req.headers.get(ROP_HEADER), b.p, cfg.projects);
  return schedPOST(new Request(req.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }));
}
