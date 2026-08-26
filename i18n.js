export const translations = {
    en: {
        "app_title": "Price & Text Tracker",
        "settings_btn": "Settings",
        "refresh_all_btn": "🔄 Refresh All",
        "refreshing": "⏳ Refreshing...",
        "started": "✅ Started!",
        "no_items": "No tracked items.",
        "best_price": "Best price",
        "current_price": "Current price",
        "no_data": "No data",
        "checked": "Checked",
        "refresh_btn": "🔄 Refresh",
        "products": "products",
        "history_title": "History",
        "select_cat_name": "Please select or enter a category name!",
        "added_success": "Successfully added!",
        "export_no_data": "No data for export.",
        "import_no_file": "Please select a .json file for import.",
        "import_error_read": "Error reading file! Make sure it is a valid JSON.",
        "open": "Open",
        "yes": "Yes",
        "no": "No",
        "min": "min",
        "site": "Site",
        "fill_all_fields": "Please fill all fields correctly.",
        "drive_search_error": "Error searching Drive: ",
        "no_change": "No change",
        "price_dropped": "Drop",
        "price_increased": "Increase",
        "refresh_all_title": "Refresh all",
        "history_btn": "📈 History",
        "delete_btn": "🗑️ Delete",
        "edit_btn": "✏️ Edit",
        
        "tab_products": "Products & Categories",
        "tab_settings": "Settings & Data",
        "add_new_site": "Add new tracking site",
        "url_label": "URL Address",
        "selector_label": "CSS Selector",
        "pick_from_page": "🖱️ Pick from page",
        "category_label": "Category / Group",
        "choose_existing": "-- Choose existing category --",
        "create_new_cat": "➕ Create new category...",
        "cat_name_label": "New Category Name",
        "type_label": "Type",
        "type_price": "Price (track drops)",
        "type_text": "Text (track changes)",
        "interval_label": "Interval (minutes)",
        "jitter_label": "Jitter (minutes)",
        "macro_label": "Use Macro (Scroll & Wait - required for Amazon/eMAG)",
        "add_to_list": "Add to list",
        "tracked_items": "Tracked Items",
        "refresh_all_now": "🔄 Refresh all now",
        "global_settings": "Global Settings",
        "enable_notif": "Enable Push notifications",
        "enable_sound": "Enable Sound notifications",
        "language_label": "Language",
        "theme_label": "Theme (Dark/Light Mode)",
        "theme_auto": "Auto (OS default)",
        "theme_light": "Light",
        "theme_dark": "Dark",
        "save_settings": "Save settings",
        "data_management": "Data Management (Import / Export)",
        "data_desc": "Product data is saved separately from settings so you can share it freely.",
        "export_data": "Export Data",
        "export_desc": "Choose which categories to share/save:",
        "export_btn": "Export Selected (JSON)",
        "import_data": "Import Data",
        "import_desc": "Add previously saved products to your current list.",
        "import_btn": "Import",
        "google_drive_sync": "☁️ Google Drive Sync",
        "drive_desc": "Backup your settings and products to a secure, hidden folder in your Google Drive.",
        "drive_backup": "⬆️ Create Backup",
        "drive_restore": "⬇️ Restore from Google Drive",
        
        "confirm_delete_item": "Are you sure you want to delete this item?",
        "confirm_delete_cat": "Delete the ENTIRE category and all its items?",
        "history_no_data": "No history data for this item.",
        "history_no_prices": "Charts are only supported for prices, not text.",
        "history_cat_empty": "No items in this category.",
        "history_cat_no_prices": "No price history for items in this category.",
        "history_chart_title_site": "Price History for 1 site",
        "history_chart_title_cat": "Lowest price history for",
        "lowest_price_all": "Lowest price (all sites)",
        "settings_saved": "Settings saved successfully!",
        "changes_saved": "Changes saved successfully!",
        "enter_url_first": "Please enter a valid URL first to open the page and pick an element.",
        "loading": "⏳ Loading...",
        "import_success": "Data imported successfully!",
        "import_error": "Error importing data. Is the JSON valid?",
        "export_empty": "Please select at least one category to export.",
        "connecting_drive": "Connecting to Google Drive...",
        "searching_backup": "Searching for previous backup...",
        "uploading_data": "Uploading data...",
        "drive_update_fail": "Failed to update file.",
        "drive_create_fail": "Failed to create file.",
        "drive_success": "✅ Successfully saved to Google Drive!",
        "drive_warn_restore": "Warning: This will overwrite your current products and settings with those from Google Drive. Continue?",
        "drive_no_backup": "❌ No backup found in Google Drive.",
        "downloading_data": "Downloading data...",
        "drive_download_err": "Error downloading.",
        "drive_restore_success": "✅ Successfully restored! Reloading...",
        "drive_corrupt": "❌ Backup file is empty or corrupted.",
        "error_prefix": "❌ Error: ",
        "check_progress": "⏳ Checking...",
        "check_done": "✅ Done! Reloading...",

        "price_drop": "Price Drop!",
        "text_change": "Text Changed!",
        "price_drop_msg": "The price dropped to",
        "text_change_msg": "The text changed to",
        
        "options_page_title": "Settings | Price Tracker Pro",
        "options_main_title": "Price & Text Tracker Pro - Dashboard",
        "cat_name_placeholder": "Enter name for the new item...",
        "selector_placeholder": "e.g. .price-tag or #main-price",
        "jitter_title": "Random delay to avoid bot detection",
        "price_history_modal": "Price History",
        "edit_site_title": "Edit Tracked Site",
        "save_changes_btn": "💾 Save changes",
        "use_lowest_price_label": "Take lowest price if multiple found in hierarchy (for promos/discounts)",
        "duplicate_exact_error": "This website with the same selector is already being tracked in category \"{cat}\"!",
        "duplicate_overlap_confirm": "This website is already tracked in category \"{cat}\" with an overlapping selector:\n\"{sel}\"\n\nAre you sure you want to add another overlapping field for this site?",
        "duplicate_same_url_confirm": "You are already tracking this website in category \"{cat}\" (selector: \"{sel}\").\n\nDo you want to add an additional field for this page?",
        "duplicate_scanner_title": "🔍 Duplicate & Overlap Scanner",
        "duplicate_scanner_desc": "Scan all categories for duplicate websites, identical or overlapping price tracking fields.",
        "scan_duplicates_btn": "🔍 Scan for duplicates now",
        "auto_clean_duplicates_btn": "🧹 Auto-remove exact duplicates",
        "scan_no_duplicates": "✅ No duplicate websites or overlapping fields found. All entries are unique!",
        "scan_found_summary": "Found {count} website(s) with multiple or overlapping tracking entries:",
        "badge_exact_duplicate": "Exact Duplicate",
        "badge_overlapping": "Overlapping Field",
        "badge_same_site": "Same Site",
        "auto_clean_success": "Successfully removed {count} duplicate item(s)!",
        "no_exact_duplicates_to_clean": "No exact duplicates found to auto-clean.",
        "delete_duplicate_btn": "🗑️ Delete",

        "context_menu_add": "Add to Price Tracker",
        "context_menu_pick": "Pick element for PriceTracker",
        "notif_new_lowest": "New lowest price: ",
        "notif_text_changed": "Text was changed.",
        "notif_price_drop_title": "🚨 Price Drop!",
        "notif_site_update_title": "🔄 Site Updated!",
        "notif_check_site": "Check: ",

        "picker_select_element": "Select Element",
        "picker_space_pause": "Press SPACE to pause (Esc to exit)",
        "picker_paused": "PAUSED (Press SPACE to continue)",
        "picker_selector": "🎯 Selector:",
        "check_failed_prefix": "Check failed",
        "check_failed": "Check failed (website changed, unreachable or blocked)",
        "err_tab_closed": "Tab was closed before check completed",
        "err_timeout": "Timeout (35s) or tab unresponsive",
        "err_open_tab": "Failed to open background tab",
        "err_inject": "Failed to inject script into page",
        "err_element_not_found": "Element not found on page (selector may have changed)",
        "err_invalid_price": "Extracted price is not a valid number",
        "last_check_failed": "Last check failed",
        "last_check": "Last check",
        "last_attempt": "Last attempt"
    },
    bg: {
        "app_title": "Price & Text Tracker",
        "settings_btn": "Настройки",
        "refresh_all_btn": "🔄 Опресни всички",
        "refreshing": "⏳ Опресняване...",
        "started": "✅ Стартирано!",
        "no_items": "Няма добавени артикули.",
        "best_price": "Най-ниска цена",
        "current_price": "Текуща цена",
        "no_data": "Няма данни",
        "checked": "Проверен",
        "refresh_btn": "🔄 Опресни",
        "products": "продукта",
        "history_title": "История",
        "select_cat_name": "Моля, изберете или въведете име на категория!",
        "added_success": "Успешно добавено!",
        "export_no_data": "Няма данни за експорт.",
        "import_no_file": "Моля, изберете .json файл за импорт.",
        "import_error_read": "Грешка при четене на файла! Уверете се, че това е валиден JSON.",
        "open": "Отвори",
        "yes": "Да",
        "no": "Не",
        "min": "мин",
        "site": "Сайт",
        "fill_all_fields": "Моля, попълнете всички полета коректно.",
        "drive_search_error": "Грешка при търсене в Drive: ",
        "no_change": "Няма промяна",
        "price_dropped": "Спад",
        "price_increased": "Увеличение",
        "refresh_all_title": "Опресни всички",
        "history_btn": "📈 История",
        "delete_btn": "🗑️ Изтрий",
        "edit_btn": "✏️ Редактирай",
        
        "tab_products": "Продукти и Категории",
        "tab_settings": "Настройки и Данни",
        "add_new_site": "Добавяне на нов сайт",
        "url_label": "URL адрес",
        "selector_label": "CSS Селектор",
        "pick_from_page": "🖱️ Избери от страница",
        "category_label": "Категория / Група",
        "choose_existing": "-- Избери съществуваща --",
        "create_new_cat": "➕ Създай нова...",
        "cat_name_label": "Име на новата категория",
        "type_label": "Тип",
        "type_price": "Цена (търси спад)",
        "type_text": "Текст (търси промяна)",
        "interval_label": "Интервал (минути)",
        "jitter_label": "Отклонение / Jitter (минути)",
        "macro_label": "Използвай Макрос (Скрол и изчакване - задължително за eMAG/Amazon)",
        "add_to_list": "Добави към списъка",
        "tracked_items": "Наблюдавани артикули",
        "refresh_all_now": "🔄 Опресни всички сега",
        "global_settings": "Глобални настройки",
        "enable_notif": "Разреши визуални известия",
        "enable_sound": "Възпроизведи звуково известие",
        "language_label": "Език (Language)",
        "theme_label": "Тема (Dark/Light Mode)",
        "theme_auto": "Автоматично (според ОС)",
        "theme_light": "Светла",
        "theme_dark": "Тъмна",
        "save_settings": "Запази настройките",
        "data_management": "Управление на данните (Импорт / Експорт)",
        "data_desc": "Данните за продуктите се запазват отделно от настройките.",
        "export_data": "Експортиране на данни",
        "export_desc": "Избери кои категории искаш да споделиш/запазиш:",
        "export_btn": "Експортирай избраните (JSON)",
        "import_data": "Импортиране на данни",
        "import_desc": "Добави предварително запазени продукти към текущия си списък.",
        "import_btn": "Импортирай",
        "google_drive_sync": "☁️ Синхронизация с Google Drive",
        "drive_desc": "Запазете всичките си настройки и списък с продукти в сигурна, скрита папка във вашия Google Drive.",
        "drive_backup": "⬆️ Създай Резервно Копие",
        "drive_restore": "⬇️ Възстанови от Google Drive",

        "confirm_delete_item": "Сигурни ли сте, че искате да изтриете този продукт?",
        "confirm_delete_cat": "Изтриване на ЦЯЛАТА категория и всички продукти в нея?",
        "history_no_data": "Няма данни за историята.",
        "history_no_prices": "Графиките се поддържат само за цени.",
        "history_cat_empty": "Няма продукти в тази категория.",
        "history_cat_no_prices": "Няма история на цените в тази категория.",
        "history_chart_title_site": "История на цена за 1 сайт",
        "history_chart_title_cat": "История на най-ниската цена за",
        "lowest_price_all": "Най-ниска цена (всички сайтове)",
        "settings_saved": "Настройките са запазени.",
        "changes_saved": "Промените са запазени успешно!",
        "enter_url_first": "Моля, първо въведете валиден URL адрес.",
        "loading": "⏳ Зареждане...",
        "import_success": "Успешен импорт!",
        "import_error": "Грешка при импорт.",
        "export_empty": "Изберете поне една категория за експорт.",
        "connecting_drive": "Свързване с Google Drive...",
        "searching_backup": "Търсене на стар бекъп...",
        "uploading_data": "Качване на данните...",
        "drive_update_fail": "Неуспешно обновяване на файла.",
        "drive_create_fail": "Неуспешно създаване на файла.",
        "drive_success": "✅ Успешно запазено в Google Drive!",
        "drive_warn_restore": "Внимание: Това ще презапише текущите ви продукти и настройки!",
        "drive_no_backup": "❌ Не е намерен бекъп в Google Drive.",
        "downloading_data": "Изтегляне на данните...",
        "drive_download_err": "Грешка при изтегляне.",
        "drive_restore_success": "✅ Успешно възстановено! Презареждане...",
        "drive_corrupt": "❌ Бекъп файлът е празен или повреден.",
        "error_prefix": "❌ Грешка: ",
        "check_progress": "⏳ Проверка...",
        "check_done": "✅ Готово! Презареждане...",

        "price_drop": "Спад в цената!",
        "text_change": "Промяна в текста!",
        "price_drop_msg": "Цената падна на",
        "text_change_msg": "Текстът се промени на",

        "options_page_title": "Настройки | Price Tracker Pro",
        "options_main_title": "Price & Text Tracker Pro - Управление",
        "cat_name_placeholder": "Въведи име за новия артикул...",
        "selector_placeholder": "Напр. .price-tag или #main-price",
        "jitter_title": "Случайно отклонение, за да не изглежда като бот",
        "price_history_modal": "История на цената",
        "edit_site_title": "Редактиране на сайт",
        "save_changes_btn": "💾 Запази промените",
        "use_lowest_price_label": "Вземай най-ниската цена при няколко в йерархията (за промоции)",
        "duplicate_exact_error": "Този сайт със същия селектор вече се наблюдава в категория \"{cat}\"!",
        "duplicate_overlap_confirm": "Този сайт вече се наблюдава в категория \"{cat}\" с припокриващ се селектор:\n\"{sel}\"\n\nСигурни ли сте, че искате да добавите припокриващо се поле за този сайт?",
        "duplicate_same_url_confirm": "Вече наблюдавате този сайт в категория \"{cat}\" (селектор: \"{sel}\").\n\nЖелаете ли да добавите допълнително поле за следене към тази страница?",
        "duplicate_scanner_title": "🔍 Проверка за дублиращи се сайтове",
        "duplicate_scanner_desc": "Сканирайте всички категории за еднакви сайтове, повтарящи се или припокриващи се полета за следене на цени.",
        "scan_duplicates_btn": "🔍 Сканирай за дубликати сега",
        "auto_clean_duplicates_btn": "🧹 Автоматично премахни точните дубликати",
        "scan_no_duplicates": "✅ Няма намерени дублиращи се сайтове или припокриващи се полета. Всички записи са уникални!",
        "scan_found_summary": "Открити {count} сайт(а) с множество или припокриващи се записи за следене:",
        "badge_exact_duplicate": "Пълен дубликат",
        "badge_overlapping": "Припокриващо се поле",
        "badge_same_site": "Същият сайт",
        "auto_clean_success": "Успешно бяха премахнати {count} дублиращи се артикула!",
        "no_exact_duplicates_to_clean": "Няма намерени точни дубликати за автоматично изчистване.",
        "delete_duplicate_btn": "🗑️ Изтрий",

        "context_menu_add": "Добави към Price Tracker",
        "context_menu_pick": "Избери елемент за PriceTracker",
        "notif_new_lowest": "Нова най-ниска цена: ",
        "notif_text_changed": "Текстът беше променен.",
        "notif_price_drop_title": "🚨 Спад в цената!",
        "notif_site_update_title": "🔄 Обновяване на сайт!",
        "notif_check_site": "Проверете: ",

        "picker_select_element": "Избор на елемент",
        "picker_space_pause": "Натисни SPACE за пауза (Esc за изход)",
        "picker_paused": "ПАУЗИРАНО (Натисни SPACE за продължаване)",
        "picker_selector": "🎯 Селектор:",
        "check_failed_prefix": "Неуспешна проверка",
        "check_failed": "Неуспешна проверка (проблем със сайта, променен селектор или блокиран достъп)",
        "err_tab_closed": "Табът беше затворен преди приключване на проверката",
        "err_timeout": "Изтече времето за изчакване (35 сек) или сайтът не отговаря",
        "err_open_tab": "Неуспешно отваряне на фонов таб",
        "err_inject": "Неуспешно инжектиране на скрипт в страницата",
        "err_element_not_found": "Елементът не беше открит (селекторът може да е променен)",
        "err_invalid_price": "Извлечената цена не е валидно число",
        "last_check_failed": "Последната проверка беше неуспешна",
        "last_check": "Последна проверка",
        "last_attempt": "Последен опит"
    }
};

let currentLang = 'en';

export async function initLang() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['settings'], (data) => {
            currentLang = (data.settings && data.settings.language) ? data.settings.language : 'en';
            resolve();
        });
    });
}

export function t(key, params = null) {
    if (!translations[currentLang]) currentLang = 'en';
    let text = translations[currentLang][key] || (translations['en'] && translations['en'][key]) || key;
    if (params && typeof params === 'object') {
        for (const [k, v] of Object.entries(params)) {
            text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
        }
    }
    return text;
}

export function getTranslatedError(err) {
    if (!err) return t("check_failed");

    const errStr = String(err);

    if (errStr.includes("Tab closed before check completed") || errStr === "ERR_TAB_CLOSED") {
        return `${t("check_failed_prefix")}: ${t("err_tab_closed")}`;
    }
    if (errStr.includes("Timeout") || errStr.includes("unresponsive") || errStr === "ERR_TIMEOUT") {
        return `${t("check_failed_prefix")}: ${t("err_timeout")}`;
    }
    if (errStr.includes("Failed to open background tab") || errStr === "ERR_OPEN_TAB") {
        return `${t("check_failed_prefix")}: ${t("err_open_tab")}`;
    }
    if (errStr.includes("Failed to inject") || errStr === "ERR_INJECT") {
        return `${t("check_failed_prefix")}: ${t("err_inject")}`;
    }
    if (errStr.includes("не беше открит") || errStr.includes("not found") || errStr.includes("not discovered") || errStr.includes("селектор") || errStr.includes("selector")) {
        return `${t("check_failed_prefix")}: ${t("err_element_not_found")}`;
    }
    if (errStr.includes("не е валидно число") || errStr.includes("Invalid price") || errStr.includes("not a valid number")) {
        return `${t("check_failed_prefix")}: ${t("err_invalid_price")}`;
    }

    return `${t("check_failed_prefix")}: ${errStr}`;
}

export function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (!key) return;
        
        if (el.tagName === 'INPUT' && el.type === 'button') {
            el.value = t(key);
        } else if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'number')) {
            if (el.placeholder) el.placeholder = t(key);
        } else if (el.tagName === 'OPTION') {
            el.innerText = t(key);
        } else {
            el.innerHTML = t(key); 
        }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key) el.placeholder = t(key);
    });

    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (key) el.title = t(key);
    });
}

export function getCurrentLang() {
    return currentLang;
}
