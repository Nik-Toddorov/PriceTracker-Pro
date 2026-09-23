# PriceTracker Pro

PriceTracker Pro is a powerful browser extension (for Google Chrome, Microsoft Edge, and Chromium-based browsers) that automatically monitors price and text changes across your favorite e-commerce websites. The extension operates seamlessly in the background and includes visual element picker tools, smart promotion/lowest-price extraction, human behavior simulation macros, duplicate scanners, Google Drive cloud backup, and dark mode.

## 🚀 Installation

1. Open your browser and navigate to `chrome://extensions/` (or `edge://extensions/`).
2. Enable **Developer mode** using the toggle in the top-right corner.
3. Click **Load unpacked** and select the repository root folder.

## ✨ Features

- **Automated Background Tracking**: Periodically checks prices at custom intervals (e.g. every 60 minutes) with randomized jitter to prevent bot detection.
- **Smart Promotional Price Extraction**: Automatically extracts the lowest active promotional price when containers include both old/strikethrough and discounted prices.
- **Visual Element Picker**: Live, interactive on-page element selector with DOM tree inspection (3 levels up, 2 levels down) and CSS selector generation.
- **Anti-Bot & Human Behavior Simulation**: Randomized Bezier mouse movements and scrolling macros for protected e-commerce sites (Amazon, eMAG).
- **Duplicate & Overlap Scanner**: Intelligent URL normalization (stripping tracking query params and hashes) to detect and manage duplicate trackers or overlapping selectors.
- **Interactive Price History Charts**: Visual price trend graphs powered by Chart.js for individual items and categories.
- **Google Drive Cloud Sync**: Secure backup and restore for all tracked items and preferences via the Google Drive AppData folder.
- **Audio & Push Notifications**: Instant desktop and sound alerts when a price drop or text update is detected.
- **Dark Mode & Multilingual**: Supports dark/light themes (Google Material 3 palette) and multiple languages (English and Bulgarian).
- **Automated CI/CD & Packaging**: GitHub Actions workflow that validates manifest and syntax, packaging production-ready extension ZIP releases automatically.

## 📝 Changelog

- **Fix & Optimization / Reliable Scraping Tab Closure & Orphan Garbage Collection**:
  - **Preserved Safety Timeout Lifecycle**: Fixed an issue in `background.js` where `cleanupListeners()` cancelled `safetyTimeoutId` immediately upon script injection at 6 seconds, removing any timeout while the site was waiting for elements or running bot-evasion macros. The safety timeout now remains active throughout the entire scrape lifecycle (up to 45s) and reliably closes unresponsive, hanging, or redirected tabs.
  - **Persistent Scraping Tab Registry (`activeScrapingTabs`)**: Added persistent tracking in `chrome.storage.local` for all background tabs opened for scraping with their IDs, item IDs, and timestamps.
  - **Automated Orphan Garbage Collection**: On service worker startup (`onStartup`, `onInstalled`, top-level load) and on each alarm trigger (`onAlarm`), cleans up and closes any lingering tabs older than 45 seconds or orphaned by previous service worker restarts.
  - **Manifest V3 Service Worker Keep-Alive**: Prevents Chrome from terminating the service worker during long element waiting or human simulation by executing a periodic lightweight ping (`chrome.runtime.getPlatformInfo`) while active scrapes are running.
  - **Async Message Dispatcher & Awaited Tab Closure**: Updated `scrape_result` and `scrape_error` dispatchers in `chrome.runtime.onMessage` to be asynchronous, properly awaiting `safeRemoveTab(tabId)` and storage updates before invoking `sendResponse()`. Added retry logic with verification in `safeRemoveTab` and in `content.js` message sending.

- **Fix & Optimization / No-Flicker State & Position Retention in Options & Popup**:
  - **Persistent Open/Expanded Categories**: Both `options.js` and `popup.js` now track open category states (`expandedCategories`) in memory and `sessionStorage`. When a background price check or storage update completes, expanded categories remain open with their toggle arrows intact instead of collapsing to `display: none`.
  - **Scroll Position Restoration**: Automatically saves and seamlessly restores window and container scroll positions upon DOM updates. The page and popup list no longer jump to the top when prices or settings update.
  - **Eliminated Unnecessary Page Reloads**: Removed unconditional `window.location.reload()` from `saveSettings()`. The page only reloads when the language is explicitly switched; saving themes, notifications, or sounds applies instantly in-place without reloading or closing open items.
  - **Tab State Persistence**: Retains the active dashboard tab (`activeOptionsTab`) in `sessionStorage` so navigating or refreshing never kicks the user out of their current workflow.
  - **Debounced Storage Updates**: Debounced background `chrome.storage.onChanged` updates by 200–250ms to prevent rapid-fire re-rendering and UI stutter when multiple sites finish scraping concurrently.
  - **Category Input Preservation**: Preserves custom new category selection (`__NEW__`) in `catSelect` so background updates never erase input while typing a new category name.
- **Fix / Savings & Difference Suppression & Nested Active Price Hierarchy (baby.bg & Magento Fix)**:
  - **Savings & Difference Filter (`isSavingsOrDifferenceEl`)**: Suppressed savings/difference elements (e.g. `<div class="you-save">Разлика <span class="price">41,05 €</span></div>`) across `content.js` and `picker.js`. Tags and eliminates numbers originating from containers with classes or IDs like `.you-save`, `.saving`, `.price-diff`, `.razlika`, `.discount-amount`, or text prefixes like *"Разлика"*, *"Спестявате"*, or *"You save"*, preventing savings differences from overriding the actual product price when selecting containers like `.product-options` or `.price-box`.
  - **Active Price Hierarchy Inheritance**: Enabled `closest()` checks on active price selectors (`.special-price`, `.discounted-price`, `.product-new-price`, `.current-price`, `.sale-price`, `.brand--h2`, `.main-price`, `[itemprop="price"]`) in both `picker.js` and `content.js`. Nested price spans (such as `<p class="special-price"><span class="price">118,85 €</span></p>`) now properly inherit `isActive` status.
  - **Decimal Cents & Precision Suffix Filtering**: Enhanced cents fragmentation filters to reject fractional leaves that start with a comma or dot (e.g. `<span class="precision">,85 €</span>` or `.99`), and discarded decimal fractions matching the cents of a full price candidate (e.g. `0.85` when `118.85` exists).
- **Fix & Feature / Container Price Extraction Optimization & Live Picker Preview**:
  - **Container Block Resilience**: Allowed selecting broad parent price containers (e.g. `<div class="c__price-block">`) to protect against frequent DOM restructuring and promotional hierarchy changes on eCommerce websites.
  - **Comprehensive Noise Sanitization & "Цена с отстъпка" Fix**:
    - Fixed a critical regex bug where sanitization for discount words was accidentally erasing the active price digits following phrases like *"Цена с отстъпка 549,99 €"* or *"Discount price $549.99"*, which caused the extractor to fall back to the strikethrough price (`599,99 €`).
    - Regulatory EU Omnibus text (e.g., *"Най-ниска цена през последните 30 дни"* no longer erroneously extracts `30 €`).
    - Delivery and shipping durations (e.g., *"Доставка от 4 до 5 дни"* or *"Доставка за 24-48 часа"* no longer extract `45 €`, `4 €`, or `5 €`).
    - Warranty and return periods (e.g., *"2 години гаранция"*, *"14 дни за връщане"*).
    - Quantities, pack sizes, and units (e.g., *"1 бр."*, *"100 ml"*, *"2 броя"*).
    - Discount badges and percentages (e.g., `"-25%"`, *"спестявате 50 лв"*).
  - **Multi-Tier Semantic Prioritization**:
    - **Active/Discounted prices first**: Prioritizes genuine active and promotional price elements (`.c__discounted-price`, `.product-new-price`, `.current-price`, `[itemprop="price"]`, `.brand--h2`).
    - **Strikethrough and MSRP suppression**: Automatically recognizes `<del>`, `<s>`, `.is-price-through`, `.old-price`, and MSRP/ПЦД reference prices, ensuring they never override active selling prices.
    - **Secondary Currency Handling**: Filters out `<sd-converted-price>` / dual currency conversions so the primary site price (`549,99 €`) is accurately targeted.
  - **Live Price Preview in Element Picker**: `picker.js` is fully synchronized with the multi-candidate extraction engine, displaying instant real-time price detection for the active hovered node (`💰 Открита цена: 549,99 €` / `💰 Detected price: 549.99 €`), giving users immediate feedback and certainty before selecting a block.
- **Feature / Multi-Site Group Text History & Clean Category Headers**:
  - **Group Text History Timeline**: Clicking the history button on a text category opens an aggregated chronological timeline showing changes across all tracked sites in that group simultaneously, with individual and group-wide "✓ Mark All in Group as Reviewed" actions.
  - **Clean Category Headers**: Removed redundant `(Text)` label from category headers. Cleanly displays only category name and status badges without unnecessary placeholders when no prices exist.
- **Feature / Smart Text Tracking, Visual Diffs & Review Workflow**: Overhauled the text tracking experience across `popup.js`, `popup.html`, `options.js`, and `options.html`:
  - **Accurate Labels & Previews**: Changed UI display for text trackers from `"Current price: Checked"` to `"Current text: [tracked text]"` with styled previews.
  - **Inline Word-Level Visual Diffing**: When tracked text changes, highlights modifications in yellow (`<mark class="diff-ins">`) and deletions in strikethrough red (`<del class="diff-del">`) with an alert badge (`⚠️ Text Changed`).
  - **"Mark as Reviewed" Reset Action**: Added a quick action button (`✓ Mark as Reviewed`) on item cards and in the history view to acknowledge changes, record `reviewedText`, and clear the warning highlight until the next change occurs.
  - **Chronological Text History Timeline**: Replaced line charts for text trackers with a dedicated, scrollable chronological timeline displaying timestamped change versions (#1, #2, #3...), word-level diffs vs previous versions, and expandable full-text views.
- **Optimization / Fast Randomized Traffic Staggering (10s – 3min)**: Updated the sequential scrape queue delay between checks from 2–10 minutes to a randomized interval of **10 seconds to 3 minutes** (`10s` - `180s`). Added hybrid in-memory timers with `chrome.alarms` fallback to handle sub-minute delays smoothly while the service worker is active, maintaining stealth against anti-bot rate limiters while significantly speeding up mass/overdue checks.
- **Fix / Amazon Cents & Truncated Integer Filtering**: Fixed an issue on Amazon and eCommerce sites where selecting a price container extracted both the full price (`687.64 €`) and the truncated whole-number part (`687 €` from `.a-price-whole`), causing `useLowestPrice` to erroneously pick `687` instead of `687.64`. Added dedicated `.a-offscreen` canonical extraction for Amazon and enhanced subtree filtering to discard any truncated integers and isolated cents belonging to a full decimal price.
- **Fix / Resilient Selector Generator & Progressive Element Lookup**: Overhauled `getCssSelector` and `generateUniqueSelector` in `picker.js` and `content.js` to avoid brittle 10-level `nth-of-type` chains. Added intelligent progressive fallback lookups in `content.js` that automatically relax selectors, strip broken hierarchy indices, scroll to trigger lazy hydration, and match common eCommerce price patterns (e.g. `p.product-new-price`, `.pricing-block`, `[itemprop="price"]`, `.a-price`).
- **Feature / Anti-Bot Traffic Staggering**: Implemented a persistent, alarm-backed Sequential Scrape Queue in `background.js` that automatically spaces/staggers checks between different sites and categories by **10 seconds to 3 minutes** (randomized). This eliminates traffic bursts and prevents e-commerce bot/WAF protections (eMAG, Amazon, Ozone, Cloudflare) from triggering during scheduled runs, startup checks, or mass refreshes.
- **License**: The project is licensed under the open-source **GNU General Public License v3.0 (GPLv3)**. Added official `LICENSE` file.
- **Feature / UX**: Automatically closes the settings window (`options.html`) immediately after successfully adding a new site to the tracking list.
- **Feature / Duplicate Scanner UI**: Added a dedicated section and manual scan button in Settings (`options.html`) to scan the database for duplicate URLs, identical selectors, or overlapping targets, with single deletion and one-click auto-cleaning.
- **Feature / Duplicate & Overlap Detection**: Added intelligent duplicate prevention on Add and Edit with URL normalization (stripping `utm_*`, `fbclid`, `gclid`, `ref`, and hash anchors). Exact duplicates are blocked with category info; overlapping selectors prompt user confirmation.
- **Fix / Price Segmentation & Difference Filtering**: Resolved issues where segmented cents (e.g. `118<sup>,85</sup> €`) were fragmented, and filtered out inline savings/differences (e.g. "Save 39.60 €", "Discount -20%").
- **Feature / Smart Price Extraction**: Added optional and automated extraction of the lowest price within an element's hierarchy (`useLowestPrice`) to handle promotional discounts.
- **Feature / UX**: Added **Pick from page** button in the Edit item modal (`editItemModal`) for seamless selector and URL updates on existing trackers.
- **Fix / Background Scraping**: Replaced `requestAnimationFrame` with `setTimeout` in mouse simulations and added MutationObserver + polling in `waitForElement` to ensure background tabs never stall when throttled by Chrome.
- **Fix / i18n**: Fully localized error tooltips to display strictly in the user's active language without language mixing.
- **Optimization / Performance**: Throttled picker DOM tree updates with RAF and element change checks for smooth 60 FPS performance on complex pages.
- **Optimization / Architecture**: Unified and consolidated message listeners in `background.js` and `content.js` into central dispatchers.
- **Optimization / Reliability**: Added cleanup for tab listeners (`chrome.tabs.onUpdated`) and safety timeouts in `background.js` upon scrape completion or tab closure.
- **Security / XSS**: Implemented `escapeHtml` sanitization in `options.js` and `popup.js` for dynamic strings and category names.
- **Feature / Persistence & Startup**: Added persistent timestamps (`lastChecked`, `lastSuccessfulCheck`), overdue checks on startup (`onStartup`), and staggered background scraping.
- **Feature / Google Drive Sync**: Full backup and restore support via Google Drive AppData API.

## 📌 TODO

- [ ] Add filtering and search functionality to the tracked items list.
- [ ] Add CSV / Excel price history export options.

## 📄 License

This project is licensed under the terms of the **GNU General Public License v3.0 (GPLv3)**. For more details, see the [LICENSE](LICENSE) file.