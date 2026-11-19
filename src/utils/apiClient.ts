import {
  AlertStatus,
  ConservationGoal,
  ForecastMethodKey,
  UserAccount,
  UserSettings,
  WorkspacePayload,
} from '../types/api';

const inFlightMutations = new Map<string, Promise<unknown>>();

async function request<T>(url: string, options: RequestInit = {}, userId?: number): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (userId) {
    headers.set('x-user-id', String(userId));
  }

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

function dedupeMutation<T>(key: string, runner: () => Promise<T>): Promise<T> {
  const existing = inFlightMutations.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = runner().finally(() => {
    inFlightMutations.delete(key);
  });
  inFlightMutations.set(key, promise);
  return promise;
}

export const api = {
  listUsers: (signal?: AbortSignal) => request<{ users: UserAccount[] }>('/api/users', { signal }),

  login: (email: string, password: string) =>
    dedupeMutation(`login:${email}`, () =>
      request<{ user: UserAccount }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
    ),

  register: (payload: {
    name: string;
    email: string;
    password: string;
    householdName: string;
    householdSize: number;
  }) =>
    dedupeMutation(`register:${payload.email}`, () =>
      request<{ user: UserAccount }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    ),

  getWorkspace: (
    userId: number,
    strategy?: ForecastMethodKey,
    horizon?: number,
    signal?: AbortSignal
  ) => {
    const params = new URLSearchParams();
    if (strategy) params.set('strategy', strategy);
    if (horizon) params.set('horizon', String(horizon));
    const qs = params.toString();
    return request<WorkspacePayload>(`/api/workspace${qs ? `?${qs}` : ''}`, { signal }, userId);
  },

  addReading: (
    userId: number,
    payload: { date: string; volumeLiters: number; nightFlowLph: number; notes: string }
  ) =>
    dedupeMutation(`add:${userId}:${payload.date}:${payload.volumeLiters}:${payload.nightFlowLph}`, () =>
      request('/api/readings', { method: 'POST', body: JSON.stringify(payload) }, userId)
    ),

  updateReading: (
    userId: number,
    id: number,
    payload: { date: string; volumeLiters: number; nightFlowLph: number; notes: string; source?: string }
  ) =>
    dedupeMutation(`put:${userId}:${id}`, () =>
      request(`/api/readings/${id}`, { method: 'PUT', body: JSON.stringify(payload) }, userId)
    ),

  deleteReading: (userId: number, id: number) =>
    dedupeMutation(`del:${userId}:${id}`, () =>
      request(`/api/readings/${id}`, { method: 'DELETE' }, userId)
    ),

  loadDemoData: (userId: number, variant: 'full90' | 'apartment14' = 'full90') =>
    dedupeMutation(`demo-load:${userId}:${variant}`, () =>
      request<{ insertedCount: number }>(
        '/api/demo/load',
        { method: 'POST', body: JSON.stringify({ variant }) },
        userId
      )
    ),

  clearDemoData: (userId: number) =>
    dedupeMutation(`demo-clear:${userId}`, () =>
      request<{ removedCount: number }>('/api/demo/clear', { method: 'POST' }, userId)
    ),

  updateSettings: (userId: number, patch: Partial<UserSettings>) =>
    dedupeMutation(`settings:${userId}:${JSON.stringify(patch)}`, () =>
      request<{ settings: UserSettings }>(
        '/api/settings',
        { method: 'PUT', body: JSON.stringify(patch) },
        userId
      )
    ),

  updateAlertStatus: (userId: number, alertId: number, status: AlertStatus) =>
    dedupeMutation(`alert:${userId}:${alertId}:${status}`, () =>
      request(
        `/api/alerts/${alertId}`,
        { method: 'PATCH', body: JSON.stringify({ status }) },
        userId
      )
    ),

  updateConservationGoal: (userId: number, goal: Omit<ConservationGoal, 'userId' | 'id'>) =>
    dedupeMutation(`goal:${userId}`, () =>
      request<{ goal: ConservationGoal }>(
        '/api/conservation',
        { method: 'PUT', body: JSON.stringify(goal) },
        userId
      )
    ),
};

export function buildCsvContent(headers: string[], rows: Array<Array<string | number>>): string {
  const escapeCell = (val: string | number): string => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  return [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))].join('\n');
}

export function downloadCsvFile(filename: string, headers: string[], rows: Array<Array<string | number>>): void {
  const csv = buildCsvContent(headers, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
