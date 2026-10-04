// Parol himoyasi: panel ochiq internetda turadi, shuning uchun login/parol so'raladi.
// Login: admin, parol: Vercel'dagi DASH_PASSWORD qiymati.
import { NextResponse } from "next/server";

export function middleware(req) {
  const pass = process.env.DASH_PASSWORD;
  if (!pass) {
    return new NextResponse("DASH_PASSWORD o'rnatilmagan. Vercel > Settings > Environment Variables'ga qo'shing.", { status: 503 });
  }
  // Parolsiz ochiladigan ikki manzil (ikkalasi ham ma'lumot ko'rsatmaydi):
  //  - amoCRM webhook: o'z kaliti bilan himoyalangan (kalit manzil ichida, lib/capi.js tekshiradi)
  //  - Vercel'ning kunlik avtomatik ishga tushirishi (cron): faqat "ok" qaytaradi, 10 daqiqada bir martadan ko'p ishlamaydi
  const path = req.nextUrl.pathname;
  if (path === "/api/amo-webhook") return NextResponse.next();
  if (path === "/api/capi/sync" && (req.headers.get("user-agent") || "").startsWith("vercel-cron")) return NextResponse.next();
  const auth = req.headers.get("authorization") || "";
  if (auth.startsWith("Basic ")) {
    try {
      const [user, ...rest] = atob(auth.slice(6)).split(":");
      if (user === "admin" && rest.join(":") === pass) return NextResponse.next();
    } catch (e) { /* noto'g'ri sarlavha */ }
  }
  return new NextResponse("Kirish uchun login va parol kerak", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Reklama paneli"' }
  });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
