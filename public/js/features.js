/**
 * SAYT FUNKSIYALARI / ФУНКЦИИ САЙТА
 *
 * Sozlamalar sahifasidan har bir bo'lim va funksiya galochka (✓) bilan
 * yoqilishi yoki olib tashlanishi mumkin.
 * O'chirilgan funksiya:
 *   — yon menyudan (sidebar) yashiriladi
 *   — to'g'ridan-to'g'ri URL orqali kirishda asosiy sahifaga yo'naltiriladi
 *   — tegishli tezkor amallar va vidjetlardan olib tashlanadi
 * Ma'lumotlar bazasi o'zgarmaydi — barcha arxiv va ma'lumotlar saqlanadi.
 */
import { api } from './api.js';

const uz = (a, b) => ({ uz: a, ru: b });

/** Hujjat turlarining funksiya kalitlari bilan bog'liqligi */
export const DOC_FEAT = {
  RECEIPT: 'kirim',
  ISSUE: 'chiqim',
  TRANSFER: 'transfer',
  PLACEMENT: 'joylash',
  PICK: 'yigish',
  INVENTORY: 'inventarizatsiya',
  PAYMENT: 'tolov',
  OPENING: 'boshlangich',
};

/** Guruhlar ro'yxati */
export const FEATURE_GROUPS = [
  { id: 'pos', label: uz('Kassa (Savdo)', 'Касса (Продажи)'), icon: '🛒' },
  { id: 'catalogs', label: uz('Kataloglar (Ma’lumotnomalar)', 'Справочники'), icon: '📁' },
  { id: 'documents', label: uz('Hujjatlar', 'Документы'), icon: '📋' },
  { id: 'registers', label: uz('Registrlar va Xaritalar', 'Регистры и карты'), icon: '📊' },
  { id: 'reports', label: uz('Hisobotlar', 'Отчёты'), icon: '📈' },
  { id: 'system', label: uz('Tizim va Xizmatlar', 'Система и сервисы'), icon: '⚙' },
];

/** Barcha boshqariladigan funksiyalar (menyu va guruh tartibida) */
export const FEATURES = [
  { group: uz('Kassa', 'Касса'), groupId: 'pos' },
  {
    key: 'pos',
    groupId: 'pos',
    icon: '🛒',
    label: uz('Tovarlarni sotish (POS)', 'Продажа товаров (POS)'),
    desc: uz('Kassir ish stoli, shtrix-kod skaner, tezkor savat va to‘lov cheklari', 'Рабочее место кассира, штрихкод-сканер, корзина и чеки'),
  },

  { group: uz('Kataloglar', 'Справочники'), groupId: 'catalogs' },
  {
    key: 'nomenklatura',
    groupId: 'catalogs',
    icon: '☰',
    label: uz('Nomenklatura (Mahsulotlar)', 'Номенклатура (Товары)'),
    desc: uz('Tovarlar, xizmatlar, shtrixkodlar, rasmlar va narxlar katalogi', 'Справочник товаров, услуг, штрихкодов, фото и цен'),
  },
  {
    key: 'omborlar',
    groupId: 'catalogs',
    icon: '🏢',
    label: uz('Omborlar', 'Склады'),
    desc: uz('Omborlar ro‘yxati, turlari, manzillari va javobgarlar', 'Список складов, типы, адреса и материально ответственные'),
  },
  {
    key: 'bino_reja',
    groupId: 'catalogs',
    icon: '🏬',
    label: uz('Bino rejasi (2D)', 'План здания (2D)'),
    desc: uz('Bino qavatlari, xonalar va stellajlar 2D chizmasi', '2D поэтажный план здания, комнат и стеллажей'),
  },
  {
    key: 'joylashuvlar',
    groupId: 'catalogs',
    icon: '▤',
    label: uz('Joylashuvlar', 'Места хранения'),
    desc: uz('Xonalar, stellajlar, qator va yacheykalar daraxti', 'Комнаты, стеллажи, ряды и ячейки хранения'),
  },
  {
    key: 'kontragentlar',
    groupId: 'catalogs',
    icon: '👤',
    label: uz('Kontragentlar', 'Контрагенты'),
    desc: uz('Mijozlar, yetkazib beruvchilar va hamkorlar bazasi', 'База покупателей, поставщиков и контрагентов'),
  },
  {
    key: 'toifalar',
    groupId: 'catalogs',
    icon: '◈',
    label: uz('Mahsulot toifalari', 'Категории товаров'),
    desc: uz('Tovarlar guruhlari va ierarxik toifalari', 'Иерархические категории и группы товаров'),
  },
  {
    key: 'brendlar',
    groupId: 'catalogs',
    icon: '★',
    label: uz('Brendlar', 'Бренды'),
    desc: uz('Ishlab chiqaruvchilar va tovar brendlari ro‘yxati', 'Список производителей и брендов товаров'),
  },
  {
    key: 'birliklar',
    groupId: 'catalogs',
    icon: '⚖',
    label: uz('O‘lchov birliklari', 'Единицы измерения'),
    desc: uz('Dona, kg, metr, quti va boshqa hisob birliklari', 'Штуки, кг, метры, коробки и единицы измерения'),
  },
  {
    key: 'xodimlar',
    groupId: 'catalogs',
    icon: '🧑',
    label: uz('Xodimlar', 'Сотрудники'),
    desc: uz('Xodimlar ro‘yxati, lavozimlar va mas’ul shaxslar', 'Список сотрудников, должности и ответственные лица'),
  },
  {
    key: 'valyutalar',
    groupId: 'catalogs',
    icon: '₽',
    label: uz('Valyutalar', 'Валюты'),
    desc: uz('Valyutalar ro‘yxati va ayirboshlash kurslari', 'Валюты и курсы обмена валют'),
  },

  { group: uz('Hujjatlar', 'Документы'), groupId: 'documents' },
  {
    key: 'jurnal',
    groupId: 'documents',
    icon: '📋',
    label: uz('Hujjatlar jurnali', 'Журнал документов'),
    desc: uz('Barcha kirim, chiqim va ichki amallarning umumiy jurnali', 'Общий журнал всех складских документов и операций'),
  },
  {
    key: 'kirim',
    groupId: 'documents',
    icon: '↓',
    label: uz('Kirim (Приход)', 'Приход (Поступление)'),
    desc: uz('Yetkazib beruvchilardan tovarlarni qabul qilish hujjati', 'Оприходование товаров от поставщиков'),
  },
  {
    key: 'chiqim',
    groupId: 'documents',
    icon: '↑',
    label: uz('Chiqim (Расход)', 'Расход (Отгрузка)'),
    desc: uz('Tovarlarni xaridorlarga sotish yoki hisobdan chiqarish', 'Отгрузка покупателям и списание товаров'),
  },
  {
    key: 'transfer',
    groupId: 'documents',
    icon: '⇄',
    label: uz('Ko‘chirish (Перемещение)', 'Перемещение'),
    desc: uz('Omborlar o‘rtasida tovarlarni siljitish va ko‘chirish', 'Перемещение товаров между складами'),
  },
  {
    key: 'joylash',
    groupId: 'documents',
    icon: '▩',
    label: uz('Joylash (Размещение)', 'Размещение'),
    desc: uz('Tovarlarni qabuldan saqlash joylariga taqsimlash', 'Размещение товаров по ячейкам склада'),
  },
  {
    key: 'yigish',
    groupId: 'documents',
    icon: '▤',
    label: uz('Yig‘ish (Выборка)', 'Выборка'),
    desc: uz('Buyurtma bo‘yicha tovarlarni yacheykalardan yig‘ish', 'Сборка и комплектация заказов из ячеек'),
  },
  {
    key: 'inventarizatsiya',
    groupId: 'documents',
    icon: '☑',
    label: uz('Inventarizatsiya', 'Инвентаризация'),
    desc: uz('Faktik qoldiqni sanash va kamomad/ortiqchani aniqlash', 'Сверка фактических остатков и инвентаризация'),
  },
  {
    key: 'tolov',
    groupId: 'documents',
    icon: '₽',
    label: uz('To‘lov', 'Оплата'),
    desc: uz('Kassa kirim va chiqim orderlari, pul to‘lovlari', 'Приходные и расходные кассовые ордера'),
  },
  {
    key: 'boshlangich',
    groupId: 'documents',
    icon: '⏱',
    label: uz('Boshlang‘ich qoldiq', 'Начальные остатки'),
    desc: uz('Tizimni ishga tushirishdagi dastlabki tovar qoldiqlari', 'Ввод начальных остатков при запуске'),
  },

  { group: uz('Registrlar', 'Регистры'), groupId: 'registers' },
  {
    key: 'qoldiqlar',
    groupId: 'registers',
    icon: '▦',
    label: uz('Qoldiqlar', 'Остатки'),
    desc: uz('Omborlar va joylashuvlar bo‘yicha joriy tovar qoldiqlari', 'Текущие остатки товаров по складам и местам'),
  },
  {
    key: 'harakatlar',
    groupId: 'registers',
    icon: '⇅',
    label: uz('Harakatlar', 'Движения'),
    desc: uz('Barcha kirim-chiqim operatsiyalari batafsil xronologiyasi', 'Хронология всех складских движений и проводок'),
  },
  {
    key: 'aylanma',
    groupId: 'registers',
    icon: '🧾',
    label: uz('Aylanma hisobdorlik (OSV)', 'Оборотно-сальдовая (ОСВ)'),
    desc: uz('Boshlang‘ich qoldiq, aylanma va oxirgi qoldiq hisoboti', 'Оборотно-сальдовая ведомость по товарам'),
  },
  {
    key: 'qarz',
    groupId: 'registers',
    icon: '⇄',
    label: uz('Qarzdorliklar', 'Взаиморасчёты'),
    desc: uz('Mijoz va ta’minotchilar bilan o‘zaro hisob-kitoblar', 'Взаиморасчёты с клиентами и поставщиками'),
  },
  {
    key: 'narxlar',
    groupId: 'registers',
    icon: '¤',
    label: uz('Narxlar', 'Цены'),
    desc: uz('Tovarlarning kirim va sotuv narxlari tarixi', 'История цен закупки и реализации товаров'),
  },

  { group: uz('Hisobotlar', 'Отчёты'), groupId: 'reports' },
  {
    key: 'his_aylanma',
    groupId: 'reports',
    icon: '📈',
    label: uz('Tovar aylanmasi', 'Обороты товаров'),
    desc: uz('Tanlangan davr uchun tovarlar kirim-chiqim dinamikasi', 'Анализ товарооборота за выбранный период'),
  },
  {
    key: 'his_sotuv',
    groupId: 'reports',
    icon: '💰',
    label: uz('Sotuvlar hisoboti', 'Отчёт по продажам'),
    desc: uz('Sotilgan tovarlar, tushum va xaridorlar hisoboti', 'Отчёт по продажам, выручке и клиентам'),
  },
  {
    key: 'his_xarid',
    groupId: 'reports',
    icon: '🛒',
    label: uz('Xaridlar hisoboti', 'Отчёт по закупкам'),
    desc: uz('Yetkazib beruvchilardan olingan tovarlar hisoboti', 'Отчёт по закупкам у поставщиков'),
  },
  {
    key: 'his_foyda',
    groupId: 'reports',
    icon: '📊',
    label: uz('Foyda va zarar', 'Прибыль и убыток'),
    desc: uz('Savdo rentabelligi, yalpi foyda va marja tahlili', 'Финансовый результат, прибыль и маржинальность'),
  },
  {
    key: 'his_yozib',
    groupId: 'reports',
    icon: '🗑',
    label: uz('Yozib tashlash (Spisaniya)', 'Списания товаров'),
    desc: uz('Buzilgan yoki yaroqsiz tovarlarni hisobdan chiqarish', 'Отчёт по списанным товарам'),
  },
  {
    key: 'his_invdiff',
    groupId: 'reports',
    icon: '⚖',
    label: uz('Inventar farqlari', 'Инвентарные разницы'),
    desc: uz('Inventarizatsiya natijasidagi kamomad va ortiqchalar', 'Недостачи и излишки по инвентаризации'),
  },
  {
    key: 'his_min',
    groupId: 'reports',
    icon: '🔻',
    label: uz('Min. qoldiqdan kam', 'Мин. остаток'),
    desc: uz('Qoldig‘i belgilangan me’yordan kamayib ketgan tovarlar', 'Товары с остатком ниже минимального'),
  },

  { group: uz('Tizim', 'Система'), groupId: 'system' },
  {
    key: 'boshqaruv_paneli',
    groupId: 'system',
    icon: '▦',
    label: uz('Boshqaruv paneli', 'Панель управления'),
    desc: uz('Asosiy umumiy ko‘rsatkichlar (KPI) va tezkor dashboard', 'Главный дашборд и основные KPI показатели'),
  },
  {
    key: 'foydalanuvchilar',
    groupId: 'system',
    icon: '🛡',
    label: uz('Foydalanuvchilar', 'Пользователи'),
    desc: uz('Foydalanuvchi hisoblari, rollar va tizim huquqlari', 'Учётные записи, роли и права доступа пользователей'),
  },
  {
    key: 'ma_lumotlar',
    groupId: 'system',
    icon: '💾',
    label: uz('Ma’lumotlar', 'Данные'),
    desc: uz('Excel / CSV formatida eksport va import qilish', 'Импорт и экспорт данных в формате CSV'),
  },
  {
    key: 'audit',
    groupId: 'system',
    icon: '📜',
    label: uz('Amallar jurnali (Audit)', 'Журнал действий'),
    desc: uz('Foydalanuvchilarning tizimdagi barcha amallari auditi', 'Журнал аудита действий пользователей'),
  },
  {
    key: 'sozlamalar',
    groupId: 'system',
    icon: '⚙',
    label: uz('Sozlamalar (Asosiy)', 'Настройки (Основные)'),
    desc: uz('Tizim parametrlari va funksiyalarni boshqarish paneli', 'Основные параметры системы и управление функциями'),
    locked: true,
  },
];

/** Faqat funksiya kalitlari (guruh emas) */
export const FEATURE_KEYS = FEATURES.filter((f) => f.key).map((f) => f.key);

let flags = null;   // null = yuklanmagan

export async function loadFeatures(force) {
  if (flags && !force) return flags;
  try {
    const data = await api.get('/api/features');
    // kalit yo'q bo'lsa — yoqilgan (default: hammasi ochiq)
    flags = Object.fromEntries(FEATURE_KEYS.map((k) => [k, data?.[k] === undefined ? 1 : Number(data[k])]));
  } catch {
    flags = Object.fromEntries(FEATURE_KEYS.map((k) => [k, 1]));
  }
  // Sozlamalar har doim yoqilgan qoladi
  flags.sozlamalar = 1;
  return flags;
}

/** Funksiya yoniqmi? Hali yuklanmagan bo'lsa — ha deb hisoblaydi */
export function feat(key) {
  if (!key) return true;
  if (key === 'sozlamalar') return true;
  if (!flags) return true;
  return flags[key] !== 0;
}

export function getFlags() { return flags || {}; }

export function clearFeatures() { flags = null; }

/**
 * Saqlash uchun { feat_pos: '1', ... } shakliga o'tkazish
 * Map yoki Oddiy obyekt yoki Kalitlar massivini qabul qiladi
 */
export function toSettings(mapOrObj) {
  const out = {};
  if (mapOrObj instanceof Map) {
    for (const [k, v] of mapOrObj.entries()) {
      out['feat_' + k] = v ? '1' : '0';
    }
  } else if (mapOrObj && typeof mapOrObj === 'object' && !Array.isArray(mapOrObj)) {
    for (const [k, v] of Object.entries(mapOrObj)) {
      out['feat_' + k] = v ? '1' : '0';
    }
  } else if (Array.isArray(mapOrObj)) {
    for (const k of mapOrObj) {
      out['feat_' + k] = feat(k) ? '1' : '0';
    }
  }
  // Sozlamalar har doim faol saqlanadi
  out['feat_sozlamalar'] = '1';
  return out;
}