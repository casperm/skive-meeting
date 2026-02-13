"use client";

import { Mic, MicOff, Video, VideoOff, Presentation, PhoneOff } from "lucide-react";

interface ControlsBarProps {
    audioEnabled: boolean;
    videoEnabled: boolean;
    whiteboardOpen: boolean;
    onToggleAudio: () => void;
    onToggleVideo: () => void;
    onToggleWhiteboard: () => void;
    onEndCall: () => void;
}

export function ControlsBar({
    audioEnabled,
    videoEnabled,
    whiteboardOpen,
    onToggleAudio,
    onToggleVideo,
    onToggleWhiteboard,
    onEndCall,
}: ControlsBarProps) {
    return (
        <div className="controls-bar">
            {/* Microphone */}
            <button
                className={`control-btn ${!audioEnabled ? "muted-state" : ""}`}
                onClick={onToggleAudio}
                title={audioEnabled ? "Mute" : "Unmute"}
            >
                {audioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
            </button>

            {/* Camera */}
            <button
                className={`control-btn ${!videoEnabled ? "muted-state" : ""}`}
                onClick={onToggleVideo}
                title={videoEnabled ? "Turn off camera" : "Turn on camera"}
            >
                {videoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
            </button>

            {/* Whiteboard */}
            <button
                className={`control-btn ${whiteboardOpen ? "active" : ""}`}
                onClick={onToggleWhiteboard}
                title={whiteboardOpen ? "Close whiteboard" : "Open whiteboard"}
            >
                <Presentation size={20} />
            </button>

            {/* End Call */}
            <button
                className="control-btn danger"
                onClick={onEndCall}
                title="End call"
            >
                <PhoneOff size={20} />
            </button>
        </div>
    );
}
