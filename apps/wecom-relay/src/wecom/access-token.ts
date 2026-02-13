import { createLogger } from "@easyclaw/logger";

const log = createLogger("wecom:access-token");

const WECOM_API_BASE = "https://qyapi.weixin.qq.com";
const REFRESH_BUFFER_MS = 10 * 60 * 1000; // Refresh 10 minutes before expiry

interface TokenState {
  token: string;
  expiresAt: number;
}

let tokenState: TokenState | null = null;
let refreshPromise: Promise<string> | null = null;

/**
 * Get a valid access token, auto-refreshing if needed.
 * Uses a lock (shared promise) to prevent concurrent refresh requests.
 */
export async function getAccessToken(corpId: string, corpSecret: string): Promise<string> {
  if (tokenState && Date.now() < tokenState.expiresAt - REFRESH_BUFFER_MS) {
    return tokenState.token;
  }

  // If a refresh is already in progress, wait for it
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = refreshToken(corpId, corpSecret);
  try {
    const token = await refreshPromise;
    return token;
  } finally {
    refreshPromise = null;
  }
}

async function refreshToken(corpId: string, corpSecret: string): Promise<string> {
  const url = `${WECOM_API_BASE}/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(corpSecret)}`;

  log.info("Refreshing WeCom access token");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch access token: HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    errcode: number;
    errmsg: string;
    access_token?: string;
    expires_in?: number;
  };

  if (data.errcode !== 0 || !data.access_token) {
    throw new Error(`WeCom API error: ${data.errcode} ${data.errmsg}`);
  }

  const expiresIn = data.expires_in ?? 7200;
  tokenState = {
    token: data.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  log.info(`Access token refreshed, expires in ${expiresIn}s`);
  return tokenState.token;
}

/**
 * Reset token state. For testing only.
 * @internal
 */
export function _resetTokenState(): void {
  tokenState = null;
  refreshPromise = null;
}
