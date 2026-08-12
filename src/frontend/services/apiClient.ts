export type ApiRequestOptions = Omit<RequestInit, 'headers' | 'body'> & {
  headers?: Record<string, string>;
  body?: unknown;
};

let apiBaseUrl = '';

export function setApiBaseUrl(url: string) {
  apiBaseUrl = url.replace(/\/$/, '');
}

export function getApiBaseUrl() {
  return apiBaseUrl;
}

export function getStoredToken(): string | null {
  return localStorage.getItem('aacp_access_token');
}

export function setStoredToken(token: string) {
  localStorage.setItem('aacp_access_token', token);
}

export function setStoredRefreshToken(token: string) {
  localStorage.setItem('aacp_refresh_token', token);
}

export function getStoredRefreshToken(): string | null {
  return localStorage.getItem('aacp_refresh_token');
}

export function clearStoredTokens() {
  localStorage.removeItem('aacp_access_token');
  localStorage.removeItem('aacp_refresh_token');
  localStorage.removeItem('aacp_role');
}

function buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getStoredToken();
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  // Deduplicate concurrent refresh attempts
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = getStoredRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${apiBaseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        mode: 'cors',
        cache: 'no-cache',
      });
      if (!res.ok) {
        clearStoredTokens();
        return false;
      }
      const data = await res.json() as { accessToken?: string };
      if (data.accessToken) {
        setStoredToken(data.accessToken);
        return true;
      }
      clearStoredTokens();
      return false;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// Typed errors so callers can distinguish categories without parsing strings
export class NetworkError extends Error { readonly type = 'network' as const; }
export class ServerError  extends Error { readonly type = 'server'  as const; }
export class ApiError     extends Error { readonly type = 'api'     as const; readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const url = `${apiBaseUrl}${path}`;

  const doFetch = (token?: string | null) =>
    fetch(url, {
      method: options.method ?? 'GET',
      headers: buildHeaders({
        ...options.headers,
        ...(token !== undefined && token !== null ? { Authorization: `Bearer ${token}` } : {}),
      }),
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      mode: 'cors',
      cache: 'no-cache',
    });

  let response: Response;
  try {
    response = await doFetch();
  } catch {
    throw new NetworkError('Unable to reach the server. Please check your connection and try again.');
  }

  // On 401, attempt a single token refresh then retry
  if (response.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      try {
        response = await doFetch(getStoredToken());
      } catch {
        throw new NetworkError('Unable to reach the server. Please check your connection and try again.');
      }
    } else {
      clearStoredTokens();
      window.dispatchEvent(new CustomEvent('aacp:session-expired'));
      // Fall through — original response body still readable
    }
  }

  let payload: Record<string, unknown> | null = null;
  try {
    const text = await response.text();
    payload = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON body — treat as server error
  }

  if (!response.ok) {
    const msg = (payload as { error?: string } | null)?.error;
    if (response.status >= 500) {
      throw new ServerError(msg ?? 'The server encountered an error. Please try again shortly.');
    }
    throw new ApiError(msg ?? 'Request failed.', response.status);
  }

  return payload as T;
}
