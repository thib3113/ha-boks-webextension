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
        const code = await addParcelAndGetCode(config.haUrl, config.haToken, description);

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
async function addParcelAndGetCode(baseUrl, token, description) {
    // Nettoyage de l'URL (retrait du slash final s'il existe)
    const cleanBaseUrl = baseUrl.replace(/\/$/, "");

    // ATTENTION : On appelle le service de l'intégration (boks), pas un script.
    const apiUrl = `${cleanBaseUrl}/api/services/boks/add_parcel`;

    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            // Pour un Service d'intégration, les champs sont à la racine
            body: JSON.stringify({
                description: description
            })
        });

        if (!response.ok) {
            throw new Error(chrome.i18n.getMessage("errorHttp", [response.status.toString()]));
        }

        // Home Assistant renvoie un tableau JSON.
        // Si supports_response est activé, il contient votre dictionnaire.
        const data = await response.json();

        // Log pour voir la structure exacte dans la console du navigateur
        console.log("Réponse brute HA:", data);

        // Récupération du code
        // La structure reçue est : { "code": "123456", "context": {...} }
        if (data && data.code) {
            return data.code;
        } else {
            console.warn("Pas de code dans la réponse");
            return null;
        }

    } catch (error) {
        console.error("Erreur lors de l'appel API:", error);
        return null;
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

        // Insert code at cursor position
        activeElement.value = text.substring(0, start) + " " + codeToInsert + text.substring(end);

        // Dispatch input event for React/Angular/Vue
        activeElement.dispatchEvent(new Event('input', { bubbles: true }));
    }
}
