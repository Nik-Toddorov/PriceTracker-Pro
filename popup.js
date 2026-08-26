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
        if (catData.items.length === 0) continue;

        const catBlock = document.createElement('div');
        catBlock.className = 'category-block';

        let catBestPrice = Infinity;
        let hasPrice = false;
        catData.items.forEach(item => {
            if (item.type === 'price' && item.history && item.history.length > 0) {
                const currentVal = item.history[item.history.length - 1].value;
                if (currentVal < catBestPrice) {
                    catBestPrice = currentVal;
                    hasPrice = true;
                }
            }
        });
        const catCurrency = catData.items[0]?.currency || '€';
        const catBestPriceText = hasPrice ? `${catBestPrice} ${catCurrency}` : t("no_data");
        const catTrend = getCategoryTrend(catData);

        const header = document.createElement('div');
        header.className = 'category-header';
        header.innerHTML = `
            <div class="toggle-cat" data-catkey="${escapeHtml(catKey)}" style="cursor: pointer; flex-grow: 1; display: flex; align-items: center; font-size:12px;">
                <span style="margin-right: 5px;">📁 <b>${escapeHtml(catData.categoryName)}</b></span>
                <span style="color: var(--success-color); font-weight: bold; display: flex; align-items: center; gap: 4px;">
                    (${catBestPriceText}) ${catTrend} <span class="arrow-icon">▾</span>
                </span>
            </div>
            <div class="header-actions">
                <button class="success btn-cat-refresh" data-catkey="${escapeHtml(catKey)}" title="${t("refresh_all_title")}">🔄</button>
                <button class="success btn-cat-history" data-catkey="${escapeHtml(catKey)}" title="${t('history_title')}">📈</button>
            </div>
        `;
        catBlock.appendChild(header);

        const itemsContainer = document.createElement('div');
        itemsContainer.id = `items_${catKey}`;
        itemsContainer.style.display = 'none';

        catData.items.forEach(item => {
            const row = document.createElement('div');
            row.className = 'item-row';
            
            let currentPriceDisplay = t("no_data");
            if (item.history && item.history.length > 0) {
                if (item.type === 'price') {
                    const currency = item.currency || '€';
                    const currentVal = item.history[item.history.length - 1].value;
                    currentPriceDisplay = `${currentVal} ${currency}`;
                } else {
                    currentPriceDisplay = t("checked");
                }
            }

            let domain = t("site");
            try { domain = new URL(item.url).hostname.replace('www.', ''); } catch(e){}
            const itemTrend = getItemTrend(item);

            const isError = item.lastCheckStatus === 'error';
            const errorBadge = isError 
                ? ` <b class="badge-error" title="${escapeHtml(getTranslatedError(item.lastError))}" style="color: var(--danger-color); font-size: 15px; font-weight: 900; margin-left: 5px; cursor: help; line-height: 1;">!</b>` 
                : '';

            let lastCheckInfo = "";
            if (isError) {
                const lastValidIso = item.lastSuccessfulCheck || (item.history && item.history.length > 0 ? item.history[item.history.length - 1].date : null);
                const validText = lastValidIso ? formatDateTime(lastValidIso) : t("no_data");
                const attemptText = item.lastChecked ? formatDateTime(item.lastChecked) : '';
                lastCheckInfo = `<br><span style="font-size: 11px; color: var(--danger-color); font-weight: 500;">🕒 ${validText} (${t("last_attempt")}: ${attemptText})</span>`;
            } else {
                const checkIso = item.lastSuccessfulCheck || item.lastChecked || (item.history && item.history.length > 0 ? item.history[item.history.length - 1].date : null);
                if (checkIso) {
                    lastCheckInfo = `<br><span style="font-size: 11px; color: var(--text-muted);">🕒 ${formatDateTime(checkIso)}</span>`;
                }
            }

            row.innerHTML = `
                <div class="item-details">
                    <a href="${escapeHtml(item.url)}" target="_blank" style="text-decoration: none; color: var(--link-color); font-weight: bold;">${escapeHtml(domain)}</a><br>
                    <span style="font-size: 13px; font-weight: bold; color: var(--text-strong);">${t("current_price")}: ${currentPriceDisplay} ${itemTrend}${errorBadge}</span>
                    ${lastCheckInfo}
                </div>
                <div class="item-actions">
                    <button class="success btn-item-refresh" data-itemid="${escapeHtml(item.id)}">${t("refresh_btn")}</button>
                    <button class="success btn-item-history" data-catkey="${escapeHtml(catKey)}" data-itemid="${escapeHtml(item.id)}">${t("history_btn")}</button>
                </div>
            `;
            itemsContainer.appendChild(row);
        });

        catBlock.appendChild(itemsContainer);
        container.appendChild(catBlock);
    }
}

function handleListClicks(e) {
    const target = e.target;
    if (target.classList.contains('btn-cat-history')) {
        showCategoryHistory(target.dataset.catkey);
    } else if (target.classList.contains('btn-cat-refresh')) {
        chrome.runtime.sendMessage({ action: "force_refresh_category", catKey: target.dataset.catkey });
        target.innerText = "⏳";
        setTimeout(() => target.innerText = t("refresh_btn"), 2000);
    } else if (target.classList.contains('btn-item-history')) {
        showItemHistory(target.dataset.catkey, target.dataset.itemid);
    } else if (target.classList.contains('btn-item-refresh')) {
        chrome.runtime.sendMessage({ action: "force_refresh_item", itemId: target.dataset.itemid });
        target.innerText = "⏳";
        setTimeout(() => target.innerText = t("refresh_btn"), 2000);
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

    let allEvents = [];
    catData.items.forEach(item => {
        if (item.type === 'price' && item.history) {
            item.history.forEach(h => {
                allEvents.push({ date: h.date, value: h.value, itemId: item.id });
            });
        }
    });

    if (allEvents.length === 0) {
        alert(t("history_no_data"));
        return;
    }

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

function renderChart(title, labels, datasets) {
    const modal = document.getElementById('historyModal');
    const titleEl = document.getElementById('modalTitle');
    const ctx = document.getElementById('priceChart').getContext('2d');

    titleEl.innerText = title;
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