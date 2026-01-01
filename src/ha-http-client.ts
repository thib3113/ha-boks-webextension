
export class HAHttpClient {
    private readonly baseUrl: string;
    private readonly token: string;

    constructor(baseUrl: string, token: string) {
        this.baseUrl = baseUrl.replace(/\/$/, "");
        this.token = token;
    }

    private async fetch<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const url = `${this.baseUrl}/api/${endpoint}`;
        const headers = {
            "Authorization": `Bearer ${this.token}`,
            "Content-Type": "application/json",
            ...options.headers
        };

        const response = await fetch(url, { ...options, headers });

        if (!response.ok) {
            throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
        }

        return await response.json() as T;
    }

    async callService<T = unknown>(domain: string, service: string, serviceData: Record<string, unknown>, target: { entity_id?: string | string[] } | null = null, returnResponse = false): Promise<T> {
        const payload: Record<string, unknown> = {
            ...serviceData
        };

        if (target) {
            if (target.entity_id) {
                payload.entity_id = target.entity_id;
            }
        }

        let url = `services/${domain}/${service}`;
        if (returnResponse) {
            url += "?return_response=true";
        }

        return this.fetch<T>(url, {
            method: "POST",
            body: JSON.stringify(payload)
        });
    }

    async getStates<T = unknown>(): Promise<T> {
        return this.fetch<T>("states");
    }
}
