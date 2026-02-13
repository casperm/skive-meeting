// Shared types for Worker and Client communication

export interface UserInfo {
    id: string;
    name: string;
    joined: boolean;
    tracks: {
        audioEnabled: boolean;
        videoEnabled: boolean;
        sessionId?: string;
        audioTrackName?: string;
        videoTrackName?: string;
    };
}

export interface MeetingState {
    meetingId: string;
    users: UserInfo[];
    whiteboardElements?: unknown[];
}

// Messages from client → server
export type ClientMessage =
    | { type: "userJoin"; name: string }
    | { type: "userUpdate"; user: Partial<UserInfo["tracks"]> }
    | { type: "userLeave" }
    | { type: "heartbeat" }
    | {
        type: "excalidrawUpdate";
        elements: unknown[];
        appState?: Record<string, unknown>;
    }
    | { type: "cursorUpdate"; x: number; y: number; name: string; tool?: "pointer" | "laser"; button?: "up" | "down" };

// Messages from server → client
export type ServerMessage =
    | { type: "roomState"; state: MeetingState }
    | { type: "userJoined"; user: UserInfo }
    | { type: "userLeft"; userId: string }
    | {
        type: "excalidrawUpdate";
        elements: unknown[];
        appState?: Record<string, unknown>;
        from: string;
    }
    | { type: "cursorUpdate"; x: number; y: number; name: string; from: string; tool?: "pointer" | "laser"; button?: "up" | "down" }
    | { type: "error"; error: string };
