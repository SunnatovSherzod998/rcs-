/**
 * Tovar rasmlari va ikonkalari.
 * Rasmdan foydalanilmasa — kategoriya bo'yicha emoji va rang bilan tasvir.
 */
import { h } from '../ui.js';
import { getLang } from '../i18n.js';

/** Kategoriya bo'yicha emoji (rasm yo'q holat uchun) */
const ICONS = {
  'Электроника': '📺', 'Elektronika': '📺',
  'Бытовая техника': '🔌', 'Uy-ro‘zg‘ol': '🔌',
  'Строительство': '🧱', 'Qurilish': '🧱',
  'Одежда': '👕', 'Kiyim': '👕',
  'Медикаменты': '💊', 'Dorilar': '💊',
  'Продукты': '🍎', 'Oziq-ovqat': '🍎',
  'Канцелярия': '✏️',
  'Автозапчасти': '🚗', 'Avto': '🚗',
  'Металл': '⚙️', 'Metall': '⚙️',
  'Пластмасса': '🧴',
  'Бумага': '📦',
  'Химия': '🧪', 'Kimiyo': '🧪',
  'Топливо': '⛽',
};

/** Toifaga mos ikonka */
export function productIcon(category) {
  if (!category) return '📦';
  return ICONS[category] || '📦';
}

/** Toifa bo'yicha barqaror rang (kartochka foni uchun) */
const COLORS = {
  'Электроника': '#e8f0f8', 'Elektronika': '#e8f0f8',
  'Бытовая техника': '#e4f5ec', 'Uy-ro‘zg‘ol': '#e4f5ec',
  'Строительство': '#fdf3e0', 'Qurilish': '#fdf3e0',
  'Одежда': '#f3ecf8', 'Kiyim': '#f3ecf8',
  'Медикаменты': '#fbe6e5', 'Dorilar': '#fbe6e5',
};

export function productColor(category) {
  return COLORS[category] || '#eef1f5';
}

/**
 * Kichik rasm (thumbnail).
 * @param {object} p  {sku, name_ru, name_uz, image_url, category}
 * @param {object} opts {size, cls}
 */
export function productThumb(p, opts = {}) {
  const size = opts.size || 46;
  const box = h('div', {
    class: opts.cls || 'p-img',
    style: {
      width: size + 'px', height: size + 'px',
      background: p.image_url ? '#e9edf2 center/cover no-repeat' : productColor(p.category),
    },
    title: p.sku,
  });
  if (p.image_url) box.append(h('img', { src: p.image_url, alt: p.sku, loading: 'lazy' }));
  else box.append(h('span', { text: productIcon(p.category), style: { fontSize: Math.round(size / 2.4) + 'px' } }));
  return box;
}

/** Toifaga mos tasodifiy rang (SKU bo'yicha barqaror) */
export function skuColor(sku) {
  const palette = ['#1f4e79', '#2b6ba8', '#1a7f4b', '#b26b00', '#6b5b95', '#0d7d8c', '#a8322a', '#4a6741'];
  let hash = 0;
  for (const ch of String(sku || '')) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

/** Xona turlari (server bilan bir xil) */
export const KIND_LABELS = {
  STORAGE:    { uz: 'Saqlash', ru: 'Хранение' },
  RECEIVING:  { uz: 'Qabul qilish', ru: 'Приёмка' },
  SHIPPING:   { uz: 'Yuborish', ru: 'Отгрузка' },
  COOLING:    { uz: 'Sovuq xona', ru: 'Холодная' },
  QUARANTINE: { uz: 'Karantin', ru: 'Карантин' },
  BUFFER:     { uz: 'Bufer', ru: 'Буфер' },
};

/**
 * Rasmli katalog jadvali uchun ustun render.
 */
export function imageCell(p) {
  return productThumb(p, { size: 34, cls: 'p-img' });
}
