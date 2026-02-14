"use client";

import { useState, useRef, useCallback, useEffect } from "react";

const API_BASE = typeof window !== "undefined" ? window.location.origin : "";

interface TrackInfo {
    sessionId: string;
    trackName: string;
}

interface RemoteStream {
    peerId: string; // This is the remote peer's SFU sessionId
    stream: MediaStream;
}

export function useCallsSfu() {
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [localTrackNames, setLocalTrackNames] = useState<{ audio?: string; video?: string }>({});
    const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const sessionIdRef = useRef<string | null>(null);
    // Map from transceiver mid → remote peer's SFU sessionId
    const midToSessionIdRef = useRef<Map<string, string>>(new Map());
    // Map from remote SFU sessionId → MediaStream (to group audio+video per peer)
    const peerStreamsRef = useRef<Map<string, MediaStream>>(new Map());

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
                const transceiver = event.transceiver;
                const mid = transceiver.mid;
                if (!mid) return;

                // Look up which remote peer this track belongs to
                const remotePeerId = midToSessionIdRef.current.get(mid);
                if (!remotePeerId) {
                    console.warn("Received track with unknown mid:", mid);
                    return;
                }

                // Get or create a MediaStream for this peer
                const existingStream = peerStreamsRef.current.get(remotePeerId);

                // Create a NEW MediaStream to ensure React triggers re-render/useEffect
                const newStream = new MediaStream(existingStream ? existingStream.getTracks() : []);
                newStream.addTrack(event.track);

                peerStreamsRef.current.set(remotePeerId, newStream);

                // Update state
                setRemoteStreams(() => {
                    const streams: RemoteStream[] = [];
                    for (const [peerId, stream] of peerStreamsRef.current) {
                        streams.push({ peerId, stream });
                    }
                    return streams;
                });
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
        const transceivers: Array<{ transceiver: RTCRtpTransceiver; kind: string }> = [];

        localStream.getTracks().forEach((track) => {
            const transceiver = pc.addTransceiver(track, { direction: "sendonly" });
            transceivers.push({ transceiver, kind: track.kind });
        });

        // Create offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // Map transceivers to track names (MID is now available after setLocalDescription)
        const tracks = transceivers.map(({ transceiver, kind }) => ({
            location: "local",
            trackName: `${kind}-${crypto.randomUUID().slice(0, 8)}`,
            mid: transceiver.mid ?? undefined,
        }));

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

            // Map MIDs from the response to remote peer sessionIds
            if (data.tracks) {
                data.tracks.forEach((t: { mid: string; sessionId?: string }, index: number) => {
                    const mid = t.mid;
                    // The sessionId for this track comes from our original request
                    const remoteSessionId = tracksToRequest[index]?.sessionId;
                    if (mid && remoteSessionId) {
                        midToSessionIdRef.current.set(mid, remoteSessionId);
                    }
                });
            }

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

    const stopRemoteStream = useCallback((peerId: string) => {
        const stream = peerStreamsRef.current.get(peerId);
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
            peerStreamsRef.current.delete(peerId);
            setRemoteStreams(prev => prev.filter(s => s.peerId !== peerId));
        }
    }, []);

    const cleanup = useCallback(() => {
        if (pcRef.current) {
            pcRef.current.close();
            pcRef.current = null;
        }
        setSessionId(null);
        sessionIdRef.current = null;

        peerStreamsRef.current.forEach(stream => {
            stream.getTracks().forEach(t => t.stop());
        });
        peerStreamsRef.current.clear();
        setRemoteStreams([]);
        midToSessionIdRef.current.clear();
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
        stopRemoteStream,
        cleanup,
    };
}
