// Keep track of the last element clicked with the right mouse button
let lastRightClickedElement = null;

document.addEventListener("contextmenu", function(event){
    lastRightClickedElement = event.target;
}, true);

// Listen for messages from background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "get_selector_from_context") {
        if (lastRightClickedElement) {
            const selector = generateUniqueSelector(lastRightClickedElement);
            sendResponse({ selector: selector });
        } else {
            sendResponse({ selector: null, error: "Element not found." });
        }
    } else if (message.action === "start_scrape") {
        executeScrapingTask(message.itemConfig);
    }
});

// Generates a concise, resilient, and accurate CSS selector for the given element
function generateUniqueSelector(el) {
    if (!el || el.nodeType !== 1) return "";
    
    // 1. If element has an ID, check if it's unique
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
            !/^(active|hover|focus|selected|open|closed|show|hide|visible|ng-|css-|styled-|d-|flex|justify-|align-|row|col|grid|container|m-|p-|w-|h-)/i.test(c) &&
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

    while (curr && curr.nodeType === 1 && depth < 3) {
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
                c && !/^(active|hover|focus|selected|open|closed|show|hide|visible|ng-|css-|styled-|d-|flex|justify-|align-|row|col|grid|container|m-|p-|w-|h-)/i.test(c) && !/^\d+$/.test(c)
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
 * Parses a price string into a float number.
 * Supports BG, European, and US number formats (e.g. 1 250,99 лв., 1.250,99 €, $1,250.99).
 */
function parsePriceStringToNumber(targetText) {
    if (!targetText) return null;
    let s = String(targetText).trim().replace(/[^0-9.,]/g, '');
    if (!s || !/\d/.test(s)) return null;

    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');

    if (lastComma > -1 && lastDot > -1) {
        if (lastComma > lastDot) {
            s = s.replace(/\./g, '').replace(',', '.'); // 1.250,99 -> 1250.99
        } else {
            s = s.replace(/,/g, ''); // 1,250.99 -> 1250.99
        }
    } else if (lastComma > -1) {
        if (s.length - lastComma - 1 === 3) {
            s = s.replace(/,/g, ''); // 1,250 -> 1250
        } else {
            s = s.replace(/,/g, '.'); // 1250,99 -> 1250.99
        }
    } else if (lastDot > -1) {
        if (s.length - lastDot - 1 === 3) {
            s = s.replace(/\./g, ''); // 1.250 -> 1250
        }
    }

    const val = parseFloat(s);
    return (isNaN(val) || val <= 0) ? null : val;
}

/**
 * Normalizes raw currency string into standard representation.
 */
function normalizeCurrency(rawCurr) {
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

/**
 * Removes non-price noise phrases (durations, delivery days, warranty, quantities, percentages, disclaimers).
 */
function sanitizePriceText(text) {
    if (!text) return '';
    let s = ' ' + String(text).replace(/\u00a0/g, ' ') + ' ';

    // 1. Filter delivery expressions: e.g. "Доставка от 4 до 5 дни", "Доставка за 24-48 часа", "delivery in 3-5 days"
    s = s.replace(/(?:доставка|delivery|shipping|versand|expediere)\s*(?:от|за|в|до|within|in)?\s*[^€$лв£\n]{0,40}/gi, ' ');

    // 2. Filter range expressions: e.g. "от 4 до 5 дни", "4-5 дни", "24-48 часа", "1 to 3 days"
    s = s.replace(/(?:^|[^\d])\d+\s*(?:до|-|to)\s*\d+\s*(?:дни|дена|days?|ч|часа|час|hours?|hrs?|работни\s+дни|business\s+days)(?=[^\p{L}\p{N}]|$)/gui, ' ');

    // 3. Filter duration & time numbers: e.g. "30 дни", "14 days", "2 години", "24 месеца", "48 часа"
    s = s.replace(/(?:^|[^\d])\d+\s*(?:дни|дена|ден|days?|d|ч|часа|час|ч\.|hours?|hrs?|h|г|год|години|година|г\.|years?|yrs?|y|мес|месеца|месец|months?|mo|седмици|седмица|weeks?|мин|минути|mins?|minutes?)(?=[^\p{L}\p{N}]|$)/gui, ' ');

    // 4. Filter quantities & packaging units: e.g. "1 бр.", "2 броя", "100 ml", "500 g", "1 кг", "2 pcs"
    s = s.replace(/(?:^|[^\d])\d+\s*(?:бр|бр\.|броя|бройки|пакет\w*|pcs?|pieces?|units?|items?|кг|kg|g|гр|ml|мл|l|л|cm|см|mm|мм|m|м)(?=[^\p{L}\p{N}]|$)/gui, ' ');

    // 5. Filter percentages and savings badges: e.g. "-20%", "20 %", "спестявате 50 лв", "you save $50"
    // (Never delete "отстъпка" or "discount" because "цена с отстъпка" is the actual selling price!)
    s = s.replace(/[-+–]?\s*\d+(?:[.,]\d+)?\s*%/g, ' ');
    s = s.replace(/(?:спестява\w*|спестете|разлика|you\s+save)\s*[^€$лв£\n]{0,25}/gi, ' ');

    // 6. Filter stock status: e.g. "На склад", "In stock", "В наличност"
    s = s.replace(/(?:на\s+склад|в\s+наличност|in\s+stock|out\s+of\s+stock)/gi, ' ');

    return s.replace(/\s+/g, ' ').trim();
}

/**
 * Extracts all explicit price tokens with currencies from a text block.
 */
function extractPriceTokensWithCurrency(text) {
    if (!text) return [];
    const sanitized = sanitizePriceText(text);
    const tokens = [];
    const seenNumbers = new Set();

    const currSymbols = '€|EUR|лв\\.?|BGN|\\$|USD|£|GBP|Lei|lei|RON|zł|PLN|CHF';

    // Regex 1: Number followed by currency (e.g. 549,99 € or 1 250,00 лв.)
    const regexNumFirst = new RegExp(`(?:^|[^\\w.,])(\\d{1,3}(?:[ .]\\d{3})*(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)\\s*(${currSymbols})(?=[^\\w]|$)`, 'gi');
    let m;
    while ((m = regexNumFirst.exec(sanitized)) !== null) {
        const num = parsePriceStringToNumber(m[1]);
        if (num !== null && num > 0 && !seenNumbers.has(num)) {
            seenNumbers.add(num);
            const prefix = sanitized.substring(Math.max(0, m.index - 25), m.index).toLowerCase();
            const isRef = /пцд|msrp|rrp|uvp|препоръчителна|първоначална|стара|old|regular/i.test(prefix);
            tokens.push({
                value: num,
                currency: normalizeCurrency(m[2]),
                rawMatch: m[0].trim(),
                isReference: isRef
            });
        }
    }

    // Regex 2: Currency followed by number (e.g. € 549,99 or $1,250.99)
    const regexCurrFirst = new RegExp(`(?:^|[^\\w.,€$£])(${currSymbols})\\s*(\\d{1,3}(?:[ ,]\\d{3})*(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)(?=[^\\w.,]|$)`, 'gi');
    while ((m = regexCurrFirst.exec(sanitized)) !== null) {
        const num = parsePriceStringToNumber(m[2]);
        if (num !== null && num > 0 && !seenNumbers.has(num)) {
            seenNumbers.add(num);
            const prefix = sanitized.substring(Math.max(0, m.index - 25), m.index).toLowerCase();
            const isRef = /пцд|msrp|rrp|uvp|препоръчителна|първоначална|стара|old|regular/i.test(prefix);
            tokens.push({
                value: num,
                currency: normalizeCurrency(m[1]),
                rawMatch: m[0].trim(),
                isReference: isRef
            });
        }
    }

    return tokens;
}

/**
 * Intelligently extracts all valid full prices from an element and its subtree/hierarchy.
 * Prioritizes active/promotional price classes, suppresses strikethrough/old prices and MSRPs,
 * completely eliminates duration/delivery noise (e.g. 30 days, 4-5 delivery days),
 * and avoids cents fragmentation.
 */
function extractPricesFromElement(element, useLowestPrice = true) {
    if (!element) return { value: null, currency: '€' };

    let targetEl = element;

    // Amazon specific canonical extraction: Check if element is inside or contains .a-price
    let amazonPriceContainer = null;
    if (targetEl.closest) {
        amazonPriceContainer = targetEl.closest('.a-price');
    }
    if (!amazonPriceContainer && targetEl.querySelector) {
        amazonPriceContainer = targetEl.querySelector('.a-price');
    }
    if (!amazonPriceContainer && targetEl.classList && targetEl.classList.contains('a-price')) {
        amazonPriceContainer = targetEl;
    }

    if (amazonPriceContainer) {
        const offscreen = amazonPriceContainer.querySelector('.a-offscreen');
        if (offscreen) {
            const offscreenText = (offscreen.innerText || offscreen.textContent || '').replace(/\u00a0/g, ' ').trim();
            const offscreenPrice = parsePriceStringToNumber(offscreenText);
            if (offscreenPrice !== null && offscreenPrice > 0) {
                let currency = '€';
                if (offscreenText.includes('лв') || offscreenText.includes('BGN')) currency = 'лв.';
                else if (offscreenText.includes('$')) currency = '$';
                else if (offscreenText.includes('£')) currency = '£';
                else if (offscreenText.includes('lei') || offscreenText.includes('Lei') || offscreenText.includes('RON')) currency = 'Lei';
                else if (offscreenText.includes('€') || offscreenText.includes('EUR')) currency = '€';

                return { value: offscreenPrice, currency, candidateCount: 1 };
            }
        }
    }

    // Detect general currency symbol or abbreviation from element text
    const containerText = (targetEl.innerText || targetEl.textContent || '').replace(/\u00a0/g, ' ').trim();
    let defaultCurrency = '€';
    if (containerText.includes('лв') || containerText.includes('BGN')) defaultCurrency = 'лв.';
    else if (containerText.includes('$')) defaultCurrency = '$';
    else if (containerText.includes('£')) defaultCurrency = '£';
    else if (containerText.includes('lei') || containerText.includes('Lei') || containerText.includes('RON')) defaultCurrency = 'Lei';
    else if (containerText.includes('zł') || containerText.includes('PLN')) defaultCurrency = 'zł';
    else if (containerText.includes('CHF')) defaultCurrency = 'CHF';

    // Classification helpers
    const activePriceSelector = '[class*="discounted-price"], [class*="product-new-price"], [class*="current-price"], [class*="price-current"], [class*="price-promo"], [class*="promo-price"], [class*="sale-price"], [class*="special-price"], [class*="brand--h2"], [class*="main-price"], [class*="final-price"], [itemprop="price"]';

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
        for (let d = 0; d < 3 && curr && curr !== targetEl; d++) {
            const text = (curr.innerText || curr.textContent || '').trim();
            if (/^(?:разлика|спестява\w*|спестете|you\s*save|save\s+amount)\b/i.test(text)) {
                return true;
            }
            curr = curr.parentElement;
        }
        return false;
    };

    const isNoiseEl = (el) => {
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

    // Collect all descendants
    const allDescendants = [targetEl, ...targetEl.querySelectorAll('*')];
    const candidates = [];

    for (const el of allDescendants) {
        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'NOSCRIPT') continue;

        const rawText = (el.innerText || el.textContent || '').replace(/\u00a0/g, ' ').trim();
        if (!rawText) continue;

        const isSavings = isSavingsOrDifferenceEl(el);
        const isOld = isOldPriceEl(el) || (el.closest && isOldPriceEl(el.closest('del, s, strike, [class*="price-through"], [class*="old-price"]')));
        const isActive = (isActivePriceEl(el) || (el.closest && el.closest(activePriceSelector))) && !isOld && !isSavings;
        const isNoise = isNoiseEl(el);

        // 1. Extract tokens with explicit currency
        const tokens = extractPriceTokensWithCurrency(rawText);
        for (const token of tokens) {
            candidates.push({
                value: token.value,
                currency: token.currency || defaultCurrency,
                isActive: isActive,
                isOld: isOld,
                isSavings: isSavings,
                isReference: token.isReference,
                isNoise: isNoise
            });
        }

        // 2. If element is a pure price leaf element (e.g. <span class="brand--h2">549,99</span>)
        if (tokens.length === 0 && (isActive || !isNoise)) {
            const trimmed = rawText.trim();
            // Reject fragments starting with comma or dot (e.g. ",85 €" or ".99")
            if (!trimmed.startsWith(',') && !trimmed.startsWith('.')) {
                const sanitized = sanitizePriceText(rawText);
                // Must be purely numeric string without letters (to avoid "30", "4 до 5", etc.)
                if (sanitized && !/[a-zA-Z\u0400-\u04FF]/.test(sanitized)) {
                    const parsed = parsePriceStringToNumber(sanitized);
                    if (parsed !== null && parsed > 0) {
                        candidates.push({
                            value: parsed,
                            currency: defaultCurrency,
                            isActive: isActive,
                            isOld: isOld,
                            isSavings: isSavings,
                            isReference: false,
                            isNoise: isNoise
                        });
                    }
                }
            }
        }
    }

    // Fallback: parse entire sanitized container text directly
    if (candidates.length === 0) {
        const containerTokens = extractPriceTokensWithCurrency(containerText);
        for (const t of containerTokens) {
            candidates.push({
                value: t.value,
                currency: t.currency || defaultCurrency,
                isActive: false,
                isOld: false,
                isSavings: false,
                isReference: t.isReference,
                isNoise: false
            });
        }
    }

    if (candidates.length === 0) {
        return { value: null, currency: defaultCurrency };
    }

    // Deduplicate candidates by value
    const uniqueCandidates = [];
    const seenVals = new Set();
    for (const c of candidates) {
        if (!seenVals.has(c.value)) {
            seenVals.add(c.value);
            uniqueCandidates.push({ ...c });
        } else {
            // Upgrade existing candidate if this one has active classification
            const existing = uniqueCandidates.find(x => x.value === c.value);
            if (existing) {
                if (c.isActive && !existing.isActive) existing.isActive = true;
                if (c.isOld && !existing.isOld) existing.isOld = true;
                if (c.isSavings && !existing.isSavings) existing.isSavings = true;
                if (c.isReference && !existing.isReference) existing.isReference = true;
            }
        }
    }

    // Filter out candidates originating from noise or savings/difference elements
    let pool = uniqueCandidates.filter(c => !c.isNoise && !c.isSavings);
    if (pool.length === 0) pool = uniqueCandidates.filter(c => !c.isSavings);
    if (pool.length === 0) pool = uniqueCandidates;

    // Filter out cents fragmentation (e.g. 85, 0.85, or 118 when 118.85 exists)
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

    // Strategy 1: If active / promotional price candidates exist, prioritize them
    const activeCandidates = pool.filter(c => c.isActive && !c.isOld && !c.isReference);
    if (activeCandidates.length > 0) {
        const values = activeCandidates.map(c => c.value);
        const finalVal = useLowestPrice ? Math.min(...values) : values[0];
        const match = activeCandidates.find(c => c.value === finalVal);
        return { value: finalVal, currency: match.currency, candidateCount: pool.length };
    }

    // Strategy 2: If regular non-old, non-reference prices exist, prioritize them
    const regularCandidates = pool.filter(c => !c.isOld && !c.isReference);
    if (regularCandidates.length > 0) {
        const values = regularCandidates.map(c => c.value);
        const finalVal = useLowestPrice ? Math.min(...values) : values[0];
        const match = regularCandidates.find(c => c.value === finalVal);
        return { value: finalVal, currency: match.currency, candidateCount: pool.length };
    }

    // Strategy 3: Fallback to old/reference prices if nothing else exists
    const fallbackVals = pool.map(c => c.value);
    const finalVal = useLowestPrice ? Math.min(...fallbackVals) : fallbackVals[0];
    const match = pool.find(c => c.value === finalVal);
    return { value: finalVal, currency: match ? match.currency : defaultCurrency, candidateCount: pool.length };
}

/**
 * Intelligently searches for the target element using direct query and progressive fallback strategies.
 */
function findTargetElement(selector, itemType = 'price') {
    if (!selector) return null;

    // 1. Direct query selector
    try {
        const el = document.querySelector(selector);
        if (el) return el;
    } catch (e) {}

    // 2. Relaxed child combinator (> replaced by descendant space)
    try {
        if (selector.includes('>')) {
            const descendantSelector = selector.replace(/\s*>\s*/g, ' ');
            const el = document.querySelector(descendantSelector);
            if (el) return el;
        }
    } catch (e) {}

    // 3. Relaxed selector: strip non-semantic layout utility classes (d-flex, row, col, etc.)
    try {
        const cleanSegments = selector
            .split(/\s*>\s*|\s+/)
            .filter(seg => !/\.(d-|flex|justify-|align-|row|col|grid|container|m-|p-|w-|h-)/i.test(seg));
        if (cleanSegments.length > 0) {
            const cleanSelector = cleanSegments.join(' ');
            if (cleanSelector !== selector) {
                const el = document.querySelector(cleanSelector);
                if (el) return el;
            }
        }
    } catch (e) {}

    // 4. Relaxed selector (strip :nth-of-type and try sub-selectors)
    try {
        if (selector.includes(':nth-of-type')) {
            const withoutNth = selector.replace(/:nth-of-type\(\d+\)/g, '');
            const el = document.querySelector(withoutNth);
            if (el) return el;
        }

        const segments = selector.split(/\s*>\s*|\s+/).filter(Boolean);
        if (segments.length > 1) {
            // Try last 2 segments
            const subSelector = segments.slice(-2).join(' ');
            const el = document.querySelector(subSelector);
            if (el) return el;

            // Try target leaf segment
            const leafSelector = segments[segments.length - 1];
            if (leafSelector && (leafSelector.includes('.') || leafSelector.includes('#'))) {
                const elLeaf = document.querySelector(leafSelector);
                if (elLeaf) return elLeaf;

                // Try leaf class without element tag prefix (e.g. div.pricing-block -> .pricing-block)
                const classOnly = leafSelector.match(/\.[\w-]+/);
                if (classOnly) {
                    const elClassOnly = document.querySelector(classOnly[0]);
                    if (elClassOnly) return elClassOnly;
                }
            }
        }
    } catch (e) {}

    // 5. eCommerce price selector fallbacks (if itemType === 'price')
    if (itemType === 'price') {
        const priceCandidates = [
            'p.special-price',
            '.special-price',
            'p.product-new-price',
            '.product-new-price',
            '.product-price',
            '.pricing-block .product-new-price',
            '.product-page-pricing .product-new-price',
            '.price-current',
            '.main-price',
            '.price-box',
            '.price-wrapper',
            '.a-price',
            '.a-price .a-offscreen',
            '#priceblock_ourprice',
            '#priceblock_dealprice',
            '[itemprop="price"]',
            '[data-testid*="price"]',
            '[class*="special-price"]',
            '[class*="discounted-price"]',
            '[class*="product-new-price"]',
            '[class*="product-price"]',
            '[class*="price-new"]',
            '[class*="main-price"]',
            '[class*="current-price"]'
        ];

        for (const cand of priceCandidates) {
            try {
                const els = document.querySelectorAll(cand);
                for (const candidateEl of els) {
                    const check = extractPricesFromElement(candidateEl, true);
                    if (check.value !== null && check.value > 0) {
                        return candidateEl;
                    }
                }
            } catch (e) {}
        }
    }

    return null;
}

/**
 * Inspects DOM to identify specific root causes when target elements cannot be found
 * (Cloudflare / bot challenges, Out of stock, 404 error pages).
 */
function diagnosePageFailure() {
    const title = (document.title || '').toLowerCase();
    const bodyText = (document.body ? document.body.innerText || document.body.textContent || '' : '').toLowerCase();

    // 1. Cloudflare / Bot Protection / CAPTCHA
    const hasCfChallenge = document.getElementById('challenge-running') || 
                           document.getElementById('challenge-form') ||
                           document.querySelector('.cf-turnstile') ||
                           document.querySelector('.cf-browser-verification') ||
                           document.querySelector('#px-captcha') ||
                           document.querySelector('iframe[src*="cloudflare"]') ||
                           document.querySelector('iframe[src*="challenges"]');
    const isBotTitle = title.includes('just a moment') || 
                       title.includes('attention required') || 
                       title.includes('security check') || 
                       title.includes('robot or human') || 
                       title.includes('bot verification') ||
                       title.includes('cloudflare');
    const isBotText = bodyText.includes('checking your browser') || 
                      bodyText.includes('потвърдете, че сте човек') || 
                      bodyText.includes('verify you are a human') ||
                      bodyText.includes('access denied') ||
                      bodyText.includes('incident id');

    if (hasCfChallenge || isBotTitle || isBotText) {
        return "ERR_BOT_CHALLENGE";
    }

    // 2. Out of Stock / Unavailable
    const outOfStockEl = document.querySelector('.product-page-out-of-stock, .label-out-of-stock, .btn-out-of-stock, .out-of-stock, [class*="out-of-stock"], [class*="outofstock"]');
    const isOutOfStockText = bodyText.includes('този продукт е изчерпан') || 
                            bodyText.includes('продуктът е изчерпан') || 
                            bodyText.includes('няма наличност') || 
                            bodyText.includes('изчерпана наличност') ||
                            bodyText.includes('currently unavailable') || 
                            bodyText.includes('out of stock') ||
                            bodyText.includes('temporarily out of stock');

    if (outOfStockEl || isOutOfStockText) {
        return "ERR_OUT_OF_STOCK";
    }

    // 3. 404 / 410 / Not Found Page
    const isNotFoundTitle = title.includes('404') || title.includes('not found') || title.includes('страницата не е намерена');
    if (isNotFoundTitle) {
        return "ERR_PAGE_NOT_FOUND";
    }

    return null;
}

/**
 * Waits for target element with MutationObserver, periodic polling, and progressive fallback.
 */
function waitForElement(selector, itemType, timeoutMs = 20000) {
    return new Promise((resolve) => {
        // Immediate check
        const initial = findTargetElement(selector, itemType);
        if (initial) {
            return resolve(initial);
        }

        let observer = null;
        let intervalId = null;
        let timeoutId = null;
        let scrollAttempts = 0;

        const cleanup = () => {
            if (observer) {
                observer.disconnect();
                observer = null;
            }
            if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
            }
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
        };

        // MutationObserver to watch DOM subtree updates
        observer = new MutationObserver(() => {
            const el = findTargetElement(selector, itemType);
            if (el) {
                cleanup();
                resolve(el);
            }
        });

        const targetNode = document.documentElement || document.body;
        if (targetNode) {
            observer.observe(targetNode, {
                childList: true,
                subtree: true
            });
        }

        // Periodic polling fallback every 250ms with light scroll nudge for lazy hydration
        intervalId = setInterval(() => {
            const el = findTargetElement(selector, itemType);
            if (el) {
                cleanup();
                resolve(el);
                return;
            }

            // Lightly nudge scroll every 4th tick (1s) to trigger lazy-load / hydration
            scrollAttempts++;
            if (scrollAttempts % 4 === 0 && window.scrollY < 800) {
                window.scrollBy(0, 200);
            }
        }, 250);

        // Maximum timeout fallback
        timeoutId = setTimeout(() => {
            const el = findTargetElement(selector, itemType);
            cleanup();
            resolve(el || null);
        }, timeoutMs);
    });
}

async function executeScrapingTask(config) {
    try {
        // 1. Execute macros (Human behavior simulation)
        if (config.requiresMacro) {
            await simulateHumanBehavior();
        }

        // 2. Wait for target element to appear in DOM (up to 20s with progressive fallback)
        let element = await waitForElement(config.selector, config.type || "price", 20000);

        if (!element) {
            const diag = diagnosePageFailure();
            if (diag) {
                throw new Error(diag);
            }
            throw new Error(`Element with selector "${config.selector}" was not found.`);
        }

        let finalValue = null;
        let currency = '€';

        if (config.type === "price") {
            const useLowest = config.useLowestPrice !== false;
            const priceResult = extractPricesFromElement(element, useLowest);
            
            if (priceResult.value === null) {
                const rawText = (element.innerText || element.textContent || '').replace(/\u00a0/g, ' ').trim();
                throw new Error(`Extracted price is not a valid number: "${rawText}"`);
            }
            
            finalValue = priceResult.value;
            currency = priceResult.currency;
        } else if (config.type === "text") {
            const rawText = element.innerText || element.textContent || '';
            finalValue = rawText.trim();
        }

        // 3. Send result back to background.js with retry
        const sendScrapeMessage = (payload, retries = 2) => {
            try {
                chrome.runtime.sendMessage(payload, () => {
                    if (chrome.runtime.lastError && retries > 0) {
                        setTimeout(() => sendScrapeMessage(payload, retries - 1), 500);
                    }
                });
            } catch (err) {
                if (retries > 0) {
                    setTimeout(() => sendScrapeMessage(payload, retries - 1), 500);
                }
            }
        };

        sendScrapeMessage({
            action: "scrape_result",
            itemConfig: config,
            value: finalValue,
            currency: currency,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        // Notify background service worker on error to log status and close tab
        const sendScrapeMessage = (payload, retries = 2) => {
            try {
                chrome.runtime.sendMessage(payload, () => {
                    if (chrome.runtime.lastError && retries > 0) {
                        setTimeout(() => sendScrapeMessage(payload, retries - 1), 500);
                    }
                });
            } catch (err) {
                if (retries > 0) {
                    setTimeout(() => sendScrapeMessage(payload, retries - 1), 500);
                }
            }
        };

        sendScrapeMessage({
            action: "scrape_error",
            itemConfig: config,
            error: error.message
        });
    }
}

/**
 * Simulates human browsing behavior: concurrent non-linear mouse movement and randomized scrolling to bypass bot detections.
 */
async function simulateHumanBehavior() {
    const totalDuration = Math.floor(Math.random() * 4000) + 3000;

    // Run scrolling and mouse movement concurrently
    await Promise.all([
        simulateMouseMovement(totalDuration),
        simulateScrolling(totalDuration)
    ]);
}

async function simulateScrolling(duration) {
    const endTime = Date.now() + duration;
    
    while (Date.now() < endTime) {
        const direction = Math.random() > 0.3 ? 1 : -1;
        const scrollAmount = Math.floor(Math.random() * 700 + 100) * direction;
        
        window.scrollBy(0, scrollAmount);
        
        const delay = Math.floor(Math.random() * 1000) + 500;
        await new Promise(r => setTimeout(r, Math.min(delay, endTime - Date.now())));
    }
}

async function simulateMouseMovement(duration) {
    const endTime = Date.now() + duration;
    
    let currentX = Math.random() * window.innerWidth;
    let currentY = Math.random() * window.innerHeight;
    
    while (Date.now() < endTime) {
        const targetX = Math.random() * window.innerWidth;
        const targetY = Math.random() * window.innerHeight;
        
        const moveDuration = Math.floor(Math.random() * 900) + 300;
        await moveMouseSmoothly(currentX, currentY, targetX, targetY, moveDuration, endTime);
        
        currentX = targetX;
        currentY = targetY;
        
        const pause = Math.floor(Math.random() * 400) + 100;
        await new Promise(r => setTimeout(r, Math.min(pause, endTime - Date.now())));
    }
}

function moveMouseSmoothly(startX, startY, endX, endY, duration, absoluteEndTime) {
    return new Promise(resolve => {
        const startTime = Date.now();
        const easeInOutQuad = t => t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

        const controlX = startX + (endX - startX) * Math.random() + (Math.random() * 200 - 100);
        const controlY = startY + (endY - startY) * Math.random() + (Math.random() * 200 - 100);

        function step() {
            const now = Date.now();
            if (now >= absoluteEndTime) {
                resolve();
                return;
            }

            let elapsed = now - startTime;
            let progress = Math.min(elapsed / duration, 1);
            let easeProgress = easeInOutQuad(progress);

            const currentX = (1 - easeProgress) * (1 - easeProgress) * startX + 2 * (1 - easeProgress) * easeProgress * controlX + easeProgress * easeProgress * endX;
            const currentY = (1 - easeProgress) * (1 - easeProgress) * startY + 2 * (1 - easeProgress) * easeProgress * controlY + easeProgress * easeProgress * endY;

            const event = new MouseEvent('mousemove', {
                view: window,
                bubbles: true,
                cancelable: true,
                clientX: currentX,
                clientY: currentY,
                screenX: currentX + (window.screenX || 0),
                screenY: currentY + (window.screenY || 0)
            });
            document.dispatchEvent(event);

            if (progress < 1) {
                setTimeout(step, 40);
            } else {
                resolve();
            }
        }
        setTimeout(step, 40);
    });
}