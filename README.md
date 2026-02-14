# Skive — Real-Time Video Meetings

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/casperm/skive-meeting)

Skive is a lightweight, edge-native video meeting application built for speed and simplicity. It leverages the power of Cloudflare's global network to provide low-latency video, real-time signaling, and a collaborative whiteboard experience.

**Created by Google Antigravity**

---

## Features

- ⚡ **Edge-Native**: Built with Next.js and deployed on Cloudflare Pages + Workers.
- 📡 **Real-Time Signaling**: Powered by Durable Objects for instantaneous state syncing.
- 🎥 **SFU Media**: Uses Cloudflare Calls for high-performance WebRTC media transport.
- 🎨 **Whiteboard**: Collaborative Excalidraw integration for shared brainstorms.
- 🧼 **Auto-Cleanup**: Automatic session data termination when the last user leaves.

---

## Screenshots

![Skive Landing Page](./.screen_capture/landing_page.png)
_Landing page with "Start Meeting" and "Join Meeting" options._

![Skive Meeting Room](./.screen_capture/meeting_room.png)
_Active meeting room with participant grid and collaborative whiteboard._

---

## Cost Estimation (Cloudflare Calls)

Skive uses **Cloudflare Calls** for its SFU (Selective Forwarding Unit) capabilities.

- **Pricing**: $0.05 per real-time GB (egress).
- **Free Tier**: The first 1 TB (1,000 GB) per month is **free**.

### Scenario: 10 Users for a 2-Hour Meeting

**Assumptions**:

- **10 Participants**: Each sending 1 video/audio stream and receiving 9 remote streams.
- **Bitrate**: ~1 Mbps per received stream (standard HD video + audio).
- **Duration**: 2 hours (120 minutes).

**Calculation**:

1.  **Bandwidth per user**: 9 incoming streams \* 1 Mbps = 9 Mbps.
2.  **Total Bandwidth**: 10 users \* 9 Mbps = 90 Mbps.
3.  **Total Data Transfer**: 90 Mbps \* 7200 seconds / 8 bits/byte = **81,000 MB** (~79.1 GB).

**Estimated Cost**:

- **Data**: ~79.1 GB.
- **Cost**: $0.00 (Covered by the massive 1 TB free tier).
- **Overages**: If you exceed the free tier, this meeting would cost approx. **$3.96**.

---

## Quick Startup Guide

### 1. Setup Cloudflare Realtime (SFU)

To enable video and audio transport, you need to create a Cloudflare Calls application:

1. Log in to your [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Navigate to **Realtime** -> **Calls**.
3. Create a new **App**.
4. Capture the **App ID** and **App Secret**.

### 2. Configure Secrets

Set your Cloudflare credentials as encrypted secrets:

```bash
# Production secrets
npx wrangler secret put CALLS_APP_ID
npx wrangler secret put CALLS_APP_SECRET

# Local development (optional)
# Create a .dev.vars file in the root directory:
# CALLS_APP_ID=your_id
# CALLS_APP_SECRET=your_secret
```

### 3. Build & Deploy

Deploy the application to Cloudflare with a single command:

```bash
# Build the Next.js static export and deploy to Cloudflare
npm run deploy
```

> **Note**: If this is your first time deploying a project with Durable Objects, Wrangler will automatically create the required migration and binding in your Cloudflare account.

---

## Configuration

All meeting settings are defined in [`wrangler.json`](wrangler.json) under the `vars` block and can be changed without modifying any application code:

```json
"vars": {
    "VIDEO_CODEC": "av1",
    "VIDEO_MAX_FRAMERATE": 24,
    "CALL_MAX_DURATION_SECONDS": 300
}
```

After changing any value, redeploy with `npm run deploy`.

### Video Codec (`VIDEO_CODEC`)

The video codec determines how video is compressed and transmitted. Set this to any codec identifier supported by the browser's WebRTC stack.

| Codec   | Identifier | Compression | Quality                 | CPU Usage            | Browser Support                   | Best For                                     |
| ------- | ---------- | ----------- | ----------------------- | -------------------- | --------------------------------- | -------------------------------------------- |
| **AV1** | `av1`      | Excellent   | Highest at low bitrates | High                 | Chrome 94+, Firefox 98+, Edge 94+ | Bandwidth-constrained calls, mobile networks |
| VP9     | `vp9`      | Very Good   | High                    | Medium-High          | Chrome 48+, Firefox 46+, Edge 79+ | Good balance of quality and compatibility    |
| VP8     | `vp8`      | Good        | Medium                  | Low                  | All modern browsers               | Maximum compatibility                        |
| H.264   | `h264`     | Good        | Medium                  | Low (HW accelerated) | All modern browsers               | Hardware acceleration, legacy systems        |

**Default: `av1`** — AV1 delivers the best visual quality at low bitrates, reducing bandwidth costs on Cloudflare Calls while maintaining sharp video. It is ideal for meetings where participants may be on varying network conditions.

### Video Framerate (`VIDEO_MAX_FRAMERATE`)

Caps the maximum framerate of the camera capture. Lower framerates reduce bandwidth and CPU usage.

- **Default: `24`** — Matches the cinematic standard; provides smooth video while keeping bandwidth ~40% lower than 30fps.
- Common alternatives: `15` (low bandwidth), `30` (smoother), `60` (screen sharing).

### Call Duration (`CALL_MAX_DURATION_SECONDS`)

Maximum duration of a single meeting in seconds. When the timer expires, a "Time's Up" modal appears prompting the user to leave.

- **Default: `300`** (5 minutes)
- Set to `0` to disable the time limit _(not yet implemented)_.

---

## Local Development

To run the application locally with full Durable Object and SFU support:

```bash
# This builds Next.js and starts Wrangler (Miniflare)
npm run dev:worker
```

Open `http://localhost:8787` in your browser.

---

## The Refined Prompt

This application was engineered using the following prompt:

> "Build a real-time video meeting application called Skive using Next.js (with static export) and Cloudflare Workers. Use Cloudflare Durable Objects for WebSocket signaling and session state management. Integrate Cloudflare Calls SFU for low-latency WebRTC media transport. Include a collaborative Excalidraw whiteboard that synchronizes drawing data across participants via the same Durable Object. The UI should have a clean, modern aesthetic inspired by Grain, using a green brand palette (#00B667) and glassmorphism for the meeting room. Implement automatic cleanup of meeting data using Durable Object alarms when all participants disconnect. Meeting IDs should be generated in the format 'xxx-yyy-zzz-www' and be case-insensitive."

---

_Powered by Google Antigravity_
