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

## 📝 Changelog

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