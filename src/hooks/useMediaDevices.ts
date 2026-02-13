"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export function useMediaDevices() {
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [audioEnabled, setAudioEnabled] = useState(true);
    const [videoEnabled, setVideoEnabled] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const startMedia = useCallback(async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: "user",
                },
            });
            streamRef.current = mediaStream;
            setStream(mediaStream);
            setError(null);
        } catch (err) {
            console.error("Failed to access media devices:", err);
            setError("Could not access camera/microphone. Please check permissions.");
            // Try audio-only
            try {
                const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                streamRef.current = audioStream;
                setStream(audioStream);
                setVideoEnabled(false);
            } catch {
                setError("Could not access any media devices.");
            }
        }
    }, []);

    const toggleAudio = useCallback(() => {
        if (streamRef.current) {
            const audioTracks = streamRef.current.getAudioTracks();
            audioTracks.forEach((track) => {
                track.enabled = !track.enabled;
            });
            setAudioEnabled((prev) => !prev);
        }
    }, []);

    const toggleVideo = useCallback(() => {
        if (streamRef.current) {
            const videoTracks = streamRef.current.getVideoTracks();
            videoTracks.forEach((track) => {
                track.enabled = !track.enabled;
            });
            setVideoEnabled((prev) => !prev);
        }
    }, []);

    const stopMedia = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
            setStream(null);
        }
    }, []);

    useEffect(() => {
        return () => {
            // Cleanup on unmount
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => track.stop());
            }
        };
    }, []);

    return {
        stream,
        audioEnabled,
        videoEnabled,
        error,
        startMedia,
        toggleAudio,
        toggleVideo,
        stopMedia,
    };
}
