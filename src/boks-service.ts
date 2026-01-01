import { HAWebSocket } from './ha-client.js';
import { HAHttpClient } from './ha-http-client.js';

export interface IHAConnection {
    callService(domain: string, service: string, serviceData: any, target: any, returnResponse?: boolean): Promise<any>;
    close?(): void;
    // For WS compatibility if needed, or handle inside specific implementations
    sendRequest?(type: string, payload?: any): Promise<any>; 
}

export class BoksService {
    private ha: IHAConnection;
    private entityId: string;

    constructor(connection: IHAConnection, entityId: string) {
        this.ha = connection;
        this.entityId = entityId;
    }

    async addParcel(description: string): Promise<string | null> {
        try {
            const response = await this.ha.callService("boks", "add_parcel", {
                description: description
            }, { entity_id: this.entityId }, true);

            let code = null;
            
            // Check for direct response object or wrapped
            const respData = (Array.isArray(response) && response.length > 0) ? response[0] : response;

            if (respData && respData.response && respData.response.code) {
                code = respData.response.code;
            } else if (respData && respData.service_response && respData.service_response.code) {
                // Handle REST API return_response=true format
                code = respData.service_response.code;
            } else if (respData && respData.code) {
                code = respData.code;
            } else {
                 if (response.code) code = response.code;
            }
            
            if (!code) {
                 console.warn("[Boks] Could not find code in response:", response);
            }

            return code;
        } finally {
            if (this.ha.close) this.ha.close();
        }
    }

    async getTodoItems(): Promise<any> {
        try {
            // Check if connection supports sendRequest (WebSocket)
            if (this.ha.sendRequest) {
                 return await this.ha.sendRequest("todo/item/list", {
                    entity_id: this.entityId
                });
            } else {
                // Fallback to todo.get_items service (HTTP / GM)
                const response = await this.ha.callService("todo", "get_items", {
                    status: ["needs_action", "completed"]
                }, { entity_id: this.entityId }, true);
                
                if (response && response[this.entityId]) {
                    return { items: response[this.entityId].items };
                }
                return { items: [] };
            }
        } finally {
             if (this.ha.close) this.ha.close();
        }
    }

    async updateTodoItem(uid: string, status: string, summary?: string): Promise<void> {
        try {
            await this.ha.callService("todo", "update_item", {
                item: uid,
                status: status
            }, { entity_id: this.entityId });
        } finally {
             if (this.ha.close) this.ha.close();
        }
    }

    static async getTodoEntities(connection: IHAConnection): Promise<any[]> {
        try {
            let states;
            if (connection.sendRequest) {
                 states = await connection.sendRequest("get_states");
            } else {
                 // For HTTP/GM, we need a way to get states. 
                 // HAHttpClient should implement getStates or we use REST API 'states' endpoint
                 // But IHAConnection is generic.
                 // We can cast if we know the type or add getStates to interface?
                 // Let's assume the connection object passed here knows how to fetch states or we rely on a specific method.
                 // Actually, HAHttpClient has getStates().
                 if ((connection as any).getStates) {
                     states = await (connection as any).getStates();
                 } else {
                     throw new Error("Connection does not support getStates");
                 }
            }
            return states.filter((state: any) => state.entity_id.startsWith("todo."));
        } finally {
            if (connection.close) connection.close();
        }
    }
}
