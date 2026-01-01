import { BoksService, IHAConnection, HAEntity } from './boks-service.js';
import { insertTextIntoActiveElement } from './dom-utils.js';

// Define GM functions with precise types
declare const GM_getValue: (key: string, defaultValue?: string) => string | undefined;
declare const GM_setValue: (key: string, value: string) => void;
declare const GM_registerMenuCommand: (caption: string, commandFunc: () => void) => void;
declare const GM_notification: (details: { text: string, title?: string, timeout?: number, onclick?: () => void }) => void;
declare const GM_setClipboard: (text: string, info?: string) => void;
declare const GM_xmlhttpRequest: (details: {
    method?: string,
    url: string,
    headers?: { [key: string]: string },
    data?: string,
    timeout?: number,
    onload?: (response: { status: number, statusText: string, responseText: string }) => void,
    onerror?: (err: unknown) => void,
    ontimeout?: () => void
}) => void;

// Injected by build script
declare const __MESSAGES__: Record<string, Record<string, string>>;

/**
 * Translation helper
 */
function t(key: string, substitutions?: string | string[]): string {
    // Determine language (simple check)
    const lang = navigator.language.split('-')[0]; // 'fr', 'en', etc.
    
    // @ts-expect-error __MESSAGES__ is injected at build time
    const allMessages = typeof __MESSAGES__ !== 'undefined' ? __MESSAGES__ : {};

    const messages = (allMessages[lang] || allMessages[Object.keys(allMessages)[0]] || {}) as Record<string, string>;

    let message = messages[key] || key;

    if (substitutions) {
        const subs = Array.isArray(substitutions) ? substitutions : [substitutions];
        subs.forEach((sub, i) => {
            message = message.replace(new RegExp(String.raw`$${i + 1}`, 'g'), sub);
        });
    }
    if (typeof substitutions === 'string') {
        message = message.replace(/$[A-Z0-9_]+$/gi, substitutions);
    }
    return message;
}

const HTTP_TIMEOUT = 10000; // 10 seconds

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

    private request<T = unknown>(endpoint: string, options: { method?: string, body?: string, headers?: Record<string, string> } = {}): Promise<T> {
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
                timeout: HTTP_TIMEOUT,
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            resolve(JSON.parse(response.responseText) as T);
                        } catch {
                            resolve(response.responseText as unknown as T);
                        }
                    } else {
                        reject(new Error(t('errorHttp', response.status.toString())));
                    }
                },
                onerror: () => {
                    reject(new Error(t('errorNetwork')));
                },
                ontimeout: () => {
                    reject(new Error(`${t('errorNetwork')} (Timeout ${HTTP_TIMEOUT / 1000}s)`));
                }
            });
        });
    }

    async callService<T = unknown>(domain: string, service: string, serviceData: Record<string, unknown>, target: { entity_id?: string | string[] } | null = null, returnResponse = false): Promise<T> {
        const payload: Record<string, unknown> = { ...serviceData };
        if (target?.entity_id) {
            payload.entity_id = target.entity_id;
        }

        let url = `services/${domain}/${service}`;
        if (returnResponse) {
            url += "?return_response=true";
        }

        return this.request<T>(url, {
            method: "POST",
            body: JSON.stringify(payload)
        });
    }

    async getStates(): Promise<HAEntity[]> {
        return this.request<HAEntity[]>("states");
    }

    close() {}
}

const HA_URL_KEY = 'ha_url';
const HA_TOKEN_KEY = 'ha_token';
const HA_ENTITY_KEY = 'ha_entity_id';

async function configure() {
    const currentUrl = GM_getValue(HA_URL_KEY, "http://homeassistant.local:8123");
    const url = prompt(t('labelUrl'), currentUrl);
    if (url === null) {
        return;
    }
    GM_setValue(HA_URL_KEY, url);

    const currentToken = GM_getValue(HA_TOKEN_KEY, "");
    const token = prompt(t('labelToken'), currentToken);
    if (token === null) {
        return;
    }
    GM_setValue(HA_TOKEN_KEY, token);

    // Try to fetch entities to help the user
    let promptText = t('labelTodoEntity');
    let fetchedEntities: HAEntity[] = [];

    try {
        GM_notification({ text: t('loadingEntities'), title: t('extName'), timeout: 1000 });
        const client = new GMHttpClient(url, token);
        fetchedEntities = await BoksService.getTodoEntities(client);

        // Sort entities: Boks first, then alphabetical
        fetchedEntities.sort((a, b) => {
            if (a.is_boks && !b.is_boks) {
                return -1;
            }
            if (!a.is_boks && b.is_boks) {
                return 1;
            }
            return a.entity_id.localeCompare(b.entity_id);
        });

        if (fetchedEntities.length > 0) {
            const entityList = fetchedEntities.map((e, index) => {
                let label = `${index + 1}. ${e.entity_id} (${e.attributes?.friendly_name || ''})`;
                if (e.is_boks) {
                    label += " [BOKS]";
                }
                return label;
            }).join('\n');
            promptText += `\n\n${entityList}`;
        }
    } catch (e) {
        console.error(e);
    }

    const currentEntity = GM_getValue(HA_ENTITY_KEY, "todo.boks");
    let entityInput = prompt(promptText, currentEntity);
    if (entityInput === null) {
        return;
    }

    const selectionIndex = Number.parseInt(entityInput.trim(), 10);
    if (!Number.isNaN(selectionIndex) && selectionIndex > 0 && selectionIndex <= fetchedEntities.length) {
        entityInput = fetchedEntities[selectionIndex - 1].entity_id;
    }

    GM_setValue(HA_ENTITY_KEY, entityInput || 'todo.boks');

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
    if (!description) {
        return;
    }

    try {
        const client = new GMHttpClient(haUrl, haToken);
        const service = new BoksService(client, entityId);
        const code = await service.addParcel(description);

        if (code) {
            handleSuccess(code);
        } else {
            GM_notification({ text: t('errorMessage'), title: t('extName') });
        }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        GM_notification({ text: `${t('errorNetwork')} : ${message}`, title: t('extName') });
    }
}

function handleSuccess(code: string) {
    const inserted = insertTextIntoActiveElement(code);

    if (!inserted) {
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