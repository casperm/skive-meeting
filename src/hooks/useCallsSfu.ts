"use client";

import { useState, useRef, useCallback, useEffect } from "react";

const API_BASE = typeof window !== "undefined" ? window.location.origin : "";

interface TrackInfo {
    sessionId: string;
    trackName: string;
}

interface RemoteStream {
    peerId: string;
    stream: MediaStream;
}

export function useCallsSfu() {
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [localTrackNames, setLocalTrackNames] = useState<{ audio?: string; video?: string }>({});
    const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const sessionIdRef = useRef<string | null>(null);

    const createSession = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/calls/session`, { method: "POST" });
            const data = await res.json();
            const sid = data.sessionId;
            setSessionId(sid);
            sessionIdRef.current = sid;

            // Create PeerConnection
            const pc = new RTCPeerConnection({
                iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
                bundlePolicy: "max-bundle",
            });
            pcRef.current = pc;

            pc.ontrack = (event) => {
                // Remote track received
                const stream = event.streams[0];
                if (stream) {
                    setRemoteStreams((prev) => {
                        const existing = prev.find((r) => r.stream.id === stream.id);
                        if (existing) return prev;
                        return [...prev, { peerId: stream.id, stream }];
                    });
                }
            };

            return sid;
        } catch (err) {
            console.error("Failed to create Calls session:", err);
            return null;
        }
    }, []);

    const pushLocalTracks = useCallback(async (localStream: MediaStream) => {
        const pc = pcRef.current;
        const sid = sessionIdRef.current;
        if (!pc || !sid) return null;

        // Add tracks to PeerConnection
        const tracks: Array<{ location: string; trackName: string; mid?: string }> = [];

        localStream.getTracks().forEach((track) => {
            const transceiver = pc.addTransceiver(track, { direction: "sendonly" });
            tracks.push({
                location: "local",
                trackName: `${track.kind}-${crypto.randomUUID().slice(0, 8)}`,
                mid: transceiver.mid ?? undefined,
            });
        });

        // Create offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // Send to server
        try {
            const res = await fetch(`${API_BASE}/api/calls/tracks`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sessionId: sid,
                    sessionDescription: {
                        type: offer.type,
                        sdp: offer.sdp,
                    },
                    tracks,
                }),
            });

            const data = await res.json();

            // Set remote description (answer from SFU)
            if (data.sessionDescription) {
                await pc.setRemoteDescription(
                    new RTCSessionDescription(data.sessionDescription)
                );
            }

            // Track the names
            const names: { audio?: string; video?: string } = {};
            data.tracks?.forEach((t: { trackName: string; mid: string }) => {
                const origTrack = tracks.find((lt) => lt.mid === t.mid);
                if (origTrack?.trackName.startsWith("audio")) {
                    names.audio = t.trackName;
                } else {
                    names.video = t.trackName;
                }
            });
            setLocalTrackNames(names);

            return { sessionId: sid, trackNames: names };
        } catch (err) {
            console.error("Failed to push tracks:", err);
            return null;
        }
    }, []);

    const pullRemoteTracks = useCallback(async (remoteTracks: TrackInfo[]) => {
        const pc = pcRef.current;
        const sid = sessionIdRef.current;
        if (!pc || !sid || remoteTracks.length === 0) return;

        const tracksToRequest = remoteTracks.map((t) => ({
            location: "remote",
            sessionId: t.sessionId,
            trackName: t.trackName,
        }));

        try {
            const res = await fetch(`${API_BASE}/api/calls/tracks`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sessionId: sid,
                    tracks: tracksToRequest,
                }),
            });

            const data = await res.json();

            if (data.requiresImmediateRenegotiation && data.sessionDescription) {
                // Set the new offer from SFU
                await pc.setRemoteDescription(
                    new RTCSessionDescription(data.sessionDescription)
                );

                // Create answer
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                // Send answer back
                await fetch(`${API_BASE}/api/calls/renegotiate`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        sessionId: sid,
                        sessionDescription: {
                            type: answer.type,
                            sdp: answer.sdp,
                        },
                    }),
                });
            }
        } catch (err) {
            console.error("Failed to pull remote tracks:", err);
        }
    }, []);

    const cleanup = useCallback(() => {
        if (pcRef.current) {
            pcRef.current.close();
            pcRef.current = null;
        }
        setSessionId(null);
        sessionIdRef.current = null;
        setRemoteStreams([]);
    }, []);

    useEffect(() => {
        return () => {
            if (pcRef.current) {
                pcRef.current.close();
            }
        };
    }, []);

    return {
        sessionId,
        localTrackNames,
        remoteStreams,
        createSession,
        pushLocalTracks,
        pullRemoteTracks,
        cleanup,
    };
}
