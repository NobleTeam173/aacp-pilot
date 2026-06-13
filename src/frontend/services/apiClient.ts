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

export async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const url = `${apiBaseUrl}${path}`;
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: buildHeaders(options.headers),
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    mode: 'cors',
    cache: 'no-cache',
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(payload?.error || response.statusText || 'API request failed');
  }

  return payload as T;
}
