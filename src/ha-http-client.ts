
export class HAHttpClient {
    private readonly baseUrl: string;
    private readonly token: string;

    constructor(baseUrl: string, token: string) {
        this.baseUrl = baseUrl.replace(/\/$/, "");
        this.token = token;
    }

    private async fetch(endpoint: string, options: RequestInit = {}): Promise<any> {
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

        return response.json();
    }

    async callService(domain: string, service: string, serviceData: any, target: any = null, returnResponse: boolean = false): Promise<any> {
        const payload: any = {
            ...serviceData
        };

        if (target) {
            // Flatten target into payload if needed, or send as separate object
            // HA REST API expects target in the body, but mixed with data?
            // Actually usually it's { entity_id: "..." } inside the body for simple calls.
            // If target is complex object:
            if (target.entity_id) {
                payload.entity_id = target.entity_id;
            }
        }

        return this.fetch(`services/${domain}/${service}`, {
            method: "POST",
            body: JSON.stringify(payload)
        });
    }

    async getStates(): Promise<any[]> {
        return this.fetch("states");
    }
}
