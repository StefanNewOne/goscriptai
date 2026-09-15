// Thin API client. All calls go through here (components → hooks → api).
const BASE = '/api/v1';

let authToken: string | null = localStorage.getItem('gs_token');

export function setToken(token: string | null) {
  authToken = token;
  if (token) localStorage.setItem('gs_token', token);
  else localStorage.removeItem('gs_token');
}

export function getToken() {
  return authToken;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiFail extends Error {
  code: string;
  details?: unknown;
  constructor(err: ApiError) {
    super(err.message);
    this.code = err.code;
    this.details = err.details;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err: ApiError = json?.error ?? { code: 'UNKNOWN', message: 'Настана грешка.' };
    if (res.status === 401) setToken(null);
    throw new ApiFail(err);
  }
  return json.data as T;
}

// Multipart upload (file + fields) — no JSON Content-Type so the browser sets
// the multipart boundary. Used to import old delivered .docx scripts.
async function uploadRequest<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
    body: form,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err: ApiError = json?.error ?? { code: 'UNKNOWN', message: 'Настана грешка.' };
    if (res.status === 401) setToken(null);
    throw new ApiFail(err);
  }
  return json.data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, form: FormData) => uploadRequest<T>(path, form),
};
