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
        const promptDefault = chrome.i18n.getMessage("promptDefault");

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

        if (!config.haUrl || !config.haToken) {
            alertUser(tab.id, chrome.i18n.getMessage("errorConfig"));
            return;
        }

        // 3. Call Home Assistant
        const code = await fetchCodeFromHA(config.haUrl, config.haToken, description);

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

/**
 * API Call to Home Assistant
 */
async function fetchCodeFromHA(baseUrl, token, description) {
    // Ensure no trailing slash on URL
    const cleanBaseUrl = baseUrl.replace(/\/$/, "");
    // Target script entity_id: script.generate_mailbox_code
    const apiUrl = `${cleanBaseUrl}/api/services/script/generate_mailbox_code`;

    const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            variables: { description: description }
        })
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    // Logic to extract the code from HA response.
    // HA 2023.7+ scripts can return data in `response` key if configured with `response_variable`
    // Structure: { "response": { "code": "123456" }, ... }

    if (data.response && data.response.code) {
        return data.response.code;
    }

    // Fallback: If your script only creates a notification/input_text but doesn't return data directly,
    // we cannot get the code immediately.
    // For this example, we assume the HA script IS configured to return a response.
    // If not, we throw an error or return a generic message.
    return data.response ? JSON.stringify(data.response) : "OK (No Return)";
}

/**
 * Injected function: Displays an alert in the browser tab
 */
function alertUser(tabId, message) {
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: (msg) => alert("[HA Extension] " + msg),
        args: [message]
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

        // Insert code at cursor position
        activeElement.value = text.substring(0, start) + " " + codeToInsert + text.substring(end);

        // Dispatch input event for React/Angular/Vue
        activeElement.dispatchEvent(new Event('input', { bubbles: true }));
    }
}
