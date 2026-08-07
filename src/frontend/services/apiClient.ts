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

  let response = await doFetch();

  // On 401, attempt a single token refresh then retry
  if (response.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      response = await doFetch(getStoredToken());
    } else {
      // Refresh failed — clear tokens and dispatch event so App can redirect to login
      clearStoredTokens();
      window.dispatchEvent(new CustomEvent('aacp:session-expired'));
    }
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(payload?.error || response.statusText || 'API request failed');
  }

  return payload as T;
}
