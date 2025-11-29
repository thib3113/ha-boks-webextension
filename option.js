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
}

// 2. Save Logic
const saveOptions = () => {
    const haUrl = document.getElementById('haUrl').value.trim();
    const haToken = document.getElementById('haToken').value.trim();

    chrome.storage.sync.set(
        { haUrl: haUrl, haToken: haToken },
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
        { haUrl: '', haToken: '' },
        (items) => {
            document.getElementById('haUrl').value = items.haUrl;
            document.getElementById('haToken').value = items.haToken;
        }
    );
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    localizeHtmlPage();
    restoreOptions();
    document.getElementById('save').addEventListener('click', saveOptions);
});
