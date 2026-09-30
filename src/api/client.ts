import axios, { type AxiosInstance } from 'axios';
import type { ApiErrorBody } from './contracts';

export type ApiErrorKind = 'timeout' | 'network' | 'http' | 'invalid' | 'canceled';

/** Normalised API failure. `retryable` drives the retry policy of queries and mutations. */
export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get retryable(): boolean {
    if (this.kind === 'timeout' || this.kind === 'network') return true;
    if (this.kind === 'http' && this.status !== null) return this.status >= 500 || this.status === 408 || this.status === 429;
    return false;
  }

  /** Short, user-facing description. */
  get userMessage(): string {
    switch (this.kind) {
      case 'timeout':
        return 'The server took too long to answer.';
      case 'network':
        return 'Could not reach the server. Check your connection.';
      case 'http':
        if (this.status !== null && this.status >= 500) return `The server had a problem (${this.status}).`;
        return `The request was rejected (${this.status ?? 'error'}).`;
      case 'invalid':
        return 'The server sent an unexpected response.';
      case 'canceled':
        return 'The request was cancelled.';
    }
  }
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  return typeof value === 'object' && value !== null && 'message' in value && typeof value.message === 'string';
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (axios.isCancel(error)) return new ApiError('canceled', 'Request cancelled');
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return new ApiError('timeout', 'Request timed out');
    if (!error.response) return new ApiError('network', error.message || 'Network error');
    const body: unknown = error.response.data;
    const message = isErrorBody(body) ? body.message : `HTTP ${error.response.status}`;
    return new ApiError('http', message, error.response.status);
  }
  return new ApiError('invalid', error instanceof Error ? error.message : 'Unknown error');
}

const params = new URLSearchParams(window.location.search);

function numberParam(name: string): number | undefined {
  const raw = params.get(name);
  const value = raw === null ? NaN : Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Runtime configuration. `VITE_API_BASE_URL` / `VITE_API_TIMEOUT_MS` come from the
 * environment; `?apiTimeout=<ms>` overrides the timeout (used to reproduce timeouts quickly).
 */
export const API_CONFIG = {
  baseURL: (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api',
  timeout: numberParam('apiTimeout') ?? (Number(import.meta.env.VITE_API_TIMEOUT_MS) || 4000),
};

export const http: AxiosInstance = axios.create({
  baseURL: API_CONFIG.baseURL,
  timeout: API_CONFIG.timeout,
  headers: { Accept: 'application/json' },
});

http.interceptors.response.use(
  (response) => response,
  (error: unknown) => Promise.reject(toApiError(error)),
);
