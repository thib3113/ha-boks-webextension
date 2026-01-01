import { HAWebSocket } from './ha-client.js';
import { DEFAULT_HA_URL } from './const.js';
import { BoksService } from './boks-service.js';

// Initialize the context menu when the extension is installed
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "generate-ha-code",
        title: chrome.i18n.getMessage("menuTitle"),
        contexts: ["editable"] // Shows only on input fields and textareas
    });
});

// Listener for context menu clicks
chrome.contextMenus.onClicked.addListener((info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => {
    if (info.menuItemId === "generate-ha-code" && tab) {
        handleMenuClick(tab);
    }
});

/**
 * Main workflow:
 * 1. Prompt user for description (in the page context)
 * 2. Read configuration (URL/Token)
 * 3. Call HA API
 * 4. Insert result
 */
async function handleMenuClick(tab: chrome.tabs.Tab) {
    if (!tab.id) return;
    try {
        // 1. Prompt user for description
        const promptMsg = chrome.i18n.getMessage("promptMessage");
        let promptDefault = chrome.i18n.getMessage("promptDefault");

        const inputResult = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (msg: string, def: string) => prompt(msg, def),
            args: [promptMsg, promptDefault]
        });

        const description = inputResult[0].result;
        if (description === null) return;

        // 2. Get configuration
        const config = await chrome.storage.sync.get(['haUrl', 'haToken', 'selectedTodoEntityId']);
        const haUrl = config.haUrl || DEFAULT_HA_URL;

        if (!haUrl || !config.haToken || !config.selectedTodoEntityId) {
            alertUser(tab.id, chrome.i18n.getMessage("errorConfig"));
            return;
        }

        // 3. Call Service
        const connection = new HAWebSocket(haUrl, config.haToken);
        const service = new BoksService(connection, config.selectedTodoEntityId);
        const code = await service.addParcel(description);

        // 4. Insert code
        if (code) {
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: insertCodeIntoActiveElement,
                args: [code]
            });
        }

    } catch (err: any) {
        console.error("Workflow failed:", err);
        let errorMsg = chrome.i18n.getMessage("errorNetwork");
        if(err.message) errorMsg += " (" + err.message + ")";
        alertUser(tab.id!, errorMsg);
    }
}

// Listener for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
        try {
            if (request.action === "GET_TODO_ENTITIES") {
                const connection = new HAWebSocket(request.haUrl, request.haToken);
                const entities = await BoksService.getTodoEntities(connection);
                sendResponse({ success: true, entities });
                return;
            }

            const config = await chrome.storage.sync.get(['haUrl', 'haToken', 'selectedTodoEntityId']);
            const haUrl = config.haUrl || DEFAULT_HA_URL;
            
            if (!haUrl || !config.haToken || (!config.selectedTodoEntityId && request.action !== "GET_TODO_ENTITIES")) {
                throw new Error("Configuration missing");
            }

            const connection = new HAWebSocket(haUrl, config.haToken);
            const service = new BoksService(connection, config.selectedTodoEntityId);

            if (request.action === "ADD_PARCEL") {
                const code = await service.addParcel(request.description);
                sendResponse({ success: code !== null, code });
            } else if (request.action === "GET_TODO_ITEMS") {
                const items = await service.getTodoItems();
                sendResponse({ success: true, items });
            } else if (request.action === "UPDATE_TODO_ITEM") {
                await service.updateTodoItem(request.uid, request.status, request.summary);
                sendResponse({ success: true });
            }
        } catch (error: any) {
             console.error(`Error in ${request.action}:`, error);
             sendResponse({ success: false, error: error.message });
        }
    })();
    return true; // Keep channel open
});

// --- Helpers ---

function alertUser(tabId: number, message: string) {
    const prefix = chrome.i18n.getMessage("extensionPrefix");
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: (p: string, msg: string) => alert(p + msg),
        args: [prefix, message]
    });
}

function insertCodeIntoActiveElement(codeToInsert: string) {
    const activeElement = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
    if (activeElement && (['INPUT','TEXTAREA'].includes(activeElement.tagName.toUpperCase()))) {
        const start = activeElement.selectionStart;
        const end = activeElement.selectionEnd;
        const text = activeElement.value;

        let prefix = "";
        if (start !== null && start > 0 && !/\s/.test(text[start - 1])) {
            prefix = " ";
        }

        const finalCode = prefix + codeToInsert;

        if (start !== null && end !== null) {
            activeElement.value = text.substring(0, start) + finalCode + text.substring(end);
        }

        activeElement.dispatchEvent(new Event('input', { bubbles: true }));
    }
}
