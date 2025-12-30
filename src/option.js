import { HAWebSocket } from './ha-client.js';
import { DEFAULT_HA_URL } from './const.js';

// 1. Localization Logic
// Automatically replace textContent of elements with data-i18n attribute
function localizeHtmlPage() {
    const objects = document.querySelectorAll('[data-i18n]');
    for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        const msgKey = obj.getAttribute('data-i18n');
        const msg = chrome.i18n.getMessage(msgKey);
        if (msg) {
            obj.textContent = msg;
        }
    }

    const placeholders = document.querySelectorAll('[data-i18n-placeholder]');
    for (let i = 0; i < placeholders.length; i++) {
        const obj = placeholders[i];
        const msgKey = obj.getAttribute('data-i18n-placeholder');
        const msg = chrome.i18n.getMessage(msgKey);
        if (msg) {
            obj.setAttribute('placeholder', msg);
        }
    }
}

// Fetch todo entities from Home Assistant
async function fetchTodoEntities(haUrl, haToken, selectedId = null) {
    const entitySelect = document.getElementById('selectedTodoEntityId');
    const entityError = document.getElementById('entityError');

    // Clear previous error
    entityError.textContent = '';

    try {
        // Send message to background script to get entities via WebSocket
        const response = await chrome.runtime.sendMessage({
            action: 'GET_TODO_ENTITIES',
            haUrl: haUrl,
            haToken: haToken
        });

        if (!response || !response.success) {
            throw new Error(response ? response.error : "Unknown error");
        }

        const entities = response.entities;
        const todoEntities = entities; // Already filtered in background

        // Filter for todo entities with boks in entity_id or friendly_name
        const todoEntitiesBoks = todoEntities.filter(entity => {
            // Check if entity_id starts with 'boks' (case insensitive)
            return entity.entity_id.toLowerCase().startsWith('todo.boks');
        });

        // If no boks todo entities found, show all todo entities
        let filteredEntities = todoEntitiesBoks.length ? todoEntitiesBoks : todoEntities;

        // Populate the select dropdown
        entitySelect.innerHTML = '';

        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = chrome.i18n.getMessage('selectTodoEntity') || 'Select a Todo entity';
        entitySelect.appendChild(defaultOption);

        // Add entities to dropdown
        filteredEntities.forEach(entity => {
            const option = document.createElement('option');
            option.value = entity.entity_id;
            option.textContent = entity.attributes.friendly_name || entity.entity_id;
            entitySelect.appendChild(option);
        });

        // Enable the select
        entitySelect.disabled = false;

        // Restore selection if provided
        if (selectedId) {
            entitySelect.value = selectedId;
        }

        // Show message if no boks entities found
        if (todoEntities.length === 0 && filteredEntities.length > 0) {
            entityError.textContent = chrome.i18n.getMessage('noBoksTodoEntities') ||
                'No Boks Todo entities found. Showing all Todo entities.';
        }

        return filteredEntities;
    } catch (error) {
        console.error('Error fetching entities:', error);
        entityError.textContent = `${chrome.i18n.getMessage('errorFetchingEntities') || 'Error fetching entities'}: ${error.message}`;
        entitySelect.disabled = true;
        return [];
    }
}

// 2. Save Logic
const saveOptions = () => {
    let haUrl = document.getElementById('haUrl').value.trim();
    const haToken = document.getElementById('haToken').value.trim();
    const selectedTodoEntityId = document.getElementById('selectedTodoEntityId').value;

    if (!haUrl) {
        haUrl = DEFAULT_HA_URL;
        document.getElementById('haUrl').value = haUrl;
    }

    chrome.storage.sync.set(
        { haUrl: haUrl, haToken: haToken, selectedTodoEntityId: selectedTodoEntityId },
        () => {
            const status = document.getElementById('status');
            status.textContent = chrome.i18n.getMessage("msgSaved");
            status.style.color = "green";
            setTimeout(() => {
                status.textContent = '';
            }, 2000);
        }
    );
};

// Global variable to track the active WebSocket instance
let currentTestHA = null;

// Test Connection Logic
const testConnection = async () => {
    let haUrl = document.getElementById('haUrl').value.trim();
    const haToken = document.getElementById('haToken').value.trim();
    const status = document.getElementById('status');

    if (!haUrl) haUrl = DEFAULT_HA_URL;

    if (!haToken) {
        status.textContent = chrome.i18n.getMessage("enterHaConfig");
        status.style.color = "orange";
        return;
    }

    // 1. Cancel/Close previous connection if exists
    if (currentTestHA) {
        console.log("Aborting previous connection attempt...");
        currentTestHA.close(); 
        currentTestHA = null;
    }

    status.textContent = "Connecting...";
    status.style.color = "blue";

    // 2. Create new instance
    const ha = new HAWebSocket(haUrl, haToken);
    currentTestHA = ha; // Track this specific instance

    try {
        await ha.connect();
        
        // 3. Check if we are still the active instance
        // (If user clicked test again, currentTestHA would be different)
        if (ha !== currentTestHA) {
            console.log("Ignoring result from cancelled connection");
            return;
        }

        // Just checking authentication is enough for a basic test
        if (ha.isAuthenticated) {
             status.textContent = chrome.i18n.getMessage("connectionSuccess");
             status.style.color = "green";
        } else {
             throw new Error("Not authenticated");
        }
    } catch (error) {
        // 4. Check if we are still the active instance
        if (ha !== currentTestHA) {
            console.log("Ignoring error from cancelled connection");
            return;
        }
        console.error("Connection test failed:", error);
        status.textContent = chrome.i18n.getMessage("connectionFailed", [error.message]);
        status.style.color = "red";
    } finally {
        // Only close if it's the current one and we are done testing
        // OR if we want to clean up the test connection immediately after success/fail
        // Usually good practice to close test connections
        if (ha === currentTestHA) {
            ha.close();
            currentTestHA = null;
        } else {
            // It was already closed/replaced, nothing to do
        }
    }
};

// 3. Restore Logic
const restoreOptions = () => {
    chrome.storage.sync.get(
        { haUrl: DEFAULT_HA_URL, haToken: '', selectedTodoEntityId: '' },
        (items) => {
            document.getElementById('haUrl').value = items.haUrl;
            document.getElementById('haToken').value = items.haToken;
            // Set value here too, in case fetch fails or takes time (it will show empty if not in list yet, but good practice)
            document.getElementById('selectedTodoEntityId').value = items.selectedTodoEntityId;

            // If we have URL and token, fetch entities
            if (items.haUrl && items.haToken) {
                // Pass the saved entity ID so it can be re-selected after fetching
                fetchTodoEntities(items.haUrl, items.haToken, items.selectedTodoEntityId);
            }
        }
    );
};

// Debounce function to limit API calls
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Event listener for when HA URL or token changes
function setupEntityFetching() {
    const haUrlInput = document.getElementById('haUrl');
    const haTokenInput = document.getElementById('haToken');
    const entitySelect = document.getElementById('selectedTodoEntityId');

    // Function to handle input changes with debounce
    const handleInputChange = debounce(() => {
        let haUrl = haUrlInput.value.trim();
        const haToken = haTokenInput.value.trim();

        // Use default if empty (visual feedback logic handled elsewhere, but for fetching we need a value)
        if (!haUrl) haUrl = DEFAULT_HA_URL;

        // Clear any previous connection status messages as config has changed
        const status = document.getElementById('status');
        if (status) status.textContent = '';

        if (haUrl && haToken) {
            // Enable the select and show loading state
            entitySelect.disabled = false;
            entitySelect.innerHTML = '<option value="" data-i18n="loadingEntities">Loading entities...</option>';
            localizeHtmlPage(); // Apply localization to new elements

            // Fetch entities
            fetchTodoEntities(haUrl, haToken);
        } else {
            // Disable the select if we don't have required info
            entitySelect.disabled = true;
            entitySelect.innerHTML = '<option value="" data-i18n="enterHaConfig">Enter HA config first</option>';
            localizeHtmlPage(); // Apply localization to new elements
        }
    }, 500); // 500ms debounce

    // Add event listeners for both input and change events
    haUrlInput.addEventListener('input', handleInputChange);
    haTokenInput.addEventListener('input', handleInputChange);
    haUrlInput.addEventListener('change', handleInputChange);
    haTokenInput.addEventListener('change', handleInputChange);
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    localizeHtmlPage();
    restoreOptions();
    setupEntityFetching();
    document.getElementById('save').addEventListener('click', (e) => {
        e.preventDefault();
        saveOptions();
    });
    document.getElementById('testConnection').addEventListener('click', (e) => {
        e.preventDefault();
        testConnection();
    });
});
