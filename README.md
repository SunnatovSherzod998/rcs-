# CRS — 1C uslubidagi katta omboralarni boshqarish tizimi

O‘zbekcha va ruscha interfeysli, brauzerda ishlaydigan ombor boshqaruv tizimi.
Arxitektura 1C ga maksimal yaqin: **Справочники → Документы → Регистры → Отчёты**.

## Ishga tushirish

```bash
npm start          # server http://localhost:3000
```

Tashqi paket (`npm install`) **kerak emas** — faqat Node.js 22.5+ (LTS 24).

**Kirish:** `admin` / `admin`

## Buyruqlar

| Buyruq | Vazifasi |
|---|---|
| `npm start` | Serverni ishga tushirish |
| `npm run dev` | Avto-qayta yuklash bilan |
| `npm run reset` | Bazani tozalab, qayta yaratish |
| `npm run backup` | Zaxira nusxa |
| `npm run seed` | Demo ma’lumotlar |
| `npm run map` | 2D bino rejasini qurish + avtomatik joylash |
| `npm run images` | Tovarlarga demo rasmlar |
| `npm test` | 3 ta test fayli, 100+ assert |
| `npm run check` | Frontend sintaksis + tarjima tekshiruvi |

---

# 2D BINO REJASI (План здания)

Siz so'ragan usul — uch qavatli navigatsiya:

```
   1-QAVAT:  XONALAR            binoning rejasida, o'z o'rnida
        ┌────────┬────────┬────────┐
        │  101   │  102   │  103   │   ← xonalar
        │Qabul   │Saqlash │Saqlash │
        ├────────┼────────┼────────┤
        │  104   │  105   │  106   │
        │Karantin│ Sovuq  │Yuborish│
        └────────┴────────┴────────┘
              ══ ko'cha / проход ══

   2-QAVAT:  XONA ICHI          har bir xona ichida
        ┌─ 102-S01 ──────────────┐
        │ Qavat 1  [ ][ ][ ][ ]  │   ← stellajlar, qavatlar
        │ Qavat 2  [ ][ ][ ][ ]  │
        └────────────────────────┘
        har bir katak = SKU + rasm + miqdor

   3-QAVAT:  TOVAR KARTASI       tovar bosilganda
        ┌────────┐  Samsung Smart TV 55"
        │  📷    │  SKU: TV-S55
        │  rasm  │  Miqdor: 38 · 5 400 000 UZS
        └────────┘  Potensial foyda: 1 350 000 UZS
                  Qayerda joylashgan: 3 ta joy
```

### Xonalar

| Turi | Rang | Vazifasi |
|---|---|---|
| `RECEIVING` | yashil | Qabul qilish |
| `STORAGE` | ko‘k | Saqlash |
| `QUARANTINE` | sariq | Karantin |
| `COOLING` | moviy | Sovuq xona (harorat ko‘rsatiladi) |
| `SHIPPING` | feruza | Yuborish |

Har bir xonada: SKU soni, miqdor, bandlik %, mini-kataklar ko‘rinishi.

### Joylashuv yaratish

`Joylashuvlar` sahifasining asosiy harakati — **ombor yaratish**:

```
＋ Ombor yaratish   →  Kod · Nomi(UZ/RU) · Turi · Manzil · Telefon
                       + Reja: xona(6) · stellaj/xona(3) · qator/stellaj(2) · joy/qator(4)
                       → ombor yaratiladi va uning bino rejasi avtomatik quriladi

＋ Joylashuv        →  Ombor *  →  Xona *  →  Kod *  →  Turi / Qavat / O‘rin / Sig‘imi
                       (Ombor maydoni ostida ham «＋ Ombor yaratish» tugmasi bor —
                        u yangi ombor yaratib, Xona ro'yxatini o'sha ombor bilan to'ldiradi)
```

- **Xona majburiy** — yangi joy doim xonaga bog‘lanadi, server ham tekshiradi
  (`xonasiz` joy yaratilsa rad etiladi).
- Ombor tanlanganda xonalar ro‘yxati **avtomatik filtrlanadi**.
- Xona boshqa omborga tegishli bo‘lsa xato beriladi.
- Eski `xonasiz` joylar (`A-01`, `A-01-01` …) saqlanadi va ularga keyinchalik
  shakldan xona biriktirish mumkin.
- Xona qo‘shish endi faqat **Bino rejasi (2D)** sahifasida (`＋ Xona`) va
  `POST /api/plan/room` orqali (`racks`, `levels`, `slots` parametrlari).

### Kataklar (ячейки)

Rang bo‘yicha holat:

| Rang | Ma’nosi |
|---|---|
| Och naqsh | Bo‘sh joy |
| Yashil | Yetarli miqdor |
| Sariq | Min. qoldiqdan kam |
| Qizil | Manfiy qoldiq |
| Ko‘k | Bir nechta SKU bitta joyda |

Har bir katakda tovar rasmi, SKU va miqdor. Bir tovarni ko‘p joyga qo‘yish mumkin.

### Tovar rasmlari

- Nomenklatura shaklida **📤 Fayl tanlash** — JPG/PNG/GIF/WEBP/SVG (4 MB gacha)
- Yoki URL kiritish
- Rasmlar `data/uploads/` da saqlanadi
- Rasm yo‘q bo‘lsa — kategoriya emoji + rang bilan tasvir

---

# JOYLASH OQIMI

```
1. KIRIM (Приход)     — tovar keladi, umumiy qoldiqga tushadi
2. JOYLASH (Размещение) — 2D xaritadan katak tanlab, aniq joyga ko'chirish
3. YIG'ISH (Выборка)   — katakdan tovarni qaytarib olish
```

Joylash va yig‘ish **ombor umumiy qoldig‘ini o‘zgartirmaydi** — faqat taqsimotni.
Bir xil SKU bir nechta katakka bo‘linishi mumkin.

Hujjat muharririda joy tanlash uchun **▩** tugmasini bosing — 2D xarita ochiladi.

### Avtomatik joylash

`⚡ Avtomatik joylash` — tovarlarni bo‘sh kataklarga tarqatadi.
Avval **Saqlash** xonalariga, keyin Karantin/Sovuq xonalarga joylaydi
(Qabul qilish va Yuborish — vaqtinchalik zaxira).

---

# MODULLAR

### Справочники (kataloglar)
Nomenklatura (rasm bilan), Omborlar, Joylashuvlar, Kontragentlar, Toifalar,
Brendlar, O‘lchov birliklari, Xodimlar, Valyutalar

### Документы (hujjatlar)
| Turi | Nomi |
|---|---|
| `OPENING` | Boshlang‘ich qoldiq |
| `RECEIPT` | Kirim (Приход) |
| `ISSUE` | Chiqim (Расход) — sotuv / yo‘qotish / ishlatish |
| `TRANSFER` | Ko‘chirish (Перемещение) — omborlar orasida |
| `PLACEMENT` | **Joylash (Размещение)** — katakka |
| `PICK` | **Yig‘ish (Выборка)** — katakdan |
| `INVENTORY` | Inventarizatsiya (faqat farq bo‘yicha) |
| `PAYMENT` | To‘lov (qarzni yopish) |

Har bir hujjat: `DRAFT → POSTED` (проведение) → orqaga (отмена проведения).

### Регистры (qoldiq hisobi)
- `reg_stock_movements` — barcha harakatlar (append-only)
- `reg_stock_balances` — tez qoldiq
- `reg_debt_movements` — kontragentlar qarzligi
- `reg_prices` — o‘rtacha tannarx

### Отчёты
Foyda/zarar, sotuvlar, xaridlar, aylanma hisobdorlik, yozib tashlash,
inventarizatsiya farqlari, min. qoldiq, qarzdorlik, tovar kartasi.

---

# TUZILMA

```
src/
  server.js              HTTP server + router
  db/schema.sql          1C uslubidagi sxema
  db/index.js            SQLite + migratsiyalar
  lib/http.js            router, statik fayllar
  lib/crypto.js          parol shaqlash (scrypt)
  services/stock.js      проведение / отмена проведения
  api/plan.js            2D bino rejasi + rasm
  api/warehouse.js       2D ombor xaritasi (joy tanlash)
  api/catalogs.js        kataloglar
  api/documents.js       hujjatlar
  api/registers.js       registrlar
  api/reports.js         hisobotlar
  api/system.js          login, foydalanuvchilar, eksport/import
public/
  js/pages/plan.js       bino rejasi, xona, tovar kartasi
  js/pages/pcard.js      rasm va ikonkalar
  js/pages/map.js        2D ombor xaritasi
  js/pages/editor.js     hujjat muharriri
  css/plan.css           bino rejasi uslubi
  css/warehouse.css      joy tanlash uslubi
  css/app.css            1C asosiy uslubi
data/
  ombor.db               ma’lumotlar bazasi
  uploads/               tovar rasmlari
  backups/               zaxira nusxalar
```

---

# ROLLAR

| Rol | Huquqlar |
|---|---|
| `ADMIN` | To‘liq |
| `WAREHOUSE_MANAGER` | Kataloglar, hujjatlar, проведение, joylash |
| `CASHIER` | Katalogni ko‘rish, hujjat yaratish, проведение |
| `OBSERVER` | Faqat ko‘rish va eksport |

# TEZKOR KALITLAR

- `F5` — sahifani yangilash
- `F2` — yangi kirim hujjati
- Barcode skaner — skaner maydoniga qariring, avtomatik qo‘shiladi
