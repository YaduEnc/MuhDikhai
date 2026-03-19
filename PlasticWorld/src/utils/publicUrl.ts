import { Request } from 'express';

function firstForwardedValue(value?: string): string | null {
  if (!value) return null;
  const first = value.split(',')[0]?.trim();
  return first || null;
}

function sanitizeOrigin(value?: string): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function isLocalHost(host: string): boolean {
  const normalized = host.toLowerCase();
  return (
    normalized.startsWith('localhost') ||
    normalized.startsWith('127.0.0.1') ||
    normalized.startsWith('[::1]')
  );
}

function fallbackOriginFromCors(): string | null {
  const raw = process.env.CORS_ORIGIN;
  if (!raw) return null;

  for (const origin of raw.split(',')) {
    const sanitized = sanitizeOrigin(origin);
    if (sanitized && sanitized.startsWith('https://')) return sanitized;
  }

  for (const origin of raw.split(',')) {
    const sanitized = sanitizeOrigin(origin);
    if (sanitized) return sanitized;
  }

  return null;
}

export function resolvePublicOrigin(req: Request): string {
  const configuredOrigin = sanitizeOrigin(
    process.env.PUBLIC_API_ORIGIN ||
    process.env.PUBLIC_BASE_URL ||
    process.env.BACKEND_PUBLIC_URL ||
    process.env.APP_BASE_URL
  );
  if (configuredOrigin) return configuredOrigin;

  const forwardedHost = firstForwardedValue(req.get('x-forwarded-host'));
  const forwardedProto = firstForwardedValue(req.get('x-forwarded-proto'));
  const requestHost = forwardedHost || req.get('host') || 'localhost:3000';
  const requestProto = forwardedProto || req.protocol || 'http';

  if (process.env.NODE_ENV === 'production' && isLocalHost(requestHost)) {
    const corsFallback = fallbackOriginFromCors();
    if (corsFallback) return corsFallback;
  }

  return `${requestProto}://${requestHost}`;
}

export function buildPublicUploadUrl(req: Request, filename: string): string {
  const origin = resolvePublicOrigin(req);
  return `${origin}/uploads/${filename}`;
}
