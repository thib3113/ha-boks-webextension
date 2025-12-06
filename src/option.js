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
async function fetchTodoEntities(haUrl, haToken) {
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
    const haUrl = document.getElementById('haUrl').value.trim();
    const haToken = document.getElementById('haToken').value.trim();
    const selectedTodoEntityId = document.getElementById('selectedTodoEntityId').value;

    chrome.storage.sync.set(
        { haUrl: haUrl, haToken: haToken, selectedTodoEntityId: selectedTodoEntityId },
        () => {
            const status = document.getElementById('status');
            status.textContent = chrome.i18n.getMessage("msgSaved");
            setTimeout(() => {
                status.textContent = '';
            }, 2000);
        }
    );
};

// 3. Restore Logic
const restoreOptions = () => {
    chrome.storage.sync.get(
        { haUrl: '', haToken: '', selectedTodoEntityId: '' },
        (items) => {
            document.getElementById('haUrl').value = items.haUrl;
            document.getElementById('haToken').value = items.haToken;
            document.getElementById('selectedTodoEntityId').value = items.selectedTodoEntityId;

            // If we have URL and token, fetch entities
            if (items.haUrl && items.haToken) {
                fetchTodoEntities(items.haUrl, items.haToken);
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
        const haUrl = haUrlInput.value.trim();
        const haToken = haTokenInput.value.trim();

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
});
