"use client";

import { useRef, useEffect } from "react";
import { MicOff } from "lucide-react";

interface VideoTileProps {
    name: string;
    stream?: MediaStream | null;
    audioEnabled?: boolean;
    videoEnabled?: boolean;
    isLocal?: boolean;
    isMuted?: boolean;
}

export function VideoTile({
    name,
    stream,
    audioEnabled = true,
    videoEnabled = true,
    isLocal = false,
}: VideoTileProps) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    const initial = name.charAt(0).toUpperCase();

    return (
        <div className="video-tile">
            {stream && videoEnabled ? (
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted={isLocal}
                    style={{ transform: isLocal ? "scaleX(-1)" : "none" }}
                />
            ) : (
                <div className="video-tile-avatar">{initial}</div>
            )}
            <div className="video-tile-info">
                <span className="video-tile-name">
                    {name}
                    {isLocal && " (You)"}
                </span>
                {!audioEnabled && (
                    <span className="video-tile-muted">
                        <MicOff size={14} />
                    </span>
                )}
            </div>
        </div>
    );
}
