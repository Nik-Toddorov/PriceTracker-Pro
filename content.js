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

// Generates a concise and accurate CSS selector for the given element
function generateUniqueSelector(el) {
    if (!el || el.nodeType !== 1) return "";
    
    // If the element has an ID, that is the most reliable selector
    if (el.id) {
        return "#" + el.id;
    }
    
    const path = [];
    while (el && el.nodeType === 1) {
        let selector = el.nodeName.toLowerCase();
        
        // Append class names (filtering out dynamic state classes like hover/active)
        if (el.className && typeof el.className === 'string') {
            const classes = el.className.split(/\s+/).filter(c => c && !c.includes('hover') && !c.includes('active'));
            if (classes.length > 0) {
                selector += "." + classes.join(".");
            }
        }
        
        path.unshift(selector);
        
        // Stop once we have reached a sufficiently specific path depth (e.g. 3 levels)
        if (path.length >= 3) break; 
        
        el = el.parentNode;
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
 * Prevents cents fragmentation (e.g. 118.85 € is not split into 118 and 85).
 * Ignores savings, price differences, and discount percentages (e.g. "Save 39.60 €", "-20%").
 */
function extractPricesFromElement(element, useLowestPrice = true) {
    if (!element) return { value: null, currency: '€' };

    // Amazon specific fix: If .a-price-whole is selected, find the parent .a-price container
    let targetEl = element;
    if (targetEl.classList && targetEl.classList.contains('a-price-whole')) {
        const parentPrice = targetEl.closest('.a-price');
        if (parentPrice) {
            targetEl = parentPrice;
        }
    }

    // 1. Clone element to normalize segmented tags (sup, sub, fraction, cents)
    let clone;
    try {
        clone = targetEl.cloneNode(true);
    } catch (e) {
        clone = targetEl;
    }

    // For Amazon, remove duplicate visible sub-parts if .a-offscreen is present
    if (clone.querySelector && clone.querySelector('.a-offscreen')) {
        clone.querySelectorAll('.a-price-whole, .a-price-fraction, .a-price-decimal').forEach(el => el.remove());
    }

    // Normalize sup, sub, or cents elements missing a decimal point (e.g. 118<sup>85</sup> -> 118.85)
    if (clone.querySelectorAll) {
        clone.querySelectorAll('sup, sub, .fraction, .cents, .price-fraction, .price-cents, .cents-holder').forEach(sup => {
            const t = sup.textContent.trim();
            if (/^\d{1,2}$/.test(t)) {
                sup.textContent = '.' + t;
            }
        });
    }

    // 2. Extract full text from cloned element
    let fullText = (clone.innerText || clone.textContent || '').replace(/\u00a0/g, ' ');

    // Dynamically extract currency symbol (defaulting to €)
    const currencyMatch = fullText.match(/(€|\$|£|лв\.?|BGN|USD|EUR|lei|RON)/i);
    const currency = currencyMatch ? currencyMatch[0].trim() : '€';

    // 3. Split text by lines/delimiters and filter out noise (savings, discounts, percentages)
    const lines = fullText.split(/[\n\r\t|•]+/);
    const candidateNumbers = [];

    // Regular expression for keywords representing discounts, savings, installments that are not product prices
    const ignoreKeywordsRegex = /(?:разлика|спестявате|спести|отстъпка|намаление|save|saving|you save|discount|diff|difference|кредит|вноска|месец|per month|\/mo|отзиви|ревю|rating|reviews|sku)/i;

    // Regex to match full price numbers (e.g. 158.45 or 1,250.99 or 118.85 or 1250)
    const fullPriceRegex = /\d+(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?|\d+[.,]\d{1,2}|\d+/g;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Skip lines containing savings or difference keywords (e.g. "Save 39.60 €")
        if (ignoreKeywordsRegex.test(trimmed)) {
            continue;
        }

        // Remove percentage strings (e.g. -25%, 50%) to avoid false price matches
        const cleanLine = trimmed.replace(/[-+]?\s*\d+(?:[.,]\d+)?\s*%/g, ' ');

        const matches = cleanLine.match(fullPriceRegex);
        if (matches) {
            for (const matchStr of matches) {
                const parsed = parsePriceStringToNumber(matchStr);
                if (parsed !== null && !candidateNumbers.includes(parsed)) {
                    candidateNumbers.push(parsed);
                }
            }
        }
    }

    // Fallback: search the entire cleaned text if line-based parsing found no numbers
    if (candidateNumbers.length === 0) {
        const fallbackText = fullText.replace(/[-+]?\s*\d+(?:[.,]\d+)?\s*%/g, ' ');
        const matches = fallbackText.match(fullPriceRegex);
        if (matches) {
            for (const matchStr of matches) {
                const parsed = parsePriceStringToNumber(matchStr);
                if (parsed !== null && !candidateNumbers.includes(parsed)) {
                    candidateNumbers.push(parsed);
                }
            }
        }
    }

    if (candidateNumbers.length === 0) {
        return { value: null, currency };
    }

    let finalValue;
    if (useLowestPrice) {
        // Take the lowest price among valid product prices found in the hierarchy
        finalValue = Math.min(...candidateNumbers);
    } else {
        // Take the first detected price
        finalValue = candidateNumbers[0];
    }

    return { value: finalValue, currency, candidateCount: candidateNumbers.length };
}

async function executeScrapingTask(config) {
    try {
        // 1. Execute macros (Human behavior simulation)
        if (config.requiresMacro) {
            await simulateHumanBehavior();
        }

        // 2. Wait for target element to appear in DOM (up to 10s)
        let element = await waitForElement(config.selector, 10000);

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
 * Waits for an element to appear in DOM using MutationObserver + periodic polling (safe for background tabs).
 */
function waitForElement(selector, timeoutMs) {
    return new Promise((resolve) => {
        // Check if element is already present
        const existing = document.querySelector(selector);
        if (existing) {
            return resolve(existing);
        }

        let observer = null;
        let intervalId = null;
        let timeoutId = null;

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

        // Setup MutationObserver to watch for DOM updates
        observer = new MutationObserver(() => {
            const el = document.querySelector(selector);
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

        // Periodic polling fallback every 200ms for inactive background tabs
        intervalId = setInterval(() => {
            const el = document.querySelector(selector);
            if (el) {
                cleanup();
                resolve(el);
            }
        }, 200);

        // Maximum timeout fallback
        timeoutId = setTimeout(() => {
            const el = document.querySelector(selector);
            cleanup();
            resolve(el || null);
        }, timeoutMs);
    });
}

/**
 * Simulates human browsing behavior: concurrent non-linear mouse movement and randomized scrolling to bypass bot detections.
 */
async function simulateHumanBehavior() {
    // Randomized total duration between 3s and 7s
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
        // Randomize scroll direction (predominantly downwards)
        const direction = Math.random() > 0.3 ? 1 : -1;
        // Scroll distance between 100px and 800px
        const scrollAmount = Math.floor(Math.random() * 700 + 100) * direction;
        
        window.scrollBy(0, scrollAmount);
        
        // Randomized delay between scroll steps
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
        
        // Duration for each mouse segment (300ms to 1200ms)
        const moveDuration = Math.floor(Math.random() * 900) + 300;
        await moveMouseSmoothly(currentX, currentY, targetX, targetY, moveDuration, endTime);
        
        currentX = targetX;
        currentY = targetY;
        
        // Pause after movement
        const pause = Math.floor(Math.random() * 400) + 100;
        await new Promise(r => setTimeout(r, Math.min(pause, endTime - Date.now())));
    }
}

function moveMouseSmoothly(startX, startY, endX, endY, duration, absoluteEndTime) {
    return new Promise(resolve => {
        const startTime = Date.now();
        
        // Ease In-Out acceleration curve for natural motion
        const easeInOutQuad = t => t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

        // Bezier control points for non-linear curve
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

            // Quadratic Bezier interpolation
            const currentX = (1 - easeProgress) * (1 - easeProgress) * startX + 2 * (1 - easeProgress) * easeProgress * controlX + easeProgress * easeProgress * endX;
            const currentY = (1 - easeProgress) * (1 - easeProgress) * startY + 2 * (1 - easeProgress) * easeProgress * controlY + easeProgress * easeProgress * endY;

            // Dispatch synthetic MouseMove event
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
                setTimeout(step, 40); // Use setTimeout (40ms) instead of RAF to run reliably in inactive background tabs
            } else {
                resolve();
            }
        }
        setTimeout(step, 40);
    });
}