import { initLang, t } from "./i18n.js";

// Global state variables
let isCheckingOverdue = false;
let isSettingUpContextMenus = false;
let activePickerTabId = null;
const activeScrapes = new Map(); // tabId -> { itemId, targetItem, completed, cleanup, resolve }

// Queue state variables
let isProcessingQueue = false;
let currentActiveScrapeItemId = null;
let queueTimeoutId = null;
const QUEUE_ALARM_NAME = 'scrape_queue_dispatcher';

// Helper function to generate a randomized delay between 10 seconds and 3 minutes in milliseconds
function getRandomStaggerDelayMs() {
  const minMs = 10 * 1000;      // 10 seconds
  const maxMs = 3 * 60 * 1000;  // 3 minutes (180 seconds)
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

// Helper function to find an item and its category key
function findItemAndCategory(trackingData, itemId) {
  if (!trackingData) return { item: null, categoryKey: null };
  for (const categoryKey in trackingData) {
    const item = trackingData[categoryKey].items.find(i => i.id === itemId);
    if (item) {
      return { item, categoryKey };
    }
  }
  return { item: null, categoryKey: null };
}

// Helper function to safely close a tab
async function safeRemoveTab(tabId) {
  if (!tabId) return;
  try {
    await chrome.tabs.remove(tabId);
  } catch (e) {
    // Ignore error if tab was already closed manually by user
  }
}

// Listener for tabs closed during scraping tasks
chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (activeScrapes.has(tabId)) {
    const scrapeContext = activeScrapes.get(tabId);
    activeScrapes.delete(tabId);
    if (scrapeContext.cleanup) scrapeContext.cleanup();
    if (!scrapeContext.completed) {
      scrapeContext.completed = true;
      await processScrapeError(scrapeContext.targetItem, "Tab closed before check completed");
    }
    if (scrapeContext.resolve) scrapeContext.resolve();
  }
});

// 1. ALARM LISTENER
chrome.alarms.onAlarm.addListener(async (alarm) => {
  await initLang();

  if (alarm.name === QUEUE_ALARM_NAME) {
    await runNextItemFromQueue();
  } else if (alarm.name.startsWith('check_item_')) {
    const itemId = alarm.name.split('check_item_')[1];
    await enqueueScrapeItems(itemId, { forceImmediate: false });
  }
});

// 2. SCRAPE QUEUE MANAGEMENT (Staggers checks between sites by 10s to 3 min)
async function enqueueScrapeItems(itemIds, options = { forceImmediate: false }) {
  if (!Array.isArray(itemIds)) itemIds = [itemIds];
  if (itemIds.length === 0) return;

  const data = await chrome.storage.local.get(['scrapeQueue']);
  let queue = data.scrapeQueue || [];

  for (const id of itemIds) {
    if (!queue.includes(id) && id !== currentActiveScrapeItemId) {
      if (options.forceImmediate) {
        queue.unshift(id);
      } else {
        queue.push(id);
      }
    }
  }

  await chrome.storage.local.set({ scrapeQueue: queue });
  await dispatchQueue(options.forceImmediate);
}

async function dispatchQueue(forceImmediate = false) {
  if (isProcessingQueue || currentActiveScrapeItemId) {
    return;
  }

  const data = await chrome.storage.local.get(['scrapeQueue', 'lastScrapeTimestamp']);
  const queue = data.scrapeQueue || [];
  if (queue.length === 0) {
    chrome.alarms.clear(QUEUE_ALARM_NAME);
    if (queueTimeoutId) {
      clearTimeout(queueTimeoutId);
      queueTimeoutId = null;
    }
    return;
  }

  const lastTime = data.lastScrapeTimestamp || 0;
  const now = Date.now();
  const elapsed = now - lastTime;

  if (forceImmediate || lastTime === 0) {
    await runNextItemFromQueue();
  } else {
    const nextStaggerMs = getRandomStaggerDelayMs();
    if (elapsed >= nextStaggerMs) {
      await runNextItemFromQueue();
    } else {
      const remainingMs = nextStaggerMs - elapsed;
      const remainingMinutes = remainingMs / (60 * 1000);
      const remainingSeconds = Math.round(remainingMs / 1000);
      console.log(`[Queue] Next site check scheduled in ~${remainingSeconds}s (~${remainingMinutes.toFixed(2)} min, staggered 10s-3min).`);
      chrome.alarms.create(QUEUE_ALARM_NAME, { delayInMinutes: Math.max(0.1, remainingMinutes) });

      if (queueTimeoutId) clearTimeout(queueTimeoutId);
      queueTimeoutId = setTimeout(async () => {
        await dispatchQueue();
      }, remainingMs);
    }
  }
}

async function runNextItemFromQueue() {
  if (isProcessingQueue || currentActiveScrapeItemId) return;
  isProcessingQueue = true;
  if (queueTimeoutId) {
    clearTimeout(queueTimeoutId);
    queueTimeoutId = null;
  }
  chrome.alarms.clear(QUEUE_ALARM_NAME);

  try {
    const data = await chrome.storage.local.get(['scrapeQueue']);
    let queue = data.scrapeQueue || [];
    if (queue.length === 0) {
      isProcessingQueue = false;
      return;
    }

    const nextItemId = queue.shift();
    await chrome.storage.local.set({ scrapeQueue: queue });

    currentActiveScrapeItemId = nextItemId;
    await executeScrape(nextItemId);
  } catch (err) {
    console.error("Queue item execution error:", err);
  } finally {
    currentActiveScrapeItemId = null;
    isProcessingQueue = false;
    const now = Date.now();
    await chrome.storage.local.set({ lastScrapeTimestamp: now });

    // Schedule next in queue after 10s - 3min
    const data = await chrome.storage.local.get(['scrapeQueue']);
    if (data.scrapeQueue && data.scrapeQueue.length > 0) {
      const nextStaggerMs = getRandomStaggerDelayMs();
      const delayMinutes = nextStaggerMs / (60 * 1000);
      const delaySeconds = Math.round(nextStaggerMs / 1000);
      console.log(`[Queue] Staggering next queued site check by ${delaySeconds}s (~${delayMinutes.toFixed(2)} min).`);
      chrome.alarms.create(QUEUE_ALARM_NAME, { delayInMinutes: delayMinutes });

      if (queueTimeoutId) clearTimeout(queueTimeoutId);
      queueTimeoutId = setTimeout(async () => {
        await dispatchQueue();
      }, nextStaggerMs);
    }
  }
}

// 3. SCRAPE EXECUTION (Opens background tab and injects content script)
function executeScrape(itemId) {
  return new Promise(async (resolve) => {
    let isResolved = false;
    const safeResolve = () => {
      if (!isResolved) {
        isResolved = true;
        resolve();
      }
    };

    const data = await chrome.storage.local.get('trackingData');
    const trackingData = data.trackingData || {};
    
    // Find product across all categories
    const { item: targetItem } = findItemAndCategory(trackingData, itemId);

    if (!targetItem) {
      console.warn(`Item with ID ${itemId} was not found.`);
      return safeResolve();
    }

    // Open inactive background tab so it doesn't interrupt the user
    let tab;
    try {
      tab = await chrome.tabs.create({ url: targetItem.url, active: false });
    } catch (e) {
      console.error(`Failed to open background tab for ${itemId}:`, e);
      await processScrapeError(targetItem, "Failed to open background tab");
      return safeResolve();
    }

    let executed = false;
    let fallbackTimeoutId = null;
    let safetyTimeoutId = null;

    const cleanupListeners = () => {
      chrome.tabs.onUpdated.removeListener(listener);
      if (fallbackTimeoutId) clearTimeout(fallbackTimeoutId);
      if (safetyTimeoutId) clearTimeout(safetyTimeoutId);
    };

    const scrapeContext = { 
      itemId: targetItem.id, 
      targetItem, 
      completed: false,
      cleanup: cleanupListeners,
      resolve: safeResolve
    };
    activeScrapes.set(tab.id, scrapeContext);
    
    const injectAndStart = async () => {
      if (executed) return;
      executed = true;
      cleanupListeners();
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        await chrome.tabs.sendMessage(tab.id, {
          action: "start_scrape",
          itemConfig: targetItem
        });
      } catch (err) {
        console.warn(`Failed to inject content script or send message to tab ${tab.id}:`, err?.message || err);
        if (!scrapeContext.completed) {
          scrapeContext.completed = true;
          activeScrapes.delete(tab.id);
          await processScrapeError(targetItem, err?.message || "Failed to inject content script");
        }
        await safeRemoveTab(tab.id);
        safeResolve();
      }
    };

    const listener = (tabId, info) => {
      if (tabId === tab.id && info.status === 'complete') {
        injectAndStart();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);

    // If tab is already completed/cached
    if (tab.status === 'complete') {
      injectAndStart();
    }

    // Fallback injection if page loading takes too long due to heavy resources/trackers
    fallbackTimeoutId = setTimeout(() => {
      injectAndStart();
    }, 6000);

    // Safety timeout to close tab and log error if unresponsive
    safetyTimeoutId = setTimeout(async () => {
      if (!scrapeContext.completed) {
        scrapeContext.completed = true;
        activeScrapes.delete(tab.id);
        await processScrapeError(targetItem, "Timeout (35s) or tab unresponsive");
      }
      await safeRemoveTab(tab.id);
      safeResolve();
    }, 35000);

    // Schedule next check with jitter for natural browsing simulation
    scheduleNextCheck(targetItem);
  });
}

// 4. SCHEDULE NEXT CHECK (with Jitter)
function scheduleNextCheck(item) {
  const baseMinutes = item.intervalMinutes || 60;
  const jitterMinutes = item.intervalJitter || Math.min(5, baseMinutes * 0.1);
  
  // Randomize interval (e.g. 60min +/- 5min = 55min to 65min)
  const randomMultiplier = (Math.random() * 2) - 1;
  const finalDelay = Math.max(2, baseMinutes + (jitterMinutes * randomMultiplier));

  chrome.alarms.create(`check_item_${item.id}`, { delayInMinutes: finalDelay });
  console.log(`Next check for ${item.id} scheduled in ~${Math.round(finalDelay)} minutes.`);
}

// 5. PROCESS SCRAPE RESULT (Comparison and persistence)
async function processScrapeResult(itemConfig, currentValue, timestamp, currency) {
  const db = await chrome.storage.local.get(['trackingData', 'settings']);
  const trackingData = db.trackingData || {};
  const settings = db.settings || { notificationsEnabled: true, notificationSound: true };

  // Find category containing the item
  const { item: itemToUpdate, categoryKey } = findItemAndCategory(trackingData, itemConfig.id);

  if (!categoryKey || !itemToUpdate) return;

  const history = itemToUpdate.history || [];
  
  // Determine if price dropped or text changed
  let isNewLowest = false;
  let parsedValue = null;
  
  if (itemToUpdate.type === "price") {
    parsedValue = parseFloat(currentValue);
    if (isNaN(parsedValue)) {
        console.error(`Returned price for ${itemConfig.id} is not a valid number: ${currentValue}`);
        await processScrapeError(itemConfig, `Invalid price value: ${currentValue}`);
        return;
    }
    
    // Find lowest recorded historical price
    const lowestRecorded = history.length > 0 ? Math.min(...history.map(h => h.value)) : Infinity;
    
    if (parsedValue < lowestRecorded) {
      isNewLowest = true;
    }
  } else if (itemToUpdate.type === "text") {
      parsedValue = typeof currentValue === 'string' ? currentValue.trim() : String(currentValue || '').trim();
      const lastRecorded = history.length > 0 ? history[history.length - 1].value : null;
      if (lastRecorded !== null && parsedValue !== lastRecorded) {
          isNewLowest = true; 
          itemToUpdate.hasUnreadTextChange = true;
          itemToUpdate.previousText = lastRecorded;
      } else if (lastRecorded === null) {
          // First check ever
          itemToUpdate.reviewedText = parsedValue;
          itemToUpdate.hasUnreadTextChange = false;
          itemToUpdate.previousText = null;
      }
  }

  // Get last recorded history value
  const lastHistoryRecord = history.length > 0 ? history[history.length - 1].value : null;

  // Always update lastChecked timestamp and clear previous error state
  const checkTime = timestamp || new Date().toISOString();
  itemToUpdate.lastChecked = checkTime;
  itemToUpdate.lastSuccessfulCheck = checkTime;
  itemToUpdate.lastCheckStatus = "success";
  itemToUpdate.lastError = null;
  if (currency) itemToUpdate.currency = currency;

  // Push new value to history only if different from previous value
  if (lastHistoryRecord === null || lastHistoryRecord !== parsedValue) {
      history.push({
        date: timestamp || new Date().toISOString(),
        value: parsedValue
      });
      
      // Cap history length to 100 entries
      if (history.length > 100) history.shift();
      itemToUpdate.history = history;
  }

  // Save back to storage
  await chrome.storage.local.set({ trackingData });

  // Trigger desktop notification and sound if criteria met
  if (isNewLowest && settings.notificationsEnabled) {
    showNotification(itemToUpdate, currentValue);
    if (settings.notificationSound) {
        playSound();
    }
  }
}

// 6. PROCESS SCRAPE ERROR (Preserve previous valid price and history)
async function processScrapeError(itemConfig, errorMessage) {
  if (!itemConfig || !itemConfig.id) return;
  const db = await chrome.storage.local.get(['trackingData']);
  const trackingData = db.trackingData || {};

  const { item: itemToUpdate, categoryKey } = findItemAndCategory(trackingData, itemConfig.id);
  if (!categoryKey || !itemToUpdate) return;

  itemToUpdate.lastChecked = new Date().toISOString();
  itemToUpdate.lastCheckStatus = "error";
  itemToUpdate.lastError = errorMessage || "Check failed";

  // Valid price history remains intact
  await chrome.storage.local.set({ trackingData });
  console.warn(`Scrape failed for ${itemToUpdate.id}: ${errorMessage}`);
}

// 7. VISUAL NOTIFICATION HELPER
async function showNotification(item, newValue) {
  await initLang();
  const currency = item.currency || '€';
  const messageText = item.type === "price" 
    ? `${t("notif_new_lowest")}${newValue} ${currency}` 
    : t("notif_text_changed");

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png', 
    title: item.type === "price" ? t("notif_price_drop_title") : t("notif_site_update_title"),
    message: `${messageText}\n${t("notif_check_site")}${item.url}`,
    priority: 2,
    requireInteraction: true 
  });
}

// 8. AUDIO PLAYBACK (Offscreen Document for Manifest V3)
async function playSound() {
  const offscreenUrl = 'offscreen.html';
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(offscreenUrl)]
  });

  // If offscreen document exists, send message to play sound
  if (existingContexts.length > 0) {
    chrome.runtime.sendMessage({ action: 'play_audio' });
  } else {
    // Create new offscreen document
    await chrome.offscreen.createDocument({
      url: offscreenUrl,
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Playback of sound notification on price or text change.'
    });
    // Wait briefly for document initialization, then play audio
    setTimeout(() => {
        chrome.runtime.sendMessage({ action: 'play_audio' });
    }, 500);
  }
}

// 9. CONTEXT MENUS SETUP
async function setupContextMenus() {
    if (isSettingUpContextMenus) return;
    isSettingUpContextMenus = true;

    try {
        await initLang();
        chrome.contextMenus.removeAll(() => {
            if (chrome.runtime.lastError) {
                // Ignore removal errors
            }
            chrome.contextMenus.create({
                id: "add_to_tracker",
                title: t("context_menu_add"),
                contexts: ["selection"]
            }, () => {
                if (chrome.runtime.lastError) {
                    // Handle duplicate ID error safely
                }
            });
            chrome.contextMenus.create({
                id: "start-picker-context",
                title: t("context_menu_pick"),
                contexts: ["all"]
            }, () => {
                if (chrome.runtime.lastError) {
                    // Handle duplicate ID error safely
                }
            });
        });
    } finally {
        isSettingUpContextMenus = false;
    }
}

chrome.runtime.onInstalled.addListener(() => {
    setupContextMenus();
    checkOverdueItems();
});

chrome.runtime.onStartup.addListener(() => {
    checkOverdueItems();
});

// Check for overdue items on service worker wake-up
checkOverdueItems();

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.settings) {
        setupContextMenus();
    }
});

// 10. CONTEXT MENU CLICK LISTENER
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "add_to_tracker") {
        const selectedText = info.selectionText;
        const pageUrl = tab.url;

        // Chrome restricts script injection on internal chrome:// and store pages
        if (pageUrl.startsWith('chrome://') || pageUrl.startsWith('https://chrome.google.com/webstore')) {
            console.error("Cannot add from Chrome system pages.");
            return;
        }

        try {
            // Try messaging content script first if already injected
            let response = await sendMessagePromise(tab.id, { action: "get_selector_from_context" });
            
            // Fallback: inject content script dynamically and retry
            if (!response || !response.selector) {
                console.log("content.js not found. Injecting dynamically...");
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                });
                
                await new Promise(resolve => setTimeout(resolve, 500));
                response = await sendMessagePromise(tab.id, { action: "get_selector_from_context" });
            }

            // Fallback to empty selector if selection is plain text
            const finalSelector = (response && response.selector) ? response.selector : "";

            const draftItem = {
                url: pageUrl,
                selector: finalSelector,
                type: "price",
                value: selectedText
            };

            chrome.storage.local.set({ draftItem: draftItem }, () => {
                chrome.runtime.openOptionsPage();
            });

        } catch (error) {
            console.error("Context menu handling error:", error);
            const draftItem = {
                url: pageUrl,
                selector: "",
                type: "price",
                value: selectedText
            };
            chrome.storage.local.set({ draftItem: draftItem }, () => {
                chrome.runtime.openOptionsPage();
            });
        }
    } else if (info.menuItemId === "start-picker-context" && tab && tab.id) {
        chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["picker.css"] });
        chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["picker.js"] });
    }
});

// Helper function converting chrome.tabs.sendMessage to Promise
function sendMessagePromise(tabId, message) {
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
            if (chrome.runtime.lastError) {
                resolve(null);
            } else {
                resolve(response);
            }
        });
    });
}

// 11. CENTRAL MESSAGE DISPATCHER
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "scrape_result") {
        let resolveFunc = null;
        if (sender.tab && activeScrapes.has(sender.tab.id)) {
            const ctx = activeScrapes.get(sender.tab.id);
            ctx.completed = true;
            if (ctx.cleanup) ctx.cleanup();
            if (ctx.resolve) resolveFunc = ctx.resolve;
            activeScrapes.delete(sender.tab.id);
        }
        processScrapeResult(message.itemConfig, message.value, message.timestamp, message.currency);
        if (sender.tab) {
            safeRemoveTab(sender.tab.id);
        }
        if (resolveFunc) resolveFunc();
        sendResponse({ status: "ok" });
        return true;
    } else if (message.action === "scrape_error") {
        let resolveFunc = null;
        if (sender.tab && activeScrapes.has(sender.tab.id)) {
            const ctx = activeScrapes.get(sender.tab.id);
            ctx.completed = true;
            if (ctx.cleanup) ctx.cleanup();
            if (ctx.resolve) resolveFunc = ctx.resolve;
            activeScrapes.delete(sender.tab.id);
        }
        console.error(`Scraping error for ${message.itemConfig.id}:`, message.error);
        processScrapeError(message.itemConfig, message.error);
        if (sender.tab) {
            safeRemoveTab(sender.tab.id);
        }
        if (resolveFunc) resolveFunc();
        sendResponse({ status: "error_handled" });
        return true;
    } else if (message.action === "force_refresh_all") {
        forceRefreshAllItems();
        sendResponse({ status: "started" });
        return true;
    } else if (message.action === "force_refresh_category") {
        forceRefreshCategory(message.catKey);
        sendResponse({ status: "started" });
        return true;
    } else if (message.action === "force_refresh_item") {
        forceRefreshItem(message.itemId);
        sendResponse({ status: "started" });
        return true;
    } else if (message.action === "start_picker") {
        chrome.tabs.create({ url: message.url, active: true }, (tab) => {
            if (!tab || !tab.id) return;
            activePickerTabId = tab.id;
            chrome.tabs.onUpdated.addListener(async function listener(tabId, info) {
                if (tabId === tab.id && info.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    try {
                        await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["picker.css"] });
                        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["picker.js"] });
                    } catch (e) {
                        console.warn("Picker injection error:", e?.message || e);
                    }
                }
            });
        });
        sendResponse({ status: "started" });
        return true;
    } else if (message.action === "picker_result") {
        chrome.storage.local.set({ latestPickerData: { url: message.url, selector: message.selector } });
        
        if (sender && sender.tab && sender.tab.id === activePickerTabId) {
            // If tab was opened from options page, close it safely
            safeRemoveTab(sender.tab.id);
            activePickerTabId = null;
        } else {
            // If triggered from context menu on active tab, open options page without closing tab
            chrome.runtime.openOptionsPage();
        }
        
        sendResponse({ status: "ok" });
        return true;
    } else if (message.action === "mark_text_reviewed") {
        (async () => {
            const db = await chrome.storage.local.get('trackingData');
            const trackingData = db.trackingData || {};
            const { item: targetItem } = findItemAndCategory(trackingData, message.itemId);
            if (targetItem && targetItem.type === 'text') {
                const history = targetItem.history || [];
                const latestVal = history.length > 0 ? history[history.length - 1].value : (message.reviewedText || '');
                targetItem.reviewedText = latestVal;
                targetItem.hasUnreadTextChange = false;
                targetItem.previousText = null;
                await chrome.storage.local.set({ trackingData });
                sendResponse({ status: "ok" });
            } else {
                sendResponse({ status: "not_found" });
            }
        })();
        return true;
    }
});

// 12. FORCE REFRESH ALL ITEMS (Queues all items, staggered by 10s to 3 min)
async function forceRefreshAllItems() {
    await initLang();

    const data = await chrome.storage.local.get('trackingData');
    const trackingData = data.trackingData || {};

    const allItemIds = [];
    for (const category in trackingData) {
        for (const item of trackingData[category].items) {
            allItemIds.push(item.id);
        }
    }

    if (allItemIds.length > 0) {
        console.log(`[Queue] Adding ${allItemIds.length} items to scrape queue with 10s-3min staggering.`);
        await enqueueScrapeItems(allItemIds, { forceImmediate: false });
    } else {
        console.log("No items available to refresh.");
    }
}

// 13. FORCE REFRESH CATEGORY (Queues category items, staggered by 10s to 3 min)
async function forceRefreshCategory(catKey) {
    const data = await chrome.storage.local.get('trackingData');
    const trackingData = data.trackingData || {};
    
    if (trackingData[catKey] && Array.isArray(trackingData[catKey].items)) {
        const itemIds = trackingData[catKey].items.map(i => i.id);
        console.log(`[Queue] Adding ${itemIds.length} items from category "${catKey}" to scrape queue with 10s-3min staggering.`);
        await enqueueScrapeItems(itemIds, { forceImmediate: false });
    }
}

// 14. FORCE REFRESH SINGLE ITEM (Prioritized immediate execution)
async function forceRefreshItem(itemId) {
    console.log(`[Queue] Immediate refresh requested for item ${itemId}.`);
    await enqueueScrapeItems(itemId, { forceImmediate: true });
}

// 15. CHECK OVERDUE ITEMS ON STARTUP (Staggers checks by 10s to 3 min)
async function checkOverdueItems() {
    if (isCheckingOverdue) return;
    isCheckingOverdue = true;

    try {
        const data = await chrome.storage.local.get('trackingData');
        const trackingData = data.trackingData || {};
        const now = Date.now();
        const overdueItemIds = [];

        for (const category in trackingData) {
            for (const item of trackingData[category].items) {
                const intervalMs = (item.intervalMinutes || 60) * 60 * 1000;
                const history = item.history || [];
                
                // Get timestamp of last successful check
                let lastCheckTime = 0;
                if (item.lastChecked) {
                    lastCheckTime = new Date(item.lastChecked).getTime();
                } else if (history.length > 0) {
                    lastCheckTime = new Date(history[history.length - 1].date).getTime();
                }
                
                // If never checked or elapsed interval exceeds threshold
                if (lastCheckTime === 0 || (now - lastCheckTime) >= intervalMs) {
                    overdueItemIds.push(item.id);
                } else {
                    // Ensure active alarm exists for remaining duration with slight jitter
                    const existingAlarm = await chrome.alarms.get(`check_item_${item.id}`);
                    if (!existingAlarm) {
                        const remainingMs = intervalMs - (now - lastCheckTime);
                        const delayMinutes = Math.max(1, remainingMs / (60 * 1000));
                        chrome.alarms.create(`check_item_${item.id}`, { delayInMinutes: delayMinutes });
                    }
                }
            }
        }

        if (overdueItemIds.length > 0) {
            console.log(`[Startup] Found ${overdueItemIds.length} overdue items. Adding to queue with 10s-3min intervals.`);
            await enqueueScrapeItems(overdueItemIds, { forceImmediate: false });
        }
    } catch (e) {
        console.error("Error checking overdue items:", e);
    } finally {
        isCheckingOverdue = false;
    }
}