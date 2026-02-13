import { MeetingRoom } from "./meeting-room";
import { createCallsSession, pushTracks, renegotiate } from "./calls-api";

export { MeetingRoom };

interface Env {
    CALLS_APP_ID: string;
    CALLS_APP_SECRET: string;
    MEETING_ROOM: DurableObjectNamespace;
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const path = url.pathname;

        // CORS headers for all API routes
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        };

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            // --- Meeting API Routes ---

            // POST /api/meetings — create a new meeting
            if (path === "/api/meetings" && request.method === "POST") {
                // Generate a temporary ID to create the DO, then the DO generates the real meeting ID
                const tempId = crypto.randomUUID();
                const doId = env.MEETING_ROOM.idFromName(tempId);
                const stub = env.MEETING_ROOM.get(doId);
                const res = await stub.fetch(new Request("https://do/create"));
                const data = (await res.json()) as { meetingId: string };

                // Store the mapping: meetingId → DO name for lookup
                // We use a second DO keyed by meetingId for lookup
                const lookupId = env.MEETING_ROOM.idFromName(data.meetingId.toLowerCase());
                const lookupStub = env.MEETING_ROOM.get(lookupId);
                await lookupStub.fetch(new Request("https://do/create"));

                return Response.json(data, { headers: corsHeaders });
            }

            // GET /api/meetings/:id — check if meeting exists
            const meetingMatch = path.match(/^\/api\/meetings\/([a-z0-9-]+)$/i);
            if (meetingMatch && request.method === "GET") {
                const meetingId = meetingMatch[1].toLowerCase();
                const doId = env.MEETING_ROOM.idFromName(meetingId);
                const stub = env.MEETING_ROOM.get(doId);
                const res = await stub.fetch(new Request("https://do/exists"));
                const data = await res.json();
                return Response.json(data, { headers: corsHeaders });
            }

            // GET /api/meetings/:id/websocket — WebSocket upgrade
            const wsMatch = path.match(/^\/api\/meetings\/([a-z0-9-]+)\/websocket$/i);
            if (wsMatch) {
                const meetingId = wsMatch[1].toLowerCase();
                const doId = env.MEETING_ROOM.idFromName(meetingId);
                const stub = env.MEETING_ROOM.get(doId);
                return stub.fetch(new Request("https://do/websocket", {
                    headers: request.headers,
                }));
            }

            // --- Cloudflare Calls SFU Proxy Routes ---

            // POST /api/calls/session — create SFU session
            if (path === "/api/calls/session" && request.method === "POST") {
                const result = await createCallsSession(env.CALLS_APP_ID, env.CALLS_APP_SECRET);
                return Response.json(result, { headers: corsHeaders });
            }

            // POST /api/calls/tracks — push/pull tracks
            if (path === "/api/calls/tracks" && request.method === "POST") {
                const body = await request.json() as { sessionId: string;[key: string]: unknown };
                const { sessionId, ...rest } = body;
                const result = await pushTracks(env.CALLS_APP_ID, env.CALLS_APP_SECRET, sessionId, rest as Parameters<typeof pushTracks>[3]);
                return Response.json(result, { headers: corsHeaders });
            }

            // POST /api/calls/renegotiate — SDP renegotiation
            if (path === "/api/calls/renegotiate" && request.method === "POST") {
                const body = await request.json() as { sessionId: string; sessionDescription: { type: string; sdp: string } };
                const result = await renegotiate(env.CALLS_APP_ID, env.CALLS_APP_SECRET, body.sessionId, body.sessionDescription);
                return Response.json(result, { headers: corsHeaders });
            }

            // Serve static assets (Next.js output) — handled by wrangler assets config
            return new Response("Not Found", { status: 404, headers: corsHeaders });

        } catch (err) {
            console.error("Worker error:", err);
            return Response.json(
                { error: (err as Error).message },
                { status: 500, headers: corsHeaders }
            );
        }
    },
};
