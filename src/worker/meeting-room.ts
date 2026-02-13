import type { UserInfo, ClientMessage, ServerMessage } from "./types";

interface Env {
    CALLS_APP_ID: string;
    CALLS_APP_SECRET: string;
    MEETING_ROOM: DurableObjectNamespace;
}

const HEARTBEAT_TIMEOUT = 30_000; // 30s
const ALARM_INTERVAL = 15_000; // 15s

/**
 * Generates a meeting ID in the format "xxx-yyy-zzz-www"
 * where each group is 3 alphanumeric characters (lowercase).
 */
function generateMeetingId(): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    const groups: string[] = [];
    for (let g = 0; g < 4; g++) {
        let group = "";
        for (let i = 0; i < 3; i++) {
            group += chars[Math.floor(Math.random() * chars.length)];
        }
        groups.push(group);
    }
    return groups.join("-");
}

/**
 * MeetingRoom Durable Object
 *
 * Manages a single video meeting room:
 * - WebSocket connections for signaling
 * - User state (name, tracks, heartbeat)
 * - Excalidraw scene relay
 * - Auto-cleanup when all users leave
 */
export class MeetingRoom implements DurableObject {
    private state: DurableObjectState;
    private env: Env;
    private sessions: Map<WebSocket, string> = new Map(); // ws → connectionId

    constructor(state: DurableObjectState, env: Env) {
        this.state = state;
        this.env = env;
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname === "/websocket") {
            if (request.headers.get("Upgrade") !== "websocket") {
                return new Response("Expected WebSocket", { status: 426 });
            }

            const pair = new WebSocketPair();
            const [client, server] = Object.values(pair);

            await this.handleWebSocket(server, url);

            return new Response(null, { status: 101, webSocket: client });
        }

        if (url.pathname === "/exists") {
            const meetingId = await this.state.storage.get<string>("meetingId");
            return Response.json({ exists: !!meetingId });
        }

        if (url.pathname === "/create") {
            let meetingId = await this.state.storage.get<string>("meetingId");
            if (!meetingId) {
                meetingId = generateMeetingId();
                await this.state.storage.put("meetingId", meetingId);
            }
            return Response.json({ meetingId });
        }

        return new Response("Not Found", { status: 404 });
    }

    private async handleWebSocket(ws: WebSocket, url: URL): Promise<void> {
        this.state.acceptWebSocket(ws);

        const connectionId = crypto.randomUUID();
        this.sessions.set(ws, connectionId);

        // Start alarm if not running
        const currentAlarm = await this.state.storage.getAlarm();
        if (!currentAlarm) {
            await this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL);
        }

        // Store heartbeat immediately
        await this.state.storage.put(`heartbeat-${connectionId}`, Date.now());
    }

    async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
        if (typeof message !== "string") return;

        try {
            const data: ClientMessage = JSON.parse(message);
            const connectionId = this.sessions.get(ws);
            if (!connectionId) return;

            switch (data.type) {
                case "userJoin": {
                    const user: UserInfo = {
                        id: connectionId,
                        name: data.name,
                        joined: true,
                        tracks: {
                            audioEnabled: false,
                            videoEnabled: false,
                        },
                    };
                    await this.state.storage.put(`session-${connectionId}`, user);
                    await this.state.storage.put(`heartbeat-${connectionId}`, Date.now());
                    await this.broadcastRoomState();
                    break;
                }

                case "userUpdate": {
                    const user = await this.state.storage.get<UserInfo>(`session-${connectionId}`);
                    if (user) {
                        user.tracks = { ...user.tracks, ...data.user };
                        await this.state.storage.put(`session-${connectionId}`, user);
                        await this.broadcastRoomState();
                    }
                    break;
                }

                case "userLeave": {
                    ws.close(1000, "User left");
                    this.sessions.delete(ws);
                    await this.state.storage.delete(`session-${connectionId}`);
                    await this.state.storage.delete(`heartbeat-${connectionId}`);
                    await this.broadcastRoomState();
                    await this.checkEmpty();
                    break;
                }

                case "heartbeat": {
                    await this.state.storage.put(`heartbeat-${connectionId}`, Date.now());
                    break;
                }

                case "excalidrawUpdate": {
                    // Persist the whiteboard state to storage
                    await this.state.storage.put("whiteboardElements", data.elements);

                    // Relay to all other participants
                    const msg: ServerMessage = {
                        type: "excalidrawUpdate",
                        elements: data.elements,
                        appState: data.appState,
                        from: connectionId,
                    };
                    const msgStr = JSON.stringify(msg);
                    for (const socket of this.state.getWebSockets()) {
                        if (socket !== ws) {
                            try {
                                socket.send(msgStr);
                            } catch {
                                // Socket may be closed
                            }
                        }
                    }
                    break;
                }

                case "cursorUpdate": {
                    // Relay cursor position to all other participants
                    const cursorMsg: ServerMessage = {
                        type: "cursorUpdate",
                        x: data.x,
                        y: data.y,
                        name: data.name,
                        from: connectionId,
                        tool: data.tool,
                        button: data.button,
                    };
                    const cursorStr = JSON.stringify(cursorMsg);
                    for (const socket of this.state.getWebSockets()) {
                        if (socket !== ws) {
                            try {
                                socket.send(cursorStr);
                            } catch {
                                // Socket may be closed
                            }
                        }
                    }
                    break;
                }
            }
        } catch (err) {
            console.error("Error handling message:", err);
            try {
                ws.send(JSON.stringify({ type: "error", error: "Invalid message" }));
            } catch {
                // ignore
            }
        }
    }

    async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
        const connectionId = this.sessions.get(ws);
        if (connectionId) {
            this.sessions.delete(ws);
            await this.state.storage.delete(`session-${connectionId}`);
            await this.state.storage.delete(`heartbeat-${connectionId}`);
            await this.broadcastRoomState();
            await this.checkEmpty();
        }
    }

    async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
        const connectionId = this.sessions.get(ws);
        if (connectionId) {
            this.sessions.delete(ws);
            await this.state.storage.delete(`session-${connectionId}`);
            await this.state.storage.delete(`heartbeat-${connectionId}`);
            await this.broadcastRoomState();
        }
    }

    private async broadcastRoomState(): Promise<void> {
        const meetingId = (await this.state.storage.get<string>("meetingId")) || "";
        const users = await this.getUsers();
        const whiteboardElements = await this.state.storage.get<unknown[]>("whiteboardElements");

        const msg: ServerMessage = {
            type: "roomState",
            state: {
                meetingId,
                users: [...users.values()],
                whiteboardElements: whiteboardElements || undefined,
            },
        };

        const msgStr = JSON.stringify(msg);
        for (const socket of this.state.getWebSockets()) {
            try {
                socket.send(msgStr);
            } catch {
                // Socket may be closed
            }
        }
    }

    private async getUsers(): Promise<Map<string, UserInfo>> {
        return this.state.storage.list<UserInfo>({ prefix: "session-" });
    }

    private async checkEmpty(): Promise<void> {
        const users = await this.getUsers();
        if (users.size === 0) {
            const meetingId = await this.state.storage.get<string>("meetingId");
            if (meetingId) {
                console.log(`Meeting ${meetingId} ended — all users left`);
                await this.state.storage.deleteAll();
            }
        }
    }

    async alarm(): Promise<void> {
        // Cleanup stale connections (no heartbeat for > HEARTBEAT_TIMEOUT)
        const now = Date.now();
        const users = await this.getUsers();
        let removedAny = false;

        for (const [key] of users) {
            const connectionId = key.replace("session-", "");
            const heartbeat = await this.state.storage.get<number>(`heartbeat-${connectionId}`);
            if (!heartbeat || heartbeat + HEARTBEAT_TIMEOUT < now) {
                await this.state.storage.delete(key);
                await this.state.storage.delete(`heartbeat-${connectionId}`);
                removedAny = true;

                // Close the websocket if still open
                for (const [ws, id] of this.sessions) {
                    if (id === connectionId) {
                        try { ws.close(1011, "Heartbeat timeout"); } catch { /* ignore */ }
                        this.sessions.delete(ws);
                        break;
                    }
                }
            }
        }

        if (removedAny) {
            await this.broadcastRoomState();
        }

        // Check if room is now empty
        const remainingUsers = await this.getUsers();
        if (remainingUsers.size === 0) {
            const meetingId = await this.state.storage.get<string>("meetingId");
            if (meetingId) {
                console.log(`Meeting ${meetingId} cleaned up by alarm`);
                await this.state.storage.deleteAll();
            }
        } else {
            // Re-schedule alarm
            await this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL);
        }
    }
}
