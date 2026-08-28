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

    // Open options page button
    document.getElementById('openOptionsBtn').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
        window.close(); 
    });

    // Force refresh all button
    document.getElementById('refreshAllBtn').addEventListener('click', () => {
        const btn = document.getElementById('refreshAllBtn');
        btn.innerText = t("refreshing");
        btn.disabled = true;
        btn.style.backgroundColor = "var(--text-muted)";

        chrome.runtime.sendMessage({ action: "force_refresh_all" }, () => {
            setTimeout(() => {
                btn.innerText = t("started");
                setTimeout(() => window.close(), 1500);
            }, 500);
        });
    });

    // Event delegation for list clicks
    document.getElementById('trackedItemsList').addEventListener('click', handleListClicks);
    document.getElementById('textHistoryContainer').addEventListener('click', handleListClicks);

    // Auto re-render on storage changes
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.trackingData) {
            renderTrackedItems();
        }
    });

    await renderTrackedItems();
});

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
    } catch(e) {
        return '';
    }
}

async function renderTrackedItems() {
    const container = document.getElementById('trackedItemsList');
    const data = await chrome.storage.local.get('trackingData');
    const trackingData = data.trackingData || {};

    container.innerHTML = ''; 

    if (Object.keys(trackingData).length === 0) {
        container.innerHTML = `<p style="color: var(--text-muted); text-align:center;">${t("no_items")}</p>`;
        return;
    }

    for (const [catKey, catData] of Object.entries(trackingData)) {
        if (!catData || !Array.isArray(catData.items) || catData.items.length === 0) continue;

        const catBlock = document.createElement('div');
        catBlock.className = 'category-block';

        let catBestPrice = Infinity;
        let hasPrice = false;
        let hasUnreadText = false;

        catData.items.forEach(item => {
            if (item.type === 'price' && item.history && item.history.length > 0) {
                const currentVal = item.history[item.history.length - 1].value;
                if (typeof currentVal === 'number' && currentVal < catBestPrice) {
                    catBestPrice = currentVal;
                    hasPrice = true;
                }
            } else if (item.type === 'text') {
                if (item.hasUnreadTextChange) {
                    hasUnreadText = true;
                }
            }
        });

        const catCurrency = catData.items.find(i => i.type === 'price')?.currency || '€';
        const catTrend = hasPrice ? getCategoryTrend(catData) : '';
        const unreadBadge = hasUnreadText ? `<span class="badge-text-changed" title="${t("text_changed_badge")}">⚠️</span>` : '';
        const catPriceSummary = hasPrice 
            ? `<span style="color: var(--success-color); font-weight: bold; display: flex; align-items: center; gap: 4px;">(${catBestPrice} ${catCurrency}) ${catTrend}</span>` 
            : '';

        const isAllText = catData.items.every(i => i.type === 'text');
        const catHistoryIcon = isAllText ? '📝' : '📈';

        const header = document.createElement('div');
        header.className = 'category-header';
        header.innerHTML = `
            <div class="toggle-cat" data-catkey="${escapeHtml(catKey)}" style="cursor: pointer; flex-grow: 1; display: flex; align-items: center; font-size:12px; gap: 4px;">
                <span>📁 <b>${escapeHtml(catData.categoryName)}</b></span>
                ${catPriceSummary}
                ${unreadBadge}
                <span class="arrow-icon">▾</span>
            </div>
            <div class="header-actions">
                <button class="success btn-cat-refresh" data-catkey="${escapeHtml(catKey)}" title="${t("refresh_all_title")}">🔄</button>
                <button class="success btn-cat-history" data-catkey="${escapeHtml(catKey)}" title="${t('history_title')}">${catHistoryIcon}</button>
            </div>
        `;
        catBlock.appendChild(header);

        const itemsContainer = document.createElement('div');
        itemsContainer.id = `items_${catKey}`;
        itemsContainer.style.display = 'none';

        catData.items.forEach(item => {
            const row = document.createElement('div');
            row.className = 'item-row';
            
            let domain = t("site");
            try { domain = new URL(item.url).hostname.replace('www.', ''); } catch(e){}

            const isError = item.lastCheckStatus === 'error';
            const errorBadge = isError 
                ? ` <b class="badge-error" title="${escapeHtml(getTranslatedError(item.lastError))}" style="color: var(--danger-color); font-size: 15px; font-weight: 900; margin-left: 5px; cursor: help; line-height: 1;">!</b>` 
                : '';

            let lastCheckInfo = "";
            if (isError) {
                const lastValidIso = item.lastSuccessfulCheck || (item.history && item.history.length > 0 ? item.history[item.history.length - 1].date : null);
                const validText = lastValidIso ? formatDateTime(lastValidIso) : t("no_data");
                const attemptText = item.lastChecked ? formatDateTime(item.lastChecked) : '';
                lastCheckInfo = `<span style="font-size: 11px; color: var(--danger-color); font-weight: 500;">🕒 ${validText} (${t("last_attempt")}: ${attemptText})</span>`;
            } else {
                const checkIso = item.lastSuccessfulCheck || item.lastChecked || (item.history && item.history.length > 0 ? item.history[item.history.length - 1].date : null);
                if (checkIso) {
                    lastCheckInfo = `<span style="font-size: 11px; color: var(--text-muted);">🕒 ${formatDateTime(checkIso)}</span>`;
                }
            }

            let mainContentHtml = '';

            if (item.type === 'price') {
                const currency = item.currency || '€';
                const currentVal = (item.history && item.history.length > 0) ? `${item.history[item.history.length - 1].value} ${currency}` : t("no_data");
                const itemTrend = getItemTrend(item);

                mainContentHtml = `
                    <div style="font-size: 13px; font-weight: bold; color: var(--text-strong); margin-top: 2px;">
                        <span>${t("current_price")}: ${currentVal} ${itemTrend}${errorBadge}</span>
                    </div>
                `;
            } else {
                // Text tracking display
                const history = item.history || [];
                const currentVal = history.length > 0 ? history[history.length - 1].value : t("no_data");
                const isChanged = item.hasUnreadTextChange || (item.reviewedText && item.reviewedText !== currentVal && history.length > 1);

                if (isChanged) {
                    let diffDisplay = '';
                    if (item.previousText && item.previousText !== currentVal) {
                        diffDisplay = `<div style="margin-top: 2px;"><b>${t("diff_label")}:</b> ${computeTextDiff(item.previousText, currentVal)}</div>`;
                    } else {
                        diffDisplay = `<div style="margin-top: 2px;"><mark class="diff-ins">${escapeHtml(currentVal)}</mark></div>`;
                    }

                    mainContentHtml = `
                        <div class="text-changed-box">
                            <div style="font-weight: bold; color: #856404; display: flex; justify-content: space-between; align-items: center;">
                                <span>${t("current_text")}: <span class="badge-text-changed">⚠️ ${t("text_changed_badge")}</span></span>
                                <button class="btn-mark-reviewed" data-catkey="${escapeHtml(catKey)}" data-itemid="${escapeHtml(item.id)}" title="${t("mark_reviewed_btn")}">
                                    ${t("mark_reviewed_btn")}
                                </button>
                            </div>
                            ${diffDisplay}
                        </div>
                    `;
                } else {
                    mainContentHtml = `
                        <div style="font-size: 12px; margin-top: 2px;">
                            <span style="font-weight: bold; color: var(--text-strong);">${t("current_text")}:</span>
                            <div class="text-preview-box">${escapeHtml(currentVal)}</div>
                        </div>
                    `;
                }
            }

            row.innerHTML = `
                <div class="item-details">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <a href="${escapeHtml(item.url)}" target="_blank" style="text-decoration: none; color: var(--link-color); font-weight: bold; font-size: 13px;">${escapeHtml(domain)}</a>
                        ${lastCheckInfo}
                    </div>
                    ${mainContentHtml}
                </div>
                <div class="item-actions">
                    <button class="success btn-item-refresh" data-itemid="${escapeHtml(item.id)}" title="${t("refresh_btn")}">🔄</button>
                    <button class="success btn-item-history" data-catkey="${escapeHtml(catKey)}" data-itemid="${escapeHtml(item.id)}" title="${t("history_btn")}">
                        ${item.type === 'text' ? '📝' : '📈'}
                    </button>
                </div>
            `;
            itemsContainer.appendChild(row);
        });

        catBlock.appendChild(itemsContainer);
        container.appendChild(catBlock);
    }
}

async function handleListClicks(e) {
    const target = e.target;
    if (target.classList.contains('btn-cat-history')) {
        showCategoryHistory(target.dataset.catkey);
    } else if (target.classList.contains('btn-cat-refresh')) {
        chrome.runtime.sendMessage({ action: "force_refresh_category", catKey: target.dataset.catkey });
        target.innerText = "⏳";
        setTimeout(() => target.innerText = "🔄", 2000);
    } else if (target.classList.contains('btn-item-history') || target.closest('.btn-item-history')) {
        const btn = target.classList.contains('btn-item-history') ? target : target.closest('.btn-item-history');
        const data = await chrome.storage.local.get('trackingData');
        const trackingData = data.trackingData || {};
        const catKey = btn.dataset.catkey;
        const itemId = btn.dataset.itemid;
        const item = trackingData[catKey]?.items.find(i => i.id === itemId);

        if (item) {
            if (item.type === 'text') {
                showTextItemHistory(catKey, itemId, item, trackingData[catKey]?.categoryName);
            } else {
                showItemHistory(catKey, itemId);
            }
        }
    } else if (target.classList.contains('btn-item-refresh')) {
        chrome.runtime.sendMessage({ action: "force_refresh_item", itemId: target.dataset.itemid });
        target.innerText = "⏳";
        setTimeout(() => target.innerText = "🔄", 2000);
    } else if (target.classList.contains('btn-mark-reviewed')) {
        const catKey = target.dataset.catkey;
        const itemId = target.dataset.itemid;
        await markTextItemReviewed(catKey, itemId);
    } else if (target.classList.contains('btn-mark-cat-reviewed')) {
        const catKey = target.dataset.catkey;
        await markAllCategoryTextReviewed(catKey);
    } else if (target.closest('.toggle-cat')) {
        const toggleBtn = target.closest('.toggle-cat');
        const catKey = toggleBtn.dataset.catkey;
        const itemsDiv = document.getElementById(`items_${catKey}`);
        if (itemsDiv) {
            const isHidden = itemsDiv.style.display === 'none';
            itemsDiv.style.display = isHidden ? 'block' : 'none';
            const span = toggleBtn.querySelector('.arrow-icon');
            if (span) {
                span.innerText = isHidden ? '▴' : '▾';
            }
        }
    }
}

async function markTextItemReviewed(catKey, itemId) {
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

        // If history modal is currently open, refresh its view
        const modal = document.getElementById('historyModal');
        if (modal.style.display === 'block') {
            const titleEl = document.getElementById('modalTitle');
            if (titleEl.innerText.includes(t("cat_text_history_title"))) {
                showCategoryTextHistory(catKey, trackingData[catKey]);
            } else {
                showTextItemHistory(catKey, itemId, item, trackingData[catKey]?.categoryName);
            }
        }
    }
}

async function markAllCategoryTextReviewed(catKey) {
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
            showCategoryTextHistory(catKey, catData);
        }
    }
}

function showTextItemHistory(catKey, itemId, item, categoryName) {
    const modal = document.getElementById('historyModal');
    const titleEl = document.getElementById('modalTitle');
    const chartContainer = document.getElementById('priceChartContainer');
    const textHistoryContainer = document.getElementById('textHistoryContainer');

    let siteName = t("site");
    try { siteName = new URL(item.url).hostname.replace('www.', ''); } catch(e) {}

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

    // Reverse history to show newest changes first
    const reversed = [...history].reverse();
    for (let idx = 0; idx < reversed.length; idx++) {
        const entry = reversed[idx];
        const prevEntry = (idx + 1 < reversed.length) ? reversed[idx + 1] : null;
        const isLatest = idx === 0;
        const versionNum = history.length - idx;

        let diffHtml = '';
        if (prevEntry) {
            diffHtml = `
                <div style="margin-top: 6px; font-size: 12px;">
                    <b>${t("diff_label")}:</b><br>
                    <div style="padding: 6px 8px; background: var(--bg-container); border: 1px solid var(--border-color); border-radius: 4px; margin-top: 4px;">
                        ${computeTextDiff(prevEntry.value, entry.value)}
                    </div>
                </div>
            `;
        } else {
            diffHtml = `
                <div style="margin-top: 4px; font-size: 11px; color: var(--text-muted); font-style: italic;">
                    📌 ${t("initial_version")}
                </div>
            `;
        }

        const isUnreviewed = isLatest && (item.hasUnreadTextChange || (item.reviewedText && item.reviewedText !== entry.value && history.length > 1));
        const statusBadge = isUnreviewed 
            ? `<span class="badge-text-changed">⚠️ ${t("unreviewed_state")}</span>` 
            : `<span style="font-size: 10px; color: var(--success-color); font-weight: bold;">✓ ${t("reviewed_state")}</span>`;

        const markBtn = isUnreviewed ? `
            <button class="btn-mark-reviewed" data-catkey="${escapeHtml(catKey)}" data-itemid="${escapeHtml(item.id)}" style="margin: 0; padding: 2px 6px;">
                ${t("mark_reviewed_btn")}
            </button>
        ` : '';

        html += `
            <div class="text-history-card ${isLatest ? 'latest' : ''}">
                <div class="text-history-header">
                    <span><b>#${versionNum}</b> • 🕒 ${formatDateTime(entry.date)}</span>
                    <div style="display: flex; align-items: center; gap: 6px;">${statusBadge} ${markBtn}</div>
                </div>
                ${diffHtml}
                <div style="margin-top: 8px; font-size: 11px; color: var(--text-muted);">
                    <details>
                        <summary style="cursor: pointer;">${t("full_text_label")}</summary>
                        <div style="padding: 4px 6px; background: var(--bg-container); border: 1px solid var(--border-color); border-radius: 3px; margin-top: 4px; white-space: pre-wrap;">${escapeHtml(entry.value)}</div>
                    </details>
                </div>
            </div>
        `;
    }

    html += `</div>`;
    textHistoryContainer.innerHTML = html;
    modal.style.display = 'block';
}

function showCategoryTextHistory(catKey, catData) {
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
        try { domain = new URL(item.url).hostname.replace('www.', ''); } catch(e){}

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
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: var(--bg-main); border: 1px solid var(--border-color); border-radius: 5px; margin-bottom: 5px;">
                <span style="font-size: 11px; font-weight: bold; color: var(--text-strong);">⚠️ ${unreviewedCount} ${t("text_changed_badge")}</span>
                <button class="btn-mark-cat-reviewed" data-catkey="${escapeHtml(catKey)}" style="background-color: #ffc107; color: #212529; border: none; padding: 3px 6px; font-size: 10px; border-radius: 3px; font-weight: bold; cursor: pointer;">
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
                <div style="margin-top: 6px; font-size: 12px;">
                    <b>${t("diff_label")}:</b><br>
                    <div style="padding: 6px 8px; background: var(--bg-container); border: 1px solid var(--border-color); border-radius: 4px; margin-top: 4px;">
                        ${computeTextDiff(ev.prevValue, ev.value)}
                    </div>
                </div>
            `;
        } else {
            diffHtml = `
                <div style="margin-top: 4px; font-size: 11px; color: var(--text-muted); font-style: italic;">
                    📌 ${t("initial_version")}
                </div>
            `;
        }

        const statusBadge = ev.isUnreviewed 
            ? `<span class="badge-text-changed">⚠️ ${t("unreviewed_state")}</span>` 
            : `<span style="font-size: 10px; color: var(--success-color); font-weight: bold;">✓ ${t("reviewed_state")}</span>`;

        const markBtn = ev.isUnreviewed ? `
            <button class="btn-mark-reviewed" data-catkey="${escapeHtml(catKey)}" data-itemid="${escapeHtml(ev.itemId)}" style="margin: 0; padding: 2px 6px;">
                ${t("mark_reviewed_btn")}
            </button>
        ` : '';

        html += `
            <div class="text-history-card ${ev.isLatest ? 'latest' : ''}">
                <div class="text-history-header">
                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                        <a href="${escapeHtml(ev.url)}" target="_blank" style="text-decoration: none; color: var(--link-color); font-weight: bold; font-size: 12px;">🌐 ${escapeHtml(ev.domain)}</a>
                        <span>(<b>#${ev.versionNum}</b> • 🕒 ${formatDateTime(ev.date)})</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">${statusBadge} ${markBtn}</div>
                </div>
                ${diffHtml}
                <div style="margin-top: 8px; font-size: 11px; color: var(--text-muted);">
                    <details>
                        <summary style="cursor: pointer;">${t("full_text_label")}</summary>
                        <div style="padding: 4px 6px; background: var(--bg-container); border: 1px solid var(--border-color); border-radius: 3px; margin-top: 4px; white-space: pre-wrap;">${escapeHtml(ev.value)}</div>
                    </details>
                </div>
            </div>
        `;
    }

    html += `</div>`;
    textHistoryContainer.innerHTML = html;
    modal.style.display = 'block';
}

async function showItemHistory(catKey, itemId) {
    const data = await chrome.storage.local.get('trackingData');
    const trackingData = data.trackingData || {};
    const item = trackingData[catKey]?.items.find(i => i.id === itemId);

    if (!item || !item.history || item.history.length === 0) {
        alert(t("history_no_data"));
        return;
    }

    if (item.type !== 'price') return;

    const labels = item.history.map(h => new Date(h.date).toLocaleDateString());
    const prices = item.history.map(h => h.value);
    
    let siteName = t("site");
    try { siteName = new URL(item.url).hostname; } catch(e) {}

    const dataset = {
        label: `${t("type_price")} @ ${siteName}`,
        data: prices,
        borderColor: getComputedStyle(document.documentElement).getPropertyValue('--link-color').trim() || '#007bff',
        backgroundColor: 'rgba(0,123,255,0.1)',
        fill: true,
        tension: 0.1,
        stepped: true
    };

    renderChart(`${t("history_chart_title_site")} ${siteName}`, labels, [dataset]);
}

async function showCategoryHistory(catKey) {
    const data = await chrome.storage.local.get('trackingData');
    const trackingData = data.trackingData || {};
    const catData = trackingData[catKey];

    if (!catData || !catData.items || catData.items.length === 0) return;

    const hasPrices = catData.items.some(item => item.type === 'price' && item.history && item.history.length > 0);
    const hasText = catData.items.some(item => item.type === 'text' && item.history && item.history.length > 0);

    if (hasText && !hasPrices) {
        showCategoryTextHistory(catKey, catData);
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
                    allEvents.push({ date: h.date, value: h.value, itemId: item.id });
                });
            }
        });

        allEvents.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        const labels = [];
        const lowestPrices = [];
        const currentPrices = {}; 

        allEvents.forEach(event => {
            currentPrices[event.itemId] = event.value;
            const pricesArray = Object.values(currentPrices);
            const minPrice = Math.min(...pricesArray);
            
            labels.push(new Date(event.date).toLocaleDateString());
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

        renderChart(`${t("best_price")}: ${catData.categoryName}`, labels, [dataset]);
    }
}

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
        data: { labels: labels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: false } },
            interaction: { mode: 'index', intersect: false }
        }
    });
}

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