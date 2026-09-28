import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { RequestHandler, Response } from 'express';

export type ErrorCategory = 'none' | 'application_quota' | 'provider_quota' | 'quota_store_unavailable'
  | 'authentication' | 'app_check' | 'validation' | 'generation_failed' | 'internal_error'
  | 'invalid_json' | 'request_too_large' | 'not_found' | 'request_aborted' | 'http_error';
const categories = new WeakMap<Response, ErrorCategory>();
export const markRequestError = (response: Response, category: ErrorCategory): void => { categories.set(response, category); };

const routes = new Set(['/health', '/api/roles', '/api/roadmap', '/api/cv-bullet', '/api/cv-profile']);
const methods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

/** Closed schema: never pass request objects, errors, headers or content to the sink. */
export const requestLog: RequestHandler = (request, response, next) => {
  const requestId = randomUUID();
  const started = performance.now();
  const path = request.path.toLowerCase().replace(/\/$/u, '');
  const route = routes.has(path) ? path : 'unmatched';
  const method = methods.has(request.method) ? request.method : 'OTHER';
  response.setHeader('X-Request-ID', requestId);
  let emitted = false;
  const emit = (aborted: boolean): void => {
    if (emitted) return;
    emitted = true;
    const status = aborted ? 499 : response.statusCode;
    const errorCategory = aborted ? 'request_aborted' : categories.get(response) ??
      (status === 404 ? 'not_found' : status >= 500 ? 'internal_error' : status >= 400 ? 'http_error' : 'none');
    try {
      console.log(JSON.stringify({
        event: 'http_request', severity: status >= 500 ? 'ERROR' : status >= 400 ? 'WARNING' : 'INFO',
        timestamp: new Date().toISOString(), requestId, route, method, status,
        durationMs: Math.round((performance.now() - started) * 100) / 100, errorCategory,
      }));
    } catch { /* Logging outages must not break requests or trigger raw-error fallback logs. */ }
  };
  response.once('finish', () => emit(false));
  response.once('close', () => emit(!response.writableFinished));
  next();
};
