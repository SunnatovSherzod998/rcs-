/**
 * IKKI TILLI TARJIMA / ДВУХЯЗЫЧНЫЙ ИНТЕРФЕЙС
 * (1C uslubidagi o'zbekcha + ruscha)
 */
export const STR = {
  // ---------------- umumiy
  app_name:        ['CRS', 'CRS'],
  app_subtitle:    ['Ombor boshqaruv tizimi', 'Система управления складом'],
  login:           ['Kirish', 'Вход'],
  logout:          ['Chiqish', 'Выход'],
  username:        ['Login', 'Логин'],
  password:        ['Parol', 'Пароль'],
  show_password:   ['Parolni ko‘rsatish', 'Показать пароль'],
  hide_password:   ['Parolni yashirish', 'Скрыть пароль'],
  login_hint:      ['', ''],
  sign_in:         ['Tizimga kiritish', 'Войти'],
  loading:         ['Yuklanmoqda…', 'Загрузка…'],
  save:            ['Saqlash', 'Сохранить'],
  cancel:          ['Bekor qilish', 'Отмена'],
  close:           ['Yopish', 'Закрыть'],
  edit:            ['Tahrirlash', 'Изменить'],
  add:             ['Qo‘shish', 'Добавить'],
  delete:          ['O‘chirish', 'Удалить'],
  refresh:         ['Yangilash', 'Обновить'],
  search:          ['Qidirish…', 'Поиск…'],
  search_ph:       ['Qidirish uchun yozing…', 'Введите для поиска…'],
  no_data:         ['Ma’lumot topilmadi', 'Нет данных'],
  total:           ['Jami', 'Итого'],
  actions:         ['Amallar', 'Действия'],
  name:            ['Nomi', 'Наименование'],
  code:            ['Kod', 'Код'],
  all:             ['Barchasi', 'Все'],
  yes:             ['Ha', 'Да'],
  no:              ['Yo‘q', 'Нет'],
  from:            ['dan', 'с'],
  to:              ['gacha', 'по'],
  date:            ['Sana', 'Дата'],
  filter:          ['Filtr', 'Фильтр'],
  apply:           ['Qo‘llash', 'Применить'],
  reset:           ['Tozalash', 'Сброс'],
  export:          ['Excel (CSV)', 'Excel (CSV)'],
  import:          ['Import (CSV)', 'Импорт (CSV)'],
  print:           ['Chop etish', 'Печать'],
  confirm:         ['Tasdiqlaysizmi?', 'Подтвердите?'],
  saved:           ['Saqlandi', 'Сохранено'],
  deleted:         ['O‘chirildi', 'Удалено'],
  language:        ['O‘zbekcha', 'Русский'],
  registers:       ['Registrlar', 'Регистры'],
  reports:         ['Hisobotlar', 'Отчёты'],
  page:            ['Sahifa', 'Страница'],
  of:              ['dan', 'из'],
  rows_per_page:   ['Qator', 'строк'],
  required_field:  ['To‘ldirish shart', 'Обязательное поле'],
  choose:          ['Tanlang', 'Выберите'],
  copy:            ['Nusxa olish', 'Копировать'],
  qty:             ['Miqdor', 'Количество'],
  price:           ['Narx', 'Цена'],
  amount:          ['Summa', 'Сумма'],
  cost:            ['Tannarx', 'Себестоимость'],
  note:            ['Izoh', 'Примечание'],
  warehouse:       ['Ombor', 'Склад'],
  product:         ['Tovar', 'Товар'],
  qty_short:       ['Qold.', 'Ост.'],
  error:           ['Xato', 'Ошибка'],

  // ---------------- menyu
  m_dashboard:     ['Boshqaruv paneli', 'Панель управления'],
  m_catalogs:      ['Spravochniklar', 'Справочники'],
  m_products:      ['Nomenklatura', 'Номенклатура'],
  m_warehouses:    ['Omborlar', 'Склады'],
  m_plan:          ['Bino rejasi (2D)', 'План здания (2D)'],
  m_map2d:         ['2D ombor xaritasi', '2D карта склада'],
  m_locations:     ['Joylashuvlar', 'Места хранения'],
  m_counterparties:['Kontragentlar', 'Контрагенты'],
  m_categories:    ['Toifalar', 'Категории'],
  m_brands:        ['Brendlar', 'Бренды'],
  m_units:         ['O‘lchov birliklari', 'Единицы измерения'],
  m_currencies:    ['Valyutalar', 'Валюты'],
  m_employees:     ['Xodimlar', 'Сотрудники'],
  m_documents:     ['Hujjatlar', 'Документы'],
  m_journal:       ['Hujjatlar jurnali', 'Журнал документов'],
  m_pos:           ['Tovarlarni sotish', 'Продажа товаров'],
  m_receipt:       ['Kirim (Приход)', 'Приход'],
  m_issue:         ['Chiqim (Расход)', 'Расход'],
  m_transfer:      ['Ko‘chirish', 'Перемещение'],
  m_placement:     ['Joylash (Размещение)', 'Размещение'],
  m_pick:          ['Yig‘ish (Выборка)', 'Выборка'],
  m_inventory:     ['Inventarizatsiya', 'Инвентаризация'],
  m_payment:       ['To‘lov', 'Оплата'],
  m_opening:       ['Boshlang‘ich qoldiq', 'Начальные остатки'],
  m_registers:     ['Registrlar', 'Регистры'],
  m_balances:      ['Qoldiqlar', 'Остатки'],
  m_movements:     ['Harakatlar', 'Движения'],
  m_turnover:      ['Aylanma hisobdorlik', 'Оборотно-сальдовая'],
  m_debt:          ['Qarzdorliklar', 'Взаиморасчёты'],
  m_prices:        ['Narxlar', 'Цены'],
  m_reports:       ['Hisobotlar', 'Отчёты'],
  m_sales:         ['Sotuvlar', 'Продажи'],
  m_purchases:     ['Xaridlar', 'Закупки'],
  m_profit:        ['Foyda va zarar', 'Прибыли и убытки'],
  m_writeoff:      ['Yozib tashlash', 'Списания'],
  m_invdiff:       ['Inventar farqlari', 'Расхождения инвентаризации'],
  m_belowmin:      ['Min. qoldiq', 'Мин. остаток'],
  m_turnover_md:   ['Kirim/Chiqim', 'Приход/Расход'],
  m_data:          ['Ma’lumotlar', 'Данные'],
  m_system:        ['Tizim', 'Система'],
  m_users:         ['Foydalanuvchilar', 'Пользователи'],
  m_settings:      ['Sozlamalar', 'Настройки'],
  m_audit:         ['Amallar jurnali', 'Журнал действий'],
  m_backup:        ['Zaxira nusxa', 'Резервная копия'],

  // ---------------- hujjat
  doc_number:      ['Raqam', 'Номер'],
  doc_date:        ['Sana', 'Дата'],
  doc_status:      ['Holati', 'Состояние'],
  doc_type:        ['Turi', 'Тип'],
  post:            ['O‘tkazish', 'Провести'],
  unpost:          ['Bekor o‘tkazish', 'Отменить проведение'],
  new_doc:         ['Yangi hujjat', 'Новый документ'],
  edit_doc:        ['Hujjatni tahrirlash', 'Редактирование документа'],
  counterparty:    ['Kontragent', 'Контрагент'],
  dest_warehouse:  ['Qabul qiluvchi ombor', 'Склад-получатель'],
  line_no:         ['№', '№'],
  add_line:        ['Qator qo‘shish', 'Добавить строку'],
  no_lines:        ['Qatorlar yo‘q. «Qator qo‘shish» bosing.', 'Нет строк. Нажмите «Добавить строку»'],
  scan:            ['Skaner', 'Сканер'],
  scan_hint:       ['Skaner yoki SKU kiriting va Enter bosing', 'Отсканируйте или введите SKU и нажмите Enter'],
  price_suggest:   ['Tannarxdan', 'По себестоимости'],
  paid:            ['To‘langan', 'Оплачено'],
  not_enough:      ['Yetarli emas', 'Недостаточно'],
  available:       ['Mavjud', 'Доступно'],
  opened:          ['Ochildi', 'Открыт'],
  created:         ['Yaratildi', 'Создан'],
  posted_at:       ['O‘tkazilgan', 'Проведён'],
  posted_by:       ['O‘tkazgan', 'Провёл'],
  reason:          ['Sabab', 'Причина'],
  currency:        ['Valyuta', 'Валюта'],
  rate:            ['Kurs', 'Курс'],
  pay_direction:   ['To‘lov yo‘nalishi', 'Направление оплаты'],
  pay_in:          ['Mijozdan oldim', 'Получено от клиента'],
  pay_out:         ['Yetkazib beruvchiga to‘ladim', 'Оплачено поставщику'],

  // ---------------- status
  st_draft:        ['Qoralamа (DRAFT)', 'Черновик (DRAFT)'],
  st_posted:       ['O‘tkazilgan (POSTED)', 'Проведён (POSTED)'],
  st_cancelled:    ['Bekor qilingan', 'Отменён'],

  // ---------------- dashboard
  d_total_stock:   ['Tovar qiymati', 'Стоимость товара'],
  d_positions:     ['Pozitsiyalar', 'Позиций'],
  d_products:      ['Tovarlar', 'Товаров'],
  d_drafts:        ['Qoralamalar', 'Черновики'],
  d_below_min:     ['Min. qoldiqdan past', 'Ниже минимума'],
  d_negative:      ['Manfiy qoldiq', 'Отрицательные остатки'],
  d_recent:        ['Oxirgi hujjatlar', 'Последние документы'],
  d_alerts:        ['Ogohlantirishlar', 'Предупреждения'],
  d_debt:          ['Kontragentlar qarzi', 'Долги контрагентов'],
  d_chart:         ['Kirim / Chiqim', 'Приход / Расход'],
  d_movements30:   ['Oxirgi 30 kun', 'Последние 30 дней'],
  d_no_alerts:     ["Ogohlantirish yo'q. Ajoyib!", 'Предупреждений нет. Отлично!'],

  // ---------------- ishchilar oyligi
  m_salary:        ['Ishchilar oyligi', 'Зарплаты сотрудников'],
  salary_employee: ['Xodim', 'Сотрудник'],
  salary_position: ['Lavozim', 'Должность'],
  salary_base:     ['Oylik (so\'m)', 'Оклад (сум)'],
  salary_limit:    ['Sotuv limiti', 'Лимит продаж'],
  salary_bonus_pct:['Bonus foizi (%)', 'Процент бонуса (%)'],
  salary_month_sales:['Oylik sotuv', 'Продажи за месяц'],
  salary_over:     ['Limitdan oshgan', 'Сверх лимита'],
  salary_pending_bonus:['Kutilayotgan bonus', 'Ожидаемый бонус'],
  salary_paid_bonus:['Berilgan bonus', 'Выплаченный бонус'],
  salary_total:    ['Jami oylik', 'Итого зарплата'],
  salary_history:  ['Bonus tarixi', 'История бонусов'],
  salary_sale_amount:['Sotuv summasi', 'Сумма продажи'],
  salary_over_limit:['Limitdan oshgan', 'Сверх лимита'],
  salary_bonus_amount:['Bonus summasi', 'Сумма бонуса'],
  salary_doc:      ['Hujjat', 'Документ'],
  salary_month:    ['Oy', 'Месяц'],
  salary_save:    ['Saqlash', 'Сохранить'],
  salary_no_limit: ['Cheksiz', 'Без лимита'],

  // ---------------- mening statistikam
  my_stats:          ['Mening statistikam', 'Моя статистика'],
  no_employee_link:  ['Sizga xodim biriktirilmagan',
                      'Вы не привязаны к сотруднику'],
};

let lang = localStorage.getItem('ombor_lang') || 'uz';

export function setLang(l) { lang = l; localStorage.setItem('ombor_lang', l); }
export function getLang() { return lang; }
export function toggleLang() { setLang(lang === 'uz' ? 'ru' : 'uz'); return lang; }

/** t('save') -> "Saqlash" | "Сохранить" */
export function t(key) {
  const v = STR[key];
  if (!v) {
    // dinamik kalitlar: t('m_' + name) → to'liq kalitni qayta urinish
    if (typeof key === 'string' && key.endsWith('_')) {
      const full = key + (key.startsWith('m_') ? '' : '');
      if (STR[full]) return lang === 'uz' ? STR[full][0] : STR[full][1];
    }
    return key;
  }
  return lang === 'uz' ? v[0] : v[1];
}

/** t() ga xavfsiz variant — yo'q kalit bo'lsa bo'sh qaytaradi */
export function tt(key) {
  const v = STR[key];
  if (!v) return '';
  return lang === 'uz' ? v[0] : v[1];
}

/** I18n obyektidan maydonga tarjima (server deskriptorlari uchun) */
export function tl(obj) {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  if (obj.uz && obj.ru) return lang === 'uz' ? obj.uz : obj.ru;
  return '';
}

/** Server maydonlaridan ko'p tilli qiymat olish */
export function fn(row, ...names) {
  for (const n of names) {
    const v = row[n];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return '';
}
