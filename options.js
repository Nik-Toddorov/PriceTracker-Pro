import { initLang, t, applyTranslations, getTranslatedError } from './i18n.js';

let priceChartInstance = null;

// Helper function for HTML escaping (XSS protection)
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Word-level text diff computation with highlight markers
function computeTextDiff(oldText, newText) {
    if (!oldText) {
        return `<mark class="diff-ins">${escapeHtml(newText)}</mark>`;
    }
    if (oldText === newText) {
        return escapeHtml(newText);
    }

    const oldWords = String(oldText).split(/(\s+)/);
    const newWords = String(newText).split(/(\s+)/);

    const matrix = Array(oldWords.length + 1).fill(null).map(() => Array(newWords.length + 1).fill(0));
    for (let i = 0; i < oldWords.length; i++) {
        for (let j = 0; j < newWords.length; j++) {
            if (oldWords[i] === newWords[j]) {
                matrix[i + 1][j + 1] = matrix[i][j] + 1;
            } else {
                matrix[i + 1][j + 1] = Math.max(matrix[i + 1][j], matrix[i][j + 1]);
            }
        }
    }

    let i = oldWords.length, j = newWords.length;
    const diffs = [];

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
            diffs.unshift({ type: 'same', text: oldWords[i - 1] });
            i--; j--;
        } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
            diffs.unshift({ type: 'ins', text: newWords[j - 1] });
            j--;
        } else if (i > 0 && (j === 0 || matrix[i][j - 1] < matrix[i - 1][j])) {
            diffs.unshift({ type: 'del', text: oldWords[i - 1] });
            i--;
        }
    }

    return diffs.map(d => {
        if (d.type === 'ins') return `<mark class="diff-ins">${escapeHtml(d.text)}</mark>`;
        if (d.type === 'del') return `<del class="diff-del">${escapeHtml(d.text)}</del>`;
        return escapeHtml(d.text);
    }).join('');
}

chrome.storage.local.get(['themePreference'], (data) => {
    const theme = data.themePreference || 'auto';
    if (theme === 'dark') document.documentElement.classList.add('theme-dark');
    else if (theme === 'light') document.documentElement.classList.add('theme-light');
});

document.addEventListener('DOMContentLoaded', async () => {
    await initLang();
    applyTranslations();

    // 1. Initialization and Tabs
    initTabs();
    await checkForDraftItem();
    await loadSettings();
    await renderTrackedItems();
    await renderExportCheckboxes();

    // 2. Event Listeners for forms and buttons
    document.getElementById('optionsRefreshBtn').addEventListener('click', handleManualRefresh);
    document.getElementById('addItemForm').addEventListener('submit', handleAddItem);
    document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('importBtn').addEventListener('click', importData);

    const driveBackupBtn = document.getElementById('driveBackupBtn');
    if (driveBackupBtn) driveBackupBtn.addEventListener('click', backupToDrive);

    const driveRestoreBtn = document.getElementById('driveRestoreBtn');
    if (driveRestoreBtn) driveRestoreBtn.addEventListener('click', restoreFromDrive);

    const scanDuplicatesBtn = document.getElementById('scanDuplicatesBtn');
    if (scanDuplicatesBtn) scanDuplicatesBtn.addEventListener('click', runDuplicateScan);

    const autoCleanDuplicatesBtn = document.getElementById('autoCleanDuplicatesBtn');
    if (autoCleanDuplicatesBtn) autoCleanDuplicatesBtn.addEventListener('click', autoCleanExactDuplicates);

    let activePickerContext = null;

    function handlePickerResult(pickerData) {
        if (!pickerData || !pickerData.selector) return;

        let ctx = activePickerContext;
        if (!ctx) {
            try {
                const raw = sessionStorage.getItem('activePickerContext');
                if (raw) ctx = JSON.parse(raw);
            } catch (e) { }
        }

        const editModal = document.getElementById('editItemModal');
        const isEditOpen = editModal && (editModal.style.display === 'block' || (ctx && ctx.source === 'edit'));

        if (isEditOpen) {
            if (ctx && ctx.catKey && ctx.itemId && (!editModal || editModal.style.display !== 'block')) {
                window.openEditItemModal(ctx.catKey, ctx.itemId);
            }
            document.getElementById('editItemSelector').value = pickerData.selector;
            if (pickerData.url) {
                document.getElementById('editItemUrl').value = pickerData.url;
            }
            const editPickerBtn = document.getElementById('editStartPickerBtn');
            if (editPickerBtn) {
                editPickerBtn.innerText = t("pick_from_page");
                editPickerBtn.disabled = false;
            }
            if (editModal) editModal.style.display = 'block';
        } else {
            document.getElementById('itemSelector').value = pickerData.selector;
            if (pickerData.url) {
                document.getElementById('itemUrl').value = pickerData.url;
            }
            const pickerBtn = document.getElementById('startPickerBtn');
            if (pickerBtn) {
                pickerBtn.innerText = t("pick_from_page");
                pickerBtn.disabled = false;
            }
        }

        activePickerContext = null;
        sessionStorage.removeItem('activePickerContext');
        chrome.storage.local.remove('latestPickerData');
    }

    // Element picker event listener (Add item form)
    const pickerBtn = document.getElementById('startPickerBtn');
    if (pickerBtn) {
        pickerBtn.addEventListener('click', () => {
            const url = document.getElementById('itemUrl').value.trim();
            if (!url) {
                alert(t("enter_url_first"));
                return;
            }
            activePickerContext = { source: 'add' };
            sessionStorage.setItem('activePickerContext', JSON.stringify(activePickerContext));
            pickerBtn.innerText = t("loading");
            pickerBtn.disabled = true;
            chrome.runtime.sendMessage({ action: "start_picker", url: url });
        });
    }

    // Element picker event listener (Edit item modal)
    const editPickerBtn = document.getElementById('editStartPickerBtn');
    if (editPickerBtn) {
        editPickerBtn.addEventListener('click', () => {
            const url = document.getElementById('editItemUrl').value.trim();
            if (!url) {
                alert(t("enter_url_first"));
                return;
            }
            const catKey = document.getElementById('editItemCatKey').value;
            const itemId = document.getElementById('editItemId').value;
            activePickerContext = { source: 'edit', catKey, itemId };
            sessionStorage.setItem('activePickerContext', JSON.stringify(activePickerContext));
            editPickerBtn.innerText = t("loading");
            editPickerBtn.disabled = true;
            chrome.runtime.sendMessage({ action: "start_picker", url: url });
        });
    }

    // Listen for storage changes (picker data or updated prices from background)
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
            if (changes.latestPickerData && changes.latestPickerData.newValue) {
                handlePickerResult(changes.latestPickerData.newValue);
            }
            if (changes.trackingData) {
                renderTrackedItems();
                renderExportCheckboxes();
            }
        }
    });

    // Check for existing picker data on open
    chrome.storage.local.get('latestPickerData', (res) => {
        if (res.latestPickerData) {
            handlePickerResult(res.latestPickerData);
        }
    });

    // Event delegation for dynamically generated buttons
    document.getElementById('trackedItemsList').addEventListener('click', handleListClicks);
    document.getElementById('textHistoryContainer').addEventListener('click', handleListClicks);

    // Show/hide input for custom category name
    const catSelect = document.getElementById('catSelect');
    const catNameInput = document.getElementById('catName');

    if (catSelect && catNameInput) {
        catSelect.addEventListener('change', (e) => {
            if (e.target.value === '__NEW__') {
                catNameInput.style.display = 'block';
                catNameInput.required = true;
                catNameInput.focus();
            } else {
                catNameInput.style.display = 'none';
                catNameInput.required = false;
                catNameInput.value = '';
            }
        });
    }
});

function handleListClicks(e) {
    const target = e.target;
    if (target.classList.contains('btn-cat-history')) {
        window.showCategoryHistory(target.dataset.catkey);
    } else if (target.classList.contains('btn-cat-delete')) {
        window.deleteCategory(target.dataset.catkey);
    } else if (target.classList.contains('btn-cat-refresh')) {
        chrome.runtime.sendMessage({ action: "force_refresh_category", catKey: target.dataset.catkey });
        target.innerText = t("check_progress");
        setTimeout(() => target.innerText = t("refresh_all_now"), 3000);
    } else if (target.classList.contains('btn-item-history') || target.closest('.btn-item-history')) {
        const btn = target.classList.contains('btn-item-history') ? target : target.closest('.btn-item-history');
        const catKey = btn.dataset.catkey;
        const itemId = btn.dataset.itemid;
        chrome.storage.local.get('trackingData', (data) => {
            const trackingData = data.trackingData || {};
            const item = trackingData[catKey]?.items.find(i => i.id === itemId);
            if (item) {
                if (item.type === 'text') {
                    window.showTextItemHistory(catKey, itemId, item, trackingData[catKey]?.categoryName);
                } else {
                    window.showItemHistory(catKey, itemId);
                }
            }
        });
    } else if (target.classList.contains('btn-item-edit')) {
        window.openEditItemModal(target.dataset.catkey, target.dataset.itemid);
    } else if (target.classList.contains('btn-item-delete')) {
        window.deleteItem(target.dataset.catkey, target.dataset.itemid);
    } else if (target.classList.contains('btn-item-refresh')) {
        chrome.runtime.sendMessage({ action: "force_refresh_item", itemId: target.dataset.itemid });
        target.innerText = t("check_progress");
        setTimeout(() => target.innerText = t("refresh_btn"), 3000);
    } else if (target.classList.contains('btn-mark-reviewed')) {
        const catKey = target.dataset.catkey;
        const itemId = target.dataset.itemid;
        window.markTextItemReviewed(catKey, itemId);
    } else if (target.classList.contains('btn-mark-cat-reviewed')) {
        const catKey = target.dataset.catkey;
        window.markAllCategoryTextReviewed(catKey);
    } else if (target.closest('.toggle-cat')) {
        const toggleBtn = target.closest('.toggle-cat');
        const catKey = toggleBtn.dataset.catkey;
        const itemsDiv = document.getElementById(`items_${catKey}`);
        if (itemsDiv) {
            const isHidden = itemsDiv.style.display === 'none';
            itemsDiv.style.display = isHidden ? 'block' : 'none';
            // Toggle collapse arrow icon
            const span = toggleBtn.querySelector('.arrow-icon');
            if (span) {
                span.innerText = isHidden ? '▴' : '▾';
            }
        }
    }
}

// --- TABS LOGIC ---
function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            document.getElementById(tab.dataset.target).classList.add('active');
        });
    });
}

// --- DUPLICATES & OVERLAP DETECTION ---
/**
 * Normalizes URL for accurate comparison (strips hash, tracking params, and trailing slash).
 */
function normalizeUrl(rawUrl) {
    if (!rawUrl) return '';
    try {
        const parsed = new URL(rawUrl.trim());
        parsed.hash = '';

        // Remove common tracking, affiliate, and session parameters
        const trackingParams = [
            'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
            'fbclid', 'gclid', 'gclsrc', 'dclid', 'msclkid', 'zanpid',
            'ref', 'ref_', 'tag', 'linkcode', 'spm', 'scm', '_ga', '_gl',
            'pd_rd_w', 'pd_rd_r', 'pd_rd_wg', 'pf_rd_p', 'pf_rd_r'
        ];

        for (const param of trackingParams) {
            parsed.searchParams.delete(param);
        }

        let path = parsed.pathname;
        if (path.length > 1 && path.endsWith('/')) {
            parsed.pathname = path.slice(0, -1);
        }

        return parsed.toString().toLowerCase();
    } catch (e) {
        return rawUrl.trim().toLowerCase().replace(/\/+$/, '');
    }
}

/**
 * Normalizes CSS selector for accurate comparison.
 */
function normalizeSelector(rawSelector) {
    if (!rawSelector) return '';
    return rawSelector
        .trim()
        .toLowerCase()
        .replace(/\s*>\s*/g, ' > ')
        .replace(/\s+/g, ' ');
}

/**
 * Finds existing duplicate or overlapping items in storage.
 */
function findDuplicateOrOverlappingItem(trackingData, url, selector, excludeItemId = null) {
    if (!trackingData || !url) return null;

    const normUrl = normalizeUrl(url);
    const normSel = normalizeSelector(selector);

    for (const catKey in trackingData) {
        const cat = trackingData[catKey];
        if (!cat || !Array.isArray(cat.items)) continue;

        for (const item of cat.items) {
            if (excludeItemId && item.id === excludeItemId) continue;

            const existingNormUrl = normalizeUrl(item.url);
            if (existingNormUrl === normUrl) {
                const existingNormSel = normalizeSelector(item.selector);

                // 1. Exact duplicate: identical normalized URL and selector
                if (normSel && existingNormSel && normSel === existingNormSel) {
                    return {
                        matchType: 'exact',
                        item,
                        categoryName: cat.categoryName || catKey,
                        catKey
                    };
                }

                // 2. Overlapping selector: hierarchical containment on the same URL
                if (normSel && existingNormSel && (normSel.includes(existingNormSel) || existingNormSel.includes(normSel))) {
                    return {
                        matchType: 'overlap',
                        item,
                        categoryName: cat.categoryName || catKey,
                        catKey
                    };
                }

                // 3. Same URL with different selector
                return {
                    matchType: 'same_url',
                    item,
                    categoryName: cat.categoryName || catKey,
                    catKey
                };
            }
        }
    }

    return null;
}

// --- ADD NEW ITEM ---
async function handleAddItem(e) {
    e.preventDefault();

    const catSelect = document.getElementById('catSelect').value;
    let catName = '';

    if (catSelect === '__NEW__') {
        catName = document.getElementById('catName').value.trim();
    } else {
        catName = catSelect;
    }

    if (!catName) {
        alert(t("select_cat_name"));
        return;
    }

    const catKey = 'cat_' + catName.toLowerCase().replace(/[^a-z0-9]/g, '_');

    const url = document.getElementById('itemUrl').value.trim();
    const selector = document.getElementById('itemSelector').value.trim();

    // Retrieve current database
    const data = await chrome.storage.local.get('trackingData');
    const trackingData = data.trackingData || {};

    // Duplicate and overlap checks
    const duplicate = findDuplicateOrOverlappingItem(trackingData, url, selector);
    if (duplicate) {
        if (duplicate.matchType === 'exact') {
            alert(t("duplicate_exact_error", { cat: duplicate.categoryName }));
            return;
        } else if (duplicate.matchType === 'overlap') {
            const confirmed = confirm(t("duplicate_overlap_confirm", {
                cat: duplicate.categoryName,
                sel: duplicate.item.selector
            }));
            if (!confirmed) return;
        } else if (duplicate.matchType === 'same_url') {
            const confirmed = confirm(t("duplicate_same_url_confirm", {
                cat: duplicate.categoryName,
                sel: duplicate.item.selector
            }));
            if (!confirmed) return;
        }
    }

    const newItem = {
        id: 'item_' + Date.now(), // Unique ID
        url: url,
        selector: selector,
        type: document.getElementById('itemType').value,
        intervalMinutes: parseInt(document.getElementById('itemInterval').value),
        intervalJitter: parseInt(document.getElementById('itemJitter').value),
        requiresMacro: document.getElementById('itemMacro').checked,
        useLowestPrice: document.getElementById('itemUseLowestPrice') ? document.getElementById('itemUseLowestPrice').checked : true,
        lastChecked: null,
        lastSuccessfulCheck: null,
        lastCheckStatus: null,
        lastError: null,
        history: [] // Price and date history records
    };

    // Create category if it does not exist
    if (!trackingData[catKey]) {
        trackingData[catKey] = { categoryName: catName, items: [] };
    }

    trackingData[catKey].items.push(newItem);
    await chrome.storage.local.set({ trackingData: trackingData });

    // Trigger initial scrape immediately (which also schedules the next jitter alarm)
    chrome.runtime.sendMessage({ action: "force_refresh_item", itemId: newItem.id });

    // Notify and close options window
    alert(t("added_success"));
    window.close();
}

// Helper function for formatting date and time (DD.MM.YYYY HH:MM)
function formatDateTime(isoString) {
    if (!isoString) return '';
    try {
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return '';
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${day}.${month}.${year} ${hours}:${minutes}`;
    } catch (e) {
        return '';
    }
}

// --- RENDER TRACKED ITEMS ---
async function renderTrackedItems() {
    const container = document.getElementById('trackedItemsList');
    const data = await chrome.storage.local.get('trackingData');
    const trackingData = data.trackingData || {};

    container.innerHTML = '';

    // Populate category dropdown with existing categories
    const catSelect = document.getElementById('catSelect');
    if (catSelect) {
        // Preserve current selection if possible
        const currentValue = catSelect.value;

        catSelect.innerHTML = `
            <option value="">${t("choose_existing")}</option>
            <option value="__NEW__">${t("create_new_cat")}</option>
        `;
        const uniqueCategories = new Set();
        for (const catKey in trackingData) {
            if (trackingData[catKey].categoryName) {
                uniqueCategories.add(trackingData[catKey].categoryName);
            }
        }
        uniqueCategories.forEach(catName => {
            const option = document.createElement('option');
            option.value = catName;
            option.textContent = catName;
            catSelect.appendChild(option);
        });

        if (currentValue && currentValue !== '__NEW__' && uniqueCategories.has(currentValue)) {
            catSelect.value = currentValue;
        }
    }

    if (Object.keys(trackingData).length === 0) {
        container.innerHTML = `<p style="color: #666;">${t("no_items")}</p>`;
        return;
    }

    // Iterate over categories
    for (const [catKey, catData] of Object.entries(trackingData)) {
        if (catData.items.length === 0) continue;

        const catBlock = document.createElement('div');
        catBlock.className = 'category-block';

        // Find lowest price across category
        let catBestPrice = Infinity;
        let hasPrice = false;
        let hasText = false;
        let hasUnreadText = false;

        catData.items.forEach(item => {
            if (item.type === 'price' && item.history && item.history.length > 0) {
                const currentVal = item.history[item.history.length - 1].value;
                if (typeof currentVal === 'number' && currentVal < catBestPrice) {
                    catBestPrice = currentVal;
                    hasPrice = true;
                }
            } else if (item.type === 'text') {
                hasText = true;
                if (item.hasUnreadTextChange) {
                    hasUnreadText = true;
                }
            }
        });

        const catCurrency = catData.items.find(i => i.type === 'price')?.currency || '€';
        const catTrend = hasPrice ? getCategoryTrend(catData) : '';
        const unreadBadge = hasUnreadText ? `<span class="badge-text-changed" title="${t("text_changed_badge")}">⚠️</span>` : '';
        const catPriceSummary = hasPrice 
            ? `<span style="color: var(--success-color); font-size: 14px; font-weight: bold; white-space: nowrap; display: flex; align-items: center; gap: 5px;">(${catBestPrice} ${catCurrency}) ${catTrend}</span>` 
            : '';

        const isAllText = catData.items.every(i => i.type === 'text');
        const catHistoryIcon = isAllText ? '📝 ' + t("history_btn").replace('📈', '').trim() : t("history_btn");

        // Category Header
        const header = document.createElement('div');
        header.className = 'category-header';
        header.innerHTML = `
            <div class="toggle-cat" data-catkey="${escapeHtml(catKey)}" style="cursor: pointer; flex-grow: 1; display: flex; align-items: center; flex-wrap: wrap; gap: 10px;">
                <span style="font-size: 16px; white-space: nowrap;">📁 <b>${escapeHtml(catData.categoryName)}</b></span>
                ${catPriceSummary}
                ${unreadBadge}
                <span class="arrow-icon">▾</span>
            </div>
            <div style="display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end; margin-left: 10px;">
                <button class="success btn-cat-refresh" data-catkey="${escapeHtml(catKey)}">${t("refresh_btn")}</button>
                <button class="success btn-cat-history" data-catkey="${escapeHtml(catKey)}">${catHistoryIcon}</button>
                <button class="danger btn-cat-delete" data-catkey="${escapeHtml(catKey)}">${t("delete_btn")}</button>
            </div>
        `;
        catBlock.appendChild(header);

        // Category Items Container (collapsed by default)
        const itemsContainer = document.createElement('div');
        itemsContainer.id = `items_${catKey}`;
        itemsContainer.style.display = 'none';

        // Iterate over products in category
        catData.items.forEach(item => {
            const row = document.createElement('div');
            row.className = 'item-row';

            let domain = t("site");
            try { domain = new URL(item.url).hostname; } catch (e) { }

            const isError = item.lastCheckStatus === 'error';
            const errorBadge = isError
                ? ` <b class="badge-error" title="${escapeHtml(getTranslatedError(item.lastError))}" style="color: var(--danger-color); font-size: 16px; font-weight: 900; margin-left: 6px; cursor: help; line-height: 1;">!</b>`
                : '';

            let lastCheckRow = "";
            if (isError) {
                const lastValidIso = item.lastSuccessfulCheck || (item.history && item.history.length > 0 ? item.history[item.history.length - 1].date : null);
                const validText = lastValidIso ? formatDateTime(lastValidIso) : t("no_data");
                const attemptText = item.lastChecked ? formatDateTime(item.lastChecked) : '';
                lastCheckRow = `
                    <div style="font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
                        <span>🕒 ${t("last_check")}: ${validText}</span>
                        <span style="color: var(--danger-color); font-weight: 600;">(${t("last_attempt")}: ${attemptText})</span>
                    </div>
                `;
            } else {
                const checkIso = item.lastSuccessfulCheck || item.lastChecked || (item.history && item.history.length > 0 ? item.history[item.history.length - 1].date : null);
                if (checkIso) {
                    lastCheckRow = `
                        <div style="font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 4px;">
                            <span>🕒 ${t("last_check")}: ${formatDateTime(checkIso)}</span>
                        </div>
                    `;
                }
            }

            const typeLabel = item.type === 'price' ? t("type_price").split("(")[0].trim() : t("type_text").split("(")[0].trim();
            const macroText = item.requiresMacro ? ` • ${t("yes")}` : '';

            let mainContentHtml = '';
            if (item.type === 'price') {
                let currentPriceDisplay = t("no_data");
                let bestPriceDisplay = "";
                const itemTrend = getItemTrend(item);

                if (item.history && item.history.length > 0) {
                    const currency = item.currency || '€';
                    const currentVal = item.history[item.history.length - 1].value;
                    currentPriceDisplay = `${currentVal} ${currency}`;

                    const minVal = Math.min(...item.history.map(h => h.value));
                    if (minVal < currentVal) {
                        bestPriceDisplay = ` <span style="font-size: 11px; color: var(--text-muted); font-weight: normal;">(${t("best_price")}: ${minVal} ${currency})</span>`;
                    }
                }

                mainContentHtml = `
                    <div style="display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: bold; color: var(--text-strong);">
                        <span>${t("current_price")}:</span>
                        <span>${currentPriceDisplay}</span>
                        ${itemTrend}
                        ${bestPriceDisplay}
                        ${errorBadge}
                    </div>
                `;
            } else {
                // Text tracking layout
                const history = item.history || [];
                const currentVal = history.length > 0 ? history[history.length - 1].value : t("no_data");
                const isChanged = item.hasUnreadTextChange || (item.reviewedText && item.reviewedText !== currentVal && history.length > 1);

                if (isChanged) {
                    let diffDisplay = '';
                    if (item.previousText && item.previousText !== currentVal) {
                        diffDisplay = `<div style="margin-top: 4px;"><b>${t("diff_label")}:</b> ${computeTextDiff(item.previousText, currentVal)}</div>`;
                    } else {
                        diffDisplay = `<div style="margin-top: 4px;"><mark class="diff-ins">${escapeHtml(currentVal)}</mark></div>`;
                    }

                    mainContentHtml = `
                        <div class="text-changed-box">
                            <div style="display: flex; justify-content: space-between; align-items: center; font-weight: bold; color: #856404;">
                                <span>${t("current_text")}: <span class="badge-text-changed">⚠️ ${t("text_changed_badge")}</span>${errorBadge}</span>
                                <button class="btn-mark-reviewed" data-catkey="${escapeHtml(catKey)}" data-itemid="${escapeHtml(item.id)}" title="${t("mark_reviewed_btn")}">
                                    ${t("mark_reviewed_btn")}
                                </button>
                            </div>
                            ${diffDisplay}
                        </div>
                    `;
                } else {
                    mainContentHtml = `
                        <div style="margin-top: 2px;">
                            <span style="font-size: 13px; font-weight: bold; color: var(--text-strong);">${t("current_text")}:</span>
                            <div class="text-preview-box">${escapeHtml(currentVal)}${errorBadge}</div>
                        </div>
                    `;
                }
            }

            row.innerHTML = `
                <div class="item-details" style="flex-grow: 1; display: flex; flex-direction: column; gap: 4px;">
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <a href="${escapeHtml(item.url)}" target="_blank" style="text-decoration: none; color: var(--link-color); font-weight: bold; font-size: 14px;">${escapeHtml(domain)} <span style="font-size: 11px; font-weight: normal; color: var(--text-muted);">(${t("open")})</span></a>
                        <span style="font-size: 11px; background: var(--bg-item-header); border: 1px solid var(--border-color); padding: 1px 6px; border-radius: 4px; color: var(--text-muted);">${typeLabel} • ~${item.intervalMinutes} ${t("min")}${macroText ? ' • Macro' : ''}</span>
                    </div>
                    ${mainContentHtml}
                    ${lastCheckRow}
                </div>
                <div class="item-actions" style="display: flex; gap: 5px; flex-shrink: 0; align-items: center;">
                    <button class="success btn-item-refresh" data-itemid="${escapeHtml(item.id)}">${t("refresh_btn")}</button>
                    <button class="success btn-item-history" data-catkey="${escapeHtml(catKey)}" data-itemid="${escapeHtml(item.id)}">${item.type === 'text' ? '📝 ' + t("history_btn").replace('📈', '').trim() : t("history_btn")}</button>
                    <button class="success btn-item-edit" data-catkey="${escapeHtml(catKey)}" data-itemid="${escapeHtml(item.id)}">${t("edit_btn")}</button>
                    <button class="danger btn-item-delete" data-catkey="${escapeHtml(catKey)}" data-itemid="${escapeHtml(item.id)}">${t("delete_btn")}</button>
                </div>
            `;
            itemsContainer.appendChild(row);
        });

        catBlock.appendChild(itemsContainer);
        container.appendChild(catBlock);
    }
}

// --- DELETION HELPERS (Globally accessible) ---
window.deleteItem = async function (catKey, itemId) {
    if (!confirm(t("confirm_delete_item"))) return;

    const data = await chrome.storage.local.get('trackingData');
    const trackingData = data.trackingData || {};

    if (trackingData[catKey]) {
        trackingData[catKey].items = trackingData[catKey].items.filter(i => i.id !== itemId);

        // Remove associated background alarm
        chrome.alarms.clear(`check_item_${itemId}`);

        // If category becomes empty, remove it
        if (trackingData[catKey].items.length === 0) {
            delete trackingData[catKey];
        }

        await chrome.storage.local.set({ trackingData });
        await renderTrackedItems();
        await renderExportCheckboxes();
    }
};

window.deleteCategory = async function (catKey) {
    if (!confirm(t("confirm_delete_cat"))) return;

    const data = await chrome.storage.local.get('trackingData');
    const trackingData = data.trackingData || {};

    if (trackingData[catKey]) {
        // Clear all alarms for this category
        trackingData[catKey].items.forEach(item => {
            chrome.alarms.clear(`check_item_${item.id}`);
        });

        delete trackingData[catKey];
        await chrome.storage.local.set({ trackingData });
        await renderTrackedItems();
        await renderExportCheckboxes();
    }
};

// --- SETTINGS ---
async function loadSettings() {
    const data = await chrome.storage.local.get(['settings', 'themePreference']);
    const settings = data.settings || { notificationsEnabled: true, notificationSound: true, language: 'en' };
    const theme = data.themePreference || 'auto';

    document.getElementById('settingNotif').checked = settings.notificationsEnabled;
    document.getElementById('settingSound').checked = settings.notificationSound;

    const themeSelect = document.getElementById('settingTheme');
    if (themeSelect) {
        themeSelect.value = theme;
    }
    const langSelect = document.getElementById('settingLanguage');
    if (langSelect) {
        langSelect.value = settings.language || 'en';
    }
}

async function saveSettings() {
    const settings = {
        notificationsEnabled: document.getElementById('settingNotif').checked,
        notificationSound: document.getElementById('settingSound').checked,
        language: document.getElementById('settingLanguage') ? document.getElementById('settingLanguage').value : 'en'
    };
    const themePreference = document.getElementById('settingTheme').value;

    await chrome.storage.local.set({ settings, themePreference });

    document.documentElement.classList.remove('theme-dark', 'theme-light');
    if (themePreference === 'dark') document.documentElement.classList.add('theme-dark');
    else if (themePreference === 'light') document.documentElement.classList.add('theme-light');

    alert(t("settings_saved"));
    window.location.reload(); // Reload to apply language immediately
}

// --- DATA EXPORT (Selective) ---
async function renderExportCheckboxes() {
    const container = document.getElementById('exportCategoryList');
    const data = await chrome.storage.local.get('trackingData');
    const trackingData = data.trackingData || {};

    container.innerHTML = '';

    if (Object.keys(trackingData).length === 0) {
        container.innerHTML = `<span style="color: var(--text-muted); font-size:12px;">${t("export_no_data")}</span>`;
        return;
    }

    for (const [catKey, catData] of Object.entries(trackingData)) {
        const div = document.createElement('div');
        div.className = 'export-item';
        div.innerHTML = `
            <input type="checkbox" id="export_${escapeHtml(catKey)}" value="${escapeHtml(catKey)}" checked>
            <label for="export_${escapeHtml(catKey)}" style="display:inline; font-weight:normal;">${escapeHtml(catData.categoryName)} (${catData.items.length} ${t("products")})</label>
        `;
        container.appendChild(div);
    }
}

async function exportData() {
    const data = await chrome.storage.local.get('trackingData');
    const trackingData = data.trackingData || {};
    const exportObject = {};

    // Get all checked categories
    const checkboxes = document.querySelectorAll('#exportCategoryList input[type="checkbox"]:checked');

    if (checkboxes.length === 0) {
        alert(t("export_empty"));
        return;
    }

    // Copy only selected categories
    checkboxes.forEach(cb => {
        const catKey = cb.value;
        if (trackingData[catKey]) {
            exportObject[catKey] = trackingData[catKey];
        }
    });

    // Generate download JSON file
    const blob = new Blob([JSON.stringify(exportObject, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    chrome.downloads.download({
        url: url,
        filename: `price_tracker_export_${new Date().toISOString().split('T')[0]}.json`
    });
}

// --- DATA IMPORT ---
async function importData() {
    const fileInput = document.getElementById('importFile');
    if (!fileInput.files.length) {
        alert(t("import_no_file"));
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async function (e) {
        try {
            const importedData = JSON.parse(e.target.result);

            // Get current tracking database
            const data = await chrome.storage.local.get('trackingData');
            const currentData = data.trackingData || {};

            // Merge imported data with current data
            const mergedData = Object.assign({}, currentData, importedData);

            await chrome.storage.local.set({ trackingData: mergedData });

            // Re-create alarms for imported products
            for (const catKey in importedData) {
                importedData[catKey].items.forEach(item => {
                    chrome.alarms.create(`check_item_${item.id}`, { delayInMinutes: 2 });
                });
            }

            alert(t("import_success"));
            await renderTrackedItems();
            await renderExportCheckboxes();
            fileInput.value = '';

        } catch (error) {
            alert(t("import_error_read"));
            console.error(error);
        }
    };

    reader.readAsText(file);
}

// --- Handle Draft Item from Context Menu ---
async function checkForDraftItem() {
    const data = await chrome.storage.local.get('draftItem');
    if (data.draftItem) {
        // Populate form with draft values
        document.getElementById('itemUrl').value = data.draftItem.url;
        document.getElementById('itemSelector').value = data.draftItem.selector;

        // Infer whether value is price or text
        const numericValue = parseFloat(data.draftItem.value.replace(/[^0-9.,]/g, '').replace(',', '.'));
        if (!isNaN(numericValue) && data.draftItem.value.match(/\d/)) {
            document.getElementById('itemType').value = 'price';
        } else {
            document.getElementById('itemType').value = 'text';
        }

        // Focus category field
        document.getElementById('catName').focus();

        // Clear draft item from storage
        await chrome.storage.local.remove('draftItem');
    }
}

function handleManualRefresh(e) {
    const btn = e.target;
    const originalText = btn.innerHTML;

    btn.innerHTML = t("check_progress");
    btn.disabled = true;

    chrome.runtime.sendMessage({ action: "force_refresh_all" }, () => {
        setTimeout(async () => {
            btn.innerHTML = t("check_done");

            // Allow background scripts to finish and re-render
            setTimeout(async () => {
                await renderTrackedItems();
                btn.innerHTML = originalText;
                btn.disabled = false;
            }, 3000);

        }, 500);
    });
}

// --- HISTORY & CHARTS ---
window.markTextItemReviewed = async function (catKey, itemId) {
    const data = await chrome.storage.local.get('trackingData');
    const trackingData = data.trackingData || {};
    const item = trackingData[catKey]?.items.find(i => i.id === itemId);
    if (item && item.type === 'text') {
        const history = item.history || [];
        const latestVal = history.length > 0 ? history[history.length - 1].value : '';
        item.reviewedText = latestVal;
        item.hasUnreadTextChange = false;
        item.previousText = null;

        await chrome.storage.local.set({ trackingData });
        await renderTrackedItems();

        const modal = document.getElementById('historyModal');
        if (modal.style.display === 'block') {
            const titleEl = document.getElementById('modalTitle');
            if (titleEl.innerText.includes(t("cat_text_history_title"))) {
                window.showCategoryTextHistory(catKey, trackingData[catKey]);
            } else {
                window.showTextItemHistory(catKey, itemId, item, trackingData[catKey]?.categoryName);
            }
        }
    }
};

window.markAllCategoryTextReviewed = async function (catKey) {
    const data = await chrome.storage.local.get('trackingData');
    const trackingData = data.trackingData || {};
    const catData = trackingData[catKey];
    if (catData && Array.isArray(catData.items)) {
        catData.items.forEach(item => {
            if (item.type === 'text') {
                const history = item.history || [];
                const latestVal = history.length > 0 ? history[history.length - 1].value : '';
                item.reviewedText = latestVal;
                item.hasUnreadTextChange = false;
                item.previousText = null;
            }
        });

        await chrome.storage.local.set({ trackingData });
        await renderTrackedItems();

        const modal = document.getElementById('historyModal');
        if (modal.style.display === 'block') {
            window.showCategoryTextHistory(catKey, catData);
        }
    }
};

window.showTextItemHistory = function (catKey, itemId, item, categoryName) {
    const modal = document.getElementById('historyModal');
    const titleEl = document.getElementById('modalTitle');
    const chartContainer = document.getElementById('priceChartContainer');
    const textHistoryContainer = document.getElementById('textHistoryContainer');

    let siteName = t("site");
    try { siteName = new URL(item.url).hostname; } catch (e) { }

    titleEl.innerText = `📝 ${t("text_history_modal_title")}: ${siteName}`;
    chartContainer.style.display = 'none';
    textHistoryContainer.style.display = 'block';

    const history = item.history || [];
    if (history.length === 0) {
        textHistoryContainer.innerHTML = `<p style="text-align:center; color: var(--text-muted);">${t("no_text_history")}</p>`;
        modal.style.display = 'block';
        return;
    }

    let html = `<div class="text-history-timeline">`;

    // Reverse history to display newest changes first
    const reversed = [...history].reverse();
    for (let idx = 0; idx < reversed.length; idx++) {
        const entry = reversed[idx];
        const prevEntry = (idx + 1 < reversed.length) ? reversed[idx + 1] : null;
        const isLatest = idx === 0;
        const versionNum = history.length - idx;

        let diffHtml = '';
        if (prevEntry) {
            diffHtml = `
                <div style="margin-top: 6px; font-size: 13px;">
                    <b>${t("diff_label")}:</b><br>
                    <div style="padding: 8px 10px; background: var(--bg-container); border: 1px solid var(--border-color); border-radius: 4px; margin-top: 4px;">
                        ${computeTextDiff(prevEntry.value, entry.value)}
                    </div>
                </div>
            `;
        } else {
            diffHtml = `
                <div style="margin-top: 4px; font-size: 12px; color: var(--text-muted); font-style: italic;">
                    📌 ${t("initial_version")}
                </div>
            `;
        }

        const isUnreviewed = isLatest && (item.hasUnreadTextChange || (item.reviewedText && item.reviewedText !== entry.value && history.length > 1));
        const statusBadge = isUnreviewed
            ? `<span class="badge-text-changed">⚠️ ${t("unreviewed_state")}</span>`
            : `<span style="font-size: 11px; color: var(--success-color); font-weight: bold;">✓ ${t("reviewed_state")}</span>`;

        const markBtn = isUnreviewed ? `
            <button class="btn-mark-reviewed" data-catkey="${escapeHtml(catKey)}" data-itemid="${escapeHtml(item.id)}">
                ${t("mark_reviewed_btn")}
            </button>
        ` : '';

        html += `
            <div class="text-history-card ${isLatest ? 'latest' : ''}">
                <div class="text-history-header">
                    <span><b>#${versionNum}</b> • 🕒 ${formatDateTime(entry.date)}</span>
                    <div style="display: flex; align-items: center; gap: 8px;">${statusBadge} ${markBtn}</div>
                </div>
                ${diffHtml}
                <div style="margin-top: 8px; font-size: 12px; color: var(--text-muted);">
                    <details>
                        <summary style="cursor: pointer; font-weight: 500;">${t("full_text_label")}</summary>
                        <div style="padding: 6px 8px; background: var(--bg-container); border: 1px solid var(--border-color); border-radius: 4px; margin-top: 4px; white-space: pre-wrap; font-family: monospace;">${escapeHtml(entry.value)}</div>
                    </details>
                </div>
            </div>
        `;
    }

    html += `</div>`;
    textHistoryContainer.innerHTML = html;
    modal.style.display = 'block';
};

window.showCategoryTextHistory = function (catKey, catData) {
    const modal = document.getElementById('historyModal');
    const titleEl = document.getElementById('modalTitle');
    const chartContainer = document.getElementById('priceChartContainer');
    const textHistoryContainer = document.getElementById('textHistoryContainer');

    titleEl.innerText = `📁 ${t("cat_text_history_title")}: ${catData.categoryName}`;
    chartContainer.style.display = 'none';
    textHistoryContainer.style.display = 'block';

    const allEvents = [];
    let unreviewedCount = 0;

    catData.items.forEach(item => {
        if (item.type !== 'text' || !item.history) return;

        let domain = t("site");
        try { domain = new URL(item.url).hostname; } catch (e) { }

        for (let idx = 0; idx < item.history.length; idx++) {
            const entry = item.history[idx];
            const prevEntry = idx > 0 ? item.history[idx - 1] : null;
            const isLatest = idx === item.history.length - 1;
            const isUnreviewed = isLatest && (item.hasUnreadTextChange || (item.reviewedText && item.reviewedText !== entry.value && item.history.length > 1));

            if (isUnreviewed) unreviewedCount++;

            allEvents.push({
                catKey,
                itemId: item.id,
                url: item.url,
                domain,
                date: entry.date,
                value: entry.value,
                prevValue: prevEntry ? prevEntry.value : null,
                versionNum: idx + 1,
                isLatest,
                isUnreviewed
            });
        }
    });

    if (allEvents.length === 0) {
        textHistoryContainer.innerHTML = `<p style="text-align:center; color: var(--text-muted);">${t("no_text_history")}</p>`;
        modal.style.display = 'block';
        return;
    }

    // Sort all events chronologically (newest first)
    allEvents.sort((a, b) => new Date(b.date) - new Date(a.date));

    let html = `<div class="text-history-timeline">`;

    if (unreviewedCount > 0) {
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--bg-main); border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 8px;">
                <span style="font-size: 13px; font-weight: bold; color: var(--text-strong);">⚠️ ${unreviewedCount} ${t("text_changed_badge")}</span>
                <button class="btn-mark-cat-reviewed" data-catkey="${escapeHtml(catKey)}" style="background-color: #ffc107; color: #212529; border: none; padding: 5px 10px; font-size: 11px; border-radius: 4px; font-weight: bold; cursor: pointer;">
                    ${t("mark_all_group_reviewed_btn")}
                </button>
            </div>
        `;
    }

    for (let idx = 0; idx < allEvents.length; idx++) {
        const ev = allEvents[idx];
        let diffHtml = '';
        if (ev.prevValue) {
            diffHtml = `
                <div style="margin-top: 6px; font-size: 13px;">
                    <b>${t("diff_label")}:</b><br>
                    <div style="padding: 8px 10px; background: var(--bg-container); border: 1px solid var(--border-color); border-radius: 4px; margin-top: 4px;">
                        ${computeTextDiff(ev.prevValue, ev.value)}
                    </div>
                </div>
            `;
        } else {
            diffHtml = `
                <div style="margin-top: 4px; font-size: 12px; color: var(--text-muted); font-style: italic;">
                    📌 ${t("initial_version")}
                </div>
            `;
        }

        const statusBadge = ev.isUnreviewed
            ? `<span class="badge-text-changed">⚠️ ${t("unreviewed_state")}</span>`
            : `<span style="font-size: 11px; color: var(--success-color); font-weight: bold;">✓ ${t("reviewed_state")}</span>`;

        const markBtn = ev.isUnreviewed ? `
            <button class="btn-mark-reviewed" data-catkey="${escapeHtml(catKey)}" data-itemid="${escapeHtml(ev.itemId)}" style="margin: 0; padding: 4px 8px;">
                ${t("mark_reviewed_btn")}
            </button>
        ` : '';

        html += `
            <div class="text-history-card ${ev.isLatest ? 'latest' : ''}">
                <div class="text-history-header">
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <a href="${escapeHtml(ev.url)}" target="_blank" style="text-decoration: none; color: var(--link-color); font-weight: bold; font-size: 13px;">🌐 ${escapeHtml(ev.domain)}</a>
                        <span>(<b>#${ev.versionNum}</b> • 🕒 ${formatDateTime(ev.date)})</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">${statusBadge} ${markBtn}</div>
                </div>
                ${diffHtml}
                <div style="margin-top: 8px; font-size: 12px; color: var(--text-muted);">
                    <details>
                        <summary style="cursor: pointer; font-weight: 500;">${t("full_text_label")}</summary>
                        <div style="padding: 6px 8px; background: var(--bg-container); border: 1px solid var(--border-color); border-radius: 4px; margin-top: 4px; white-space: pre-wrap; font-family: monospace;">${escapeHtml(ev.value)}</div>
                    </details>
                </div>
            </div>
        `;
    }

    html += `</div>`;
    textHistoryContainer.innerHTML = html;
    modal.style.display = 'block';
};

window.showItemHistory = async function (catKey, itemId) {
    const data = await chrome.storage.local.get('trackingData');
    const trackingData = data.trackingData || {};
    const item = trackingData[catKey]?.items.find(i => i.id === itemId);

    if (!item || !item.history || item.history.length === 0) {
        alert(t("history_no_data"));
        return;
    }

    if (item.type !== 'price') return;

    const labels = item.history.map(h => new Date(h.date).toLocaleString());
    const prices = item.history.map(h => h.value);

    let siteName = t("site");
    try {
        siteName = new URL(item.url).hostname;
    } catch (e) { }

    const dataset = {
        label: `${t("type_price")} @ ${siteName}`,
        data: prices,
        borderColor: getComputedStyle(document.documentElement).getPropertyValue('--link-color').trim() || '#007bff',
        backgroundColor: 'rgba(0,123,255,0.1)',
        fill: true,
        tension: 0.1,
        stepped: true
    };

    renderChart(t("history_chart_title_site"), labels, [dataset]);
};

window.showCategoryHistory = async function (catKey) {
    const data = await chrome.storage.local.get('trackingData');
    const trackingData = data.trackingData || {};
    const catData = trackingData[catKey];

    if (!catData || !catData.items || catData.items.length === 0) {
        alert(t("history_cat_empty"));
        return;
    }

    const hasPrices = catData.items.some(item => item.type === 'price' && item.history && item.history.length > 0);
    const hasText = catData.items.some(item => item.type === 'text' && item.history && item.history.length > 0);

    if (hasText && !hasPrices) {
        window.showCategoryTextHistory(catKey, catData);
        return;
    }

    if (!hasPrices && !hasText) {
        alert(t("history_no_data"));
        return;
    }

    if (hasPrices) {
        let allEvents = [];
        catData.items.forEach(item => {
            if (item.type === 'price' && item.history) {
                item.history.forEach(h => {
                    allEvents.push({
                        date: h.date,
                        value: h.value,
                        itemId: item.id
                    });
                });
            }
        });

        // Sort chronologically
        allEvents.sort((a, b) => new Date(a.date) - new Date(b.date));

        const labels = [];
        const lowestPrices = [];
        const currentPrices = {};

        allEvents.forEach(event => {
            currentPrices[event.itemId] = event.value;

            const pricesArray = Object.values(currentPrices);
            const minPrice = Math.min(...pricesArray);

            labels.push(new Date(event.date).toLocaleString());
            lowestPrices.push(minPrice);
        });

        const dataset = {
            label: t("lowest_price_all"),
            data: lowestPrices,
            borderColor: getComputedStyle(document.documentElement).getPropertyValue('--success-color').trim() || '#28a745',
            backgroundColor: 'rgba(40,167,69,0.1)',
            fill: true,
            tension: 0.1,
            stepped: true
        };

        renderChart(`${t("history_chart_title_cat")} "${catData.categoryName}"`, labels, [dataset]);
    }
};

function renderChart(title, labels, datasets) {
    const modal = document.getElementById('historyModal');
    const titleEl = document.getElementById('modalTitle');
    const chartContainer = document.getElementById('priceChartContainer');
    const textHistoryContainer = document.getElementById('textHistoryContainer');
    const ctx = document.getElementById('priceChart').getContext('2d');

    titleEl.innerText = title;
    textHistoryContainer.style.display = 'none';
    chartContainer.style.display = 'block';
    modal.style.display = 'block';

    if (priceChartInstance) {
        priceChartInstance.destroy();
    }

    priceChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: false
                }
            },
            interaction: {
                mode: 'index',
                intersect: false,
            }
        }
    });
}

// Close modal
document.getElementById('closeModalBtn').addEventListener('click', () => {
    document.getElementById('historyModal').style.display = 'none';
});

window.addEventListener('click', (event) => {
    const modal = document.getElementById('historyModal');
    if (event.target == modal) {
        modal.style.display = 'none';
    }
});

function getCategoryTrend(catData) {
    let allEvents = [];
    catData.items.forEach(item => {
        if (item.type === 'price' && item.history) {
            item.history.forEach(h => {
                allEvents.push({ date: h.date, value: h.value, itemId: item.id });
            });
        }
    });

    if (allEvents.length < 2) return '<span style="color: #ffc107; font-size:18px; -webkit-text-stroke: 1px #ffc107; text-shadow: 0px 0px 1px rgba(0,0,0,0.3);" title="${t("no_change")}">○</span>';

    allEvents.sort((a, b) => new Date(a.date) - new Date(b.date));
    const lowestPrices = [];
    const currentPrices = {};
    allEvents.forEach(event => {
        currentPrices[event.itemId] = event.value;
        const minPrice = Math.min(...Object.values(currentPrices));
        if (lowestPrices.length === 0 || lowestPrices[lowestPrices.length - 1] !== minPrice) {
            lowestPrices.push(minPrice);
        }
    });

    if (lowestPrices.length < 2) return '<span style="color: #ffc107; font-size:18px; -webkit-text-stroke: 1px #ffc107; text-shadow: 0px 0px 1px rgba(0,0,0,0.3);" title="${t("no_change")}">○</span>';

    const last = lowestPrices[lowestPrices.length - 1];
    const prev = lowestPrices[lowestPrices.length - 2];

    if (last < prev) return '<span style="color: var(--success-color); font-size:20px; -webkit-text-stroke: 1px var(--success-color); text-shadow: 0px 0px 1px rgba(0,0,0,0.3);" title="${t("price_dropped")}">↓</span>';
    if (last > prev) return '<span style="color: var(--danger-color); font-size:20px; -webkit-text-stroke: 1px var(--danger-color); text-shadow: 0px 0px 1px rgba(0,0,0,0.3);" title="${t("price_increased")}">↑</span>';
    return '<span style="color: #ffc107; font-size:18px; -webkit-text-stroke: 1px #ffc107; text-shadow: 0px 0px 1px rgba(0,0,0,0.3);" title="${t("no_change")}">○</span>';
}

function getItemTrend(item) {
    if (item.type !== 'price' || !item.history || item.history.length < 2) {
        return '<span style="color: #ffc107; font-size:18px; -webkit-text-stroke: 1px #ffc107; text-shadow: 0px 0px 1px rgba(0,0,0,0.3);" title="${t("no_change")}">○</span>';
    }

    const last = item.history[item.history.length - 1].value;
    const prev = item.history[item.history.length - 2].value;

    if (last < prev) return '<span style="color: var(--success-color); font-size:20px; -webkit-text-stroke: 1px var(--success-color); text-shadow: 0px 0px 1px rgba(0,0,0,0.3);" title="${t("price_dropped")}">↓</span>';
    if (last > prev) return '<span style="color: var(--danger-color); font-size:20px; -webkit-text-stroke: 1px var(--danger-color); text-shadow: 0px 0px 1px rgba(0,0,0,0.3);" title="${t("price_increased")}">↑</span>';
    return '<span style="color: #ffc107; font-size:18px; -webkit-text-stroke: 1px #ffc107; text-shadow: 0px 0px 1px rgba(0,0,0,0.3);" title="${t("no_change")}">○</span>';
}

// --- EDIT ITEM MODAL LOGIC ---
window.openEditItemModal = async function (catKey, itemId) {
    const data = await chrome.storage.local.get('trackingData');
    const trackingData = data.trackingData || {};
    const item = trackingData[catKey]?.items.find(i => i.id === itemId);
    if (!item) return;

    document.getElementById('editItemUrl').value = item.url || '';
    document.getElementById('editItemSelector').value = item.selector || '';
    document.getElementById('editItemType').value = item.type || 'price';
    document.getElementById('editItemInterval').value = item.intervalMinutes || 60;
    document.getElementById('editItemJitter').value = item.intervalJitter !== undefined ? item.intervalJitter : 5;
    document.getElementById('editItemMacro').checked = !!item.requiresMacro;
    document.getElementById('editItemUseLowestPrice').checked = item.useLowestPrice !== false;

    document.getElementById('editItemCatKey').value = catKey;
    document.getElementById('editItemId').value = itemId;

    const editPickerBtn = document.getElementById('editStartPickerBtn');
    if (editPickerBtn) {
        editPickerBtn.innerText = t("pick_from_page");
        editPickerBtn.disabled = false;
    }

    document.getElementById('editItemModal').style.display = 'block';
};

document.getElementById('closeEditModalBtn').addEventListener('click', () => {
    document.getElementById('editItemModal').style.display = 'none';
});

window.addEventListener('click', (event) => {
    const editModal = document.getElementById('editItemModal');
    if (event.target == editModal) {
        editModal.style.display = 'none';
    }
});

document.getElementById('saveEditItemBtn').addEventListener('click', async () => {
    const catKey = document.getElementById('editItemCatKey').value;
    const itemId = document.getElementById('editItemId').value;

    const newUrl = document.getElementById('editItemUrl').value.trim();
    const newSelector = document.getElementById('editItemSelector').value.trim();
    const newType = document.getElementById('editItemType').value;
    const newInterval = parseInt(document.getElementById('editItemInterval').value, 10);
    const newJitter = parseInt(document.getElementById('editItemJitter').value, 10);
    const newMacro = document.getElementById('editItemMacro').checked;
    const newUseLowest = document.getElementById('editItemUseLowestPrice').checked;

    if (!newUrl || !newSelector || isNaN(newInterval) || newInterval < 1 || isNaN(newJitter) || newJitter < 0) {
        alert(t("fill_all_fields"));
        return;
    }

    const data = await chrome.storage.local.get('trackingData');
    const trackingData = data.trackingData || {};

    // Check for duplicates excluding current item
    const duplicate = findDuplicateOrOverlappingItem(trackingData, newUrl, newSelector, itemId);
    if (duplicate) {
        if (duplicate.matchType === 'exact') {
            alert(t("duplicate_exact_error", { cat: duplicate.categoryName }));
            return;
        } else if (duplicate.matchType === 'overlap') {
            const confirmed = confirm(t("duplicate_overlap_confirm", {
                cat: duplicate.categoryName,
                sel: duplicate.item.selector
            }));
            if (!confirmed) return;
        } else if (duplicate.matchType === 'same_url') {
            const confirmed = confirm(t("duplicate_same_url_confirm", {
                cat: duplicate.categoryName,
                sel: duplicate.item.selector
            }));
            if (!confirmed) return;
        }
    }

    const itemIndex = trackingData[catKey]?.items.findIndex(i => i.id === itemId);
    if (itemIndex > -1) {
        trackingData[catKey].items[itemIndex].url = newUrl;
        trackingData[catKey].items[itemIndex].selector = newSelector;
        trackingData[catKey].items[itemIndex].type = newType;
        trackingData[catKey].items[itemIndex].intervalMinutes = newInterval;
        trackingData[catKey].items[itemIndex].intervalJitter = newJitter;
        trackingData[catKey].items[itemIndex].requiresMacro = newMacro;
        trackingData[catKey].items[itemIndex].useLowestPrice = newUseLowest;

        await chrome.storage.local.set({ trackingData });

        // Trigger refresh with new parameters immediately
        chrome.runtime.sendMessage({ action: "force_refresh_item", itemId: itemId });

        document.getElementById('editItemModal').style.display = 'none';
        await renderTrackedItems();
        await renderExportCheckboxes();
        alert(t("changes_saved"));
    }
});

// --- GOOGLE DRIVE SYNC ---
function setDriveStatus(text, isError = false) {
    const statusEl = document.getElementById('driveStatusText');
    if (!statusEl) return;
    statusEl.innerText = text;
    statusEl.style.color = isError ? 'var(--danger-color)' : 'var(--text-main)';
}

async function getAuthToken() {
    return new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: true }, function (token) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(token);
            }
        });
    });
}

async function findDriveFile(token, fileName = 'PriceTrackerSyncData.json') {
    const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${fileName}'`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(t("drive_search_error") + response.statusText);
    const data = await response.json();
    return (data.files && data.files.length > 0) ? data.files[0].id : null;
}

async function backupToDrive() {
    try {
        setDriveStatus(t("connecting_drive"));
        const token = await getAuthToken();

        const data = await chrome.storage.local.get(['trackingData', 'settings', 'themePreference']);
        const fileContent = JSON.stringify(data);

        setDriveStatus(t("searching_backup"));
        const existingFileId = await findDriveFile(token);

        setDriveStatus(t("uploading_data"));
        if (existingFileId) {
            // Update existing file
            const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: fileContent
            });
            if (!res.ok) throw new Error(t("drive_update_fail"));
        } else {
            // Create new file
            const metadata = { name: 'PriceTrackerSyncData.json', parents: ['appDataFolder'] };
            const boundary = "-------314159265358979323846";
            const body =
                "\r\n--" + boundary + "\r\n" +
                "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
                JSON.stringify(metadata) + "\r\n" +
                "--" + boundary + "\r\n" +
                "Content-Type: application/json\r\n\r\n" +
                fileContent + "\r\n" +
                "--" + boundary + "--";

            const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': `multipart/related; boundary="${boundary}"`
                },
                body: body
            });
            if (!res.ok) throw new Error(t("drive_create_fail"));
        }

        setDriveStatus(t("drive_success"));
        setTimeout(() => setDriveStatus(""), 3000);
    } catch (err) {
        console.error(err);
        setDriveStatus(t("error_prefix") + err.message, true);
    }
}

async function restoreFromDrive() {
    if (!confirm(t("drive_warn_restore"))) return;

    try {
        setDriveStatus(t("connecting_drive"));
        const token = await getAuthToken();

        setDriveStatus(t("searching_backup"));
        const fileId = await findDriveFile(token);
        if (!fileId) {
            setDriveStatus(t("drive_no_backup"), true);
            return;
        }

        setDriveStatus(t("downloading_data"));
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) throw new Error(t("drive_download_err"));
        const data = await res.json();

        if (data.trackingData || data.settings) {
            await chrome.storage.local.set(data);

            // Recreate alarms
            chrome.alarms.clearAll(() => {
                if (data.trackingData) {
                    for (const catKey in data.trackingData) {
                        data.trackingData[catKey].items.forEach(item => {
                            chrome.alarms.create(`check_item_${item.id}`, { periodInMinutes: item.intervalMinutes || 60 });
                        });
                    }
                }
            });

            setDriveStatus(t("drive_restore_success"));
            setTimeout(() => window.location.reload(), 1500);
        } else {
            setDriveStatus(t("drive_corrupt"), true);
        }

    } catch (err) {
        console.error(err);
        setDriveStatus(t("error_prefix") + err.message, true);
    }
}

// --- FORCED DUPLICATE SCANNER ---
function scanAllDuplicates(trackingData) {
    if (!trackingData) return { clusters: [], totalExact: 0, totalOverlaps: 0, totalSameUrl: 0 };

    const allItems = [];
    for (const catKey in trackingData) {
        const cat = trackingData[catKey];
        if (!cat || !Array.isArray(cat.items)) continue;
        cat.items.forEach(item => {
            allItems.push({
                item,
                catKey,
                categoryName: cat.categoryName || catKey,
                normUrl: normalizeUrl(item.url),
                normSel: normalizeSelector(item.selector)
            });
        });
    }

    const urlGroups = {};
    allItems.forEach(entry => {
        if (!entry.normUrl) return;
        if (!urlGroups[entry.normUrl]) {
            urlGroups[entry.normUrl] = [];
        }
        urlGroups[entry.normUrl].push(entry);
    });

    const duplicateClusters = [];
    let totalExact = 0;
    let totalOverlaps = 0;
    let totalSameUrl = 0;

    for (const [normUrl, entries] of Object.entries(urlGroups)) {
        if (entries.length < 2) continue;

        const analyzedEntries = entries.map((e, idx) => {
            let status = 'same_url';
            for (let j = 0; j < entries.length; j++) {
                if (idx === j) continue;
                const other = entries[j];
                if (e.normSel && other.normSel && e.normSel === other.normSel) {
                    status = 'exact';
                    break;
                } else if (e.normSel && other.normSel && (e.normSel.includes(other.normSel) || other.normSel.includes(e.normSel))) {
                    status = 'overlap';
                }
            }
            return { ...e, duplicateType: status };
        });

        const hasExact = analyzedEntries.some(e => e.duplicateType === 'exact');
        const hasOverlap = analyzedEntries.some(e => e.duplicateType === 'overlap');

        if (hasExact) totalExact++;
        if (hasOverlap) totalOverlaps++;
        totalSameUrl++;

        duplicateClusters.push({
            normUrl,
            displayUrl: entries[0].item.url,
            entries: analyzedEntries,
            hasExact,
            hasOverlap
        });
    }

    return {
        clusters: duplicateClusters,
        totalClusters: duplicateClusters.length,
        totalExact,
        totalOverlaps,
        totalSameUrl
    };
}

async function runDuplicateScan() {
    const data = await chrome.storage.local.get('trackingData');
    const trackingData = data.trackingData || {};

    const resultsDiv = document.getElementById('duplicateScanResults');
    const autoCleanBtn = document.getElementById('autoCleanDuplicatesBtn');
    if (!resultsDiv) return;

    resultsDiv.style.display = 'block';
    resultsDiv.innerHTML = '<p style="color: var(--text-muted);">' + t("loading") + '</p>';

    const scanResult = scanAllDuplicates(trackingData);

    if (scanResult.totalClusters === 0) {
        resultsDiv.innerHTML = `
            <div style="background: var(--success-bg); border: 1px solid var(--success-color); color: var(--text-main); padding: 12px; border-radius: 5px; font-weight: bold;">
                ${t("scan_no_duplicates")}
            </div>
        `;
        if (autoCleanBtn) autoCleanBtn.style.display = 'none';
        return;
    }

    if (autoCleanBtn) {
        autoCleanBtn.style.display = scanResult.totalExact > 0 ? 'inline-block' : 'none';
    }

    let html = `
        <div style="margin-bottom: 12px; font-weight: bold; color: var(--text-main);">
            ${t("scan_found_summary", { count: scanResult.totalClusters })}
        </div>
    `;

    scanResult.clusters.forEach(cluster => {
        html += `
            <div style="background: var(--bg-main); border: 1px solid var(--border-color); border-radius: 6px; padding: 12px; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid var(--border-color); padding-bottom: 6px;">
                    <a href="${escapeHtml(cluster.displayUrl)}" target="_blank" style="color: var(--link-color); font-weight: bold; word-break: break-all; text-decoration: none;">
                        🔗 ${escapeHtml(cluster.displayUrl)}
                    </a>
                    <span style="font-size: 11px; background: var(--header-bg); border: 1px solid var(--border-color); padding: 2px 8px; border-radius: 10px; white-space: nowrap; margin-left: 8px;">
                        ${cluster.entries.length} ${t("products")}
                    </span>
                </div>
                <div>
        `;

        cluster.entries.forEach(entry => {
            let badgeBg = '#3498db';
            let badgeText = t("badge_same_site");
            if (entry.duplicateType === 'exact') {
                badgeBg = 'var(--danger-color)';
                badgeText = t("badge_exact_duplicate");
            } else if (entry.duplicateType === 'overlap') {
                badgeBg = '#e67e22';
                badgeText = t("badge_overlapping");
            }

            const lastVal = (entry.item.history && entry.item.history.length > 0)
                ? `${entry.item.history[entry.item.history.length - 1].value} ${entry.item.currency || '€'}`
                : '-';

            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px dashed var(--row-border); font-size: 13px;">
                    <div style="flex: 1; min-width: 0; margin-right: 10px;">
                        <span style="background: ${badgeBg}; color: #fff; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: bold; margin-right: 6px;">
                            ${badgeText}
                        </span>
                        <strong>${escapeHtml(entry.categoryName)}</strong>: 
                        <code style="background: var(--header-bg); padding: 2px 4px; border-radius: 3px;">${escapeHtml(entry.item.selector)}</code>
                        <span style="color: var(--text-muted); margin-left: 8px;">(${t("last_check")}: <strong>${escapeHtml(lastVal)}</strong>)</span>
                    </div>
                    <button class="danger btn-delete-duplicate" data-catkey="${escapeHtml(entry.catKey)}" data-itemid="${escapeHtml(entry.item.id)}" style="padding: 4px 8px; font-size: 11px;">
                        ${t("delete_duplicate_btn")}
                    </button>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    });

    resultsDiv.innerHTML = html;

    // Event listeners for deleting individual duplicates
    resultsDiv.querySelectorAll('.btn-delete-duplicate').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const catKey = e.currentTarget.dataset.catkey;
            const itemId = e.currentTarget.dataset.itemid;
            await window.deleteItem(catKey, itemId);
            await runDuplicateScan();
        });
    });
}

async function autoCleanExactDuplicates() {
    if (!confirm(t("confirm_delete") || "Are you sure you want to automatically remove all exact duplicates?")) return;

    const data = await chrome.storage.local.get('trackingData');
    const trackingData = data.trackingData || {};

    const seen = new Set();
    let removedCount = 0;

    for (const catKey in trackingData) {
        const cat = trackingData[catKey];
        if (!cat || !Array.isArray(cat.items)) continue;

        const newItems = [];
        for (const item of cat.items) {
            const key = `${normalizeUrl(item.url)}|${normalizeSelector(item.selector)}`;
            if (seen.has(key)) {
                removedCount++;
                chrome.alarms.clear(`check_item_${item.id}`);
            } else {
                seen.add(key);
                newItems.push(item);
            }
        }
        trackingData[catKey].items = newItems;
    }

    if (removedCount > 0) {
        await chrome.storage.local.set({ trackingData });
        await renderTrackedItems();
        await renderExportCheckboxes();
        await runDuplicateScan();
        alert(t("auto_clean_success", { count: removedCount }));
    } else {
        alert(t("no_exact_duplicates_to_clean"));
    }
}
