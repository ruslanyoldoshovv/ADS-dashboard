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
  // Sotuv bo'limi rahbari (ROP): faqat /rop bo'limiga kiradi (login "rop", parol ROP_PASSWORD).
  // Admin (login "admin") hamma joyga, shu jumladan /rop ga ham kira oladi.
  const isRop = path === "/rop" || path.startsWith("/rop/");
  const ropPass = process.env.ROP_PASSWORD;
  const auth = req.headers.get("authorization") || "";
  if (auth.startsWith("Basic ")) {
    try {
      const [user, ...rest] = atob(auth.slice(6)).split(":");
      const pw = rest.join(":");
      if (user === "admin" && pw === pass) return NextResponse.next();
      if (isRop && ropPass && user === "rop" && pw === ropPass) return NextResponse.next();
    } catch (e) { /* noto'g'ri sarlavha */ }
  }
  return new NextResponse("Kirish uchun login va parol kerak", {
    status: 401,
    headers: { "WWW-Authenticate": isRop ? 'Basic realm="Sotuv bo\'limi paneli"' : 'Basic realm="Reklama paneli"' }
  });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
