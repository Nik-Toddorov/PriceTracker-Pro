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
 * Intelligently extracts all valid full prices from an element and its subtree/hierarchy.
 * Prevents cents fragmentation and truncated integer confusion (e.g. 687.64 € is not overridden by 687).
 * Ignores savings, price differences, and discount percentages (e.g. "Save 39.60 €", "-20%").
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

    // Detect currency symbol or abbreviation
    const fullTextForCurrency = (targetEl.innerText || targetEl.textContent || '').replace(/\u00a0/g, ' ').trim();
    let currency = '€';
    if (fullTextForCurrency.includes('лв') || fullTextForCurrency.includes('BGN')) currency = 'лв.';
    else if (fullTextForCurrency.includes('$')) currency = '$';
    else if (fullTextForCurrency.includes('£')) currency = '£';
    else if (fullTextForCurrency.includes('lei') || fullTextForCurrency.includes('Lei') || fullTextForCurrency.includes('RON')) currency = 'Lei';
    else if (fullTextForCurrency.includes('€') || fullTextForCurrency.includes('EUR')) currency = '€';

    // 1. Try parsing full element text directly first (unified whole container)
    let wholeContainerNum = null;
    if (fullTextForCurrency) {
        const lines = fullTextForCurrency.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
        const filteredLines = lines.filter(line => {
            const lower = line.toLowerCase();
            return !lower.includes('спестява') && 
                   !lower.includes('разлика') && 
                   !lower.includes('отстъпка') && 
                   !lower.includes('save') && 
                   !lower.includes('discount') &&
                   !lower.includes('diff') &&
                   !lower.includes('%');
        });

        const targetSource = filteredLines.length > 0 ? filteredLines.join(' ') : fullTextForCurrency;
        wholeContainerNum = parsePriceStringToNumber(targetSource);
    }

    // 2. Discover all price candidates in the subtree/hierarchy
    const candidateNumbers = [];
    if (wholeContainerNum !== null) {
        candidateNumbers.push(wholeContainerNum);
    }

    // Traverse child nodes to catch sub-elements, discounts, and promotional tags
    const allDescendants = [targetEl, ...targetEl.querySelectorAll('*')];
    for (const el of allDescendants) {
        // Skip hidden or script elements
        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'NOSCRIPT') continue;

        // Skip discount difference / savings badges
        const elText = (el.innerText || el.textContent || '').replace(/\u00a0/g, ' ').trim();
        if (!elText) continue;

        const lower = elText.toLowerCase();
        if (lower.includes('спестява') || lower.includes('разлика') || lower.includes('отстъпка') ||
            lower.includes('save') || lower.includes('discount') || lower.includes('%')) {
            continue;
        }

        // If the element has direct text content or is a price wrapper
        const parsed = parsePriceStringToNumber(elText);
        if (parsed !== null && parsed > 0) {
            if (!candidateNumbers.includes(parsed)) {
                candidateNumbers.push(parsed);
            }
        }
    }

    if (candidateNumbers.length === 0) {
        return { value: null, currency };
    }

    // Filter out partial fragments (both truncated integers and isolated decimal fractions)
    // e.g. If candidates contain [687.64, 687, 64], 64 is decimal cents and 687 is truncated whole part of 687.64
    const validPrices = candidateNumbers.filter(num => {
        if (num < 1 && candidateNumbers.some(other => other >= 1)) return false;

        // Check if num is an incomplete fragment of any full float price in candidateNumbers
        for (const full of candidateNumbers) {
            if (full > num && (full % 1 !== 0)) {
                // 1. Is num the integer/whole part of full? (e.g. 687 of 687.64)
                if (Math.floor(full) === num) {
                    return false;
                }
                // 2. Is num the cents/fraction part of full? (e.g. 64 of 687.64)
                if (num <= 99 && num >= 1 && Number.isInteger(num)) {
                    const cents = Math.round((full - Math.floor(full)) * 100);
                    if (cents === num) {
                        return false;
                    }
                }
            }
        }
        return true;
    });

    const pricesToEvaluate = validPrices.length > 0 ? validPrices : candidateNumbers;

    let finalValue = pricesToEvaluate[0];
    if (useLowestPrice) {
        // Select lowest price among valid full prices (e.g. promotional price)
        finalValue = Math.min(...pricesToEvaluate);
    }

    return { value: finalValue, currency, candidateCount: candidateNumbers.length };
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

    // 2. Relaxed selector (strip :nth-of-type and try sub-selectors)
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
            }
        }
    } catch (e) {}

    // 3. eCommerce price selector fallbacks (if itemType === 'price')
    if (itemType === 'price') {
        const priceCandidates = [
            'p.product-new-price',
            '.product-new-price',
            '.product-price',
            '.pricing-block .product-new-price',
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

        // 3. Send result back to background.js
        chrome.runtime.sendMessage({
            action: "scrape_result",
            itemConfig: config,
            value: finalValue,
            currency: currency,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        // Notify background service worker on error to log status and close tab
        chrome.runtime.sendMessage({
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