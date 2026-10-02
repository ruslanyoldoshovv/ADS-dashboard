# Reklama va lidlar paneli

Meta Ads + amoCRM ma'lumotini bitta panelda ko'rsatadi: sifatli lid, manba, ogohlantirish, tavsiya, oylik reja kalendari. AI ulanmagan, hammasi oddiy qoidalar.

## 1. Kodni GitHub'ga yuklash (kod yozish shart emas)
1. github.com > yuqori o'ng "+" > **New repository** > nom: `reklama-panel` > **Private** > Create.
2. Ochilgan sahifada **uploading an existing file** havolasini bosing.
3. Zip'ni kompyuteringizda oching, ichidagi **hamma fayl va papkalarni** (`app`, `lib`, `package.json` va boshqalar) sudrab tashlang. `node_modules` papkasi bo'lmasligi kerak.
4. **Commit changes** bosing.

## 2. Vercel'ga ulash
1. vercel.com > **Add New > Project** > `reklama-panel` repozitoriyasini tanlang > **Import**.
2. Deploy bosishdan OLDIN **Environment Variables** bo'limini oching va qo'shing:

| Nomi | Qiymati |
|---|---|
| `DASH_PASSWORD` | panelga kirish paroli (login: `admin`) |
| `DEMO` | `1` (namuna ma'lumot ko'rinishi uchun, haqiqiy ulangach o'chirish mumkin) |
| `AMO_DOMAIN` | `amocrm.ru` yoki `amocrm.com` |
| `META_TOKEN_P1` | 1-loyiha Meta System User tokeni |
| `META_ACCOUNT_P1` | `act_` bilan boshlanadigan reklama akkaunt ID |
| `AMO_SUBDOMAIN_P1` | amoCRM manzilidagi nom (`nomi.amocrm.ru` dagi `nomi`) |
| `AMO_TOKEN_P1` | amoCRM uzoq muddatli token |

2- va 3-loyiha uchun xuddi shunday `..._P2`, `..._P3`.
3. **Deploy** bosing. Tayyor bo'lgach manzilni oching, login `admin`, parol o'zingiz yozgan.

## 3. Ulanishni tekshirish
Brauzerda oching: `sizning-manzil.vercel.app/api/check?p=loyiha-1`
- `ok: true` chiqsa, ulanish to'g'ri.
- `topilmagan_bosqichlar` bo'sh bo'lishi kerak. Agar nom chiqsa, `projects.config.js` dagi bosqich nomini amoCRM'dagi nom bilan bir xil qiling.

## 4. Sozlamalarni o'zgartirish
GitHub'da `projects.config.js` faylini oching > qalam belgisi (Edit) > o'zgartiring > Commit. Vercel o'zi qayta joylaydi.
- Chegaralar (`thresholds`): CPL, sifatli lid narxi, sifatli ulush, ROAS va boshqalar.
- Reja (`plan`): kunlik lid. Alohida kun uchun `overrides: { "2026-10-20": 10 }`.
- Loyiha qo'shish: `projects` ro'yxatiga yangi blok nusxalang, `slug` va `env` ni o'zgartiring.

## Qoidalar
- Sifatli lid: "Ma'lumot berildi", "Taklif qilindi", "Suhbatga keldi" yoki sotuvga bir marta o'tgan lid (keyin lost bo'lsa ham).
- Manba: `incoming_call` tegi bor yoki tegsiz lid kiruvchi qo'ng'iroq, boshqa tegli lid reklama.
- Reklamaga bog'lash: lid tegi Meta reklama nomi bilan bir xil bo'lishi yoki reklama ID'sini o'z ichiga olishi kerak. Mos kelmasa, "Tegi Meta reklamasiga mos kelmagan lidlar" qatoriga tushadi.
- Suhbatga keldi: lid "Suhbatga keldi" VORONKASIga o'tgan bo'lsa (`stages.visitPipelines`).
- Sotuv: "Suhbatga keldi" voronkasidagi "Чек" bosqichi (`stages.sale`). Daromad shu lidlarning bitim summasi.
- Hisob lid yaratilgan sana bo'yicha yuritiladi: tanlangan davrda tushgan lidlar keyin sotuvga yetsa, shu davrga yoziladi.

## Hozircha ulanmagan
- Operatorning birinchi javob vaqti (jadvalda "—").
- Telegram ogohlantirish (keyingi bosqich).
