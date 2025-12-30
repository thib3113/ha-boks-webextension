import { HAWebSocket } from './ha-client.js';
import { DEFAULT_HA_URL } from './const.js';

// Initialize the context menu when the extension is installed
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "generate-ha-code",
        title: chrome.i18n.getMessage("menuTitle"),
        contexts: ["editable"] // Shows only on input fields and textareas
    });
});

// Listener for context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "generate-ha-code") {
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
async function handleMenuClick(tab) {
    try {
        // 1. Prompt user for description
        // We inject a script to run window.prompt inside the tab
        const promptMsg = chrome.i18n.getMessage("promptMessage");
        let promptDefault = chrome.i18n.getMessage("promptDefault");

        const inputResult = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (msg, def) => prompt(msg, def),
            args: [promptMsg, promptDefault]
        });

        // chrome.scripting.executeScript returns an array of results (one per frame)
        const description = inputResult[0].result;

        // If user clicked Cancel or entered nothing (and prompt returned null), abort
        if (description === null) return;

        // 2. Get configuration from storage
        const config = await chrome.storage.sync.get(['haUrl', 'haToken']);
        const haUrl = config.haUrl || DEFAULT_HA_URL;

        if (!haUrl || !config.haToken) {
            alertUser(tab.id, chrome.i18n.getMessage("errorConfig"));
            return;
        }

        // 3. Call Home Assistant
        const code = await addParcelAndGetCode(haUrl, config.haToken, description);

        // 4. Insert code into the field
        if (code) {
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: insertCodeIntoActiveElement,
                args: [code]
            });
        }

    } catch (err) {
        console.error("Workflow failed:", err);
        // Display a clearer error to the user
        let errorMsg = chrome.i18n.getMessage("errorNetwork");
        if(err.message) errorMsg += " (" + err.message + ")";
        alertUser(tab.id, errorMsg);
    }
}

// Listener for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "ADD_PARCEL") {
        handleAddParcel(request.description)
            .then(result => sendResponse({ success: result !== null, code: result }))
            .catch(error => {
                console.error("Error in handleAddParcel:", error);
                sendResponse({ success: false, error: error.message });
            });
        return true;
    }

    if (request.action === "GET_TODO_ITEMS") {
        handleGetTodoItems()
            .then(result => sendResponse({ success: true, items: result }))
            .catch(error => {
                console.error("Error in handleGetTodoItems:", error);
                sendResponse({ success: false, error: error.message });
            });
        return true;
    }

    if (request.action === "UPDATE_TODO_ITEM") {
        handleUpdateTodoItem(request.uid, request.status, request.summary)
            .then(() => sendResponse({ success: true }))
            .catch(error => {
                console.error("Error in handleUpdateTodoItem:", error);
                sendResponse({ success: false, error: error.message });
            });
        return true;
    }

    if (request.action === "GET_TODO_ENTITIES") {
        handleGetTodoEntities(request.haUrl, request.haToken)
            .then(result => sendResponse({ success: true, entities: result }))
            .catch(error => {
                console.error("Error in handleGetTodoEntities:", error);
                sendResponse({ success: false, error: error.message });
            });
        return true;
    }
});

// --- WebSocket Client Class ---
// (Moved to ha-client.js)

// --- Handlers ---

async function getHAConnection() {
    const config = await chrome.storage.sync.get(['haUrl', 'haToken']);
    const haUrl = config.haUrl || DEFAULT_HA_URL;
    if (!haUrl || !config.haToken) {
        throw new Error("Configuration missing");
    }
    return new HAWebSocket(haUrl, config.haToken);
}

/**
 * Handle adding a parcel from the popup
 */
async function handleAddParcel(description) {
    try {
        const config = await chrome.storage.sync.get(['selectedTodoEntityId']);
        if (!config.selectedTodoEntityId) {
            throw new Error("No Todo List entity configured.");
        }

        const ha = await getHAConnection();
        try {
            const response = await ha.callService("boks", "add_parcel", {
                description: description
            }, { entity_id: config.selectedTodoEntityId }, true); // target, return_response = true

            console.log("[Boks] Service Response:", JSON.stringify(response));

            // Response structure: { response: { code: "..." } } or just { code: "..." } depending on HA version
            let code = null;
            if (response && response.response && response.response.code) {
                code = response.response.code;
            } else if (response && response.code) {
                code = response.code;
            } else {
                console.warn("[Boks] Could not find code in response:", response);
            }

            console.log("[Boks] Extracted code:", code);

            return code;
        } finally {
            ha.close();
        }
    } catch (err) {
        console.error("Error adding parcel:", err);
        throw err;
    }
}

/**
 * Handle getting todo items from Home Assistant
 */
async function handleGetTodoItems() {
    try {
        const config = await chrome.storage.sync.get(['selectedTodoEntityId']);
        if (!config.selectedTodoEntityId) {
            throw new Error("No Todo entity selected");
        }

        const ha = await getHAConnection();
        try {
            return await ha.sendRequest("todo/item/list", {
                entity_id: config.selectedTodoEntityId
            });
        } finally {
            ha.close();
        }
    } catch (err) {
        console.error("Error getting todo items:", err);
        throw err;
    }
}

/**
 * Handle updating a todo item (mark as completed/uncompleted)
 */
async function handleUpdateTodoItem(uid, status, summary) {
    try {
        const config = await chrome.storage.sync.get(['selectedTodoEntityId']);
        if (!config.selectedTodoEntityId) {
            throw new Error("No Todo entity selected");
        }

        const ha = await getHAConnection();
        try {
            await ha.callService("todo", "update_item", {
                item: uid,
                status: status,
                // summary: summary // Optional but good practice
            }, { entity_id: config.selectedTodoEntityId });
            return true;
        } finally {
            ha.close();
        }
    } catch (err) {
        console.error("Error updating todo item:", err);
        throw err;
    }
}

/**
 * Handle getting all todo entities
 */
async function handleGetTodoEntities(haUrl, haToken) {
    try {
        // Use provided credentials or fallback to storage
        let url = haUrl;
        let token = haToken;

        if (!url || !token) {
            const config = await chrome.storage.sync.get(['haUrl', 'haToken']);
            url = config.haUrl || DEFAULT_HA_URL;
            token = config.haToken;
        }

        if (!url || !token) {
            throw new Error("Configuration missing");
        }

        const ha = new HAWebSocket(url, token);
        try {
            const states = await ha.sendRequest("get_states");
            return states.filter(state => state.entity_id.startsWith("todo."));
        } finally {
            ha.close();
        }
    } catch (err) {
        console.error("Error getting todo entities:", err);
        throw err;
    }
}

// Also expose addParcelAndGetCode for the context menu workflow
async function addParcelAndGetCode(baseUrl, token, description) {
    // This function is called by handleMenuClick which passes url/token directly
    // We can reuse our HAWebSocket class
    try {
        const config = await chrome.storage.sync.get(['selectedTodoEntityId']);
        if (!config.selectedTodoEntityId) {
            throw new Error("No Todo List entity configured.");
        }

        const ha = new HAWebSocket(baseUrl, token);
        try {
            const response = await ha.callService("boks", "add_parcel", {
                description: description
            }, { entity_id: config.selectedTodoEntityId }, true);

            console.log("[Boks] Service Response (Menu):", JSON.stringify(response));

            const code = response?.response?.code ?? response?.code;

            if(!code) {
                 console.warn("[Boks] Could not find code in response (Menu):", response);
            }

            console.log("[Boks] Extracted code (Menu):", code);
            return code;
        } finally {
            ha.close();
        }
    } catch (err) {
        console.error("Error in addParcelAndGetCode:", err);
        throw err;
    }
}

/**
 * Injected function: Displays an alert in the browser tab
 */
function alertUser(tabId, message) {
    const prefix = chrome.i18n.getMessage("extensionPrefix");
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: (p, msg) => alert(p + msg),
        args: [prefix, message]
    });
}

/**
 * Injected function: Inserts text into the currently focused input
 */
function insertCodeIntoActiveElement(codeToInsert) {
    const activeElement = document.activeElement;
    if (activeElement && (['INPUT','TEXTAREA'].includes(activeElement.tagName.toUpperCase()))) {
        const start = activeElement.selectionStart;
        const end = activeElement.selectionEnd;
        const text = activeElement.value;

        // Check if we need a leading space
        // Add space if:
        // 1. Not at the start of the field
        // 2. The character before cursor is not already a whitespace
        let prefix = "";
        if (start > 0 && !/\s/.test(text[start - 1])) {
            prefix = " ";
        }

        const finalCode = prefix + codeToInsert;

        // Insert code at cursor position
        activeElement.value = text.substring(0, start) + finalCode + text.substring(end);

        // Dispatch input event for React/Angular/Vue
        activeElement.dispatchEvent(new Event('input', { bubbles: true }));
    }
}
