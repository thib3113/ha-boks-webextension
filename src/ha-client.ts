/**
 * Home Assistant WebSocket Client
 * Handles connection, authentication, and service calls.
 */

interface HAMessage {
    id?: number;
    type: string;
    success?: boolean;
    result?: unknown;
    error?: { message: string };
    message?: string;
    [key: string]: unknown;
}

interface PendingRequest {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
}

export class HAWebSocket {
    private readonly baseUrl: string;
    private readonly token: string;
    private socket: WebSocket | null;
    private messageId: number;
    private readonly pendingRequests: Map<number, PendingRequest>;
    public isConnected: boolean;
    public isAuthenticated: boolean;

    constructor(baseUrl: string, token: string) {
        this.baseUrl = baseUrl.replace(/\/$/, "");
        this.token = token;
        this.socket = null;
        this.messageId = 1;
        this.pendingRequests = new Map();
        this.isConnected = false;
        this.isAuthenticated = false;
    }

    async connect(): Promise<void> {
        if (this.isConnected && this.isAuthenticated) {
            return;
        }

        return new Promise((resolve, reject) => {
            const wsUrl = this.baseUrl.replace(/^http/, "ws") + "/api/websocket";
            console.log("Connecting to WebSocket:", wsUrl);

            try {
                this.socket = new WebSocket(wsUrl);
            } catch (e: unknown) {
                const message = e instanceof Error ? e.message : String(e);
                reject(new Error(`Failed to create WebSocket: ${message}`));
                return;
            }

            this.socket.onopen = () => {
                console.log("WebSocket connection opened");
                this.isConnected = true;
            };

            this.socket.onmessage = (event: MessageEvent) => {
                try {
                    const message = JSON.parse(event.data as string) as HAMessage;
                    this.handleMessage(message, resolve, reject);
                } catch (e) {
                    console.error("Error processing WebSocket message:", e);
                }
            };

            this.socket.onerror = () => {
                console.error("WebSocket error");
                this.isConnected = false;
                this.isAuthenticated = false;
                reject(new Error("WebSocket connection error"));
            };

            this.socket.onclose = (event: CloseEvent) => {
                console.log("WebSocket connection closed", event.code, event.reason);
                this.isConnected = false;
                this.isAuthenticated = false;
            };
        });
    }

    private handleMessage(message: HAMessage, connectResolve?: () => void, connectReject?: (reason: Error) => void) {
        if (message.type === "auth_required") {
            this.socket?.send(JSON.stringify({
                type: "auth",
                access_token: this.token
            }));
        } else if (message.type === "auth_ok") {
            console.log("Authentication successful");
            this.isAuthenticated = true;
            if (connectResolve) {
                connectResolve();
            }
        } else if (message.type === "auth_invalid") {
            console.error("Authentication failed:", message.message);
            this.isAuthenticated = false;
            if (connectReject) {
                connectReject(new Error(`Authentication failed: ${message.message}`));
            }
        } else if (message.type === "result") {
            const req = this.pendingRequests.get(message.id!);
            if (req) {
                if (message.success) {
                    req.resolve(message.result);
                } else {
                    req.reject(new Error(message.error?.message || "Unknown error"));
                }
                this.pendingRequests.delete(message.id!);
            }
        }
    }

    async sendRequest<T = unknown>(type: string, payload: Record<string, unknown> = {}): Promise<T> {
        await this.connect();

        return new Promise((resolve, reject) => {
            const id = this.messageId++;
            this.pendingRequests.set(id, { 
                resolve: (val: unknown) => resolve(val as T), 
                reject 
            });

            const message = {
                id,
                type,
                ...payload
            };

            this.socket?.send(JSON.stringify(message));
        });
    }

    async callService<T = unknown>(domain: string, service: string, serviceData: Record<string, unknown>, target: { entity_id?: string | string[] } | null = null, returnResponse = false): Promise<T> {
        const payload: Record<string, unknown> = {
            domain,
            service,
            service_data: serviceData
        };
        if (target) {
            payload.target = target;
        }
        if (returnResponse) {
            payload.return_response = true;
        }
        return this.sendRequest<T>("call_service", payload);
    }

    close() {
        if (this.socket) {
            this.socket.close();
        }
    }
}
