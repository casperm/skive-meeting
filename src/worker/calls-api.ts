// Cloudflare Calls SFU REST API helpers

const CALLS_BASE_URL = "https://rtc.live.cloudflare.com/apps";

interface CallsSessionResponse {
    sessionId: string;
    [key: string]: unknown;
}

interface CallsTracksResponse {
    requiresImmediateRenegotiation: boolean;
    sessionDescription?: {
        type: string;
        sdp: string;
    };
    tracks: Array<{
        trackName: string;
        mid: string;
        location: string;
        [key: string]: unknown;
    }>;
}

async function callsApi(
    appId: string,
    appSecret: string,
    path: string,
    method: string = "POST",
    body?: unknown
): Promise<unknown> {
    const url = `${CALLS_BASE_URL}/${appId}${path}`;
    const res = await fetch(url, {
        method,
        headers: {
            Authorization: `Bearer ${appSecret}`,
            "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Calls API error ${res.status}: ${text}`);
    }

    return res.json();
}

export async function createCallsSession(
    appId: string,
    appSecret: string
): Promise<CallsSessionResponse> {
    return callsApi(appId, appSecret, "/sessions/new") as Promise<CallsSessionResponse>;
}

export async function pushTracks(
    appId: string,
    appSecret: string,
    sessionId: string,
    body: {
        sessionDescription?: { type: string; sdp: string };
        tracks: Array<{
            location: string;
            trackName: string;
            mid?: string;
            kind?: string;
            bidirectionalMediaStream?: boolean;
        }>;
    }
): Promise<CallsTracksResponse> {
    return callsApi(
        appId,
        appSecret,
        `/sessions/${sessionId}/tracks/new`,
        "POST",
        body
    ) as Promise<CallsTracksResponse>;
}

export async function closeTracks(
    appId: string,
    appSecret: string,
    sessionId: string,
    body: {
        tracks: Array<{ trackName: string }>;
        force?: boolean;
    }
): Promise<unknown> {
    return callsApi(
        appId,
        appSecret,
        `/sessions/${sessionId}/tracks/close`,
        "POST",
        body
    );
}

export async function renegotiate(
    appId: string,
    appSecret: string,
    sessionId: string,
    sdp: { type: string; sdp: string }
): Promise<{ sessionDescription?: { type: string; sdp: string } }> {
    return callsApi(appId, appSecret, `/sessions/${sessionId}/renegotiate`, "PUT", {
        sessionDescription: sdp,
    }) as Promise<{ sessionDescription?: { type: string; sdp: string } }>;
}
