"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Video, Users, Pencil, ArrowRight, Loader2 } from "lucide-react";

const API_BASE = typeof window !== "undefined" ? window.location.origin : "";

export default function LandingPage() {
  const router = useRouter();
  const [meetingId, setMeetingId] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");

  const handleStartMeeting = async () => {
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/meetings`, { method: "POST" });
      const data = await res.json();
      if (data.meetingId) {
        router.push(`/meeting?id=${data.meetingId}`);
      }
    } catch (err) {
      console.error("Failed to create meeting:", err);
    } finally {
      setCreating(false);
    }
  };

  const handleJoinMeeting = async () => {
    const id = meetingId.trim().toLowerCase();
    if (!id) {
      setJoinError("Please enter a meeting ID");
      return;
    }

    setJoining(true);
    setJoinError("");

    try {
      const res = await fetch(`${API_BASE}/api/meetings/${id}`);
      const data = await res.json();
      if (data.exists) {
        router.push(`/meeting?id=${id}`);
      } else {
        setJoinError("Meeting not found. Check the ID and try again.");
      }
    } catch {
      setJoinError("Could not verify meeting. Please try again.");
    } finally {
      setJoining(false);
    }
  };

  const formatMeetingInput = (value: string) => {
    // Auto-format: strip non-alphanumeric, insert dashes
    const clean = value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
    const parts = clean.match(/.{1,3}/g);
    return parts ? parts.join("-") : "";
  };

  return (
    <div className="landing-container">
      {/* Navigation */}
      <nav className="landing-nav">
        <div className="landing-logo">
          <div className="landing-logo-icon">S</div>
          Skive
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#6b7280", fontSize: "0.85rem" }}>
          <Video size={16} />
          Video meetings made simple
        </div>
      </nav>

      {/* Hero Section */}
      <div className="landing-hero">
        <div className="landing-hero-content">
          {/* Left: Headline */}
          <div>
            <h1 className="landing-headline">
              Video calls <br />
              <span>without the</span>
              <br />
              complexity.
            </h1>
            <p className="landing-subtitle">
              Start a meeting in one click. Share a link to invite others.
              Collaborate on a built-in whiteboard — all powered by
              Cloudflare&apos;s global edge network.
            </p>
            <div style={{ marginTop: "2rem", display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#6b7280", fontSize: "0.9rem" }}>
                <Video size={18} style={{ color: "var(--color-primary)" }} />
                HD Video & Audio
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#6b7280", fontSize: "0.9rem" }}>
                <Pencil size={18} style={{ color: "var(--color-primary)" }} />
                Collaborative Whiteboard
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#6b7280", fontSize: "0.9rem" }}>
                <Users size={18} style={{ color: "var(--color-primary)" }} />
                Instant Sharing
              </div>
            </div>
          </div>

          {/* Right: Action Cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Start Meeting Card */}
            <div className="landing-card">
              <h3>Start a New Meeting</h3>
              <p style={{ color: "#6b7280", fontSize: "0.9rem", margin: 0 }}>
                Create a meeting room and share the link with your team.
              </p>
              <button
                className="btn btn-primary"
                onClick={handleStartMeeting}
                disabled={creating}
              >
                {creating ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Video size={18} />
                )}
                {creating ? "Creating..." : "Start Meeting"}
              </button>
            </div>

            {/* Join Meeting Card */}
            <div className="landing-card">
              <h3>Join an Existing Meeting</h3>
              <div className="input-row">
                <input
                  className="input-field"
                  type="text"
                  placeholder="abc-xyz-123-def"
                  value={meetingId}
                  onChange={(e) =>
                    setMeetingId(formatMeetingInput(e.target.value))
                  }
                  onKeyDown={(e) => e.key === "Enter" && handleJoinMeeting()}
                  style={{ fontFamily: "'SF Mono', 'Fira Code', monospace", letterSpacing: "0.05em" }}
                />
                <button
                  className="btn btn-outline"
                  onClick={handleJoinMeeting}
                  disabled={joining}
                >
                  {joining ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <ArrowRight size={18} />
                  )}
                </button>
              </div>
              {joinError && (
                <p style={{ color: "var(--color-danger)", fontSize: "0.85rem", margin: 0 }}>
                  {joinError}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        textAlign: "center",
        padding: "1.5rem",
        color: "#9ca3af",
        fontSize: "0.8rem",
        borderTop: "1px solid var(--color-border)",
      }}>
        Powered by Cloudflare Workers & Calls · Built with ❤️
      </div>
    </div>
  );
}
