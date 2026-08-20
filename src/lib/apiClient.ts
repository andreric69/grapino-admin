const TOKEN_KEY = 'grapino-admin-token';

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

/**
 * Fetch-Wrapper fuer geschuetzte /api-Aufrufe - haengt das Session-Token an
 * und wirft bei 401 den gespeicherten Token weg (naechster Aufruf zeigt dann
 * wieder den Login).
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(path, { ...init, headers });
  if (res.status === 401) clearToken();
  return res;
}
