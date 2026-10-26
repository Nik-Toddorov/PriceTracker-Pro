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

    // Domain-specific smart anchoring: Ozone.bg
    if (typeof window !== 'undefined' && window.location && window.location.hostname.includes('ozone.bg')) {
        const mainForm = el.closest ? el.closest('#product_addtocart_form, .product-options, .right-info') : null;
        if (mainForm) {
            const formPrefix = mainForm.id === 'product_addtocart_form' ? '#product_addtocart_form' : (mainForm.classList.contains('product-options') ? '.product-options' : '.right-info');
            const sub = el.closest('.special-price') ? '.special-price .price' : (el.closest('.regular-price') ? '.regular-price .price' : '.price-box .price');
            return `${formPrefix} ${sub}`;
        }
    }
    
    // Check if element is inside a recognized eCommerce price container
    const semanticPrice = el.closest ? el.closest('.product-new-price, .special-price, .price-new, .current-price, .a-price, .product-price-col, .price-buy, .row-price, .product-price, .price-box, .price-wrapper, [data-price-type="finalPrice"], sd-price') : null;
    if (semanticPrice) {
        const tag = semanticPrice.tagName.toLowerCase();
        for (const cls of ['product-new-price', 'special-price', 'price-new', 'current-price', 'product-price-col', 'price-buy', 'row-price']) {
            if (semanticPrice.classList && semanticPrice.classList.contains(cls)) {
                const s = `.${cls}`;
                if (document.querySelectorAll(s).length === 1) return s;
                const ts = `${tag}.${cls}`;
                if (document.querySelectorAll(ts).length === 1) return ts;
            }
        }
    }

    // 1. If element has an ID, check if it's unique (avoid dynamic IDs with timestamps or numbers like product-options-767908)
    if (el.id && !/^\d+$/.test(el.id) && !/\d{4,}/.test(el.id) && !/product-options-\d+/i.test(el.id) && !el.id.includes('ember') && !el.id.includes('react-')) {
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
            !/^\d+$/.test(c) &&
            !/\d{4,}/.test(c)
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
    for (const attr of ['itemprop', 'data-testid', 'data-qa', 'data-cy', 'data-test', 'data-price-type']) {
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

    // 4. Concise hierarchical path (max 3 levels, avoid long nth-of-type chains)
    const path = [];
    let curr = el;
    let depth = 0;

    while (curr && curr.nodeType === 1 && depth < 3) {
        let seg = curr.nodeName.toLowerCase();

        if (curr.id && !/^\d+$/.test(curr.id) && !/\d{4,}/.test(curr.id) && !curr.id.includes('ember')) {
            try {
                seg += '#' + CSS.escape(curr.id);
                path.unshift(seg);
                break;
            } catch(e) {}
        }

        if (curr.className && typeof curr.className === 'string') {
            const validClasses = curr.className.split(/\s+/).filter(c => 
                c && !/^(active|hover|focus|selected|open|closed|show|hide|visible|ng-|css-|styled-|d-|flex|justify-|align-|row|col|grid|container|m-|p-|w-|h-)/i.test(c) && !/^\d+$/.test(c) && !/\d{4,}/.test(c)
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
    let clean = String(targetText).replace(/\u00a0/g, ' ').replace(/(?:^|[^\d])\d+\s*(?:дни|дена|ден|days?|d|ч|часа|час|hours?)(?=[^\p{L}\p{N}]|$)/gui, ' ');
    
    // 1. Strip trailing non-digit punctuation (e.g. sentence-ending periods, commas, colons)
    clean = clean.replace(/[\s.,:;!?-]+$/, '');

    // 2. Extract potential price token using currency/numeric boundaries
    const currSymbols = '€|EUR|лв\\.?|BGN|\\$|USD|£|GBP|Lei|RON|zł|PLN|CHF';
    const tokenRegex = new RegExp(`(?:^|[^\\w.,])(\\d{1,3}(?:[ .]\\d{3})*(?:[.,]\\d{1,2})|\\d+(?:[.,]\\d{1,2}))\\s*(?:${currSymbols})?(?=[^\\w]|$)`, 'i');
    const tokenMatch = clean.match(tokenRegex);

    let s = tokenMatch ? tokenMatch[1] : clean.replace(/[^0-9.,]/g, '');
    if (!s || !/\d/.test(s)) return null;

    s = s.trim().replace(/[\s.,]+$/, '');
    s = s.replace(/\s+/g, ''); // Remove thousands separating spaces

    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');

    if (lastComma > -1 && lastDot > -1) {
        if (lastComma > lastDot) {
            s = s.replace(/\./g, '').replace(',', '.'); // 1.250,99 -> 1250.99
        } else {
            const afterDot = s.length - lastDot - 1;
            if (afterDot === 2 || afterDot === 1) {
                s = s.replace(/,/g, ''); // 1,250.99 -> 1250.99
            } else {
                // e.g. 164,90. -> lastComma is the real decimal point
                s = s.substring(0, lastDot).replace(/,/g, '.');
            }
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

function isOldPriceElement(el) {
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'del' || tag === 's' || tag === 'strike') return true;

    const cls = (el.className && typeof el.className === 'string' ? el.className : '').toLowerCase();
    if (cls.includes('price-through') ||
        cls.includes('line-through') ||
        cls.includes('old-price') ||
        cls.includes('old_price') ||
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
}
const isOldPriceEl = isOldPriceElement;

function isUpsellOrCarousel(el) {
    if (!el || !el.closest) return false;

    // Positive exclusion: elements inside primary product containers are NEVER upsells
    if (el.closest('#product_addtocart_form, .product-options, .right-info, .product-page-pricing, .product-highlight, .highlight-box, .main-product-form, .product-info-main, .product-purchase-panel, .product-block--price, #corePriceDisplay_desktop_feature_div, #corePrice_feature_div, #apex_desktop')) {
        return false;
    }

    const upsellSelector = [
        '.upsell',
        '.upsell-products',
        '[class*="upsell"]',
        '.related',
        '.crosssell',
        '[class*="cross-sell"]',
        '[class*="crosssell"]',
        '[class*="related-"]',
        '[class*="-related"]',
        '[class*="slider"]',
        '[class*="carousel"]',
        '[class*="recommended"]',
        '[class*="similar"]',
        '[class*="viewed"]',
        '.products-list',
        '.product-box',
        '[id*="upsell"]',
        '[id*="related"]',
        '[id*="similar"]',
        '[id*="recommend"]',
        '.linked-products',
        '.linked-box'
    ].join(',');

    return !!((el.matches && el.matches(upsellSelector)) || el.closest(upsellSelector));
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
 * Domain-specific price, promotion, and discount rules for high accuracy and self-healing.
 */
const DOMAIN_PRICE_RULES = [
    {
        // eMAG (bg, ro, hu)
        match: (host) => host.includes('emag.'),
        priceSelectors: [
            'p.product-new-price',
            '.product-page-pricing .product-new-price',
            '.pricing-block .product-new-price',
            '.product-highlight .product-new-price',
            '[data-zone="pricing"] .product-new-price'
        ],
        oldPriceSelectors: [
            'p.product-old-price',
            '.product-page-pricing .product-old-price',
            '.pricing-block .product-old-price',
            'p.pricing.rrp-lp30d',
            'p.rrp-lp30d',
            '.rrp-lp30d-content',
            '[class*="rrp-lp30d"]',
            '.card-v2-discounts',
            'p.product-old-price del',
            '.product-page-pricing del'
        ],
        promoBadgeSelectors: [
            '.product-discount',
            '.badge-genius',
            '.voucher-details',
            '.vcr-voucher-card',
            '.vcr-voucher-placeholder',
            '.vcr-badge',
            '[class*="vcr-badge"]',
            '.personalization-teaser',
            '[data-source="voucher_badge"]',
            '.card-v2-discounts',
            '.product-page-pricing [class*="discount"]',
            '.product-page-pricing [class*="badge"]',
            '.product-page-pricing [class*="voucher"]'
        ],
        cleanSelector: 'p.product-new-price'
    },
    {
        // Amazon (de, com, co.uk, fr, it, es, etc.)
        match: (host) => host.includes('amazon.'),
        priceSelectors: [
            '#corePriceDisplay_desktop_feature_div .a-price .a-offscreen',
            '#corePrice_feature_div .a-price .a-offscreen',
            '#apex_desktop .a-price .a-offscreen',
            '.a-price .a-offscreen',
            '#priceblock_ourprice',
            '#priceblock_dealprice',
            '#price_inside_buybox'
        ],
        oldPriceSelectors: [
            '#corePriceDisplay_desktop_feature_div .basisPrice .a-offscreen',
            'span.a-text-price .a-offscreen',
            '#corePrice_feature_div span.a-text-price .a-offscreen',
            '.basisPrice .a-offscreen',
            '#listPrice'
        ],
        promoBadgeSelectors: [
            '.savingsPercentage',
            '.reinventPriceSavingsPercentageMargin',
            '#couponBadge',
            'label[for*="coupon"]',
            '#dealBadge_feature_div'
        ],
        cleanSelector: '.a-price .a-offscreen'
    },
    {
        // Ozone.bg
        match: (host) => host.includes('ozone.bg'),
        priceSelectors: [
            '#product_addtocart_form .price-box .price',
            '#product_addtocart_form p.special-price .price',
            '#product_addtocart_form .regular-price .price',
            '.product-options .price-box .price',
            '.product-options p.special-price .price',
            '.product-options .regular-price .price',
            '.right-info .price-box .price',
            '.right-info p.special-price .price',
            '.right-info .regular-price .price',
            '#product_addtocart_form span.price'
        ],
        oldPriceSelectors: [
            '#product_addtocart_form .price-box p.old-price .price',
            '#product_addtocart_form p.old-price .price',
            '#product_addtocart_form .price-box .old-price',
            '.product-options .price-box p.old-price .price',
            '.right-info .price-box p.old-price .price'
        ],
        promoBadgeSelectors: [
            '#product_addtocart_form .discount-price',
            '#product_addtocart_form .discount-percentage',
            '#product_addtocart_form .price-box .discount-price',
            '.product-options .discount-price',
            '.right-info .discount-price'
        ],
        cleanSelector: '#product_addtocart_form .price-box .price, .product-options .price-box .price, .right-info .price-box .price'
    },
    {
        // BabyMatters.bg
        match: (host) => host.includes('babymatters.bg'),
        priceSelectors: [
            '.product-price-col .special-price',
            '.product-price-col .price-new',
            '.product-price-col span.price',
            '.product-price-col',
            '.product-purchase-panel .price-new',
            '.product-purchase-panel .special-price'
        ],
        oldPriceSelectors: [
            '.product-price-col .price-old',
            '.product-price-col del',
            '.product-price-col s',
            '.product-purchase-panel .price-old'
        ],
        promoBadgeSelectors: [
            '.product-discount-badge',
            '.product-label-special',
            '.badge-discount'
        ],
        cleanSelector: '.product-price-col'
    },
    {
        // Baby.bg (Magento)
        match: (host) => host.includes('baby.bg'),
        priceSelectors: [
            '.price-box .special-price .price',
            '.price-box .regular-price .price',
            '.product-info-price .special-price .price',
            '.product-info-price .regular-price .price',
            '.price-box :not(.old-price) > .price',
            '.product-options'
        ],
        oldPriceSelectors: [
            '.price-box .old-price .price',
            '.product-info-price .old-price .price',
            '.price-box .old-price'
        ],
        promoBadgeSelectors: [
            '.discount-percent',
            '.sale-label',
            '.product-badge'
        ],
        cleanSelector: '.price-box .special-price .price, .price-box .regular-price .price'
    },
    {
        // Ardes.bg
        match: (host) => host.includes('ardes.bg'),
        priceSelectors: [
            '.common-price .price',
            '.price-total .price',
            '.price-total',
            '.common-price'
        ],
        oldPriceSelectors: [
            '.common-price .price-standard',
            '.old-price',
            '.price-old'
        ],
        promoBadgeSelectors: [
            '.discount-badge',
            '.price-saving'
        ],
        cleanSelector: '.common-price .price, .price-total'
    },
    {
        // Plasico.bg
        match: (host) => host.includes('plasico.bg'),
        priceSelectors: [
            '.price-buy .price',
            '.price-current',
            '.new-price',
            '.price-buy'
        ],
        oldPriceSelectors: [
            '.price-buy .old-price',
            '.old-price'
        ],
        promoBadgeSelectors: [
            '.discount-percentage',
            '.promo-badge',
            '.discount-badge'
        ],
        cleanSelector: '.price-buy'
    },
    {
        // Jar Computers
        match: (host) => host.includes('jarcomputers.com'),
        priceSelectors: [
            'div.row-price .price',
            'div.row-price .price_num',
            '.price_num',
            'div.row-price'
        ],
        oldPriceSelectors: [
            'div.row-price .price_old',
            '.price_old'
        ],
        promoBadgeSelectors: [
            '.label-promo',
            '.discount-badge'
        ],
        cleanSelector: 'div.row-price'
    },
    {
        // Tefal / Rowenta (SEB Web-Components)
        match: (host) => host.includes('tefal.') || host.includes('rowenta.'),
        priceSelectors: [
            'sd-price [class*="current"]',
            'div.c__price-block sd-price',
            'sd-price',
            '.c__price-block .c__price'
        ],
        oldPriceSelectors: [
            'sd-price del',
            '.c__price-block del',
            '[class*="c__price-old"]',
            'sd-price s'
        ],
        promoBadgeSelectors: [
            '.c__price-savings',
            '[class*="savings"]',
            '[class*="discount"]'
        ],
        cleanSelector: 'div.c__price-block > sd-price, sd-price'
    },
    {
        // Praktiker.bg
        match: (host) => host.includes('praktiker.bg'),
        priceSelectors: [
            '.pdp-tools .price',
            '.pdp-tools__start .price',
            '.pdp-price',
            '.current-price',
            '.pdp-tools__start'
        ],
        oldPriceSelectors: [
            '.crossed-price',
            '.old-price',
            '.pdp-tools del'
        ],
        promoBadgeSelectors: [
            '.promo-label',
            '.discount-badge'
        ],
        cleanSelector: '.pdp-tools__start, .pdp-price'
    },
    {
        // Praktis.bg
        match: (host) => host.includes('praktis.bg'),
        priceSelectors: [
            '[data-price-type="finalPrice"]',
            '.special-price .price',
            '.product-info-price .price',
            '.flex.gap-2.pb-3'
        ],
        oldPriceSelectors: [
            '[data-price-type="oldPrice"]',
            '.old-price .price'
        ],
        promoBadgeSelectors: [
            '.discount-percent',
            '.badge-promo'
        ],
        cleanSelector: '[data-price-type="finalPrice"], .special-price .price'
    },
    {
        // Raya Toys
        match: (host) => host.includes('rayatoys.com'),
        priceSelectors: [
            '.product-info-price .special-price .price',
            '.product-info-price span.price',
            'span.price'
        ],
        oldPriceSelectors: [
            '.product-info-price .old-price .price',
            '.old-price .price'
        ],
        promoBadgeSelectors: [
            '.product-discount-label',
            '.sale-badge'
        ],
        cleanSelector: '.product-info-price span.price, span.price'
    },
    {
        // BaniaStil
        match: (host) => host.includes('baniastil.com'),
        priceSelectors: [
            '.product-price .price-new',
            '.product-price .special-price',
            '.product-details .product-price'
        ],
        oldPriceSelectors: [
            '.product-price .price-old',
            '.product-price del',
            '.product-price s'
        ],
        promoBadgeSelectors: [
            '.promo-badge',
            '.label-discount'
        ],
        cleanSelector: '.product-details .product-price'
    },
    {
        // Pax.bg
        match: (host) => host.includes('pax.bg'),
        priceSelectors: [
            '.product__content__list .product__price',
            '.product__content__list',
            '.product__price'
        ],
        oldPriceSelectors: [
            '.product__price--old',
            'del'
        ],
        promoBadgeSelectors: [
            '.badge-promo'
        ],
        cleanSelector: '.product__content__list'
    },
    {
        // Elaria.bg (Shopify)
        match: (host) => host.includes('elaria.bg') || host.includes('myshopify.com'),
        priceSelectors: [
            '.product-block--price .price-item--sale',
            '.product-block--price .price__current',
            '.product-block.product-block--price .price-item',
            '.price-item--sale',
            '.product-block--price'
        ],
        oldPriceSelectors: [
            '.product-block--price .price-item--regular',
            '.price-item--regular',
            's.price-item'
        ],
        promoBadgeSelectors: [
            '.badge--sale',
            '.price__badge-sale'
        ],
        cleanSelector: '.product-block.product-block--price'
    },
    {
        // Generic WooCommerce
        match: () => !!document.querySelector('.woocommerce-Price-amount, .woocommerce-product-details__short-description'),
        priceSelectors: [
            'ins .woocommerce-Price-amount',
            '.woocommerce-Price-amount.amount',
            'p.price .amount'
        ],
        oldPriceSelectors: [
            'del .woocommerce-Price-amount',
            'del .amount'
        ],
        promoBadgeSelectors: [
            '.onsale',
            '.woocommerce-badge'
        ],
        cleanSelector: 'ins .woocommerce-Price-amount, .woocommerce-Price-amount'
    },
    {
        // Generic Magento / PrestaShop / OpenCart
        match: () => !!document.querySelector('.price-box, .current-price, .product-price-and-shipping'),
        priceSelectors: [
            '.special-price .price',
            '.current-price [itemprop="price"]',
            '.price-new',
            '.product-price-and-shipping .current-price',
            '.price-box .price'
        ],
        oldPriceSelectors: [
            '.old-price .price',
            '.regular-price',
            '.price-old',
            '.product-price-and-shipping .regular-price'
        ],
        promoBadgeSelectors: [
            '.discount-percentage',
            '.discount-amount',
            '.badge-discount'
        ],
        cleanSelector: '.special-price .price, .current-price, .price-new'
    }
];

/**
 * Dedicated parser for eMAG inline script offer data (EM.offer and campaign flags).
 * Extracts active promo, RRP/LP30D price, discount percent, and absolute discount amount.
 */
function extractEmagPageData() {
    if (!window.location.hostname.includes('emag.')) return null;
    try {
        const scripts = document.querySelectorAll('script:not([src])');
        for (const s of scripts) {
            const content = s.textContent || '';
            if (!content.includes('EM.offer')) continue;

            const emOfferMatch = content.match(/EM\.offer\s*=\s*(\{[\s\S]*?\n\s*\};)/);
            const targetContent = emOfferMatch ? emOfferMatch[1] : content;

            // Discard restricted internal margin differences that are hidden from customers
            const isRestricted = targetContent.includes('"is_restricted_from_view":true') || 
                                 targetContent.includes('"is_restricted_from_view": true') ||
                                 targetContent.includes('"is_visible":false') ||
                                 targetContent.includes('"is_visible": false') ||
                                 targetContent.includes('"labeled_as_discount":false') ||
                                 targetContent.includes('"labeled_as_discount": false');

            const curMatch = targetContent.match(/"current"\s*:\s*(\d+(?:\.\d+)?)/);
            const rrpMatch = targetContent.match(/"recommended_retail_price"\s*:\s*\{[^}]*"amount"\s*:\s*(\d+(?:\.\d+)?)/);
            const lowest30Match = targetContent.match(/"lowest_price_30_days"\s*:\s*\{[^}]*"amount"\s*:\s*(\d+(?:\.\d+)?)/);
            const rrp = (rrpMatch && parseFloat(rrpMatch[1]) > 0) ? parseFloat(rrpMatch[1]) : null;
            const lowest30 = (lowest30Match && parseFloat(lowest30Match[1]) > 0) ? parseFloat(lowest30Match[1]) : null;

            const cur = curMatch ? parseFloat(curMatch[1]) : null;

            let pct = null;
            let abs = null;
            if (!isRestricted) {
                const pctMatch = targetContent.match(/"percent"\s*:\s*(\d+(?:\.\d+)?)/);
                const absMatch = targetContent.match(/"absolute"\s*:\s*(\d+(?:\.\d+)?)/);
                pct = pctMatch ? parseFloat(pctMatch[1]) : null;
                abs = absMatch ? parseFloat(absMatch[1]) : null;
            }

            let orig = rrp || lowest30;
            if (cur && (orig && orig > cur)) {
                const finalPct = pct || Math.round(((orig - cur) / orig) * 100);
                const finalAbs = abs || +(orig - cur).toFixed(2);
                return {
                    value: cur,
                    originalPrice: orig,
                    discountPercent: finalPct,
                    discountAmount: finalAbs,
                    isPromo: true,
                    promoBadge: `-${finalPct}%`,
                    currency: '€'
                };
            }
        }
    } catch (e) {}
    return null;
}

/**
 * Extracts product price and promotional details from Schema.org JSON-LD scripts or OpenGraph/Meta tags.
 */
function extractFromStructuredData() {
    let result = null;

    // 1. JSON-LD scripts (<script type="application/ld+json">)
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of jsonLdScripts) {
        try {
            const raw = script.textContent.trim();
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            const items = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);

            for (const item of items) {
                if (!item) continue;
                const type = (item['@type'] || '').toLowerCase();
                
                if (type === 'product' || type === 'individualproduct' || type === 'productgroup') {
                    const offers = Array.isArray(item.offers) ? item.offers : (item.offers ? [item.offers] : []);
                    
                    for (const offer of offers) {
                        if (!offer) continue;
                        const price = parseFloat(offer.price || offer.lowPrice);
                        const curr = offer.priceCurrency ? normalizeCurrency(offer.priceCurrency) : '€';
                        const highPrice = parseFloat(offer.highPrice);
                        const avail = String(offer.availability || '').toLowerCase();
                        const isOutOfStock = avail.includes('outofstock') || avail.includes('discontinued');

                        if (!isNaN(price) && price > 0) {
                            let original = (!isNaN(highPrice) && highPrice > price) ? highPrice : null;
                            let discPct = null;
                            let isPromo = false;

                            if (original) {
                                discPct = Math.round(((original - price) / original) * 100);
                                isPromo = discPct > 0;
                            }

                            result = {
                                value: price,
                                currency: curr,
                                originalPrice: original,
                                discountPercent: discPct,
                                discountAmount: original ? +(original - price).toFixed(2) : null,
                                isPromo: isPromo,
                                promoBadge: discPct ? `-${discPct}%` : null,
                                stockStatus: isOutOfStock ? 'out_of_stock' : 'in_stock',
                                source: 'json_ld'
                            };
                            return result;
                        }
                    }
                }
            }
        } catch (e) {}
    }

    // 2. OpenGraph / Twitter meta tags
    try {
        const ogPriceEl = document.querySelector('meta[property="product:price:amount"], meta[property="og:price:amount"], meta[name="twitter:data1"]');
        const ogSalePriceEl = document.querySelector('meta[property="product:sale_price:amount"]');
        const ogOrigPriceEl = document.querySelector('meta[property="product:original_price:amount"]');
        const ogCurrEl = document.querySelector('meta[property="product:price:currency"], meta[property="og:price:currency"]');

        const mainPrice = ogSalePriceEl ? parseFloat(ogSalePriceEl.content) : (ogPriceEl ? parseFloat(ogPriceEl.content) : null);
        const origPrice = ogOrigPriceEl ? parseFloat(ogOrigPriceEl.content) : (ogSalePriceEl && ogPriceEl ? parseFloat(ogPriceEl.content) : null);
        const curr = ogCurrEl ? normalizeCurrency(ogCurrEl.content) : '€';

        if (mainPrice !== null && !isNaN(mainPrice) && mainPrice > 0) {
            let discPct = null;
            let isPromo = false;
            let validOrig = (origPrice !== null && !isNaN(origPrice) && origPrice > mainPrice) ? origPrice : null;

            if (validOrig) {
                discPct = Math.round(((validOrig - mainPrice) / validOrig) * 100);
                isPromo = discPct > 0;
            }

            result = {
                value: mainPrice,
                currency: curr,
                originalPrice: validOrig,
                discountPercent: discPct,
                discountAmount: validOrig ? +(validOrig - mainPrice).toFixed(2) : null,
                isPromo: isPromo,
                promoBadge: discPct ? `-${discPct}%` : null,
                stockStatus: 'in_stock',
                source: 'meta_tags'
            };
            return result;
        }
    } catch (e) {}

    return null;
}

/**
 * Searches for target element using built-in domain specific rules.
 */
function findTargetWithDomainRules(config = {}) {
    const host = window.location.hostname.toLowerCase();
    for (const rule of DOMAIN_PRICE_RULES) {
        if (rule.match(host)) {
            for (const sel of rule.priceSelectors) {
                try {
                    const el = document.querySelector(sel);
                    if (el) {
                        const check = extractPricesFromElement(el, true);
                        if (check.value !== null && check.value > 0) {
                            return { element: el, ruleSelector: rule.cleanSelector || sel };
                        }
                    }
                } catch (e) {}
            }
        }
    }
    return null;
}

/**
 * Comprehensive price and promotion extractor.
 * Detects current price, old/original price, discount percentage, and promotion vouchers/badges.
 */
function extractPriceAndPromo(element, config = {}, directVoucher = null) {
    if (!element) return { value: null, currency: '€' };

    const useLowest = config.useLowestPrice !== false;
    const baseResult = extractPricesFromElement(element, useLowest);
    if (!baseResult || baseResult.value === null) {
        return { value: null, currency: '€' };
    }

    let currentPrice = baseResult.value;
    const currency = baseResult.currency || '€';

    let originalPrice = null;
    let discountPercent = null;
    let discountAmount = null;
    let isPromo = false;
    let promoBadge = null;

    // 1. Check matching domain rule for dedicated old price & badge selectors
    const host = window.location.hostname.toLowerCase();
    const matchedRule = DOMAIN_PRICE_RULES.find(r => r.match(host));

    // 2. Expand search area: prioritize local pricing block first to prevent upsell/related contamination
    const localPriceBlock = (element.closest && element.closest([
        '#product_addtocart_form',
        '.product-options',
        '.right-info',
        '.pricing-block',
        '.product-price-col',
        '.price-box',
        '.price-wrapper',
        '.product-info-price',
        '.c__price-block',
        '.pdp-tools',
        '.common-price',
        '.price-buy',
        '.product-details',
        'div[class*="price"]'
    ].join(','))) || element.parentElement || element;

    const widePriceBlock = (element.closest && element.closest([
        '.product-page-pricing',
        '.product-highlight',
        '.highlight-box',
        '.main-product-form',
        '.product-info-main',
        '.product-purchase-panel',
        '.product-block--price',
        '#corePriceDisplay_desktop_feature_div',
        '#corePrice_feature_div',
        '#apex_desktop',
        'form[id*="cart"]'
    ].join(',')));

    const priceBlock = localPriceBlock || widePriceBlock || element;

    // 3. Search for explicit original / old / strikethrough price
    const oldPriceCandidates = [
        ...(matchedRule?.oldPriceSelectors || []),
        'p.product-old-price',
        '.product-old-price',
        'p.old-price',
        '.old-price',
        '.price-old',
        '.price-standard',
        '.crossed-price',
        'span.a-text-price .a-offscreen',
        '.basisPrice .a-offscreen',
        '#listPrice',
        'del',
        's',
        'strike',
        '[class*="price-through"]',
        '[class*="line-through"]',
        '[class*="old-price"]',
        '[class*="old_price"]',
        '[data-price-type="oldPrice"]'
    ];

    // Search local price block first, then wide container if not found
    const searchBlocks = [localPriceBlock];
    if (widePriceBlock && widePriceBlock !== localPriceBlock) {
        searchBlocks.push(widePriceBlock);
    }

    for (const block of searchBlocks) {
        if (originalPrice) break;
        for (const sel of oldPriceCandidates) {
            try {
                const els = block.querySelectorAll(sel);
                for (const oldEl of els) {
                    // Ignore elements inside upsell, related, or recommended carousels
                    if (isUpsellOrCarousel(oldEl)) {
                        continue;
                    }

                    // Prefer nested .price or span.price to avoid tooltips and labels
                    const subPrice = oldEl.querySelector('.price, span.price, del, s, strike');
                    const targetEl = subPrice || oldEl;

                    // Strip tooltips before reading text
                    let oldText = '';
                    try {
                        const clone = targetEl.cloneNode(true);
                        const tooltips = clone.querySelectorAll('.product-tooltip, .product-page-tooltip, .tooltip, [role="tooltip"], .price-label');
                        tooltips.forEach(t => t.remove());
                        oldText = (clone.innerText || clone.textContent || '').replace(/\u00a0/g, ' ').trim();
                    } catch (e) {
                        oldText = (targetEl.innerText || targetEl.textContent || '').replace(/\u00a0/g, ' ').trim();
                    }

                    let parsedOld = parsePriceStringToNumber(oldText);
                    if (parsedOld !== null) {
                        // Decimal-drop safeguard: if parsedOld is ~100x currentPrice (e.g. 16490 vs 115.5 or 164.9), adjust
                        if (parsedOld >= currentPrice * 30 && Math.abs((parsedOld / 100) - currentPrice) < currentPrice * 2) {
                            parsedOld = +(parsedOld / 100).toFixed(2);
                        }
                        // Discard absurd outliers (e.g. > 10x currentPrice)
                        if (parsedOld > currentPrice && parsedOld <= currentPrice * 10 && (!originalPrice || parsedOld > originalPrice)) {
                            originalPrice = parsedOld;
                        }
                    }
                }
            } catch (e) {}
        }
    }

    // 4. Search for in-page voucher cards, data-voucher JSON, and promo badges
    let voucherDiscountPercent = null;
    let voucherDiscountAmount = null;
    let voucherPromoBadge = null;

    // 4a. Check direct voucher passed from eMAG SAPI call
    if (directVoucher) {
        if (directVoucher.discount_type === 1 && typeof directVoucher.discount_value === 'number') {
            voucherDiscountPercent = directVoucher.discount_value;
        } else if (directVoucher.discount_type === 2 && typeof directVoucher.discount_value === 'number') {
            voucherDiscountAmount = directVoucher.discount_value;
        }
        if (directVoucher.name) {
            voucherPromoBadge = directVoucher.name;
            if (directVoucher.voucher_code) {
                voucherPromoBadge += ` (${directVoucher.voucher_code})`;
            }
        }
    }

    // 4b. Search in-page voucher elements in priceBlock or document scope
    if (!voucherDiscountPercent && !voucherDiscountAmount) {
        const voucherEl = (priceBlock && priceBlock.querySelector('.js-in-page-voucher, [data-voucher], .vcr-voucher-card, .vcr-voucher-placeholder, .personalization-teaser')) ||
                          document.querySelector('.js-in-page-voucher, [data-voucher], .vcr-voucher-card, .vcr-voucher-placeholder, .personalization-teaser');
        if (voucherEl) {
            try {
                const rawVoucher = voucherEl.getAttribute('data-voucher');
                if (rawVoucher) {
                    const vData = JSON.parse(rawVoucher);
                    if (vData) {
                        if (vData.discount_type === 1 && typeof vData.discount_value === 'number') {
                            voucherDiscountPercent = vData.discount_value;
                        } else if (vData.discount_type === 2 && typeof vData.discount_value === 'number') {
                            voucherDiscountAmount = vData.discount_value;
                        }
                        if (vData.name) {
                            voucherPromoBadge = vData.name;
                            if (vData.voucher_code) {
                                voucherPromoBadge += ` (${vData.voucher_code})`;
                            }
                        }
                    }
                }
            } catch (e) {}

            if (!voucherDiscountPercent && !voucherPromoBadge) {
                const vText = (voucherEl.innerText || voucherEl.textContent || '').replace(/\u00a0/g, ' ').trim();
                const pctMatch = vText.match(/[-–]?\s*(\d{1,2}(?:[.,]\d)?)\s*%/);
                if (pctMatch) {
                    voucherDiscountPercent = Math.round(parseFloat(pctMatch[1].replace(',', '.')));
                }
                const nameMatch = vText.match(/[-–]?\s*\d{1,2}%\s*отстъпка\s*с\s*ваучер|ваучер\s*[-–]?\s*\d{1,2}%|[-–]?\s*\d{1,2}%\s*с\s*код\s*[\w\d]+/i);
                if (nameMatch) {
                    voucherPromoBadge = nameMatch[0];
                }
            }
        }
    }

    // 4c. Search full pricing container or main content for visible voucher text
    if (!voucherDiscountPercent && !voucherDiscountAmount) {
        const searchScope = (element.closest && element.closest('.product-page-pricing, .product-highlight, .main-product-form, main')) || document.body;
        if (searchScope) {
            const scopeText = (searchScope.innerText || searchScope.textContent || '').replace(/\u00a0/g, ' ');
            const vTextMatch = scopeText.match(/[-–]?\s*(\d{1,2})%\s*отстъпка\s*с\s*ваучер/i) ||
                               scopeText.match(/ваучер\s*[-–]?\s*(\d{1,2})%/i);
            if (vTextMatch) {
                voucherDiscountPercent = parseInt(vTextMatch[1], 10);
                voucherPromoBadge = vTextMatch[0];
            }
        }
    }

    const promoBadgeCandidates = [
        ...(matchedRule?.promoBadgeSelectors || []),
        '.product-discount',
        '.badge-genius',
        '.voucher-details',
        '.discount-percentage',
        '.savingsPercentage',
        '.badge-promo',
        '.product-label-special',
        '.product-discount-badge',
        '.discount-badge',
        '.promo-badge',
        '.c__price-savings',
        '.badge--sale',
        '.onsale',
        '[class*="discount"]',
        '[class*="savings"]',
        '[class*="promo"]',
        '[class*="badge"]'
    ];

    for (const sel of promoBadgeCandidates) {
        try {
            const els = priceBlock.querySelectorAll(sel);
            for (const bEl of els) {
                if (isUpsellOrCarousel(bEl)) {
                    continue;
                }
                const bText = (bEl.innerText || bEl.textContent || '').replace(/\u00a0/g, ' ').trim();
                if (!bText) continue;

                // Match -XX% or XX%
                const pctMatch = bText.match(/[-–]?\s*(\d{1,2}(?:[.,]\d)?)\s*%/);
                if (pctMatch) {
                    const parsedPct = parseFloat(pctMatch[1].replace(',', '.'));
                    if (parsedPct > 0 && parsedPct < 100 && (!discountPercent || parsedPct > discountPercent)) {
                        discountPercent = Math.round(parsedPct);
                        if (!promoBadge) promoBadge = `-${discountPercent}%`;
                    }
                }

                // Check for voucher / coupon text
                const vMatch = bText.match(/[-–]?\s*\d{1,2}%\s*отстъпка\s*с\s*ваучер|ваучер\s*[-–]?\s*\d{1,2}%|[-–]?\s*\d{1,2}%\s*с\s*код\s*[\w\d]+/i);
                if (vMatch) {
                    voucherPromoBadge = vMatch[0];
                    if (!voucherDiscountPercent && pctMatch) {
                        voucherDiscountPercent = Math.round(parseFloat(pctMatch[1].replace(',', '.')));
                    }
                } else if (/voucher|ваучер|coupon|купон|genius|код\s*за\s*отстъпка/i.test(bText)) {
                    const cleanBadge = bText.replace(/\s+/g, ' ').trim();
                    if (cleanBadge.length <= 40 && !promoBadge) {
                        promoBadge = cleanBadge;
                    }
                }
            }
        } catch (e) {}
    }

    // 5. Check eMAG script data fallback
    if (!originalPrice || !discountPercent) {
        const emagData = extractEmagPageData();
        if (emagData) {
            if (!originalPrice && emagData.originalPrice && emagData.originalPrice > currentPrice) {
                originalPrice = emagData.originalPrice;
            }
            if (!discountPercent && emagData.discountPercent) {
                discountPercent = emagData.discountPercent;
            }
            if (!discountAmount && emagData.discountAmount) {
                discountAmount = emagData.discountAmount;
            }
            if (emagData.isPromo) {
                isPromo = true;
            }
            if (!promoBadge && emagData.promoBadge) {
                promoBadge = emagData.promoBadge;
            }
        }
    }

    // 6. Check JSON-LD / Meta data for highPrice / regular price if not found yet
    if (!originalPrice || !discountPercent) {
        const metaData = extractFromStructuredData();
        if (metaData) {
            if (!originalPrice && metaData.originalPrice && metaData.originalPrice > currentPrice) {
                originalPrice = metaData.originalPrice;
            }
            if (!discountPercent && metaData.discountPercent) {
                discountPercent = metaData.discountPercent;
            }
        }
    }

    // 7. Calculate promotion and discount amounts
    if (voucherDiscountPercent && voucherDiscountPercent > 0) {
        isPromo = true;
        discountPercent = voucherDiscountPercent;
        promoBadge = voucherPromoBadge || `-${discountPercent}% с ваучер`;

        if (!originalPrice) {
            // No strikethrough price: currentPrice (e.g. 259.95) is the regular price before voucher
            discountAmount = +(currentPrice * (discountPercent / 100)).toFixed(2);
            if (useLowest) {
                originalPrice = currentPrice;
                currentPrice = +(currentPrice - discountAmount).toFixed(2);
            }
        } else {
            // Product already had a strikethrough price (originalPrice)
            if (useLowest) {
                const voucherSavings = +(currentPrice * (discountPercent / 100)).toFixed(2);
                currentPrice = +(currentPrice - voucherSavings).toFixed(2);
            }
            discountAmount = +(originalPrice - currentPrice).toFixed(2);
            discountPercent = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
        }
    } else if (voucherDiscountAmount && voucherDiscountAmount > 0) {
        isPromo = true;
        promoBadge = voucherPromoBadge || `-${voucherDiscountAmount} с ваучер`;
        if (!originalPrice) {
            discountAmount = voucherDiscountAmount;
            if (useLowest) {
                originalPrice = currentPrice;
                currentPrice = +(currentPrice - voucherDiscountAmount).toFixed(2);
                discountPercent = Math.round((discountAmount / originalPrice) * 100);
            } else {
                discountPercent = Math.round((discountAmount / currentPrice) * 100);
            }
        } else {
            if (useLowest) {
                currentPrice = +(currentPrice - voucherDiscountAmount).toFixed(2);
            }
            discountAmount = +(originalPrice - currentPrice).toFixed(2);
            discountPercent = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
        }
    } else if (originalPrice && originalPrice > currentPrice) {
        isPromo = true;
        if (!discountPercent) {
            discountPercent = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
        }
        discountAmount = +(originalPrice - currentPrice).toFixed(2);
        if (!promoBadge) {
            promoBadge = `-${discountPercent}%`;
        }
    } else if (discountPercent && discountPercent > 0) {
        isPromo = true;
        if (!originalPrice) {
            // Displayed currentPrice is already the active discounted selling price.
            // Estimate regular/original price from discount percentage without double subtracting.
            originalPrice = +((currentPrice / (1 - (discountPercent / 100)))).toFixed(2);
            discountAmount = +(originalPrice - currentPrice).toFixed(2);
        }
    }

    let stockStatus = 'in_stock';
    const oosEl = document.querySelector('.availability.out-of-stock, #availability-holder.out-of-stock, .product-page-out-of-stock, .label-out-of-stock, .btn-out-of-stock, .out-of-stock, [class*="out-of-stock"], [class*="outofstock"]');
    if (oosEl) {
        stockStatus = 'out_of_stock';
    }

    return {
        value: currentPrice,
        currency: currency,
        originalPrice: originalPrice,
        discountPercent: discountPercent,
        discountAmount: discountAmount,
        isPromo: isPromo,
        promoBadge: promoBadge,
        stockStatus: stockStatus
    };
}

/**
 * Intelligently searches for the target element using direct query, domain rules, and progressive fallback strategies.
 */
function findTargetElement(selector, itemType = 'price') {
    if (!selector) return null;

    const isPrimaryScope = (el) => !!(el && el.closest && el.closest('#product_addtocart_form, .product-options, .right-info, .product-page-pricing, .product-highlight, .highlight-box, .main-product-form, .product-info-main, .product-purchase-panel, .product-block--price, #corePriceDisplay_desktop_feature_div, #corePrice_feature_div, #apex_desktop, form[id*="cart"]'));

    // 1. If selector is a comma-separated list, prioritize candidates in listed order,
    // preferring primary product containers, active prices over strikethrough/old prices, and strictly excluding upsell/carousel elements.
    if (selector.includes(',')) {
        const parts = selector.split(',').map(s => s.trim()).filter(Boolean);
        let fallbackOldPriceEl = null;
        for (const part of parts) {
            try {
                const candidates = Array.from(document.querySelectorAll(part));
                // 1a. Prioritize candidates in primary product container
                for (const candidate of candidates) {
                    if (itemType === 'price') {
                        if (isUpsellOrCarousel(candidate)) continue;
                        if (isOldPriceElement(candidate)) {
                            if (!fallbackOldPriceEl) fallbackOldPriceEl = candidate;
                            continue;
                        }
                    }
                    if (isPrimaryScope(candidate)) {
                        return candidate;
                    }
                }
                // 1b. Fallback to valid non-upsell candidate
                for (const candidate of candidates) {
                    if (itemType === 'price') {
                        if (isUpsellOrCarousel(candidate)) continue;
                        if (isOldPriceElement(candidate)) {
                            if (!fallbackOldPriceEl) fallbackOldPriceEl = candidate;
                            continue;
                        }
                    }
                    return candidate;
                }
            } catch (e) {}
        }
        if (fallbackOldPriceEl) return fallbackOldPriceEl;
    }

    // 1b. Direct query selector
    try {
        const candidates = Array.from(document.querySelectorAll(selector));
        let fallbackOldPriceEl = null;
        // Prioritize primary product container
        for (const el of candidates) {
            if (itemType === 'price') {
                if (isUpsellOrCarousel(el)) continue;
                if (isOldPriceElement(el)) {
                    const parentBox = el.closest('.price-box, .product-price-col, .product-info-price, .pricing-block, #product_addtocart_form, .product-options');
                    if (parentBox) {
                        const activeEl = parentBox.querySelector('.special-price .price, .product-new-price, .regular-price .price, [class*="special-price"] .price');
                        if (activeEl && !isUpsellOrCarousel(activeEl)) return activeEl;
                    }
                    if (!fallbackOldPriceEl) fallbackOldPriceEl = el;
                    continue;
                }
            }
            if (isPrimaryScope(el)) {
                return el;
            }
        }
        // Fallback to non-upsell candidate
        for (const el of candidates) {
            if (itemType === 'price') {
                if (isUpsellOrCarousel(el)) continue;
                if (isOldPriceElement(el)) {
                    if (!fallbackOldPriceEl) fallbackOldPriceEl = el;
                    continue;
                }
            }
            return el;
        }
        if (fallbackOldPriceEl) return fallbackOldPriceEl;
    } catch (e) {}

    // 2. Relaxed child combinator (> replaced by descendant space)
    try {
        if (selector.includes('>')) {
            const descendantSelector = selector.replace(/\s*>\s*/g, ' ');
            const candidates = document.querySelectorAll(descendantSelector);
            for (const el of candidates) {
                if (itemType === 'price' && isUpsellOrCarousel(el)) continue;
                return el;
            }
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
                const candidates = document.querySelectorAll(cleanSelector);
                for (const el of candidates) {
                    if (itemType === 'price' && isUpsellOrCarousel(el)) continue;
                    return el;
                }
            }
        }
    } catch (e) {}

    // 4. Relaxed selector (strip :nth-of-type and try sub-selectors)
    try {
        if (selector.includes(':nth-of-type')) {
            const withoutNth = selector.replace(/:nth-of-type\(\d+\)/g, '');
            const candidates = document.querySelectorAll(withoutNth);
            for (const el of candidates) {
                if (itemType === 'price' && isUpsellOrCarousel(el)) continue;
                return el;
            }
        }

        const segments = selector.split(/\s*>\s*|\s+/).filter(Boolean);
        if (segments.length > 1) {
            // Try last 2 segments
            const subSelector = segments.slice(-2).join(' ');
            const candidates = document.querySelectorAll(subSelector);
            for (const el of candidates) {
                if (itemType === 'price' && isUpsellOrCarousel(el)) continue;
                return el;
            }

            // Try target leaf segment
            const leafSelector = segments[segments.length - 1];
            if (leafSelector && (leafSelector.includes('.') || leafSelector.includes('#'))) {
                const leafCandidates = document.querySelectorAll(leafSelector);
                for (const elLeaf of leafCandidates) {
                    if (itemType === 'price' && isUpsellOrCarousel(elLeaf)) continue;
                    return elLeaf;
                }

                // Try leaf class without element tag prefix (e.g. div.pricing-block -> .pricing-block)
                const classOnly = leafSelector.match(/\.[\w-]+/);
                if (classOnly) {
                    const classCandidates = document.querySelectorAll(classOnly[0]);
                    for (const elClassOnly of classCandidates) {
                        if (itemType === 'price' && isUpsellOrCarousel(elClassOnly)) continue;
                        return elClassOnly;
                    }
                }
            }
        }
    } catch (e) {}

    // 5. Try domain-specific rules (smart fallback)
    if (itemType === 'price') {
        const domainMatch = findTargetWithDomainRules();
        if (domainMatch && domainMatch.element) {
            return domainMatch.element;
        }

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
        let autoHealedSelector = null;

        // If selector wasn't found, try domain rules or structured data fallback
        if (!element && config.type === "price") {
            const domainMatch = findTargetWithDomainRules(config);
            if (domainMatch && domainMatch.element) {
                element = domainMatch.element;
                autoHealedSelector = domainMatch.ruleSelector;
                console.log(`[PriceTracker] Auto-healed broken selector "${config.selector}" -> "${autoHealedSelector}"`);
            }
        }

        // eMAG voucher campaign check: fetch async voucher if not yet in DOM
        let sapiVoucher = null;
        if (window.location.hostname.includes('emag.')) {
            const addBtn = document.querySelector('[data-offer-id]');
            let offerId = addBtn ? addBtn.getAttribute('data-offer-id') : null;
            if (!offerId) {
                const prodEl = document.querySelector('[data-product*="offerid"]');
                if (prodEl) {
                    try {
                        const pData = JSON.parse(prodEl.getAttribute('data-product'));
                        if (pData && pData.offerid) offerId = String(pData.offerid);
                    } catch (e) {}
                }
            }
            if (!offerId) {
                const htmlText = document.documentElement.innerHTML || '';
                const m = htmlText.match(/data-offer-id=["'](\d+)["']/) ||
                          htmlText.match(/"offerid"\s*:\s*(\d+)/) ||
                          htmlText.match(/"offer_id"\s*:\s*(\d+)/);
                if (m) offerId = m[1];
            }

            if (offerId && /^\d+$/.test(offerId)) {
                try {
                    const sapiRes = await fetch(`https://sapi.emag.bg/voucher-campaign/product-page/${offerId}`, {
                        headers: { 'X-Request-Source': 'www' }
                    });
                    if (sapiRes.ok) {
                        const sapiData = await sapiRes.json();
                        const notif = sapiData?.data?.notification;
                        if (notif && (notif.discount_value > 0 || notif.discount_percent > 0)) {
                            sapiVoucher = notif;
                            const placeholder = document.querySelector('.js-vcr-voucher-placeholder') || document.querySelector('.product-page-pricing') || document.body;
                            const vDiv = document.createElement('div');
                            vDiv.className = 'js-in-page-voucher';
                            vDiv.setAttribute('data-voucher', JSON.stringify(notif));
                            vDiv.innerHTML = `<span class="voucher-name">${notif.name}</span>`;
                            placeholder.appendChild(vDiv);
                        }
                    }
                } catch (e) {}
            }
        }

        let finalValue = null;
        let currency = '€';
        let originalPrice = null;
        let discountPercent = null;
        let discountAmount = null;
        let isPromo = false;
        let promoBadge = null;
        let stockStatus = 'in_stock';

        if (config.type === "price") {
            if (element) {
                const promoResult = extractPriceAndPromo(element, config, sapiVoucher);
                if (promoResult.value !== null) {
                    finalValue = promoResult.value;
                    currency = promoResult.currency;
                    originalPrice = promoResult.originalPrice;
                    discountPercent = promoResult.discountPercent;
                    discountAmount = promoResult.discountAmount;
                    isPromo = promoResult.isPromo;
                    promoBadge = promoResult.promoBadge;
                    stockStatus = promoResult.stockStatus;
                }
            }

            // Fallback: eMAG script data or Structured Data
            if (finalValue === null) {
                const emagData = extractEmagPageData();
                if (emagData && emagData.value !== null) {
                    finalValue = emagData.value;
                    currency = emagData.currency || '€';
                    originalPrice = emagData.originalPrice;
                    discountPercent = emagData.discountPercent;
                    discountAmount = emagData.discountAmount;
                    isPromo = emagData.isPromo;
                    promoBadge = emagData.promoBadge;
                    stockStatus = 'in_stock';
                }
            }
            if (finalValue === null) {
                const structured = extractFromStructuredData();
                if (structured && structured.value !== null) {
                    finalValue = structured.value;
                    currency = structured.currency;
                    originalPrice = structured.originalPrice;
                    discountPercent = structured.discountPercent;
                    discountAmount = structured.discountAmount;
                    isPromo = structured.isPromo;
                    promoBadge = structured.promoBadge;
                    stockStatus = structured.stockStatus;
                }
            }

            // Check if current selector is brittle and can be improved
            if (!autoHealedSelector && config.selector) {
                const isBrittle = config.selector.includes(':nth-of-type') || 
                                  config.selector.includes('#product-options') || 
                                  config.selector === 'div > div.a-section > div.a-section' ||
                                  config.selector.split('>').length > 4;
                if (isBrittle) {
                    const host = window.location.hostname.toLowerCase();
                    const matchedRule = DOMAIN_PRICE_RULES.find(r => r.match(host));
                    if (matchedRule && matchedRule.cleanSelector) {
                        try {
                            const cleanEl = document.querySelector(matchedRule.cleanSelector);
                            if (cleanEl) {
                                autoHealedSelector = matchedRule.cleanSelector;
                                console.log(`[PriceTracker] Upgraded brittle selector "${config.selector}" -> "${autoHealedSelector}"`);
                            }
                        } catch (e) {}
                    }
                }
            }

            if (finalValue === null) {
                const diag = diagnosePageFailure();
                if (diag) {
                    throw new Error(diag);
                }
                const rawText = element ? (element.innerText || element.textContent || '').replace(/\u00a0/g, ' ').trim() : '';
                throw new Error(rawText ? `Extracted price is not a valid number: "${rawText}"` : `Element with selector "${config.selector}" was not found.`);
            }
        } else if (config.type === "text") {
            if (!element) {
                const diag = diagnosePageFailure();
                if (diag) {
                    throw new Error(diag);
                }
                throw new Error(`Element with selector "${config.selector}" was not found.`);
            }
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
            originalPrice: originalPrice,
            discountPercent: discountPercent,
            discountAmount: discountAmount,
            isPromo: isPromo,
            promoBadge: promoBadge,
            stockStatus: stockStatus,
            autoHealedSelector: autoHealedSelector,
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