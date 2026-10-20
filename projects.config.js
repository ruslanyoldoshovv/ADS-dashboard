// =====================================================================
// LOYIHALAR SOZLAMASI. Faqat shu faylni o'zgartirasiz.
// Har loyiha: o'z Business Manager token'i, reklama akkaunti va amoCRM'i.
// Token va parollar bu yerga YOZILMAYDI, ular Vercel > Environment Variables'da turadi.
// =====================================================================

// amoCRM bosqich nomlari (voronkangizdagi nom bilan bir xil yozing, katta-kichik harf farq qilmaydi).
// Yozish usullari:
//   "Ma'lumot berildi"        -> shu nomli bosqich (istalgan voronkada)
//   "Suhbatga keldi > Чек"    -> faqat "Suhbatga keldi" voronkasidagi "Чек" bosqichi
const STAGES = {
  contacted: [],                              // ixtiyoriy: "Aloqaga chiqildi" bosqichi (SOTUV voronkasida bo'lsa yozing)
  info: ["Ma'lumot berildi"],                 // sifatli lid boshlanishi (SOTUV voronkasidagi bosqich)
  offer: ["Taklif qilindi", "TAklif qilndi"],   // SOTUV voronkasida "TAklif qilndi" deb yozilgan, ikkalasi ham hisoblanadi
  // "Suhbatga keldi": alohida VORONKA. Lid shu voronkaga o'tgan bo'lsa, mijoz markazga kelgan hisoblanadi.
  visit: [],
  visitPipelines: ["Suhbatga keldi"],
  // Sotuv: "Suhbatga keldi" voronkasidagi "Чек" bosqichi
  sale: ["Suhbatga keldi > Чек"]
};

// Lost sababi nomida shu so'zlar bo'lsa, tegishli guruhga tushadi (kichik harfda yozing)
const REASON_WORDS = {
  noAnswer: ["ko'tarmadi", "kotarmadi", "nedozvon", "недозвон", "недазвон", "не взял", "bog'lana olmadik"],
  duplicate: ["takror", "dubl", "дубл"]
};

module.exports = {
  // amoCRM'ning standart "muvaffaqiyatli" holati (id 142) ham sotuv hisoblansinmi? Sizda sotuv "Чек" bosqichida, shuning uchun false.
  useWonStatus: false,
  timezoneOffsetHours: 5, // Toshkent UTC+5
  // Dollar kursi (reklama sarfi $ da, tushum so'mda bo'lgan loyihalarda ROAS uchun).
  // "auto": Markaziy bank rasmiy kursi avtomatik olinadi. O'zingiz belgilamoqchi bo'lsangiz son yozing: usdRate: 12800
  usdRate: "auto",
  usdRateFallback: 11800, // Markaziy bank javob bermasa ishlatiladigan zaxira kurs
  // Soat bo'yicha kunlik lidning yig'ma ulushi (0-soatdan 23-soat oxirigacha). Kerak bo'lsa o'zingizga moslang.
  hourlyShare: [0, 0.01, 0.02, 0.02, 0.03, 0.04, 0.06, 0.09, 0.14, 0.22, 0.31, 0.39, 0.46, 0.52, 0.58, 0.64, 0.7, 0.76, 0.82, 0.88, 0.93, 0.97, 0.99, 1],
  stages: STAGES,
  reasonWords: REASON_WORDS,
  // Reklama bilan bog'lanmaydigan teglar (kiruvchi qo'ng'iroq belgisi)
  ignoreTags: ["incoming_call"],

  projects: [
    {
      slug: "nexus-school",
      short: "Nexus School",
      niche: "O'quv markazi",
      name: "Nexus School · O'quv markazi",
      env: "P1", // META_TOKEN_P1, META_ACCOUNT_P1, AMO_SUBDOMAIN_P1, AMO_TOKEN_P1
      // Reklama sarfi valyutasi: "USD" (dollar) yoki "UZS" (so'm). Tushum (amoCRM bitim summasi) doim so'mda.
      currency: "USD",
      // Lid qaysi reklamadan kelganini aniqlash usuli.
      // by: "fields" = lid (yoki unga bog'langan kompaniya) maydonidagi reklama nomi bo'yicha. by: "tags" = teg bo'yicha.
      // Quyida amoCRM'dagi maydon nomlari yoziladi (lid va kompaniyadagi nomlar).
      source: {
        by: "fields",
        ad: ["ad name", "AD NAME"],
        adset: ["Ad set name", "AD SET NAME"],
        campaign: ["Compaign name", "COMPAIGN NAME"]
      },
      // LOST qilingan lidning sifati shu maydon qiymatiga qarab aniqlanadi.
      // good: sifatli deb sanaladigan qiymatlar. bad: sifatsiz deb sanaladigan qiymatlar.
      // LOST lid sifati FAQAT shu maydonga qarab aniqlanadi (maydon amoCRM'da majburiy). Bo'sh bo'lsa sifatsiz deb olinadi.
      lostQuality: { field: "Lid sifati", good: ["Sifatli"], bad: ["Sifatsiz"] },
      // Daromad hisobi: 1-oy daromadi = reklamadan kelgan sotuv soni × avgCheck (so'm). LTV = 1-oy daromadi × ltvMultiplier.
      avgCheck: 1850000,
      ltvMultiplier: 5,
      // Meta Conversions API: amoCRM bosqichlari Meta'ga shu nomlar bilan yuboriladi (Events Manager'da ko'rinadi).
      // lead = har bir yangi lid, quality = sifatli lid, visit = "Suhbatga keldi" voronkasiga o'tdi, sale = Чек.
      // leadId: Meta lid ID'si yoziladigan amoCRM maydoni nomlari (bo'lmasa telefon raqami xeshi ishlatiladi).
      // onlyAdLeads: true = faqat reklamadan kelgan lidlar yuboriladi (qo'ng'iroqlar yuborilmaydi).
      capi: {
        crm: "amoCRM",
        leadId: ["Meta lead ID", "lead id", "leadgen id"],
        onlyAdLeads: true,
        events: { lead: "Lead", quality: "Sifatli lid", visit: "Suhbatga keldi", sale: "Sotuv" }
      },
      // Hisobga olinmaydigan voronkalar (masalan: ["Eski lidlar", "Fermer"]). Bo'sh bo'lsa hammasi hisoblanadi.
      ignorePipelines: [],
      // cpl: Meta CPL chegarasi ($). qcpl: sifatli lid narxi chegarasi ($).
      // quality: sifatli ulush shundan past bo'lsa qizil. qualityWarn: shundan past bo'lsa sariq ("chegaraga yaqin").
      // roas: null = ROAS chegarasi yo'q, faqat ko'rsatiladi. Chegara kerak bo'lsa son yozing, masalan roas: 2
      thresholds: { cpl: 6, qcpl: 12, quality: 0.5, qualityWarn: 0.6, pace: 0.8, minLeads: 30, reply: 60, roas: null, noAns: 0.3 },
      // Reja nimada o'lchanadi: "quality" = SIFATLI lid soni (barcha manba: reklama va qo'ng'iroqlar), "leads" = jami lid soni.
      planBy: "quality",
      // true = kiruvchi qo'ng'iroqlar (reklama nomi yozilmagan lidlar) ham reklamadan kelgan deb hisoblanadi.
      // Umumiy ko'rsatkichlar (sifatli lid narxi va ulushi, sotuv narxi, daromad, ROAS, LTV) barcha lidlar bo'yicha chiqadi.
      // Jadvaldagi har bir reklama qatorida doim faqat shu reklamaga bog'langan lidlar sanaladi.
      callsFromAds: true,
      // To'lov sanasi maydoni ("Sotuv hisobi: To'lov sanasi bo'yicha" rejimi uchun). Bo'sh bo'lsa lid Чек bosqichiga o'tgan sana olinadi.
      payDateField: "To'lov sanasi",
      // Oylik reja PANELNING O'ZIDA kiritiladi ("Oylik reja" tugmasi) va kunlarga avtomatik bo'linadi.
      // Quyidagi qiymat faqat panelda shu oy uchun reja kiritilmagan bo'lsa ishlatiladigan standart reja (0 = standart reja yo'q).
      plan: { weekday: 0, sunday: 0, overrides: {} }
      // dayBudget: 1400000,  // ixtiyoriy: kunlik byudjet (yozilmasa: kunlik reja × CPL chegarasi)
    },
    {
      slug: "loyiha-2",
      short: "Loyiha 2",
      niche: "bo'sh",
      name: "Loyiha 2 · bo'sh",
      env: "P2",
      currency: "UZS",
      thresholds: { cpl: 150000, qcpl: 220000, quality: 0.4, qualityWarn: 0.5, pace: 0.8, minLeads: 15, reply: 60, roas: 3, noAns: 0.3 },
      plan: { weekday: 14, sunday: 8, overrides: {} }
    },
    {
      // Bitrix24 loyihasi (marva.bitrix24.kz). Vercel: BITRIX_WEBHOOK_P3 (maxfiy), META_ACCOUNT_P3.
      // Meta tokeni alohida kiritilmagan bo'lsa Nexus tokeni (META_TOKEN_P1) ishlatiladi.
      slug: "loyiha-3",
      short: "Halila.uz",
      niche: "Wellness mahsulot",
      name: "Halila.uz · Wellness mahsulot",
      env: "P3",
      crm: "bitrix",
      metaTokenFrom: "P1",
      currency: "USD",
      hideOperators: true, // sotuvchilar bo'limi ko'rsatilmaydi
      // Bitrix24 sozlamasi: lid = "CALL-ЦЕНТР" voronkasidagi (ID 0) sdelka
      bitrix: {
        categories: [0],
        sourceField: "UF_CRM_1678555479910",          // "Каердан эшитди мижоз"
        adSourceValues: ["Target"],                    // UTM bo'lmasa ham reklama lidi deb sanaladigan qiymatlar
        badStages: ["Дубль", "БРАК НОМЕР", "НЕГАТИВ", "НЕДАЗВОН"], // doim sifatsiz
        lostStages: ["ОТКАЗ"],                          // rad etgan (sifati oldingi bosqichlarga qarab)
        returnStages: ["ВОЗВРАТ", "ЗАКАЗ НЕ ДОСТАВЛЕНО"] // qaytgan buyurtma: sotuv hisoblanmaydi
      },
      // Lid qaysi reklamadan: UTM'dagi reklama ID'si bo'yicha (utm_content = ad ID, utm_term = ad set ID, utm_campaign = kampaniya ID)
      source: { by: "fields", ad: ["utm_content"], adset: ["utm_term"], campaign: ["utm_campaign"] },
      stages: {
        contacted: [],
        info: ["QUAL LEAD", "ДУМКА", "ПЕРЕЗВОНИТЬ"],   // sifatli lid
        offer: [],
        visit: [],
        visitPipelines: [],
        // Sotuv (buyurtma): ЗАКАЗ ПРИНЯТ va undan keyingi bosqichlar
        sale: ["ЗАКАЗ ПРИНЯТ", "ЗАКАЗ ПОДТВЕРЖДЕН", "ЛОГИСТИКА", "МОЙ СКЛАД", "ЗАКАЗ ДОСТАВЛЕН"]
      },
      ignorePipelines: [],
      callsFromAds: false,
      planBy: "leads",
      // Vaqtinchalik chegaralar ($): haqiqiy 30 kunlik natija ko'rilgach moslanadi
      thresholds: { cpl: 2, qcpl: 4, quality: 0.4, qualityWarn: 0.5, pace: 0.8, minLeads: 40, reply: 60, roas: null, noAns: 0.3 },
      plan: { weekday: 0, sunday: 0, overrides: {} }
    },
    {
      // Polaris Consulting (chet elda o'qish). amoCRM ("Sotuv" voronkasi). Vercel: META_ACCOUNT_P4, AMO_SUBDOMAIN_P4, AMO_TOKEN_P4 (maxfiy).
      // Reklama akkaunti Nexus BM'ga partner qilib berilgan, shuning uchun Meta tokeni Nexus'niki (META_TOKEN_P1).
      slug: "loyiha-4",
      short: "Polaris Consulting",
      niche: "Chet elda o'qish",
      name: "Polaris Consulting · Chet elda o'qish",
      env: "P4",
      metaTokenFrom: "P1",
      currency: "USD",
      // Bosqichlar: YANGI LID -> BOG'LANILMADI -> ALOQA O'RNATILDI -> MA'LUMOT BERILDI (sifatli boshlanishi) -> MEETINGGA/OFISGA TAKLIF -> OFISGA KELDI -> Qisman to'lov -> WON
      stages: {
        contacted: ["ALOQA O'RNATILDI"],
        info: ["MA'LUMOT BERILDI"],
        offer: ["MEETINGGA TAKLIF QILINDI", "OFISGA TAKLIF QILINDI"],
        visit: ["OFISGA KELDI"],
        visitPipelines: [],
        sale: ["Qisman to'lov qildi", "WON"] // birinchi pul tushgan payt sotuv hisoblanadi
      },
      // Voronka va qoidalardagi bosqich nomlari (panelda shunday ko'rinadi)
      labels: { contacted: "Aloqa o'rnatildi", info: "Ma'lumot berildi", offer: "Meeting/ofisga taklif", visit: "Ofisga keldi", sale: "To'lov (sotuv)" },
      // LOST lid sifati "SIFAT" maydoniga qarab. Bo'sh bo'lsa sifatsiz deb olinadi.
      lostQuality: { field: "SIFAT", good: ["Sifatli"], bad: ["Sifatsiz"] },
      // Lid qaysi reklamadan: Meta lid formasi amoCRM'ga yozadigan maydonlar
      source: { by: "fields", ad: ["ad name"], adset: ["Ad set name"], campaign: ["Compaign name"] },
      // Daromad: amoCRM'dagi shartnoma summasi (dollarda). Panelda so'mga o'girib ko'rsatiladi.
      revenueField: "shartnoma narxi ($)",
      revenueCurrency: "USD",
      payDateField: "To'lov sanasi",
      // Davlat filtri: amoCRM tegi "<DAVLAT>_LEADS" (masalan ITALIYA_LEADS), Meta'da kampaniya nomining birinchi so'zi (ITALIYA 2 - ...).
      // Yangi davlat tegi va kampaniyasi qo'shilsa, panelda avtomatik paydo bo'ladi.
      countries: { tagSuffix: "_LEADS" },
      thresholds: { cpl: 5, qcpl: 10, quality: 0.4, qualityWarn: 0.5, pace: 0.8, minLeads: 20, reply: 60, roas: null, noAns: 0.3 },
      plan: { weekday: 0, sunday: 0, overrides: {} }
    },
    {
      // Bo'sh loyiha: ulash uchun Vercel'da META_TOKEN_P5, META_ACCOUNT_P5 va CRM (AMO_SUBDOMAIN_P5 + AMO_TOKEN_P5 yoki BITRIX_WEBHOOK_P5) kiritiladi
      slug: "loyiha-5",
      short: "Loyiha 5",
      niche: "bo'sh",
      name: "Loyiha 5 · bo'sh",
      env: "P5",
      currency: "USD",
      thresholds: { cpl: 5, qcpl: 10, quality: 0.4, qualityWarn: 0.5, pace: 0.8, minLeads: 20, reply: 60, roas: null, noAns: 0.3 },
      plan: { weekday: 0, sunday: 0, overrides: {} }
    },
    {
      // Bo'sh loyiha: ulash uchun Vercel'da META_TOKEN_P6, META_ACCOUNT_P6 va CRM (AMO_SUBDOMAIN_P6 + AMO_TOKEN_P6 yoki BITRIX_WEBHOOK_P6) kiritiladi
      slug: "loyiha-6",
      short: "Loyiha 6",
      niche: "bo'sh",
      name: "Loyiha 6 · bo'sh",
      env: "P6",
      currency: "USD",
      thresholds: { cpl: 5, qcpl: 10, quality: 0.4, qualityWarn: 0.5, pace: 0.8, minLeads: 20, reply: 60, roas: null, noAns: 0.3 },
      plan: { weekday: 0, sunday: 0, overrides: {} }
    },
    {
      // Bo'sh loyiha: ulash uchun Vercel'da META_TOKEN_P7, META_ACCOUNT_P7 va CRM (AMO_SUBDOMAIN_P7 + AMO_TOKEN_P7 yoki BITRIX_WEBHOOK_P7) kiritiladi
      slug: "loyiha-7",
      short: "Loyiha 7",
      niche: "bo'sh",
      name: "Loyiha 7 · bo'sh",
      env: "P7",
      currency: "USD",
      thresholds: { cpl: 5, qcpl: 10, quality: 0.4, qualityWarn: 0.5, pace: 0.8, minLeads: 20, reply: 60, roas: null, noAns: 0.3 },
      plan: { weekday: 0, sunday: 0, overrides: {} }
    }
  ]
};
