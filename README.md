# PriceTracker Pro

PriceTracker Pro is a powerful browser extension (for Google Chrome, Microsoft Edge, and Chromium-based browsers) that automatically monitors price and text changes across your favorite e-commerce websites. The extension operates seamlessly in the background and includes visual element picker tools, smart promotion/lowest-price extraction, human behavior simulation macros, duplicate scanners, Google Drive cloud backup, and dark mode.

## 🚀 Installation

1. Open your browser and navigate to `chrome://extensions/` (or `edge://extensions/`).
2. Enable **Developer mode** using the toggle in the top-right corner.
3. Click **Load unpacked** and select the repository root folder.

## ✨ Features

- **Automated Background Tracking**: Periodically checks prices at custom intervals (e.g. every 60 minutes) with randomized jitter to prevent bot detection.
- **Advanced Promotion & Discount Detection**: Detects and extracts not only current prices, but also original regular prices, discount percentages (`-XX%`), savings amounts, and promotional badges (e.g. *Genius*, *Promo Code*, *Special Price*, *Sale*).
- **Domain-Tailored Smart Rules & JSON-LD Fallback**: Pre-configured resilient extraction rules for 15+ major eCommerce platforms (eMag, Ozone, Amazon, BabyMatters, Baby.bg, Ardes, Plasico, Jar Computers, Rowenta, Tefal, Praktiker, Praktis, Raya Toys, BaniaStil, Pax, Elaria/Shopify) plus universal Schema.org JSON-LD and OpenGraph fallbacks.
- **Automatic Self-Healing & 1-Click Selector Optimizer**: Automatically detects brittle selectors (deep 10+ level `:nth-of-type` chains or dynamic product IDs) and repairs them on the fly, with a built-in "⚡ Optimize Selectors" tool to upgrade existing databases in 1 click.
- **Promotion Filters & Badges**: 1-click filter toggle in both Popup and Options (`[ All Items ]` / `[ 🔥 On Promotion only ]`) with eye-catching promo badges, strikethrough regular prices, and savings tags (`Save 40.00 €`).
- **Visual Element Picker**: Live, interactive on-page element selector with DOM tree inspection (3 levels up, 2 levels down), live price and discount preview, and resilient CSS selector generation.
- **Anti-Bot & Human Behavior Simulation**: Randomized Bezier mouse movements and scrolling macros for protected e-commerce sites (Amazon, eMAG).
- **Duplicate & Overlap Scanner**: Intelligent URL normalization (stripping tracking query params and hashes) to detect and manage duplicate trackers or overlapping selectors.
- **Interactive Price History Charts**: Visual price trend graphs powered by Chart.js for individual items and categories.
- **Google Drive Cloud Sync**: Secure backup and restore for all tracked items and preferences via the Google Drive AppData folder.
- **Chronological Change History & Audit Timeline**: Dedicated management tab logging every price drop, price increase, and text change with before-and-after values, percentages, visual word-level text diffs, statistics, search/filtering, and JSON export.
- **Audio & Push Notifications**: Instant desktop and sound alerts when a price drop, promotion, or text update is detected.
- **Dark Mode & Multilingual**: Supports dark/light themes (Google Material 3 palette) and multiple languages (English and Bulgarian).
- **Automated CI/CD & Packaging**: GitHub Actions workflow that validates manifest and syntax, packaging production-ready extension ZIP releases automatically.

## 📝 Changelog

- **Fix / Strikethrough Price Exclusion on Baby.bg & Elimination of 0 € Promo-Drop Log Entries**:
  - **Exclusion of Strikethrough `.old-price` in Baby.bg Domain Rules**: Corrected the smart selector for `baby.bg` (Magento) from `.price-box .special-price .price, .price-box .price` to `.price-box .special-price .price, .price-box .regular-price .price`. Previously, because `.price-box .old-price` appears before `.special-price` in document tree order, `.price-box .price` matched the strikethrough recommended retail price (ПЦД: `164.90 €`) instead of the active selling price (`115.50 €`).
  - **Sequential Selector Priority & Strikethrough Suppression in `findTargetElement`**: Enhanced `findTargetElement` in `content.js` to evaluate comma-separated selectors in listed priority order, while checking `isOldPriceEl(candidate)`. Ensures that strikethrough/old price elements are never erroneously returned when a valid active price exists.
  - **Elimination of Fake 0 € Price Drops (`164.9 € -> 164.9 €`)**: Fixed `background.js` and `options.js` when a promotional alert (`isNewPromoAlert`) fires on an item where the numeric price did not change on that check:
    - If `originalPrice` is higher than the current price, the log transition now accurately records the full promotional discount from `originalPrice` to `currentPrice`.
    - If `oldValue === newValue` (difference is 0), `changeType` is assigned `'promo_alert'` rather than `'promo_drop'`. The change badge displays `🔥 Promo (-XX%)` without displaying a misleading `📉 -0 € (-0%)` drop pill, and the state comparison cleanly presents the current active price without crossing out the value.
  - **Auto-Healing for Existing Baby.bg Selectors**: Updated `optimizeTrackingSelectors` and startup routines to automatically detect and upgrade legacy `.price-box .price` selectors to `.price-box .special-price .price, .price-box .regular-price .price`.

- **Fix / Unhandled Promise Rejection on Desktop Notification Click (`Receiving end does not exist`)**:
  - **Safe Message Dispatching (`safeRuntimeSendMessage`)**: Implemented a hardened message dispatch helper in [background.js](file:///d:/Nik%20Todorov/Desktop/PriceTracker/background.js) that attaches `.catch()` handlers and checks `chrome.runtime.lastError`. This eliminates unhandled promise rejections (`Error: Could not establish connection. Receiving end does not exist.`) occurring when desktop notifications are clicked while options pages are not yet open or listening.
  - **Notification Dismissal on Click**: Automatically clears the active desktop notification via `chrome.notifications.clear(notificationId)` upon clicking to ensure clean dismissal from the Windows notification center.
  - **Concurrent Audio Playback Guard**: Added an asynchronous document creation mutex (`isCreatingOffscreen`) in `playSound()` to prevent concurrent `chrome.offscreen.createDocument` conflicts when multiple price alerts fire simultaneously.
  - **Global `chrome.runtime.sendMessage` Error Shielding**: Added callback error interceptors across all manual refresh and picker triggers in [options.js](file:///d:/Nik%20Todorov/Desktop/PriceTracker/options.js) and [popup.js](file:///d:/Nik%20Todorov/Desktop/PriceTracker/popup.js).

- **Feature / Windows Desktop Notification Event Navigation & Auto-Scroll Highlight**:
  - **Notification-to-Event Linkage**: Assigned structured notification IDs (`pt_notif::{itemId}::{eventId}::{timestamp}`) linking every desktop alert to its specific entry in `changeHistoryLog`.
  - **Direct Desktop Notification Routing**: Clicking on any Windows notification directly opens the options page and activates the **Change History** tab (`tab-history-log`), seamlessly handling both newly opened tabs and already open/focused options pages via runtime messaging and storage sync.
  - **Smart Filter Reset & Smooth Auto-Scroll**: Clears active search or category/type filters to guarantee the target event is rendered in the DOM, then smoothly scrolls the target card directly into the center of the viewport (`scrollIntoView({ behavior: 'smooth', block: 'center' })`).
  - **Glowing Visual Pulse Animation**: Applies an eye-catching highlight animation (`@keyframes notifHighlightPulse`) with a glowing border and shadow pulse on the target card to immediately draw the user's attention to the event.

- **Fix / Punctuation Punctured Decimals, Local Container Isolation & Automatic Promotion Repair**:
  - **Sentence Punctuation & Trailing Period Decoupling**: Fixed a critical numeric parsing bug in `parsePriceStringToNumber` and `parseNum` where text containing a decimal comma (e.g. `164,90 €`) followed by sentence punctuation or tooltip disclaimers (e.g. `Препоръчителна цена от доставчик. Продажната цена е показана по-долу.`) caused `lastDot > lastComma`. This incorrectly stripped the comma and inflated original prices by 100x (e.g. `164.90 €` parsed as `16490 €`, producing false `-99%` or `-100%` discounts like `29905 €`). Punctuation and sentence periods are now stripped prior to tokenization.
  - **Local Price Block Prioritization & Upsell Exclusion**: Confined old price candidate queries to the immediate product `.price-box` / `.pricing-block` first before expanding to wide containers. Completely excluded upsell, related, recommended, and slider products (`.upsell`, `.related`, `.crosssell`, `[class*="slider"]`, `[class*="carousel"]`), preventing adjacent product prices from corrupting the tracked item.
  - **Decimal-Drop Recovery & Outlier Safeguard**: Added an intelligent self-recovery heuristic in `content.js`, `picker.js`, and `background.js`: if an extracted original price is ~100x the current price and `(originalPrice / 100)` matches the expected magnitude, it automatically recovers the true decimal price (e.g. `16490 -> 164.90 €`). Any remaining absurd outliers (> 10x current price) are strictly discarded.
  - **Automatic Database Self-Healing & Repaired Export**: Added `sanitizeTrackingDataPromotions` across `background.js` (on startup / scrape), `options.js` (on render / import), and `popup.js` (on render), automatically scanning and fixing existing databases. Provided `repaired_database.json` with all 8 corrupted item records completely healed.

- **Fix & Feature / Accurate In-Page Voucher Promotion Calculation & eMAG SAPI Campaign Integration**:
  - **Deduct Voucher Discount from Printed Value**: Fixed a runtime `TypeError` (`Assignment to constant variable`) where `currentPrice` was declared `const`, preventing the `-10%` voucher discount from being deducted from the printed price (`259.95 €`). Now reliably excludes the percentage discount, computing the net promotional price of `233.95 €` (saving `26.00 €`), with the printed price preserved as `originalPrice: 259.95 €`.
  - **Direct Voucher Pipeline Passing**: Enhanced `executeScrapingTask` to pass fetched eMAG voucher notifications directly into `extractPriceAndPromo(element, config, sapiVoucher)`, eliminating DOM hierarchy lookup failures when the price element is nested inside `.pricing-block` and the voucher placeholder is in the parent container.
  - **Proactive Picker Pre-Fetch & Text Regex Discovery**: Added proactive eMAG campaign pre-fetching on picker init and regex text matching (`[-–]?\s*(\d{1,2})%\s*отстъпка\s*с\s*ваучер`), allowing real-time hover preview in `picker.js` to immediately display the deducted voucher price.
  - **Suppression of Hidden & Restricted Supplier Margins**: Filtered out internal supplier margin differences in `EM.offer` flagged with `is_restricted_from_view: true`, `is_visible: false`, or `labeled_as_discount: false`, completely eliminating phantom/bogus discounts (e.g. false `-9% (was: 285.95 €)`).
  - **Desktop Notification & UI Strikethrough Verification**: Updated desktop alert construction and popup/options item rendering so `(беше: ...)` and `<del>` strikethrough tags are strictly displayed when `originalPrice > currentPrice`, ensuring clean notifications like `🔥 Открита промоция! -10% отстъпка с ваучер (MultiDeals1) 233.95 € (беше: 259.95 €)`.

- **Fix & Feature / Comprehensive eMAG Promotion, Voucher & Script (`EM.offer`) Detection**:
  - **Dedicated eMAG Offer Script Parser (`extractEmagPageData`)**: Added automated parsing of inline `EM.offer` and page script definitions in `content.js` and `picker.js`. Captures active discounts, discount percentages, absolute savings, and recommended retail prices (RRP/ПЦД) when publicly displayed on the storefront.
  - **EU Omnibus & RRP/ПЦД Price Selectors**: Added full support for eMAG reference pricing in `DOMAIN_PRICE_RULES`, capturing `.rrp-lp30d-content`, `p.pricing.rrp-lp30d`, `p.rrp-lp30d`, `[class*="rrp-lp30d"]`, and `.card-v2-discounts` to compute accurate regular prices (`originalPrice`) and discount percentages.
  - **Campaign Voucher & Promo Code Selectors**: Added dedicated selectors for eMAG campaign vouchers and personalized teasers (`.vcr-voucher-card`, `.vcr-voucher-placeholder`, `.vcr-badge`, `[class*="vcr-badge"]`, `.personalization-teaser`, `[data-source="voucher_badge"]`, `.product-page-pricing [class*="voucher"]`).
  - **Container Scope Hierarchy Expansion**: Overhauled `closest()` container traversal in `extractPriceAndPromo` and `detectPriceInElement`. Rather than halting at immediate sub-blocks like `.pricing-block`, the engine searches for the full `.product-page-pricing`, `.product-highlight`, or `.highlight-box`, ensuring voucher placeholders and teaser badges are included in the search scope.
  - **Unicode-Safe Duration Pre-Sanitizer**: Enhanced `parsePriceStringToNumber` and `parseNum` with Unicode regex sanitization to remove time duration phrases (e.g. *"30 дни"*, *"14 days"*) before parsing numeric digits, preventing regulatory text like *"Най-ниска цена за последните 30 дни: 289,95 €"* from corrupting numbers.
  - **Synchronized Visual Picker Live Preview**: Fully mirrored the container scope expansion, RRP selectors, duration filtering, and `EM.offer` fallback in `picker.js`, providing instant `🔥 Promo -9% (285.95 €)` live badges when hovering over product prices.

- **Feature & Overhaul / Advanced Promotion, Discount & Smart Selector Detection**:
  - **Comprehensive Domain Price Rules Engine (`DOMAIN_PRICE_RULES`)**: Added a modular, domain-tailored rules engine in `content.js` with dedicated price and promotion selectors for 15+ major eCommerce sites and platforms:
    - *eMag* (`emag.bg`): Detects `p.product-new-price`, `p.product-old-price`, `.product-discount`, and Genius badges.
    - *Ozone* (`ozone.bg`): Detects `.price-box .price`, `.special-price`, MSRP/ПЦД regular prices, and `-XX%` promo tags while ignoring dynamic product ID wrapper IDs.
    - *Amazon* (`amazon.com`, `amazon.de`, etc.): Targets `.a-price .a-offscreen`, `span.basisPrice`, and coupon/deal tags.
    - *BabyMatters* (`babymatters.bg`): Targets `span.price`, regular prices, and discount percentages.
    - *Baby.bg* (`baby.bg`): Handles Magento price box hierarchy, separating active discounts from original prices and difference values.
    - *Ardes & Plasico* (`ardes.bg`, `plasico.bg`): Prioritizes `.price-normal`, `.current-price`, and strikethrough prices.
    - *Jar Computers* (`jarcomputers.com`): Targets `#price_data`, `.price`, and promotional labels.
    - *Rowenta & Tefal* (`rowenta.bg`, `tefal.bg`): Special handling for web components (`sd-price`), extracting active discounted prices and MSRP.
    - *Praktiker & Praktis* (`praktiker.bg`, `praktis.bg`): Robust leaf and regular price parsing.
    - *Raya Toys* (`rayatoys.com`): Targets `.product-price` and promotional tags.
    - *BaniaStil & Pax* (`baniastil.com`, `pax.bg`): Prioritizes discounted prices and promo badges.
    - *Shopify & WooCommerce Platforms*: Universal fallback rules for `.price--on-sale`, `.woocommerce-Price-amount`, and Schema.org metadata.
  - **Schema.org JSON-LD & OpenGraph Fallback**: Built-in `extractFromStructuredData()` automatically extracts prices and currencies from `application/ld+json` (`@type: Product` / `Offer`) or `meta[property="product:price:amount"]` when page DOM elements are obfuscated or lazy-loaded.
  - **Deep Promotion & Discount Extraction (`extractPriceAndPromo`)**: Automatically captures:
    - `isPromo`: boolean indicating an active promotion.
    - `originalPrice`: strikethrough/regular price before discount.
    - `discountPercent`: calculated or detected percentage reduction (`-XX%`).
    - `discountAmount`: monetary savings amount.
    - `promoBadge`: text of the promotion or deal badge.
  - **Anti-Brittle Selector Generation & Self-Healing**:
    - Overhauled selector generation in `picker.js` and `content.js` to reject fragile, deep `:nth-of-type` chains (e.g. `main > section:nth-of-type(4) > div > div...`) and dynamic numeric IDs (e.g. `#product-options-767908`).
    - If a tracked selector breaks during scraping or contains fragile patterns, the engine tests domain rules and Schema.org, finds the element, and automatically transmits an `autoHealedSelector` to update the user's storage seamlessly.
  - **1-Click "⚡ Optimize Selectors" Tool**:
    - Added an optimization engine in `background.js` and an "⚡ Optimize Selectors" button in `options.html` (`#tab-products`).
    - Scans all tracked sites in the user's database, identifies brittle selectors, and upgrades them to robust, semantic domain selectors in 1 click.
  - **Promotions UI in Dashboard & Popup**:
    - **Filter Bar**: Added `[ All Items ]` and `[ 🔥 On Promotion only ]` toggle tabs in both `options.html` and `popup.html`.
    - **Visual Promotion Badges**: Displays vibrant gradient badges (`🔥 -25%`, `🔥 Promo`), strikethrough regular prices (`<del>164.90 €</del>`), and savings tags (`Save 49.40 €`).
    - **Category Badges**: Category headers display real-time counters for items currently on promotion (`🔥 2`).
    - **Change History Filtering**: Added a dedicated `🔥 Promotions` filter to the Change History log to audit promotional drops.
  - **Promotional Notifications**: When a price drop is accompanied by an active promotion, desktop notifications highlight the event with `🔥 Promotion Detected!`.

- **Feature / Chronological Price & Text Change History Tab & Audit Log**:
  - **Dedicated Change History Tab**: Added a brand new "Change History" ("Хронология на промените") tab in the dashboard (`options.html`) providing a complete, chronological timeline of all price drops, price increases, and text changes.
  - **Previous vs. New State Details**: Clearly records and displays what the previous value was, what it changed to, absolute and percentage differences (`-15.00 лв. / -12.5%`), all-time lowest price badges, and inline word-level diffs (`diff-ins` / `diff-del`) for content and stock changes.
  - **Live Statistics Overview**: Added 4 real-time stat metric cards tracking Total Changes, Price Drops, Price Increases, and Text Updates.
  - **Filtering & Search**: Dynamic filtering by change type (Price Drops, Price Increases, Text Changes), category dropdown, and live text search across URLs, categories, selectors, and content.
  - **Notification Click Navigation**: Clicking a desktop notification popup automatically opens the management dashboard and switches directly to the Change History tab.
  - **Audit Management & Export**: Built-in 1-click JSON export for audit trails, single-entry removal, and full history clearing with user confirmation.
  - **Historical Aggregation**: Reconstructs past change events from existing item history so past changes are immediately visible upon loading, alongside new background scrape events.
  - **Full Bilingual Support**: Localized in Bulgarian and English with responsive dark/light mode styling.

- **Fix & Optimization / Resilient Selector Relaxation, Anti-Bot & Out-of-Stock Diagnosis**:
  - **Selector Relaxation & Layout Utility Filtering**: Enhanced `findTargetElement` in `content.js` to automatically relax brittle child combinator selectors (e.g. `div.product-page-pricing > div.d-flex > div.pricing-block`) into flexible descendant paths, stripping CSS layout utility classes (`d-flex`, `row`, `col`, etc.) and resolving leaf selectors without restrictive tag prefixes.
  - **CSS Utility Stripping in Selector Generation**: Overhauled `getCssSelector` and `generateUniqueSelector` in both `picker.js` and `content.js` to ignore CSS layout helper classes (`d-flex`, `flex-*`, `justify-*`, `align-*`, `row`, `col-*`, `grid`, `container`), preventing the generation of fragile child selector chains.
  - **Intelligent Page Failure Diagnosis**: Added real-time DOM diagnosis in `content.js` (`diagnosePageFailure`) when a target element is missing to identify root causes:
    - *Bot protection / CAPTCHA*: Detects Cloudflare Turnstile, verification challenge pages, and robot verification prompts (`ERR_BOT_CHALLENGE`).
    - *Out of Stock*: Detects e-commerce out-of-stock indicators (*"Изчерпан"*, *"Няма наличност"*, *"Currently unavailable"*, `ERR_OUT_OF_STOCK`).
    - *404 / Missing page*: Detects page not found titles (`ERR_PAGE_NOT_FOUND`).
  - **Localized User Diagnostics**: Added comprehensive localized error descriptions across English and Bulgarian in `i18n.js` so users receive clear, actionable feedback instead of generic *"Element was not found"* errors.
  - **Clean Service Worker Logging**: Changed routine background scrape failure logging in `background.js` from `console.error` to `console.warn` to prevent normal scraping timeouts and website blocks from triggering red error alerts in `chrome://extensions/`.

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

- [x] Add promotion and discount filtering (`[ All Items ]` / `[ 🔥 On Promotion only ]`).
- [x] Windows desktop notification event targeting, auto-scroll and pulse highlight.
- [ ] Add live text search filter bar to the tracked items list.
- [ ] Add CSV / Excel price history export options.

## 📄 License

This project is licensed under the terms of the **GNU General Public License v3.0 (GPLv3)**. For more details, see the [LICENSE](LICENSE) file.