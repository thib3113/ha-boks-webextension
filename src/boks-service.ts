export interface HAEntity {
    entity_id: string;
    state: string;
    attributes: {
        friendly_name?: string;
        todo_items?: HATodoItem[];
        [key: string]: unknown;
    };
    is_boks?: boolean;
    boks_device_name?: string;
}

export interface HATodoItem {
    uid: string;
    summary: string;
    status: 'needs_action' | 'completed';
}

export interface HAServiceResponse {
    response?: {
        code?: string;
        [key: string]: unknown;
    };
    service_response?: {
        code?: string;
        [key: string]: unknown;
    };
    code?: string;
    [key: string]: unknown;
}

export interface HARegistryDevice {
    id: string;
    name: string;
    manufacturer: string;
    identifiers: string[][];
}

export interface HARegistryEntity {
    entity_id: string;
    device_id: string;
}

export interface IHAConnection {
    callService(domain: string, service: string, serviceData: Record<string, unknown>, target: { entity_id?: string | string[] } | null, returnResponse?: boolean): Promise<HAServiceResponse | HAServiceResponse[]>;
    close?(): void;
    sendRequest<T = unknown>(type: string, payload?: Record<string, unknown>): Promise<T>;
}

interface IHAConnectionWithStates extends IHAConnection {
    getStates(): Promise<HAEntity[]>;
}

function hasGetStates(connection: IHAConnection): connection is IHAConnectionWithStates {
    return 'getStates' in connection && typeof (connection as Record<string, unknown>).getStates === 'function';
}

export class BoksService {
    private readonly ha: IHAConnection;
    private readonly entityId: string;

    constructor(connection: IHAConnection, entityId: string) {
        this.ha = connection;
        this.entityId = entityId;
    }

    async addParcel(description: string): Promise<string | null> {
        try {
            const response = await this.ha.callService("boks", "add_parcel", {
                description: description
            }, { entity_id: this.entityId }, true);

            let code: string | null = null;

            // Check for direct response object or wrapped
            const respData = Array.isArray(response) ? (response[0] as HAServiceResponse) : (response as HAServiceResponse);

            if (respData?.response?.code) {
                code = respData.response.code;
            } else if (respData?.service_response?.code) {
                // Handle REST API return_response=true format
                code = respData.service_response.code;
            } else if (respData?.code) {
                code = respData.code;
            }

            if (!code) {
                 console.warn("[Boks] Could not find code in response:", response);
            }

            return code;
        } finally {
            if (this.ha.close) {
                this.ha.close();
            }
        }
    }

    async getTodoItems(): Promise<{ items: HATodoItem[] }> {
        try {
            // Check if connection supports sendRequest (WebSocket)
            if (this.ha.sendRequest) {
                 return await this.ha.sendRequest<{ items: HATodoItem[] }>("todo/item/list", {
                    entity_id: this.entityId
                });
            } else {
                // Fallback to todo.get_items service (HTTP / GM)
                const response = await this.ha.callService("todo", "get_items", {
                    status: ["needs_action", "completed"]
                }, { entity_id: this.entityId }, true) as Record<string, { items: HATodoItem[] }>;

                if (response?.[this.entityId]) {
                    return { items: response[this.entityId].items };
                }
                return { items: [] };
            }
        } finally {
             if (this.ha.close) {
                 this.ha.close();
             }
        }
    }

    async updateTodoItem(uid: string, status: string): Promise<void> {
        try {
            await this.ha.callService("todo", "update_item", {
                item: uid,
                status: status
            }, { entity_id: this.entityId });
        } finally {
             if (this.ha.close) {
                 this.ha.close();
             }
        }
    }

    static async getTodoEntities(connection: IHAConnection): Promise<HAEntity[]> {
        try {
            let states: HAEntity[];
            if (connection.sendRequest) {
                 states = await connection.sendRequest<HAEntity[]>("get_states");
            } else {
                 if (hasGetStates(connection)) {
                     states = await connection.getStates();
                 } else {
                     throw new Error("Connection does not support getStates");
                 }
            }
            const todoStates = states.filter((state) => state.entity_id.startsWith("todo."));

            // 1. Basic Text-based Detection (Works for REST & WebSocket)
            todoStates.forEach((state) => {
                const id = state.entity_id.toLowerCase();
                const name = state.attributes?.friendly_name?.toLowerCase() || "";
                if (id.includes('boks') || name.includes('boks')) {
                    state.is_boks = true;
                }
            });

            // 2. Enrich with Registry Data if possible (WebSocket only - More precise)
            if (connection.sendRequest) {
                try {
                    const [devices, entities] = await Promise.all([
                        connection.sendRequest<HARegistryDevice[]>('config/device_registry/list'),
                        connection.sendRequest<HARegistryEntity[]>('config/entity_registry/list')
                    ]);

                    const boksDeviceIds = new Set(
                        devices
                            .filter((d) => 
                                d.manufacturer === 'Boks' || 
                                (d.identifiers?.some((id) => id[0].toLowerCase() === 'boks'))
                            )
                            .map((d) => d.id)
                    );

                    todoStates.forEach((state) => {
                        const regEntity = entities.find((e) => e.entity_id === state.entity_id);
                        if (regEntity && boksDeviceIds.has(regEntity.device_id)) {
                             state.is_boks = true; // Confirmed via registry
                             const device = devices.find((d) => d.id === regEntity.device_id);
                             if (device) {
                                 state.boks_device_name = device.name;
                             }
                        }
                    });
                } catch (e) {
                    console.warn("Failed to query registry:", e);
                }
            }

            return todoStates;
        } finally {
            if (connection.close) {
                connection.close();
            }
        }
    }
}