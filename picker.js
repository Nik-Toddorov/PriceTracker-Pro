if (!window.priceTrackerPickerInjected) {
    window.priceTrackerPickerInjected = true;

    let pickerActive = false;
    let hoveredElement = null;
    let overlay = null;
    let panelRoot = null;
    let shadow = null;
    let isPaused = false;

    const trans = {
        en: {
            title: "Select Element",
            space: "Press SPACE to pause (Esc to exit)",
            paused: "PAUSED (Press SPACE to continue)",
            selector: "🎯 Selector:",
            detectedPrice: "💰 Detected price:",
            hoverPrompt: "Hover mouse over element..."
        },
        bg: {
            title: "Избор на елемент",
            space: "Натисни SPACE за пауза (Esc за изход)",
            paused: "ПАУЗИРАНО (Натисни SPACE за продължаване)",
            selector: "🎯 Селектор:",
            detectedPrice: "💰 Открита цена:",
            hoverPrompt: "Наведи мишката над елемент..."
        }
    };
    let lang = 'en';
    let animFrameId = null;
    function t(k) { return trans[lang][k] || k; }

    function initPicker() {
        if (pickerActive) return;
        pickerActive = true;
        isPaused = false;

        // Create highlight overlay
        overlay = document.createElement('div');
        overlay.id = 'price-tracker-overlay';
        document.body.appendChild(overlay);

        // Create Shadow DOM panel
        panelRoot = document.createElement('div');
        panelRoot.id = 'price-tracker-panel-root';
        document.body.appendChild(panelRoot);
        
        shadow = panelRoot.attachShadow({ mode: 'open' });

        chrome.storage.local.get(['settings', 'themePreference'], (d) => {
            if (d.settings && d.settings.language) lang = d.settings.language;
            const theme = d.themePreference || 'auto';
            if (theme === 'dark') panelRoot.classList.add('theme-dark');
            else if (theme === 'light') panelRoot.classList.add('theme-light');
            
            if (shadow) {
                const headerSpan = shadow.querySelector('.header span:first-child');
                if (headerSpan) headerSpan.innerText = trans[lang].title;
                const statusSpan = shadow.getElementById('status-text');
                if (statusSpan && !isPaused) statusSpan.innerText = trans[lang].space;
                const treeView = shadow.getElementById('tree-view');
                if (treeView && !hoveredElement) treeView.innerText = trans[lang].hoverPrompt;
            }
        });
        
        const style = document.createElement('style');
        style.textContent = `
            #picker-panel {
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 550px;
                background: #fff;
                border: 2px solid #007bff;
                border-radius: 8px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.3);
                font-family: monospace;
                z-index: 2147483647;
                display: flex;
                flex-direction: column;
                color: #333;
                overflow: hidden;
                font-size: 13px;
            }
            .header {
                background: #007bff;
                color: white;
                padding: 10px;
                font-weight: bold;
                font-family: sans-serif;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .header button {
                background: none;
                border: none;
                color: white;
                cursor: pointer;
                font-size: 16px;
            }
            .tree-view {
                padding: 10px;
                max-height: 450px;
                overflow-y: auto;
                background: #f8f9fa;
            }
            .node {
                padding: 4px;
                cursor: pointer;
                border-radius: 3px;
                margin: 2px 0;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .node:hover {
                background: #e9ecef;
                outline: 1px solid #007bff;
            }
            .node.active {
                background: #cce5ff;
                font-weight: bold;
                border-left: 3px solid #007bff;
            }
            .tag { color: #d63384; }
            .attr { color: #0dcaf0; }
            .val { color: #198754; }
            .text { color: #212529; font-family: sans-serif; font-size: 12px; margin-left: 15px; }
            #status-text { font-size: 12px; font-weight: normal; margin-top: 4px; color: #e9ecef; }
            
            @media (prefers-color-scheme: dark) {
                :host(:not(.theme-light)) #picker-panel { background: #1e1f20; border-color: #a8c7fa; color: #e3e3e3; box-shadow: 0 10px 25px rgba(0,0,0,0.8); }
                :host(:not(.theme-light)) .header { background: #282a2c; color: #e3e3e3; border-bottom: 1px solid #444746; }
                :host(:not(.theme-light)) .tree-view { background: #131314; }
                :host(:not(.theme-light)) .node:hover { background: #282a2c; outline-color: #a8c7fa; }
                :host(:not(.theme-light)) .node.active { background: #004a77; border-left-color: #a8c7fa; }
                :host(:not(.theme-light)) .tag { color: #f28b82; }
                :host(:not(.theme-light)) .attr { color: #8ab4f8; }
                :host(:not(.theme-light)) .val { color: #81c995; }
                :host(:not(.theme-light)) .text { color: #c4c7c5; }
                :host(:not(.theme-light)) #status-text { color: #c4c7c5; }
            }
            :host(.theme-dark) #picker-panel { background: #1e1f20; border-color: #a8c7fa; color: #e3e3e3; box-shadow: 0 10px 25px rgba(0,0,0,0.8); }
            :host(.theme-dark) .header { background: #282a2c; color: #e3e3e3; border-bottom: 1px solid #444746; }
            :host(.theme-dark) .tree-view { background: #131314; }
            :host(.theme-dark) .node:hover { background: #282a2c; outline-color: #a8c7fa; }
            :host(.theme-dark) .node.active { background: #004a77; border-left-color: #a8c7fa; }
            :host(.theme-dark) .tag { color: #f28b82; }
            :host(.theme-dark) .attr { color: #8ab4f8; }
            :host(.theme-dark) .val { color: #81c995; }
            :host(.theme-dark) .text { color: #c4c7c5; }
            :host(.theme-dark) #status-text { color: #c4c7c5; }
        `;
        
        const panel = document.createElement('div');
        panel.id = 'picker-panel';
        panel.innerHTML = `
            <div class="header">
                <div style="display:flex; flex-direction:column;">
                    <span>${t("title")}</span>
                    <span id="status-text">${t("space")}</span>
                </div>
                <button id="close-picker">✖</button>
            </div>
            <div class="tree-view" id="tree-view">${t("hoverPrompt")}</div>
        `;
        
        shadow.appendChild(style);
        shadow.appendChild(panel);

        shadow.getElementById('close-picker').addEventListener('click', stopPicker);

        document.addEventListener('mousemove', handleMouseMove, true);
        document.addEventListener('click', handleClick, true);
        document.addEventListener('keydown', handleKeyDown, true);
    }

    function stopPicker() {
        pickerActive = false;
        if (animFrameId) {
            cancelAnimationFrame(animFrameId);
            animFrameId = null;
        }
        document.removeEventListener('mousemove', handleMouseMove, true);
        document.removeEventListener('click', handleClick, true);
        document.removeEventListener('keydown', handleKeyDown, true);
        if (overlay) overlay.remove();
        if (panelRoot) panelRoot.remove();
    }

    function handleKeyDown(e) {
        if (e.code === 'Space') {
            e.preventDefault();
            e.stopPropagation();
            isPaused = !isPaused;
            const statusEl = shadow.getElementById('status-text');
            if (isPaused) {
                statusEl.innerText = t("paused");
                statusEl.style.color = "#ffc107";
                statusEl.style.fontWeight = "bold";
            } else {
                statusEl.innerText = t("space");
                statusEl.style.color = "#e9ecef";
                statusEl.style.fontWeight = "normal";
            }
        } else if (e.code === 'Escape') {
            stopPicker();
        }
    }

    function getCssSelector(el) {
        if (!(el instanceof Element)) return "";
        
        // 1. If element has a valid unique ID
        if (el.id && !/^\d+$/.test(el.id) && !el.id.includes('ember') && !el.id.includes('react-')) {
            try {
                if (document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) {
                    return '#' + CSS.escape(el.id);
                }
            } catch (e) {}
        }

        // 2. Check if element has unique meaningful classes
        if (el.className && typeof el.className === 'string') {
            const classes = el.className.split(/\s+/).filter(c => 
                c && 
                !/^(active|hover|focus|selected|open|closed|show|hide|visible|ng-|css-|styled-)/i.test(c) &&
                !/^\d+$/.test(c)
            );
            
            if (classes.length > 0) {
                const tag = el.nodeName.toLowerCase();
                const classSel = '.' + classes.map(c => CSS.escape(c)).join('.');
                try {
                    if (document.querySelectorAll(classSel).length === 1) {
                        return classSel;
                    }
                    if (document.querySelectorAll(tag + classSel).length === 1) {
                        return tag + classSel;
                    }
                } catch (e) {}
            }
        }

        // 3. Try standard semantic/eCommerce attributes
        for (const attr of ['itemprop', 'data-testid', 'data-qa', 'data-cy', 'data-test']) {
            const val = el.getAttribute(attr);
            if (val) {
                const attrSel = `[${attr}="${CSS.escape(val)}"]`;
                try {
                    if (document.querySelectorAll(attrSel).length === 1) {
                        return attrSel;
                    }
                } catch (e) {}
            }
        }

        // 4. Concise hierarchical path (max 3 levels)
        const path = [];
        let curr = el;
        let depth = 0;

        while (curr && curr.nodeType === Node.ELEMENT_NODE && depth < 3) {
            let seg = curr.nodeName.toLowerCase();

            if (curr.id && !/^\d+$/.test(curr.id) && !curr.id.includes('ember')) {
                try {
                    seg += '#' + CSS.escape(curr.id);
                    path.unshift(seg);
                    break;
                } catch(e) {}
            }

            if (curr.className && typeof curr.className === 'string') {
                const validClasses = curr.className.split(/\s+/).filter(c => 
                    c && !/^(active|hover|focus|selected|open|show|hide|ng-|css-)/i.test(c) && !/^\d+$/.test(c)
                );
                if (validClasses.length > 0) {
                    seg += '.' + CSS.escape(validClasses[0]);
                }
            }

            if (!seg.includes('.') && !seg.includes('#')) {
                let sib = curr, nth = 1;
                while (sib = sib.previousElementSibling) {
                    if (sib.nodeName === curr.nodeName) nth++;
                }
                if (nth > 1) {
                    seg += `:nth-of-type(${nth})`;
                }
            }

            path.unshift(seg);
            depth++;
            curr = curr.parentElement;
        }

        return path.join(" > ");
    }

    /**
     * Helper to detect genuine price in an element or its subtree for real-time preview
     */
    /**
     * Helper to detect genuine price in an element or its subtree for real-time preview
     */
    function detectPriceInElement(element) {
        if (!element || !(element instanceof Element)) return null;

        function parseNum(targetText) {
            if (!targetText) return null;
            let s = String(targetText).trim().replace(/[^0-9.,]/g, '');
            if (!s || !/\d/.test(s)) return null;
            const lastComma = s.lastIndexOf(',');
            const lastDot = s.lastIndexOf('.');
            if (lastComma > -1 && lastDot > -1) {
                if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
                else s = s.replace(/,/g, '');
            } else if (lastComma > -1) {
                if (s.length - lastComma - 1 === 3) s = s.replace(/,/g, '');
                else s = s.replace(/,/g, '.');
            } else if (lastDot > -1) {
                if (s.length - lastDot - 1 === 3) s = s.replace(/\./g, '');
            }
            const val = parseFloat(s);
            return (isNaN(val) || val <= 0) ? null : val;
        }

        function normalizeCurr(rawCurr) {
            if (!rawCurr) return '€';
            const c = rawCurr.trim().toUpperCase();
            if (c === '€' || c === 'EUR') return '€';
            if (c.includes('ЛВ') || c === 'BGN') return 'лв.';
            if (c === '$' || c === 'USD') return '$';
            if (c === '£' || c === 'GBP') return '£';
            if (c.includes('LEI') || c === 'RON') return 'Lei';
            if (c.includes('ZŁ') || c === 'PLN') return 'zł';
            if (c === 'CHF') return 'CHF';
            return rawCurr.trim();
        }

        function sanitize(text) {
            if (!text) return '';
            let s = ' ' + String(text).replace(/\u00a0/g, ' ') + ' ';
            s = s.replace(/(?:доставка|delivery|shipping|versand|expediere)\s*(?:от|за|в|до|within|in)?\s*[^€$лв£\n]{0,40}/gi, ' ');
            s = s.replace(/(?:^|[^\d])\d+\s*(?:до|-|to)\s*\d+\s*(?:дни|дена|days?|ч|часа|час|hours?|hrs?|работни\s+дни|business\s+days)(?=[^\p{L}\p{N}]|$)/gui, ' ');
            s = s.replace(/(?:^|[^\d])\d+\s*(?:дни|дена|ден|days?|d|ч|часа|час|ч\.|hours?|hrs?|h|г|год|години|година|г\.|years?|yrs?|y|мес|месеца|месец|months?|mo|седмици|седмица|weeks?|мин|минути|mins?|minutes?)(?=[^\p{L}\p{N}]|$)/gui, ' ');
            s = s.replace(/(?:^|[^\d])\d+\s*(?:бр|бр\.|броя|бройки|пакет\w*|pcs?|pieces?|units?|items?|кг|kg|g|гр|ml|мл|l|л|cm|см|mm|мм|m|м)(?=[^\p{L}\p{N}]|$)/gui, ' ');
            s = s.replace(/[-+–]?\s*\d+(?:[.,]\d+)?\s*%/g, ' ');
            s = s.replace(/(?:спестява\w*|спестете|разлика|you\s+save)\s*[^€$лв£\n]{0,25}/gi, ' ');
            s = s.replace(/(?:на\s+склад|в\s+наличност|in\s+stock|out\s+of\s+stock)/gi, ' ');
            return s.replace(/\s+/g, ' ').trim();
        }

        function extractTokens(text) {
            if (!text) return [];
            const sanitized = sanitize(text);
            const tokens = [];
            const seenNumbers = new Set();
            const currSymbols = '€|EUR|лв\\.?|BGN|\\$|USD|£|GBP|Lei|lei|RON|zł|PLN|CHF';

            const regexNumFirst = new RegExp(`(?:^|[^\\w.,])(\\d{1,3}(?:[ .]\\d{3})*(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)\\s*(${currSymbols})(?=[^\\w]|$)`, 'gi');
            let m;
            while ((m = regexNumFirst.exec(sanitized)) !== null) {
                const num = parseNum(m[1]);
                if (num !== null && num > 0 && !seenNumbers.has(num)) {
                    seenNumbers.add(num);
                    const prefix = sanitized.substring(Math.max(0, m.index - 25), m.index).toLowerCase();
                    const isRef = /пцд|msrp|rrp|uvp|препоръчителна|първоначална|стара|old|regular/i.test(prefix);
                    tokens.push({
                        value: num,
                        currency: normalizeCurr(m[2]),
                        rawMatch: m[0].trim(),
                        isReference: isRef
                    });
                }
            }

            const regexCurrFirst = new RegExp(`(?:^|[^\\w.,€$£])(${currSymbols})\\s*(\\d{1,3}(?:[ ,]\\d{3})*(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)(?=[^\\w.,]|$)`, 'gi');
            while ((m = regexCurrFirst.exec(sanitized)) !== null) {
                const num = parseNum(m[2]);
                if (num !== null && num > 0 && !seenNumbers.has(num)) {
                    seenNumbers.add(num);
                    const prefix = sanitized.substring(Math.max(0, m.index - 25), m.index).toLowerCase();
                    const isRef = /пцд|msrp|rrp|uvp|препоръчителна|първоначална|стара|old|regular/i.test(prefix);
                    tokens.push({
                        value: num,
                        currency: normalizeCurr(m[1]),
                        rawMatch: m[0].trim(),
                        isReference: isRef
                    });
                }
            }

            return tokens;
        }

        const containerText = (element.innerText || element.textContent || '').replace(/\u00a0/g, ' ').trim();
        let defaultCurr = '€';
        if (containerText.includes('лв') || containerText.includes('BGN')) defaultCurr = 'лв.';
        else if (containerText.includes('$')) defaultCurr = '$';
        else if (containerText.includes('£')) defaultCurr = '£';
        else if (containerText.includes('lei') || containerText.includes('Lei') || containerText.includes('RON')) defaultCurr = 'Lei';
        else if (containerText.includes('zł') || containerText.includes('PLN')) defaultCurr = 'zł';
        else if (containerText.includes('CHF')) defaultCurr = 'CHF';

        const activeSelector = '[class*="discounted-price"], [class*="product-new-price"], [class*="current-price"], [class*="price-current"], [class*="price-promo"], [class*="promo-price"], [class*="sale-price"], [class*="special-price"], [class*="brand--h2"], [class*="main-price"], [class*="final-price"], [itemprop="price"]';

        const isActivePriceEl = (el) => {
            if (!el) return false;
            const cls = (el.className && typeof el.className === 'string' ? el.className : '').toLowerCase();
            return cls.includes('discounted-price') ||
                   cls.includes('product-new-price') ||
                   cls.includes('current-price') ||
                   cls.includes('price-current') ||
                   cls.includes('price-promo') ||
                   cls.includes('promo-price') ||
                   cls.includes('sale-price') ||
                   cls.includes('special-price') ||
                   cls.includes('brand--h2') ||
                   cls.includes('main-price') ||
                   cls.includes('final-price') ||
                   (el.getAttribute && el.getAttribute('itemprop') === 'price');
        };

        const isOldPriceEl = (el) => {
            if (!el) return false;
            const cls = (el.className && typeof el.className === 'string' ? el.className : '').toLowerCase();
            const tag = (el.tagName || '').toLowerCase();
            if (tag === 'del' || tag === 's' || tag === 'strike') return true;
            if (cls.includes('price-through') ||
                cls.includes('line-through') ||
                cls.includes('old-price') ||
                cls.includes('old_price') ||
                cls.includes('regular-price') ||
                cls.includes('original-price') ||
                cls.includes('was-price') ||
                cls.includes('former-price') ||
                cls.includes('before-discount')) {
                return true;
            }
            try {
                if (window.getComputedStyle) {
                    const style = window.getComputedStyle(el);
                    if (style && style.textDecorationLine && style.textDecorationLine.includes('line-through')) {
                        return true;
                    }
                }
            } catch (e) {}
            return false;
        };

        const isSavingsOrDifferenceEl = (el) => {
            if (!el) return false;
            const cls = (el.className && typeof el.className === 'string' ? el.className : '').toLowerCase();
            const id = (el.getAttribute && el.getAttribute('id') ? el.getAttribute('id') : '').toLowerCase();
            const check = (s) => (
                s.includes('you-save') || s.includes('you_save') || s.includes('yousave') ||
                s.includes('saving') || s.includes('price-diff') || s.includes('pricediff') ||
                s.includes('razlika') || s.includes('discount-amount') || s.includes('save-amount') ||
                s.includes('save-price') || s.includes('discount-value')
            );
            if (check(cls) || check(id)) return true;
            if (el.closest && el.closest('[class*="you-save"], [class*="you_save"], [class*="yousave"], [class*="saving"], [class*="price-diff"], [class*="pricediff"], [class*="razlika"], [class*="discount-amount"], [class*="save-amount"], [class*="save-price"], [class*="discount-value"], [id*="you-save"], [id*="razlika"]')) {
                return true;
            }
            let curr = el;
            for (let d = 0; d < 3 && curr && curr !== element; d++) {
                const text = (curr.innerText || curr.textContent || '').trim();
                if (/^(?:разлика|спестява\w*|спестете|you\s*save|save\s+amount)\b/i.test(text)) {
                    return true;
                }
                curr = curr.parentElement;
            }
            return false;
        };

        const isNoiseOrConverted = (el) => {
            if (!el) return false;
            const cls = (el.className && typeof el.className === 'string' ? el.className : '').toLowerCase();
            const tag = (el.tagName || '').toLowerCase();
            return tag.includes('converted') ||
                   cls.includes('converted') ||
                   cls.includes('double-c') ||
                   cls.includes('delivery') ||
                   cls.includes('shipping') ||
                   cls.includes('warranty') ||
                   cls.includes('stock') ||
                   cls.includes('installments') ||
                   cls.includes('leasing');
        };

        const allDescendants = [element, ...element.querySelectorAll('*')];
        const candidates = [];

        for (const el of allDescendants) {
            if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'NOSCRIPT') continue;
            const rawText = (el.innerText || el.textContent || '').replace(/\u00a0/g, ' ').trim();
            if (!rawText) continue;

            const isSavings = isSavingsOrDifferenceEl(el);
            const isOld = isOldPriceEl(el) || (el.closest && isOldPriceEl(el.closest('del, s, strike, [class*="price-through"], [class*="old-price"]')));
            const isActive = (isActivePriceEl(el) || (el.closest && el.closest(activeSelector))) && !isOld && !isSavings;
            const isNoise = isNoiseOrConverted(el);

            const tokens = extractTokens(rawText);
            for (const token of tokens) {
                candidates.push({
                    value: token.value,
                    currency: token.currency || defaultCurr,
                    isActive: isActive,
                    isOld: isOld,
                    isSavings: isSavings,
                    isReference: token.isReference,
                    isNoise: isNoise
                });
            }
        }

        if (candidates.length === 0) {
            const containerTokens = extractTokens(containerText);
            for (const t of containerTokens) {
                candidates.push({
                    value: t.value,
                    currency: t.currency || defaultCurr,
                    isActive: false,
                    isOld: false,
                    isSavings: false,
                    isReference: t.isReference,
                    isNoise: false
                });
            }
        }

        if (candidates.length === 0) return null;

        const uniqueCandidates = [];
        for (const c of candidates) {
            const existing = uniqueCandidates.find(x => x.value === c.value);
            if (!existing) {
                uniqueCandidates.push({ ...c });
            } else {
                if (c.isActive && !existing.isActive) existing.isActive = true;
                if (c.isOld && !existing.isOld) existing.isOld = true;
                if (c.isSavings && !existing.isSavings) existing.isSavings = true;
                if (c.isReference && !existing.isReference) existing.isReference = true;
            }
        }

        let pool = uniqueCandidates.filter(c => !c.isNoise && !c.isSavings);
        if (pool.length === 0) pool = uniqueCandidates.filter(c => !c.isSavings);
        if (pool.length === 0) pool = uniqueCandidates;

        // Filter cents fragments (e.g. 85, 0.85, or 118 when 118.85 exists)
        pool = pool.filter(c => {
            for (const other of pool) {
                if (other.value > c.value && (other.value % 1 !== 0)) {
                    // Whole part match (e.g. 118 when 118.85 exists)
                    if (Math.floor(other.value) === c.value) return false;
                    // Integer cents match (e.g. 85 when 118.85 exists)
                    if (c.value <= 99 && c.value >= 1 && Number.isInteger(c.value)) {
                        const cents = Math.round((other.value - Math.floor(other.value)) * 100);
                        if (cents === c.value) return false;
                    }
                    // Fractional cents match (e.g. 0.85 when 118.85 exists)
                    const centsFrac = +(other.value - Math.floor(other.value)).toFixed(2);
                    if (Math.abs(centsFrac - c.value) < 0.001) return false;
                }
            }
            return true;
        });

        const activeCandidates = pool.filter(c => c.isActive && !c.isOld && !c.isReference);
        if (activeCandidates.length > 0) {
            const values = activeCandidates.map(c => c.value);
            const minVal = Math.min(...values);
            const match = activeCandidates.find(c => c.value === minVal);
            return { value: minVal, currency: match.currency };
        }

        const regularCandidates = pool.filter(c => !c.isOld && !c.isReference);
        if (regularCandidates.length > 0) {
            const values = regularCandidates.map(c => c.value);
            const minVal = Math.min(...values);
            const match = regularCandidates.find(c => c.value === minVal);
            return { value: minVal, currency: match.currency };
        }

        const fallbackVals = pool.map(c => c.value);
        const minVal = Math.min(...fallbackVals);
        const match = pool.find(c => c.value === minVal);
        return { value: minVal, currency: match ? match.currency : defaultCurr };
    }

    function formatNode(node, isActive) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return '';
        let attrs = Array.from(node.attributes).map(a => `<span class="attr">${a.name}</span>="<span class="val">${a.value}</span>"`).join(' ');
        let tag = node.tagName.toLowerCase();
        
        let text = Array.from(node.childNodes)
            .filter(c => c.nodeType === Node.TEXT_NODE && c.textContent.trim())
            .map(c => c.textContent.trim())
            .join(' ');
            
        let textHtml = text ? `<div class="text">${text.substring(0, 80)}${text.length > 80 ? '...' : ''}</div>` : '';
        
        let selectorInfo = '';
        let priceInfo = '';
        if (isActive) {
            selectorInfo = `<div style="font-size:11px; color:#ffc107; margin-top:4px; font-weight:bold; letter-spacing:0.5px;">${t("selector")} ${getCssSelector(node)}</div>`;
            const detected = detectPriceInElement(node);
            if (detected && detected.value !== null) {
                priceInfo = `<div style="font-size:12px; color:#28a745; margin-top:4px; font-weight:bold; letter-spacing:0.3px;">${t("detectedPrice")} ${detected.value} ${detected.currency}</div>`;
            }
        }

        return `<div class="node ${isActive ? 'active' : ''}">
            &lt;<span class="tag">${tag}</span> ${attrs}&gt;
            ${textHtml}
            ${selectorInfo}
            ${priceInfo}
        </div>`;
    }

    function updatePanel(target) {
        const treeView = shadow.getElementById('tree-view');
        treeView.innerHTML = '';
        
        let nodesToRender = [];
        let current = target;
        let ancestors = [];
        
        // 3 hierarchies up
        for (let i = 0; i < 3; i++) {
            if (current.parentElement) {
                ancestors.unshift(current.parentElement);
                current = current.parentElement;
            } else {
                break;
            }
        }
        
        let baseIndent = 0;
        ancestors.forEach(a => {
            nodesToRender.push({ el: a, indent: baseIndent, isActive: false });
            baseIndent += 15;
        });
        
        // Target
        nodesToRender.push({ el: target, indent: baseIndent, isActive: true });
        
        // 2 hierarchies down
        let childIndent = baseIndent + 15;
        Array.from(target.children).slice(0, 15).forEach(child => {
            nodesToRender.push({ el: child, indent: childIndent, isActive: false });
            
            let gcIndent = childIndent + 15;
            Array.from(child.children).slice(0, 10).forEach(gc => {
                nodesToRender.push({ el: gc, indent: gcIndent, isActive: false });
            });
        });
        
        nodesToRender.forEach(nodeInfo => {
            let div = document.createElement('div');
            div.innerHTML = formatNode(nodeInfo.el, nodeInfo.isActive);
            div.addEventListener('mouseenter', () => highlightElement(nodeInfo.el));
            div.addEventListener('mouseleave', () => highlightElement(isPaused ? target : hoveredElement));
            div.addEventListener('click', (e) => { e.stopPropagation(); selectElement(nodeInfo.el); });
            div.style.marginLeft = nodeInfo.indent + 'px';
            treeView.appendChild(div);
        });
    }

    function highlightElement(el) {
        if (!el || !overlay) return;
        const rect = el.getBoundingClientRect();
        overlay.style.top = (rect.top + window.scrollY) + 'px';
        overlay.style.left = (rect.left + window.scrollX) + 'px';
        overlay.style.width = rect.width + 'px';
        overlay.style.height = rect.height + 'px';
        overlay.style.display = 'block';
    }

    function handleMouseMove(e) {
        if (e.composedPath().includes(panelRoot)) return;
        if (isPaused) return;

        const clientX = e.clientX;
        const clientY = e.clientY;
        const target = e.target;

        if (animFrameId) cancelAnimationFrame(animFrameId);

        animFrameId = requestAnimationFrame(() => {
            animFrameId = null;
            let targetEl = target;

            if (targetEl === overlay) {
                overlay.style.display = 'none';
                targetEl = document.elementFromPoint(clientX, clientY);
                overlay.style.display = 'block';
            }

            if (targetEl && targetEl !== hoveredElement && !panelRoot.contains(targetEl)) {
                hoveredElement = targetEl;
                highlightElement(hoveredElement);
                updatePanel(hoveredElement);
            }
        });
    }

    function handleClick(e) {
        if (e.composedPath().includes(panelRoot)) {
            return; 
        }
        
        e.preventDefault();
        e.stopPropagation();
        
        if (hoveredElement) {
            selectElement(hoveredElement);
        }
    }

    function selectElement(el) {
        const selector = getCssSelector(el);
        try {
            chrome.runtime.sendMessage({ action: "picker_result", selector: selector, url: window.location.href }, () => {
                if (chrome.runtime.lastError) {
                    console.warn("PriceTracker Picker:", chrome.runtime.lastError.message);
                }
                stopPicker();
            });
        } catch (e) {
            console.warn("PriceTracker Picker: Extension context invalidated. Please refresh the page (F5).", e);
            stopPicker();
        }
    }

    window.startPriceTrackerPicker = initPicker;
    window.startPriceTrackerPicker();
} else {
    if (window.startPriceTrackerPicker) {
        window.startPriceTrackerPicker();
    }
}
