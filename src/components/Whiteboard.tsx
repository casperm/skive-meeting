"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { X, Presentation } from "lucide-react";

// Collaborator data for rendering remote cursors
interface CollaboratorData {
    pointer: { x: number; y: number; tool: "pointer" | "laser" };
    username: string;
    button?: "up" | "down";
    color?: { background: string; stroke: string };
}

interface WhiteboardProps {
    onClose: () => void;
    onSceneChange?: (elements: unknown[]) => void;
    remoteElements?: unknown[];
    initialElements?: unknown[];
    onPointerUpdate?: (x: number, y: number, tool: "pointer" | "laser", button: "up" | "down") => void;
    collaborators?: Map<string, CollaboratorData>;
}

// Cursor colors for collaborators
const CURSOR_COLORS = [
    { background: "#FF6B6B", stroke: "#C0392B" },
    { background: "#4ECDC4", stroke: "#16A085" },
    { background: "#FFD93D", stroke: "#F39C12" },
    { background: "#6C5CE7", stroke: "#341F97" },
    { background: "#FF9FF3", stroke: "#C44569" },
    { background: "#54A0FF", stroke: "#2E86DE" },
];

// Excalidraw element shape (subset of the fields we use for merging)
interface ExcalidrawEl {
    id: string;
    version: number;
    versionNonce?: number;
    isDeleted?: boolean;
    [key: string]: unknown;
}

/**
 * Merge remote elements into local elements by element ID.
 * For each element: keep the one with the higher `version`.
 * This supports simultaneous drawing — neither side overwrites the other.
 */
function mergeElements(local: ExcalidrawEl[], remote: ExcalidrawEl[]): ExcalidrawEl[] {
    const merged = new Map<string, ExcalidrawEl>();

    // Start with all local elements
    for (const el of local) {
        merged.set(el.id, el);
    }

    // Merge in remote elements (higher version wins)
    for (const el of remote) {
        const existing = merged.get(el.id);
        if (!existing || el.version > existing.version) {
            merged.set(el.id, el);
        }
    }

    return Array.from(merged.values());
}

export function Whiteboard({
    onClose,
    onSceneChange,
    remoteElements,
    initialElements,
    onPointerUpdate,
    collaborators,
}: WhiteboardProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const excalidrawRef = useRef<unknown>(null);
    const [ExcalidrawComp, setExcalidrawComp] = useState<React.ComponentType<Record<string, unknown>> | null>(null);

    // Readiness flag: suppress onChange during initialization
    const readyRef = useRef(false);
    // Flag to suppress onChange when we're applying a remote merge
    const applyingRemoteRef = useRef(false);

    // Dynamically import Excalidraw (client-side only)
    useEffect(() => {
        if (typeof window !== "undefined") {
            (window as any).process = { env: { NODE_ENV: "production" } };
            (window as any).global = window;

            // Load Excalidraw's CSS
            if (!document.getElementById("excalidraw-css")) {
                try {
                    const cssText = require("@excalidraw/excalidraw/index.css");
                    if (typeof cssText === "string") {
                        const style = document.createElement("style");
                        style.id = "excalidraw-css";
                        style.textContent = cssText;
                        document.head.appendChild(style);
                    } else if (cssText && cssText.default) {
                        const style = document.createElement("style");
                        style.id = "excalidraw-css";
                        style.textContent = cssText.default;
                        document.head.appendChild(style);
                    }
                } catch {
                    const link = document.createElement("link");
                    link.id = "excalidraw-css";
                    link.rel = "stylesheet";
                    link.href = "/_next/static/css/excalidraw.css";
                    document.head.appendChild(link);
                }
            }
        }

        import("@excalidraw/excalidraw").then((mod) => {
            setExcalidrawComp(() => mod.Excalidraw);
            // Delay readiness to let Excalidraw fire its initial onChange events
            setTimeout(() => {
                readyRef.current = true;
            }, 2000);
        });
    }, []);

    // onChange handler — broadcasts local drawing changes
    const handleChange = useCallback(
        (elements: readonly unknown[]) => {
            // Skip during init or when we're applying a remote update
            if (!readyRef.current || applyingRemoteRef.current) return;
            // Skip empty scenes
            if ((elements as unknown[]).length === 0) return;

            onSceneChange?.(elements as unknown[]);
        },
        [onSceneChange]
    );

    // Handle local pointer movement — throttled broadcast
    const lastPointerBroadcast = useRef(0);
    const handlePointerUpdate = useCallback(
        (payload: {
            pointer: { x: number; y: number; tool: "pointer" | "laser" };
            button: "down" | "up";
        }) => {
            const now = Date.now();
            // Throttle to ~20 updates/sec (every 50ms)
            if (now - lastPointerBroadcast.current < 50) return;
            lastPointerBroadcast.current = now;

            onPointerUpdate?.(
                payload.pointer.x,
                payload.pointer.y,
                payload.pointer.tool,
                payload.button
            );
        },
        [onPointerUpdate]
    );

    // Merge remote elements into the local scene (preserves both sides' drawings)
    useEffect(() => {
        if (!remoteElements || remoteElements.length === 0 || !excalidrawRef.current) return;

        const api = excalidrawRef.current as any;
        const localElements = api.getSceneElements() as ExcalidrawEl[];
        const merged = mergeElements(localElements, remoteElements as ExcalidrawEl[]);

        // Only update if there's actually something new
        if (merged.length === localElements.length) {
            // Quick check: if all IDs and versions match, skip the update
            const localMap = new Map(localElements.map((e) => [e.id, e.version]));
            const hasChanges = merged.some((e) => localMap.get(e.id) !== e.version);
            if (!hasChanges) return;
        }

        applyingRemoteRef.current = true;
        api.updateScene({ elements: merged });
        // Re-enable onChange after Excalidraw processes the update
        requestAnimationFrame(() => {
            applyingRemoteRef.current = false;
        });
    }, [remoteElements]);

    // Update collaborator cursors on the scene
    useEffect(() => {
        if (!collaborators || !excalidrawRef.current) return;

        const excalidrawCollabs = new Map();
        let colorIdx = 0;
        for (const [id, collab] of collaborators) {
            excalidrawCollabs.set(id, {
                pointer: {
                    x: collab.pointer.x,
                    y: collab.pointer.y,
                    tool: collab.pointer.tool || "pointer",
                    renderCursor: true,
                },
                button: collab.button || "up",
                username: collab.username,
                color: collab.color || CURSOR_COLORS[colorIdx % CURSOR_COLORS.length],
                isCurrentUser: false,
            });
            colorIdx++;
        }
        (excalidrawRef.current as any).updateScene({
            collaborators: excalidrawCollabs,
        });
    }, [collaborators]);

    return (
        <div className="whiteboard-panel">
            <div className="whiteboard-header">
                <h3><Presentation size={18} style={{ marginRight: "8px", verticalAlign: "middle" }} /> Collaborative Whiteboard</h3>
                <button className="whiteboard-close" onClick={onClose}>
                    <X size={18} />
                </button>
            </div>
            <div className="whiteboard-content" ref={containerRef}>
                {ExcalidrawComp && (
                    <ExcalidrawComp
                        excalidrawAPI={(api: unknown) => {
                            excalidrawRef.current = api;
                        }}
                        initialData={
                            initialElements && initialElements.length > 0
                                ? { elements: initialElements }
                                : undefined
                        }
                        onChange={handleChange}
                        onPointerUpdate={handlePointerUpdate}
                        isCollaborating={true}
                        UIOptions={{
                            canvasActions: {
                                loadScene: false,
                                export: false,
                            },
                        }}
                        theme="light"
                    />
                )}
            </div>
        </div>
    );
}
