// Sotuv bo'limi rahbarlari (ROP): har biri o'z login va paroli bilan /rop sahifasiga kiradi va FAQAT o'z loyihasini ko'radi.
// Parol Vercel > Environment Variables'da (passEnv nomi bilan). Parol kiritilmagan login ishlamaydi.
// Yangi ROP qo'shish: shu ro'yxatga bitta qator va Vercel'ga parol.
export const ROP_USERS = [
  { user: "rop", passEnv: "ROP_PASSWORD", project: "nexus-school" },   // Nexus School
  { user: "polaris", passEnv: "ROP_PASSWORD_P4", project: "loyiha-4" }, // Polaris Consulting
  { user: "ilmnur", passEnv: "ROP_PASSWORD_P2", project: "loyiha-2" }   // Ilm Nur
];

// Middleware o'rnatadigan ichki sarlavha: kirgan ROP qaysi loyihaga ruxsatli
export const ROP_HEADER = "x-rop-project";

// /rop sahifasi va /rop/api uchun loyiha: ROP bo'lsa faqat o'zinikini, admin bo'lsa ?p= (bo'lmasa Nexus)
export function ropSlug(headerValue, askedSlug, projects) {
  if (headerValue) return headerValue;
  const ok = projects.find((x) => x.slug === askedSlug);
  return ok ? ok.slug : ROP_USERS[0].project;
}
