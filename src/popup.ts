import { HATodoItem } from './boks-service.js';

// 1. Localization Logic
// Automatically replace textContent of elements with data-i18n attribute
function localizeHtmlPage() {
    const objects = document.querySelectorAll('[data-i18n]');
    for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        const msgKey = obj.getAttribute('data-i18n');
        if (msgKey) {
            const msg = chrome.i18n.getMessage(msgKey);
            if (msg) {
                obj.textContent = msg;
            }
        }
    }

    const placeholders = document.querySelectorAll('[data-i18n-placeholder]');
    for (let i = 0; i < placeholders.length; i++) {
        const obj = placeholders[i];
        const msgKey = obj.getAttribute('data-i18n-placeholder');
        if (msgKey) {
            const msg = chrome.i18n.getMessage(msgKey);
            if (msg) {
                obj.setAttribute('placeholder', msg);
            }
        }
    }
}

// 2. Show message function
function showMessage(text: string, isSuccess: boolean) {
    const messageElement = document.getElementById('message');
    if (!messageElement) {
        return;
    }

    messageElement.textContent = text;
    messageElement.className = isSuccess ? 'success' : 'error';
    messageElement.style.display = 'block';

    // Hide message after 3 seconds
    setTimeout(() => {
        messageElement.style.display = 'none';
    }, 3000);
}

// 3. Fetch and display todo items
async function fetchAndDisplayTodoItems() {
    const loadingElement = document.getElementById('loadingTodoList');
    const todoListElement = document.getElementById('todoList');
    const noItemsElement = document.getElementById('noTodoItems');

    if (!loadingElement || !todoListElement || !noItemsElement) {
        return;
    }

    try {
        // Show loading state only if list is empty
        if (todoListElement.children.length === 0) {
            loadingElement.style.display = 'block';
            todoListElement.style.display = 'none';
            noItemsElement.style.display = 'none';
        } else {
            // Indicate refresh without hiding content
            todoListElement.style.opacity = '0.6';
        }

        // Send message to background script to get todo items
        const response = await chrome.runtime.sendMessage({
            action: 'GET_TODO_ITEMS'
        }) as { success: boolean; items: { items: HATodoItem[] } | { attributes: { todo_items: HATodoItem[] } }; error?: string };

        // Hide loading state
        loadingElement.style.display = 'none';
        todoListElement.style.opacity = '1';

        if (response?.success) {
            // Process and display todo items
            displayTodoItems(response.items);
        } else {
            // Display error
            console.error("Error fetching todo items:", response ? response.error : "Unknown error");
            todoListElement.style.display = 'none';
            noItemsElement.textContent = chrome.i18n.getMessage("errorLoadingParcels");
            noItemsElement.style.display = 'block';
        }
    } catch (error: unknown) {
        console.error("Error sending message to background script:", error);
        loadingElement.style.display = 'none';
        todoListElement.style.display = 'none';
        noItemsElement.textContent = chrome.i18n.getMessage("errorLoadingParcels");
        noItemsElement.style.display = 'block';
    }
}

// 4. Display todo items in the list
function displayTodoItems(items: { items: HATodoItem[] } | { attributes: { todo_items: HATodoItem[] } } | Record<string, unknown>) {
    const todoListElement = document.getElementById('todoList');
    const noItemsElement = document.getElementById('noTodoItems');

    if (!todoListElement || !noItemsElement) {
        return;
    }

    // Handle different response structures (WebSocket vs REST)
    let todoItems: HATodoItem[] = [];
    if (items && 'items' in items && Array.isArray(items.items)) {
        // WebSocket response structure: { items: [...] }
        todoItems = items.items as HATodoItem[];
    } else if (items && 'attributes' in items) {
        const attrs = items.attributes as Record<string, unknown>;
        if (Array.isArray(attrs.todo_items)) {
            // REST API response structure (legacy)
            todoItems = attrs.todo_items as HATodoItem[];
        }
    }

    if (todoItems.length > 0) {
        todoItems.reverse()
        // Sort items: incomplete first
        todoItems.sort((a, b) => {
            if (a.status === 'completed' && b.status !== 'completed') {
                return 1;
            }
            if (a.status !== 'completed' && b.status === 'completed') {
                return -1;
            }
            return 0;
        });

        // Create fragment for atomic update
        const fragment = document.createDocumentFragment();

        // Display todo items
        [
            todoItems.filter((item) => item.status !== 'completed'),
            todoItems.filter((item) => item.status === 'completed'),
        ].flat().forEach(item => {
            const listItem = document.createElement('li');
            listItem.className = 'todo-item';
            if (item.status === 'completed') {
                listItem.classList.add('completed');
            }

            // Checkbox
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = item.status === 'completed';
            checkbox.className = 'todo-checkbox';
            checkbox.addEventListener('change', async () => {
                const newStatus = checkbox.checked ? 'completed' : 'needs_action';
                // Optimistic update
                if (checkbox.checked) {
                    listItem.classList.add('completed');
                } else {
                    listItem.classList.remove('completed');
                }

                try {
                    await chrome.runtime.sendMessage({
                        action: 'UPDATE_TODO_ITEM',
                        uid: item.uid,
                        status: newStatus,
                        summary: item.summary
                    });
                    // Refresh list to ensure correct order
                    void fetchAndDisplayTodoItems();
                } catch (error) {
                    console.error("Error updating item:", error);
                    // Revert on error
                    checkbox.checked = !checkbox.checked;
                    if (checkbox.checked) {
                        listItem.classList.add('completed');
                    } else {
                        listItem.classList.remove('completed');
                    }
                }
            });

            // Content Container
            const contentDiv = document.createElement('div');
            contentDiv.className = 'todo-content';

            // Extract code
            const codeMatch = item.summary.match(/^\s*([0-9A-B]{6})(?:[\W_]+)?(.*)/i);
            let code: string | null = null;
            let description = item.summary;

            if (codeMatch) {
                code = codeMatch[1];
                description = codeMatch[2];
            }

            // Summary Text
            const summarySpan = document.createElement('span');
            summarySpan.className = 'todo-summary';
            summarySpan.textContent = description;

            contentDiv.appendChild(summarySpan);

            // Code Display
            if (code) {
                const codeContainer = document.createElement('div');
                codeContainer.className = 'todo-code-container';

                const codeSpan = document.createElement('span');
                codeSpan.className = 'todo-code';
                codeSpan.textContent = code;

                const copyBtn = document.createElement('button');
                copyBtn.className = 'copy-btn';
                copyBtn.title = chrome.i18n.getMessage("copy_code");
                copyBtn.innerHTML = '📋'; // Simple icon
                copyBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    void navigator.clipboard.writeText(code!).then(() => {
                        const originalText = copyBtn.innerHTML;
                        copyBtn.innerHTML = '✅';
                        setTimeout(() => copyBtn.innerHTML = originalText, 1000);
                    });
                });

                codeContainer.appendChild(codeSpan);
                codeContainer.appendChild(copyBtn);
                contentDiv.appendChild(codeContainer);
            }

            // Edit Button (Simple implementation: prompt)
            const editBtn = document.createElement('button');
            editBtn.className = 'edit-btn';
            editBtn.innerHTML = '✏️';
            editBtn.title = chrome.i18n.getMessage("editTaskTitle");
            editBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const newSummary = prompt(chrome.i18n.getMessage("editTaskPrompt"), item.summary);
                if (newSummary !== null && newSummary !== item.summary) {
                    try {
                        await chrome.runtime.sendMessage({
                            action: 'UPDATE_TODO_ITEM',
                            uid: item.uid,
                            status: item.status,
                            summary: newSummary
                        });
                        void fetchAndDisplayTodoItems();
                    } catch (error) {
                        console.error("Error updating item:", error);
                        alert(chrome.i18n.getMessage("updateFailedAlert"));
                    }
                }
            });

            listItem.appendChild(checkbox);
            listItem.appendChild(contentDiv);
            listItem.appendChild(editBtn);

            fragment.appendChild(listItem);
        });

        // Clear and update list in one go
        todoListElement.innerHTML = '';
        todoListElement.appendChild(fragment);

        // Show the list
        todoListElement.style.display = 'block';
        noItemsElement.style.display = 'none';
    } else {
        // No items found
        todoListElement.innerHTML = '';
        noItemsElement.style.display = 'block';
        todoListElement.style.display = 'none';
    }
}

// 5. Add Parcel button event listener
document.addEventListener('DOMContentLoaded', () => {
    // Apply localization
    localizeHtmlPage();

    const addButton = document.getElementById('addParcel') as HTMLButtonElement;
    const descriptionInput = document.getElementById('description') as HTMLInputElement;
    const configRequiredMessage = document.getElementById('configRequiredMessage');
    const openOptionsButton = document.getElementById('openOptions');

    // Add event listener to open options
    if (openOptionsButton) {
        openOptionsButton.addEventListener('click', () => {
            chrome.runtime.openOptionsPage();
        });
    }

    // Check if entity_id is configured
    chrome.storage.sync.get(['selectedTodoEntityId'], (config: Record<string, string>) => {
        const entityId = config.selectedTodoEntityId;

        if (!entityId) {
            // No entity configured, disable UI and show message
            descriptionInput.disabled = true;
            addButton.disabled = true;
            if (configRequiredMessage) {
                configRequiredMessage.style.display = 'block';
            }
        } else {
            // Entity configured, enable UI
            descriptionInput.disabled = false;
            addButton.disabled = false;
            if (configRequiredMessage) {
                configRequiredMessage.style.display = 'none';
            }

            // Fetch and display todo items
            void fetchAndDisplayTodoItems();
        }
    });

    // Add event listener to the button
    addButton.addEventListener('click', async () => {
        const description = descriptionInput.value.trim();

        // Validate input
        if (!description) {
            showMessage(chrome.i18n.getMessage("errorMessage") || "Please enter a description", false);
            return;
        }

        // Disable button and show loading state
        addButton.disabled = true;
        addButton.textContent = "Adding...";

        try {
            // Send message to background script
            const response = await chrome.runtime.sendMessage({
                action: 'ADD_PARCEL',
                description: description
            }) as { success: boolean; code?: string; error?: string };

            console.log("Popup received from background:", response);

            // Handle response
            if (response?.success) {
                const successMessage = response.code
                    ? (chrome.i18n.getMessage("successMessageWithCode", [response.code]) || `Parcel added! Code: ${response.code}`)
                    : (chrome.i18n.getMessage("successMessage") || "Parcel added successfully!");
                showMessage(successMessage, true);
                
                // Auto-copy to clipboard
                if (response.code) {
                    void navigator.clipboard.writeText(response.code).then(() => {
                        console.log('Code copied to clipboard');
                    }).catch(err => {
                        console.error('Failed to copy code: ', err);
                    });
                }

                // Clear input
                descriptionInput.value = '';

                // Refresh todo list
                void fetchAndDisplayTodoItems();
            } else {
                // Display specific error message if available
                const errorMessage = response?.error
                    ? response.error
                    : chrome.i18n.getMessage("errorMessage") || "Error adding parcel. Please try again.";
                showMessage(errorMessage, false);
            }
        } catch (error) {
            console.error("Error sending message to background script:", error);
            showMessage(chrome.i18n.getMessage("errorMessage") || "Error adding parcel. Please try again.", false);
        } finally {
            // Re-enable button
            addButton.disabled = false;
            addButton.textContent = chrome.i18n.getMessage("addParcelButton") || "Add Parcel";
        }
    });

    // Allow Enter key to trigger the button
    descriptionInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addButton.click();
        }
    });
});
