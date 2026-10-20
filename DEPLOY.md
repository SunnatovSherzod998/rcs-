# 🚀 Vercel ga deploy / Развёртывание на Vercel

## Nima o'zgaradi / Что меняется

| | Lokal | Vercel |
|---|---|---|
| Server | `node src/server.js` (doimiy) | `api/index.js` (serverless function) |
| Ma'lumot bazasi | `data/ombor.db` (SQLite fayl) | **Turso** (libSQL — bulutda) |
| Sessiya | server xotirasida | HMAC imzolangan stateless token |
| Statik fayllar | `public/` | Vercel avtomatik beradi |

---

## 1-bosqich — Turso bazasi / Создание базы Turso

1. **https://turso.tech** → ro'yxatdan o'tish (GitHub bilan)
2. **New Database** → nom bering (masalan `crs-ombor`)
3. **Token** yarating: Dashboard → API Tokens → Create Token
4. `turso db show <db-name>` — URL va Token ni ko'rasiz

Yoki CLI bilan:
```bash
npm install -g @libsql/cli
turso login
turso db create crs-ombor
turso db show crs-ombor
```

---

## 2-bosqich — Vercel / Деплой на Vercel

### Variant A: Vercel CLI (tavsiya etiladi)

```bash
npm install -g vercel
vercel login
vercel
# Environment Variables:
#   TURSO_DATABASE_URL  = libsql://...
#   TURSO_AUTH_TOKEN   = eyJ...
#   SESSION_SECRET     = <uzun tasodifiy qator>
#   ADMIN_PASSWORD     = <kuchli parol>
vercel --prod
```

### Variant B: Vercel Dashboard (GitHub orqali)

1. **https://vercel.com** → **Add New** → **Project** → repo'ni tanlang
2. **Framework Preset**: `Other`
3. **Build Command**: bo'sh qoldiring (vercel.json da `null`)
4. **Output Directory**: `public` (vercel.json da belgilangan)
5. **Environment Variables** — yuqoridagi 4 ta kalitni qo'shing
6. **Deploy**

---

## 3-bosqich — Tekshirish / Проверка

```bash
curl https://your-app.vercel.app/api/health
# {"ok":true,"data":{"ok":true,"storage":"turso",...}}
```

Login: `admin` / `ADMIN_PASSWORD` da belgilangan parol.

---

## Mahalliy server bilan ishlash / Локальная разработка

```bash
node src/server.js          # http://localhost:3000
```

Lokal rejimda `TURSO_DATABASE_URL` yo'q bo'lsa — `data/ombor.db` fayli ishlatiladi.

Turso bilan lokal:
```bash
TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... node src/server.js
```

---

## Muhim / Важно

* **Turso bepul** — 1 GB ma'lumot, 1M qator/oy
* Ma'lumotlar **bulutda** saqlanadi — server o'chsa ham yo'qolmaydi
* `SESSION_SECRET` ni o'zgartirmang — aks holda barcha foydalanuvchilar chiqib qoladi
* Yangi funksiyalar qo'shishdan keyin `npm run build` o'rniga faqat `vercel --prod` yetarli

---

## Fayllar / Файлы

```
api/index.js          — Vercel serverless function
src/app.js            — platformaga bog'liq bo'lmagan yadros
src/server.js         — lokal server
src/db/index.js       — dual driver (lokal SQLite / Turso)
vercel.json           — Vercel konfiguratsiyasi
.env.example          — muhit o'zgaruvchilari namunasi
```
