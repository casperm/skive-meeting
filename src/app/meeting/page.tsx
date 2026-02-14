"use client";

import { useState, useCallback, useRef, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Copy, Users, QrCode } from "lucide-react";
import { VideoTile } from "@/components/VideoTile";
import { ControlsBar } from "@/components/ControlsBar";
import { Whiteboard } from "@/components/Whiteboard";
import { QRCodeModal } from "@/components/QRCodeModal";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useMediaDevices } from "@/hooks/useMediaDevices";
import { useCallsSfu } from "@/hooks/useCallsSfu";
import type { MeetingState, UserInfo } from "@/worker/types";

function MeetingRoomInner() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const meetingId = (searchParams.get("id") || "").toLowerCase();

    // User state
    const [userName, setUserName] = useState("");
    const [nameSubmitted, setNameSubmitted] = useState(false);
    const [nameInput, setNameInput] = useState("");
    const [copied, setCopied] = useState(false);

    // Meeting state
    const [roomState, setRoomState] = useState<MeetingState | null>(null);
    const [whiteboardOpen, setWhiteboardOpen] = useState(false);
    const [qrModalOpen, setQrModalOpen] = useState(false);
    const [remoteElements, setRemoteElements] = useState<unknown[] | undefined>();
    const [initialWhiteboardElements, setInitialWhiteboardElements] = useState<unknown[] | undefined>();
    const initialElementsLoadedRef = useRef(false);

    // Cursor collaboration state
    const [remoteCollaborators, setRemoteCollaborators] = useState<Map<string, {
        pointer: { x: number; y: number; tool: "pointer" | "laser" };
        username: string;
        button?: "up" | "down";
    }>>(new Map());

    // Media
    const {
        stream: localStream,
        audioEnabled,
        videoEnabled,
        startMedia,
        toggleAudio,
        toggleVideo,
        stopMedia,
    } = useMediaDevices();

    // Calls SFU
    const {
        sessionId: sfuSessionId,
        remoteStreams,
        createSession,
        pushLocalTracks,
        pullRemoteTracks,
        stopRemoteStream,
        cleanup: cleanupSfu,
    } = useCallsSfu();

    // Track previous users for diffing remote tracks
    const prevUsersRef = useRef<UserInfo[]>([]);

    // WebSocket handlers
    const handleRoomState = useCallback((state: MeetingState) => {
        setRoomState(state);
        // Capture whiteboard state from the first roomState for initial load
        if (!initialElementsLoadedRef.current && state.whiteboardElements && state.whiteboardElements.length > 0) {
            setInitialWhiteboardElements(state.whiteboardElements);
            initialElementsLoadedRef.current = true;
        }
    }, []);

    const handleExcalidrawUpdate = useCallback(
        (elements: unknown[]) => {
            setRemoteElements(elements);
        },
        []
    );

    // Handle remote cursor updates
    const handleCursorUpdate = useCallback(
        (x: number, y: number, name: string, from: string, tool?: "pointer" | "laser", button?: "up" | "down") => {
            setRemoteCollaborators((prev) => {
                const next = new Map(prev);
                next.set(from, {
                    pointer: { x, y, tool: tool || "pointer" },
                    username: name,
                    button: button || "up",
                });
                return next;
            });
        },
        []
    );

    // WebSocket
    const { connected, sendMessage } = useWebSocket({
        meetingId: nameSubmitted ? meetingId : "",
        userName: nameSubmitted ? userName : "",
        onRoomState: handleRoomState,
        onExcalidrawUpdate: handleExcalidrawUpdate,
        onCursorUpdate: handleCursorUpdate,
    });

    // Initialize media and SFU after name submission
    useEffect(() => {
        if (nameSubmitted && !localStream) {
            startMedia();
        }
    }, [nameSubmitted, localStream, startMedia]);

    // After getting local stream, push to SFU
    useEffect(() => {
        if (localStream && !sfuSessionId && nameSubmitted) {
            (async () => {
                const sid = await createSession();
                if (sid && localStream) {
                    const result = await pushLocalTracks(localStream);
                    if (result) {
                        sendMessage({
                            type: "userUpdate",
                            user: {
                                audioEnabled: true,
                                videoEnabled: true,
                                sessionId: result.sessionId,
                                audioTrackName: result.trackNames.audio,
                                videoTrackName: result.trackNames.video,
                            },
                        });
                    }
                }
            })();
        }
    }, [localStream, sfuSessionId, nameSubmitted, createSession, pushLocalTracks, sendMessage]);

    // Track which tracks we've already requested to avoid redundant pulls
    const pulledTracksRef = useRef<Set<string>>(new Set());

    // Pull remote tracks when room state changes
    useEffect(() => {
        if (!roomState || !sfuSessionId) return;

        const currentUsers = roomState.users;
        const prevUsers = prevUsersRef.current;

        // Cleanup: Identify users who left and stop their streams
        const currentIds = new Set(currentUsers.map(u => u.id));
        prevUsers.forEach((u: UserInfo) => {
            if (!currentIds.has(u.id) && u.tracks.sessionId) {
                stopRemoteStream(u.tracks.sessionId);
                // Also clear from pulled tracks cache
                if (u.tracks.audioTrackName) pulledTracksRef.current.delete(`${u.tracks.sessionId}:${u.tracks.audioTrackName}`);
                if (u.tracks.videoTrackName) pulledTracksRef.current.delete(`${u.tracks.sessionId}:${u.tracks.videoTrackName}`);
            }
        });

        const newRemoteTracks: { sessionId: string; trackName: string }[] = [];

        for (const user of currentUsers) {
            const sid = user.tracks.sessionId;
            if (sid && sid !== sfuSessionId) {
                // Audio track
                if (user.tracks.audioTrackName) {
                    const key = `${sid}:${user.tracks.audioTrackName}`;
                    if (!pulledTracksRef.current.has(key)) {
                        newRemoteTracks.push({ sessionId: sid, trackName: user.tracks.audioTrackName });
                        pulledTracksRef.current.add(key);
                    }
                }
                // Video track
                if (user.tracks.videoTrackName) {
                    const key = `${sid}:${user.tracks.videoTrackName}`;
                    if (!pulledTracksRef.current.has(key)) {
                        newRemoteTracks.push({ sessionId: sid, trackName: user.tracks.videoTrackName });
                        pulledTracksRef.current.add(key);
                    }
                }
            }
        }

        if (newRemoteTracks.length > 0) {
            pullRemoteTracks(newRemoteTracks);
        }

        prevUsersRef.current = currentUsers;
    }, [roomState, sfuSessionId, pullRemoteTracks, stopRemoteStream]);

    // Update tracks state when toggling
    useEffect(() => {
        if (nameSubmitted) {
            sendMessage({
                type: "userUpdate",
                user: { audioEnabled, videoEnabled },
            });
        }
    }, [audioEnabled, videoEnabled, nameSubmitted, sendMessage]);

    // Whiteboard sync — low debounce for near-real-time collaboration
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const handleSceneChange = useCallback(
        (elements: unknown[]) => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = setTimeout(() => {
                sendMessage({
                    type: "excalidrawUpdate",
                    elements,
                });
            }, 50);
        },
        [sendMessage]
    );

    // Broadcast local pointer position for cursor collaboration
    const handlePointerUpdate = useCallback(
        (x: number, y: number, tool: "pointer" | "laser", button: "up" | "down") => {
            sendMessage({
                type: "cursorUpdate",
                x,
                y,
                name: userName,
                tool,
                button,
            });
        },
        [sendMessage, userName]
    );

    // Copy meeting link
    const handleCopyLink = useCallback(async () => {
        const link = `${window.location.origin}/meeting?id=${meetingId}`;
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [meetingId]);

    // End call
    const handleEndCall = useCallback(() => {
        sendMessage({ type: "userLeave" });
        stopMedia();
        cleanupSfu();
        router.push("/");
    }, [sendMessage, stopMedia, cleanupSfu, router]);

    // Redirect if no meeting ID
    if (!meetingId) {
        return (
            <div className="modal-overlay">
                <div className="modal-card">
                    <h2>No Meeting ID</h2>
                    <p>Please start or join a meeting from the home page.</p>
                    <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => router.push("/")}>
                        Go Home
                    </button>
                </div>
            </div>
        );
    }

    // Name entry modal
    if (!nameSubmitted) {
        return (
            <div className="modal-overlay">
                <div className="modal-card">
                    <h2>Join Meeting</h2>
                    <p>
                        Meeting ID: <strong style={{ fontFamily: "monospace" }}>{meetingId}</strong>
                    </p>
                    <input
                        className="input-field"
                        type="text"
                        placeholder="Enter your name"
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && nameInput.trim()) {
                                setUserName(nameInput.trim());
                                setNameSubmitted(true);
                            }
                        }}
                        autoFocus
                    />
                    <button
                        className="btn btn-primary"
                        style={{ width: "100%", marginTop: "0.5rem" }}
                        onClick={() => {
                            if (nameInput.trim()) {
                                setUserName(nameInput.trim());
                                setNameSubmitted(true);
                            }
                        }}
                        disabled={!nameInput.trim()}
                    >
                        Join Meeting
                    </button>
                </div>
            </div>
        );
    }

    // Build video tiles
    const myUser = roomState?.users.find((u) => u.name === userName);
    const otherUsers = roomState?.users.filter((u) => u.id !== myUser?.id) || [];

    return (
        <div className="meeting-container">
            {/* Copied toast */}
            {copied && <div className="copied-toast">Meeting link copied!</div>}

            {/* Header */}
            <div className="meeting-header">
                <span className="meeting-header-logo">Skive</span>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                    <div className="participants-count">
                        <div className="dot-green" />
                        <Users size={14} />
                        <span>{roomState?.users.length || 1}</span>
                    </div>
                    <button className="meeting-id-badge" onClick={handleCopyLink} title="Copy meeting link">
                        {meetingId} <Copy size={12} style={{ marginLeft: "4px", opacity: 0.6 }} />
                    </button>
                    <button
                        className="meeting-id-badge"
                        onClick={() => setQrModalOpen(true)}
                        title="Show join QR code"
                        style={{ display: "flex", alignItems: "center", gap: "4px" }}
                    >
                        <QrCode size={12} /> QR
                    </button>
                    {!connected && (
                        <span style={{ fontSize: "0.75rem", color: "#f87171" }}>Reconnecting...</span>
                    )}
                </div>
            </div>

            {/* QR Code Modal */}
            {qrModalOpen && (
                <QRCodeModal
                    url={`${window.location.origin}/meeting?id=${meetingId}`}
                    onClose={() => setQrModalOpen(false)}
                />
            )}

            {/* Body */}
            <div className={`meeting-body ${whiteboardOpen ? "meeting-body--whiteboard" : ""}`}>
                <div className="video-grid-container">
                    <div
                        className="video-grid"
                        data-count={whiteboardOpen ? "sidebar" : Math.min(1 + otherUsers.length, 6)}
                    >
                        {/* Local video */}
                        <VideoTile
                            name={userName}
                            stream={localStream}
                            audioEnabled={audioEnabled}
                            videoEnabled={videoEnabled}
                            isLocal
                        />

                        {/* Remote videos */}
                        {otherUsers.map((user) => (
                            <VideoTile
                                key={user.id}
                                name={user.name}
                                stream={remoteStreams.find((r) => r.peerId === user.tracks.sessionId)?.stream}
                                audioEnabled={user.tracks.audioEnabled}
                                videoEnabled={user.tracks.videoEnabled}
                            />
                        ))}
                    </div>
                </div>

                {/* Whiteboard panel */}
                {whiteboardOpen && (
                    <Whiteboard
                        onClose={() => setWhiteboardOpen(false)}
                        onSceneChange={handleSceneChange}
                        remoteElements={remoteElements}
                        initialElements={initialWhiteboardElements}
                        onPointerUpdate={handlePointerUpdate}
                        collaborators={remoteCollaborators}
                    />
                )}
            </div>

            {/* Controls */}
            <ControlsBar
                audioEnabled={audioEnabled}
                videoEnabled={videoEnabled}
                whiteboardOpen={whiteboardOpen}
                onToggleAudio={toggleAudio}
                onToggleVideo={toggleVideo}
                onToggleWhiteboard={() => setWhiteboardOpen((prev) => !prev)}
                onEndCall={handleEndCall}
            />
        </div>
    );
}

export default function MeetingRoom() {
    return (
        <Suspense fallback={
            <div className="modal-overlay">
                <div className="modal-card">
                    <h2>Loading...</h2>
                    <p>Preparing your meeting room...</p>
                </div>
            </div>
        }>
            <MeetingRoomInner />
        </Suspense>
    );
}
