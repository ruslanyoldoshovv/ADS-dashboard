// ROP uchun ish grafigi: o'qish va saqlash faqat ruxsat berilgan loyiha uchun. Siz ham, ROP ham bir xil grafikni ko'radi.
import cfg from "../../../../projects.config";
import { GET as schedGET, POST as schedPOST } from "../../../api/schedule/route";

export const dynamic = "force-dynamic";
const SLUG = () => cfg.ropProject || "nexus-school";

export async function GET(req) {
  const u = new URL(req.url);
  u.searchParams.set("p", SLUG());
  return schedGET(new Request(u.toString()));
}

export async function POST(req) {
  let b = {};
  try { b = await req.json(); } catch (e) { return Response.json({ ok: false, error: "JSON xato" }, { status: 400 }); }
  b.p = SLUG();
  return schedPOST(new Request(req.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }));
}
