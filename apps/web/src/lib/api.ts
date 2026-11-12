import { messageFor } from './messages';

export interface FieldError {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors: FieldError[] = [],
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** Calls the API through the same-origin proxy. Tokens travel only as httpOnly cookies. */
export async function api<T>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown } = {},
): Promise<T> {
  const method = options.method ?? (options.body === undefined ? 'GET' : 'POST');
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        'x-xrostr-csrf': '1',
        ...(options.body !== undefined && { 'content-type': 'application/json' }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, 'network', messageFor('network'));
  }

  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const code = typeof data?.code === 'string' ? data.code : `http_${response.status}`;
    const fieldErrors = Array.isArray(data?.errors) ? (data.errors as FieldError[]) : [];
    throw new ApiError(
      response.status,
      code,
      messageFor(code, data?.title),
      fieldErrors,
      data ?? {},
    );
  }
  return data as T;
}
