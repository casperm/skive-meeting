"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { ClientMessage, ServerMessage, MeetingState } from "@/worker/types";

interface UseWebSocketOptions {
    meetingId: string;
    userName: string;
    onRoomState?: (state: MeetingState) => void;
    onExcalidrawUpdate?: (elements: unknown[], appState?: Record<string, unknown>, from?: string) => void;
    onCursorUpdate?: (x: number, y: number, name: string, from: string, tool?: "pointer" | "laser", button?: "up" | "down") => void;
    onError?: (error: string) => void;
}

export function useWebSocket({
    meetingId,
    userName,
    onRoomState,
    onExcalidrawUpdate,
    onCursorUpdate,
    onError,
}: UseWebSocketOptions) {
    const wsRef = useRef<WebSocket | null>(null);
    const [connected, setConnected] = useState(false);
    const heartbeatRef = useRef<ReturnType<typeof setInterval>>(undefined);
    const reconnectRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const callbacksRef = useRef({ onRoomState, onExcalidrawUpdate, onCursorUpdate, onError });

    // Keep refs fresh
    callbacksRef.current = { onRoomState, onExcalidrawUpdate, onCursorUpdate, onError };

    const sendMessage = useCallback((msg: ClientMessage) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(msg));
        }
    }, []);

    const connect = useCallback(() => {
        if (!meetingId || !userName) return;

        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/api/meetings/${meetingId}/websocket`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            setConnected(true);
            // Join the meeting
            sendMessage({ type: "userJoin", name: userName });

            // Start heartbeat
            heartbeatRef.current = setInterval(() => {
                sendMessage({ type: "heartbeat" });
            }, 10_000);
        };

        ws.onmessage = (event) => {
            try {
                const msg: ServerMessage = JSON.parse(event.data);
                switch (msg.type) {
                    case "roomState":
                        callbacksRef.current.onRoomState?.(msg.state);
                        break;
                    case "excalidrawUpdate":
                        callbacksRef.current.onExcalidrawUpdate?.(msg.elements, msg.appState, msg.from);
                        break;
                    case "cursorUpdate":
                        callbacksRef.current.onCursorUpdate?.(msg.x, msg.y, msg.name, msg.from, msg.tool, msg.button);
                        break;
                    case "error":
                        callbacksRef.current.onError?.(msg.error);
                        break;
                }
            } catch {
                // ignore parse errors
            }
        };

        ws.onclose = () => {
            setConnected(false);
            if (heartbeatRef.current) clearInterval(heartbeatRef.current);
            // Auto-reconnect after 2s
            reconnectRef.current = setTimeout(() => {
                connect();
            }, 2000);
        };

        ws.onerror = () => {
            ws.close();
        };
    }, [meetingId, userName, sendMessage]);

    // Connect on mount
    useEffect(() => {
        connect();

        // Cleanup on beforeunload
        const handleBeforeUnload = () => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: "userLeave" }));
                wsRef.current.close();
            }
        };

        window.addEventListener("beforeunload", handleBeforeUnload);

        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
            if (heartbeatRef.current) clearInterval(heartbeatRef.current);
            if (reconnectRef.current) clearTimeout(reconnectRef.current);
            if (wsRef.current) {
                wsRef.current.onclose = null; // prevent reconnect
                if (wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ type: "userLeave" }));
                }
                wsRef.current.close();
            }
        };
    }, [connect]);

    return { connected, sendMessage };
}
