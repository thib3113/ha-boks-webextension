import { BoksService, IHAConnection } from './boks-service.js';
import { insertTextIntoActiveElement } from './dom-utils.js';

// Define GM functions
declare const GM_getValue: (key: string, defaultValue?: any) => any;
declare const GM_setValue: (key: string, value: any) => void;
declare const GM_registerMenuCommand: (caption: string, commandFunc: () => void) => void;
declare const GM_notification: (details: { text: string, title?: string, timeout?: number, onclick?: () => void }) => void;
declare const GM_setClipboard: (text: string, info?: string) => void;
declare const GM_xmlhttpRequest: (details: any) => any;

// Injected by build script
declare const __MESSAGES__: { [locale: string]: { [key: string]: string } };

/**
 * GMHttpClient using GM_xmlhttpRequest to bypass CORS
 */
class GMHttpClient implements IHAConnection {
    private baseUrl: string;
    private token: string;

    constructor(baseUrl: string, token: string) {
        this.baseUrl = baseUrl.replace(/\/$/, "");
        this.token = token;
    }

    private request(endpoint: string, options: any = {}): Promise<any> {
        return new Promise((resolve, reject) => {
            const url = `${this.baseUrl}/api/${endpoint}`;
            const headers = {
                "Authorization": `Bearer ${this.token}`,
                "Content-Type": "application/json",
                ...options.headers
            };

            GM_xmlhttpRequest({
                method: options.method || "GET",
                url: url,
                headers: headers,
                data: options.body,
                onload: (response: any) => {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            resolve(JSON.parse(response.responseText));
                        } catch (e) {
                            resolve(response.responseText);
                        }
                    } else {
                        reject(new Error(`HTTP Error ${response.status}: ${response.statusText || response.responseText}`));
                    }
                },
                onerror: (err: any) => {
                    reject(new Error("Network Error"));
                }
            });
        });
    }

    async callService(domain: string, service: string, serviceData: any, target: any = null, returnResponse: boolean = false): Promise<any> {
        const payload: any = { ...serviceData };
        if (target?.entity_id) {
            payload.entity_id = target.entity_id;
        }

        let url = `services/${domain}/${service}`;
        if (returnResponse) {
            url += "?return_response=true";
        }

        return this.request(url, {
            method: "POST",
            body: JSON.stringify(payload)
        });
    }

    // Optional: Implement getStates for BoksService.getTodoEntities compatibility if needed
    // BoksService checks for .getStates or similar? No, IHAConnection doesn't mandate it but BoksService.getTodoEntities might need it.
    // I refactored BoksService to expect .getStates on the connection for HTTP mode.
    async getStates(): Promise<any[]> {
        return this.request("states");
    }

    close() {}
}

/**
 * Translation helper
 */
function t(key: string, substitutions?: string | string[]): string {
    // Determine language (simple check)
    const lang = navigator.language.split('-')[0]; // 'fr', 'en', etc.
    // @ts-ignore
    const allMessages = __MESSAGES__ ? __MESSAGES__ : {};

    const messages = allMessages[lang] || allMessages[Object.keys(allMessages)[0]] || {};

    let message = messages[key] || key;

    if (substitutions) {
        const subs = Array.isArray(substitutions) ? substitutions : [substitutions];
        subs.forEach((sub, i) => {
            message = message.replace(new RegExp(String.raw`\$${i + 1}`, 'g'), sub);
        });
    }
    if (typeof substitutions === 'string') {
        message = message.replace(/\$[A-Z0-9_]+\$/gi, substitutions);
    }
    return message;
}

const HA_URL_KEY = 'ha_url';
const HA_TOKEN_KEY = 'ha_token';
const HA_ENTITY_KEY = 'ha_entity_id';

async function configure() {
    const currentUrl = GM_getValue(HA_URL_KEY, "http://homeassistant.local:8123");
    const url = prompt(t('labelUrl'), currentUrl);
    if (url === null) return;

    const currentToken = GM_getValue(HA_TOKEN_KEY, "");
    const token = prompt(t('labelToken'), currentToken);
    if (token === null) return;

    // Try to fetch entities to help the user
    let promptText = t('labelTodoEntity');
    let fetchedEntities: any[] = [];

    try {
        GM_notification({ text: t('loadingEntities'), title: t('extName'), timeout: 1000 });
        const client = new GMHttpClient(url, token);
        fetchedEntities = await BoksService.getTodoEntities(client);

        if (fetchedEntities.length > 0) {
            const entityList = fetchedEntities.map((e: any, index: number) => `${index + 1}. ${e.entity_id} (${e.attributes.friendly_name || ''})`).join('\n');
            promptText += `\n\n${entityList}`;
        }
    } catch (e) {
        console.error(e);
    }

    const currentEntity = GM_getValue(HA_ENTITY_KEY, "todo.boks");
    let entityInput = prompt(promptText, currentEntity);
    if (entityInput === null) return;

    const selectionIndex = Number.parseInt(entityInput.trim(), 10);
    if (!Number.isNaN(selectionIndex) && selectionIndex > 0 && selectionIndex <= fetchedEntities.length) {
        entityInput = fetchedEntities[selectionIndex - 1].entity_id;
    }

    GM_setValue(HA_URL_KEY, url);
    GM_setValue(HA_TOKEN_KEY, token);
    GM_setValue(HA_ENTITY_KEY, entityInput);

    GM_notification({
        text: t('msgSaved'),
        title: t('extName'),
        timeout: 2000
    });
}

async function addParcel() {
    const haUrl = GM_getValue(HA_URL_KEY);
    const haToken = GM_getValue(HA_TOKEN_KEY);
    const entityId = GM_getValue(HA_ENTITY_KEY);

    if (!haUrl || !haToken || !entityId) {
        GM_notification({
            text: t('errorConfig'),
            title: t('extName')
        });
        configure();
        return;
    }

    const description = prompt(t('promptMessage'), t('promptDefault'));
    if (!description) return;

    try {
        const client = new GMHttpClient(haUrl, haToken);
        const service = new BoksService(client, entityId);
        const code = await service.addParcel(description);

        if (code) {
            handleSuccess(code);
        } else {
            GM_notification({ text: t('errorMessage'), title: t('extName') });
        }
    } catch (e: any) {
        console.error(e);
        GM_notification({ text: `${t('errorNetwork')} : ${e.message}`, title: t('extName') });
    }
}

function handleSuccess(code: string) {
    const inserted = insertTextIntoActiveElement(code);

    if (inserted) {
         // Optional
    } else {
        GM_setClipboard(code, "text");
        GM_notification({
            text: `${t('successMessageWithCode', code)} (Clipboard)`,
            title: t('extName')
        });
    }
}

// Register Menu Commands
GM_registerMenuCommand(t('menuTitle'), addParcel);
GM_registerMenuCommand(t('openOptionsButton'), configure);
