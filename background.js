import { initLang, t } from "./i18n.js";

// Global state variables
let isCheckingOverdue = false;
let isSettingUpContextMenus = false;
let activePickerTabId = null;
const activeScrapes = new Map(); // tabId -> { itemId, targetItem, completed }

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
  }
});

// 1. ALARM LISTENER
chrome.alarms.onAlarm.addListener(async (alarm) => {
  await initLang();

  if (alarm.name.startsWith('check_item_')) {
    const itemId = alarm.name.split('check_item_')[1];
    await executeScrape(itemId);
  }
});

// 2. SCRAPE EXECUTION (Open background tab and inject content script)
async function executeScrape(itemId) {
  const data = await chrome.storage.local.get('trackingData');
  const trackingData = data.trackingData || {};
  
  // Find product across all categories
  const { item: targetItem } = findItemAndCategory(trackingData, itemId);

  if (!targetItem) {
    console.warn(`Item with ID ${itemId} was not found.`);
    return;
  }

  // Open inactive background tab so it doesn't interrupt the user
  let tab;
  try {
    tab = await chrome.tabs.create({ url: targetItem.url, active: false });
  } catch (e) {
    console.error(`Failed to open background tab for ${itemId}:`, e);
    await processScrapeError(targetItem, "Failed to open background tab");
    return;
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
    cleanup: cleanupListeners
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
    safeRemoveTab(tab.id);
  }, 30000);

  // Schedule next check with jitter for natural browsing simulation
  scheduleNextCheck(targetItem);
}

// 3. SCHEDULE NEXT CHECK (with Jitter)
function scheduleNextCheck(item) {
  const baseMinutes = item.intervalMinutes || 60;
  const jitterMinutes = item.intervalJitter || Math.min(5, baseMinutes * 0.1);
  
  // Randomize interval (e.g. 60min +/- 5min = 55min to 65min)
  const randomMultiplier = (Math.random() * 2) - 1;
  const finalDelay = baseMinutes + (jitterMinutes * randomMultiplier);

  chrome.alarms.create(`check_item_${item.id}`, { delayInMinutes: finalDelay });
  console.log(`Next check for ${item.id} in ~${Math.round(finalDelay)} minutes.`);
}

// 4. PROCESS SCRAPE RESULT (Comparison and persistence)
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
      parsedValue = currentValue;
      const lastRecorded = history.length > 0 ? history[history.length - 1].value : null;
      if (currentValue !== lastRecorded) {
          isNewLowest = true; 
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

// 5. PROCESS SCRAPE ERROR (Preserve previous valid price and history)
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

// 6. VISUAL NOTIFICATION HELPER
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

// 7. AUDIO PLAYBACK (Offscreen Document for Manifest V3)
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

// 8. CONTEXT MENUS SETUP
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

// 9. CONTEXT MENU CLICK LISTENER
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

// 10. CENTRAL MESSAGE DISPATCHER
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "scrape_result") {
        if (sender.tab && activeScrapes.has(sender.tab.id)) {
            const ctx = activeScrapes.get(sender.tab.id);
            ctx.completed = true;
            if (ctx.cleanup) ctx.cleanup();
            activeScrapes.delete(sender.tab.id);
        }
        processScrapeResult(message.itemConfig, message.value, message.timestamp, message.currency);
        if (sender.tab) {
            safeRemoveTab(sender.tab.id);
        }
        sendResponse({ status: "ok" });
        return true;
    } else if (message.action === "scrape_error") {
        if (sender.tab && activeScrapes.has(sender.tab.id)) {
            const ctx = activeScrapes.get(sender.tab.id);
            ctx.completed = true;
            if (ctx.cleanup) ctx.cleanup();
            activeScrapes.delete(sender.tab.id);
        }
        console.error(`Scraping error for ${message.itemConfig.id}:`, message.error);
        processScrapeError(message.itemConfig, message.error);
        if (sender.tab) {
            safeRemoveTab(sender.tab.id);
        }
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
    }
});

// 11. FORCE REFRESH ALL ITEMS
async function forceRefreshAllItems() {
    await initLang();

    const data = await chrome.storage.local.get('trackingData');
    const trackingData = data.trackingData || {};

    let hasItems = false;
    let delayMs = 0;

    // Stagger requests across all categories and products
    for (const category in trackingData) {
        for (const item of trackingData[category].items) {
            hasItems = true;
            setTimeout(() => {
                executeScrape(item.id).catch(err => console.error(`Manual refresh error for ${item.id}:`, err));
            }, delayMs);
            delayMs += 1500; // 1.5s delay between background tabs
        }
    }

    if (hasItems) {
        console.log("Manual refresh started for all items.");
    } else {
        console.log("No items available to refresh.");
    }
}

// 12. FORCE REFRESH CATEGORY
async function forceRefreshCategory(catKey) {
    const data = await chrome.storage.local.get('trackingData');
    const trackingData = data.trackingData || {};
    
    if (trackingData[catKey]) {
        let delayMs = 0;
        for (const item of trackingData[catKey].items) {
            setTimeout(() => {
                executeScrape(item.id).catch(err => console.error(`Error refreshing ${item.id}:`, err));
            }, delayMs);
            delayMs += 1500;
        }
        console.log(`Manual refresh started for category ${catKey}.`);
    }
}

// 13. FORCE REFRESH SINGLE ITEM
async function forceRefreshItem(itemId) {
    executeScrape(itemId).catch(err => console.error(`Error refreshing ${itemId}:`, err));
    console.log(`Manual refresh started for item ${itemId}.`);
}

// 14. CHECK OVERDUE ITEMS ON STARTUP
async function checkOverdueItems() {
    if (isCheckingOverdue) return;
    isCheckingOverdue = true;

    try {
        const data = await chrome.storage.local.get('trackingData');
        const trackingData = data.trackingData || {};
        const now = Date.now();
        const overdueItems = [];

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
                    overdueItems.push(item);
                } else {
                    // Ensure active alarm exists for remaining duration
                    const existingAlarm = await chrome.alarms.get(`check_item_${item.id}`);
                    if (!existingAlarm) {
                        const remainingMs = intervalMs - (now - lastCheckTime);
                        const delayMinutes = Math.max(1, remainingMs / (60 * 1000));
                        chrome.alarms.create(`check_item_${item.id}`, { delayInMinutes: delayMinutes });
                    }
                }
            }
        }

        if (overdueItems.length > 0) {
            console.log(`Found ${overdueItems.length} overdue items. Starting sequential checks...`);
            let delayMs = 1500;
            for (const item of overdueItems) {
                setTimeout(() => {
                    executeScrape(item.id).catch(err => console.error(`Error checking overdue item ${item.id}:`, err));
                }, delayMs);
                delayMs += 2500; // 2.5s delay between tabs for smooth performance
            }
        }
    } catch (e) {
        console.error("Error checking overdue items:", e);
    } finally {
        isCheckingOverdue = false;
    }
}