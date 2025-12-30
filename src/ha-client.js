/**
 * Home Assistant WebSocket Client
 * Handles connection, authentication, and service calls.
 */
export class HAWebSocket {
    constructor(baseUrl, token) {
        this.baseUrl = baseUrl.replace(/\/$/, "");
        this.token = token;
        this.socket = null;
        this.messageId = 1;
        this.pendingRequests = new Map();
        this.isConnected = false;
        this.isAuthenticated = false;
    }

    async connect() {
        if (this.isConnected && this.isAuthenticated) return;

        return new Promise((resolve, reject) => {
            let wsUrl = this.baseUrl.replace(/^http/, "ws") + "/api/websocket";
            console.log("Connecting to WebSocket:", wsUrl);

            try {
                this.socket = new WebSocket(wsUrl);
            } catch (e) {
                reject(new Error(`Failed to create WebSocket: ${e.message}`));
                return;
            }

            this.socket.onopen = () => {
                console.log("WebSocket connection opened");
                this.isConnected = true;
            };

            this.socket.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleMessage(message, resolve, reject);
                } catch (e) {
                    console.error("Error processing WebSocket message:", e);
                }
            };

            this.socket.onerror = (error) => {
                console.error("WebSocket error:", error);
                this.isConnected = false;
                this.isAuthenticated = false;
                reject(new Error("WebSocket connection error"));
            };

            this.socket.onclose = (event) => {
                console.log("WebSocket connection closed", event.code, event.reason);
                this.isConnected = false;
                this.isAuthenticated = false;
            };
        });
    }

    handleMessage(message, connectResolve, connectReject) {
        // console.log("WS Message received:", message); // Verbose logging

        if (message.type === "auth_required") {
            this.socket.send(JSON.stringify({
                type: "auth",
                access_token: this.token
            }));
        } else if (message.type === "auth_ok") {
            console.log("Authentication successful");
            this.isAuthenticated = true;
            if (connectResolve) connectResolve();
        } else if (message.type === "auth_invalid") {
            console.error("Authentication failed:", message.message);
            this.isAuthenticated = false;
            if (connectReject) connectReject(new Error(`Authentication failed: ${message.message}`));
        } else if (message.type === "result") {
            const req = this.pendingRequests.get(message.id);
            if (req) {
                if (message.success) {
                    req.resolve(message.result);
                } else {
                    req.reject(new Error(message.error ? message.error.message : "Unknown error"));
                }
                this.pendingRequests.delete(message.id);
            }
        }
    }

    async sendRequest(type, payload = {}) {
        await this.connect();

        return new Promise((resolve, reject) => {
            const id = this.messageId++;
            this.pendingRequests.set(id, { resolve, reject });

            const message = {
                id,
                type,
                ...payload
            };

            this.socket.send(JSON.stringify(message));
        });
    }

    async callService(domain, service, serviceData, target = null, returnResponse = false) {
        const payload = {
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
        return this.sendRequest("call_service", payload);
    }

    close() {
        if (this.socket) {
            this.socket.close();
        }
    }
}
