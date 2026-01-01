import { HAWebSocket } from './ha-client.js';
import { DEFAULT_HA_URL } from './const.js';
import { HAEntity } from './boks-service.js';

// 1. Localization Logic
// Automatically replace textContent of elements with data-i18n attribute
function localizeHtmlPage() {
    const objects = document.querySelectorAll('[data-i18n]');
    for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        const msgKey = obj.getAttribute('data-i18n');
        const msg = chrome.i18n.getMessage(msgKey!);
        if (msg) {
            obj.textContent = msg;
        }
    }

    const placeholders = document.querySelectorAll('[data-i18n-placeholder]');
    for (let i = 0; i < placeholders.length; i++) {
        const obj = placeholders[i];
        const msgKey = obj.getAttribute('data-i18n-placeholder');
        const msg = chrome.i18n.getMessage(msgKey!);
        if (msg) {
            obj.setAttribute('placeholder', msg);
        }
    }
}

// Fetch todo entities from Home Assistant
async function fetchTodoEntities(haUrl: string, haToken: string, selectedId: string | null = null) {
    const entitySelect = document.getElementById('selectedTodoEntityId') as HTMLSelectElement;
    const entityError = document.getElementById('entityError');

    if (!entitySelect || !entityError) {
        return [];
    }

    // Clear previous error
    entityError.textContent = '';

    try {
        // Send message to background script to get entities via WebSocket
        const response = await chrome.runtime.sendMessage({
            action: 'GET_TODO_ENTITIES',
            haUrl: haUrl,
            haToken: haToken
        }) as { success: boolean; entities: HAEntity[]; error?: string };

        if (!response?.success) {
            throw new Error(response ? response.error : "Unknown error");
        }

        const entities = response.entities;
        
        // 1. Identify Boks Entities (Registry & Fallback)
        const boksRegistryEntities = entities.filter((e) => e.is_boks);
        const boksNameEntities = entities.filter((e) => 
            !e.is_boks && e.entity_id.toLowerCase().includes('boks')
        );
        
        const boksEntities = [...boksRegistryEntities, ...boksNameEntities];

        // 2. Determine which list to show
        // If we found specific Boks entities, show them. Otherwise show all.
        const filteredEntities = boksEntities.length > 0 ? boksEntities : entities;

        // Populate the select dropdown
        entitySelect.innerHTML = '';

        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = chrome.i18n.getMessage('selectTodoEntity') || 'Select a Todo entity';
        entitySelect.appendChild(defaultOption);

        // Add entities to dropdown
        filteredEntities.forEach((entity) => {
            const option = document.createElement('option');
            option.value = entity.entity_id;
            
            let label = entity.attributes.friendly_name || entity.entity_id;
            // Append Device Name if available
            if (entity.boks_device_name) {
                label = `${entity.boks_device_name} (${label})`;
            }
            
            option.textContent = label;
            entitySelect.appendChild(option);
        });

        // Enable the select
        entitySelect.disabled = false;

        // 3. Auto-Selection Logic
        // Prioritize: Passed ID > Single Registry Match > Single Name Match
        if (selectedId && filteredEntities.some((e) => e.entity_id === selectedId)) {
            entitySelect.value = selectedId;
        } else if (boksRegistryEntities.length === 1) {
            entitySelect.value = boksRegistryEntities[0].entity_id;
        } else if (boksRegistryEntities.length === 0 && boksNameEntities.length === 1) {
             entitySelect.value = boksNameEntities[0].entity_id;
        }

        // Show message if no boks entities found
        if (boksEntities.length === 0) {
            entityError.textContent = chrome.i18n.getMessage('noBoksTodoEntities') ||
                'No Boks Todo entities found. Showing all Todo entities.';
        }

        return filteredEntities;
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error fetching entities:', message);
        entityError.textContent = `${chrome.i18n.getMessage('errorFetchingEntities') || 'Error fetching entities'}: ${message}`;
        entitySelect.disabled = true;
        return [];
    }
}

// 2. Save Logic
const saveOptions = () => {
    const haUrlInput = document.getElementById('haUrl') as HTMLInputElement;
    let haUrl = haUrlInput.value.trim();
    const haToken = (document.getElementById('haToken') as HTMLInputElement).value.trim();
    const selectedTodoEntityId = (document.getElementById('selectedTodoEntityId') as HTMLSelectElement).value;

    if (!haUrl) {
        haUrl = DEFAULT_HA_URL;
        haUrlInput.value = haUrl;
    }

    chrome.storage.sync.set(
        { haUrl: haUrl, haToken: haToken, selectedTodoEntityId: selectedTodoEntityId },
        () => {
            const status = document.getElementById('status');
            if (status) {
                status.textContent = chrome.i18n.getMessage("msgSaved");
                status.style.color = "green";
                setTimeout(() => {
                    status.textContent = '';
                }, 2000);
            }
        }
    );
};

// Global variable to track the active WebSocket instance
let currentTestHA: HAWebSocket | null = null;

// Test Connection Logic
const testConnection = async () => {
    const haUrlInput = (document.getElementById('haUrl') as HTMLInputElement);
    let haUrl = haUrlInput.value.trim();
    const haToken = (document.getElementById('haToken') as HTMLInputElement).value.trim();
    const status = document.getElementById('status');
    
    if (!status) {
        return;
    }

    if (!haUrl) {
        haUrl = DEFAULT_HA_URL;
    }

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
    } catch (error: unknown) {
        // 4. Check if we are still the active instance
        if (ha !== currentTestHA) {
            console.log("Ignoring error from cancelled connection");
            return;
        }
        const message = error instanceof Error ? error.message : String(error);
        console.error("Connection test failed:", message);
        status.textContent = chrome.i18n.getMessage("connectionFailed", [message]);
        status.style.color = "red";
    } finally {
        // Only close if it's the current one and we are done testing
        if (ha === currentTestHA) {
            ha.close();
            currentTestHA = null;
        }
    }
};

// 3. Restore Logic
const restoreOptions = () => {
    chrome.storage.sync.get(
        { haUrl: DEFAULT_HA_URL, haToken: '', selectedTodoEntityId: '' },
        (items: Record<string, string>) => {
            (document.getElementById('haUrl') as HTMLInputElement).value = items.haUrl;
            (document.getElementById('haToken') as HTMLInputElement).value = items.haToken;
            // Set value here too, in case fetch fails or takes time (it will show empty if not in list yet, but good practice)
            (document.getElementById('selectedTodoEntityId') as HTMLSelectElement).value = items.selectedTodoEntityId;

            // If we have URL and token, fetch entities
            if (items.haUrl && items.haToken) {
                // Pass the saved entity ID so it can be re-selected after fetching
                void fetchTodoEntities(items.haUrl, items.haToken, items.selectedTodoEntityId);
            }
        }
    );
};

// Debounce function to limit API calls
function debounce<T extends (...args: unknown[]) => void>(func: T, wait: number) {
    let timeout: NodeJS.Timeout;
    return function executedFunction(...args: Parameters<T>) {
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
    const haUrlInput = document.getElementById('haUrl') as HTMLInputElement;
    const haTokenInput = document.getElementById('haToken') as HTMLInputElement;
    const entitySelect = document.getElementById('selectedTodoEntityId') as HTMLSelectElement;

    if (!haUrlInput || !haTokenInput || !entitySelect) {
        return;
    }

    // Function to handle input changes with debounce
    const handleInputChange = debounce<() => void>(() => {
        let haUrl = haUrlInput.value.trim();
        const haToken = haTokenInput.value.trim();

        // Use default if empty (visual feedback logic handled elsewhere, but for fetching we need a value)
        if (!haUrl) {
            haUrl = DEFAULT_HA_URL;
        }

        // Clear any previous connection status messages as config has changed
        const status = document.getElementById('status');
        if (status) {
            status.textContent = '';
        }

        if (haUrl && haToken) {
            // Enable the select and show loading state
            entitySelect.disabled = false;
            entitySelect.innerHTML = '<option value="" data-i18n="loadingEntities">Loading entities...</option>';
            localizeHtmlPage(); // Apply localization to new elements

            // Fetch entities
            void fetchTodoEntities(haUrl, haToken);
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
    document.getElementById('save')?.addEventListener('click', (e) => {
        e.preventDefault();
        saveOptions();
    });
    document.getElementById('testConnection')?.addEventListener('click', (e) => {
        e.preventDefault();
        testConnection().catch(err => console.error(err));
    });
});
