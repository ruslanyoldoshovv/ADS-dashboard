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
Brauzerda oching: `sizning-manzil.vercel.app/api/check?p=nexus-school`
- `ok: true` chiqsa, ulanish to'g'ri.
- `topilmagan_bosqichlar` bo'sh bo'lishi kerak. Agar nom chiqsa, `projects.config.js` dagi bosqich nomini amoCRM'dagi nom bilan bir xil qiling.

## 4. Sozlamalarni o'zgartirish
GitHub'da `projects.config.js` faylini oching > qalam belgisi (Edit) > o'zgartiring > Commit. Vercel o'zi qayta joylaydi.
- Chegaralar (`thresholds`): CPL, sifatli lid narxi, sifatli ulush, ROAS va boshqalar. `roas: null` bo'lsa ROAS chegarasiz, faqat ko'rsatiladi.
- Valyuta (`currency`): reklama sarfi `"USD"` yoki `"UZS"`. Tushum doim so'mda. Dollar loyihada ROAS uchun sarf Markaziy bank kursi bo'yicha so'mga o'giriladi (`usdRate`).
- Reja (`plan`): faqat standart reja. Asosiy reja panelning o'zida kiritiladi (pastga qarang).

## 5. Oylik lid rejasini paneldan kiritish
Panelda "Oylik reja" bo'limida forma bor: oy, oylik lid soni va yakshanba qoidasi tanlanadi, "Rejani saqlash" bosiladi. Oylik son kunlarga avtomatik bo'linadi, yig'indi aynan oylik rejaga teng chiqadi. Joriy va keyingi oy uchun kiritish mumkin.

Forma ishlashi uchun saqlash joyi bir marta ulanadi:
1. Vercel > loyiha > **Storage** > **Create Database** > **Upstash for Redis** (bepul tarif).
2. Loyihaga ulang (**Connect Project**). Vercel `KV_REST_API_URL` va `KV_REST_API_TOKEN` ni o'zi qo'shadi.
3. **Redeploy** qiling.

Saqlash joyi ulanmagan bo'lsa panel ishlayveradi, faqat `projects.config.js` dagi standart reja ko'rsatiladi.
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

## Meta Conversions API (amoCRM bosqichlari → Meta)

Panel amoCRM'dagi lid bosqichlarini Meta'ga yuboradi: `Lead` → `Sifatli lid` → `Suhbatga keldi` → `Sotuv`.
Shunda kampaniyani "lid" emas, "sifatli lid" bo'yicha optimallashtirish mumkin bo'ladi.

**Vercel > Environment Variables:**

| O'zgaruvchi | Qiymat |
|---|---|
| `CAPI_DATASET_P1` | Events Manager'dagi dataset (piksel) ID |
| `CAPI_TOKEN_P1` | Dataset > Settings > Generate access token |
| `CAPI_TEST_CODE_P1` | ixtiyoriy: sinov kodi (qo'yilsa hodisalar faqat Test events'ga tushadi) |

**Manzillar (panel paroli bilan):**

- `/api/capi?p=nexus-school` : holat, amoCRM'ga qo'yiladigan webhook manzili, oxirgi yuborilgan hodisalar
- `/api/capi/sync?p=nexus-school&days=3&dry=1` : nechta hodisa ketishini ko'rish (hech narsa yuborilmaydi)
- `/api/capi/sync?p=nexus-school&days=3` : oxirgi 3 kunni yuborish
- `/api/capi/sync?p=nexus-school&days=1&test=TEST123` : Test events'ga sinov yuborish

**Qanday ishlaydi:**

- Lid Meta'da `Meta lead ID` maydoni (lid, kompaniya yoki kontaktda) bo'yicha topiladi. Maydon bo'lmasa, kontakt telefon raqamining xeshi (SHA-256) yuboriladi. Telefonning o'zi Meta'ga ochiq ko'rinishda ketmaydi.
- Faqat reklamadan kelgan lidlar yuboriladi (reklama nomi maydoni to'ldirilgan). Kiruvchi qo'ng'iroqlar yuborilmaydi.
- Har bosqich bir lid uchun bir marta yuboriladi (Upstash'da eslab qolinadi).
- Real vaqt: amoCRM webhook. Zaxira: Vercel har kuni 09:00 va 21:00 da (Toshkent) oxirgi 7 kunni tekshirib, o'tkazib yuborilganini yuboradi.
- Hodisa nomlari va sozlamalar: `projects.config.js` > `capi`.
