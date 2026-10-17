// Fixed-window request counters per client address. In memory, like everything else here.
import { trustsProxy } from './config.mjs';

export const GENERAL_LIMIT = { max: 300, windowMs: 60_000 };
// Anything that hashes a password costs real CPU, so it gets a much smaller budget.
export const SENSITIVE_LIMIT = { max: 20, windowMs: 60_000 };
const MAX_TRACKED_CLIENTS = 10_000;

const counters = new Map(); // `${bucket}|${ip}` -> { count, resetAt }

/**
 * The caller's address. Behind a trusted proxy (TRUST_PROXY=1) it is, in order:
 *  1. the header named by CLIENT_IP_HEADER, if set (e.g. cf-connecting-ip: Cloudflare sets it on
 *     every request and overwrites whatever the client sent, so it cannot be spoofed);
 *  2. the last X-Forwarded-For entry (added by our own proxy).
 * Without a trusted proxy it is the socket address.
 */
export function clientAddress(request) {
  if (trustsProxy()) {
    const named = process.env.CLIENT_IP_HEADER?.trim().toLowerCase();
    const fromHeader = named ? request.headers[named] : undefined;
    if (typeof fromHeader === 'string' && fromHeader.trim() !== '') return fromHeader.trim();
    const forwarded = String(request.headers['x-forwarded-for'] ?? '').split(',').map((part) => part.trim()).filter(Boolean);
    if (forwarded.length > 0) return forwarded[forwarded.length - 1];
  }
  return request.socket.remoteAddress ?? 'unknown';
}

/** Counts one request. Returns 0 when allowed, otherwise the seconds to wait. */
export function hit(bucket, address, limit, now = Date.now()) {
  const key = `${bucket}|${address}`;
  const current = counters.get(key);
  if (!current || now >= current.resetAt) {
    if (counters.size >= MAX_TRACKED_CLIENTS) sweep(now);
    counters.set(key, { count: 1, resetAt: now + limit.windowMs });
    return 0;
  }
  current.count += 1;
  return current.count > limit.max ? Math.ceil((current.resetAt - now) / 1000) : 0;
}

function sweep(now) {
  for (const [key, entry] of counters) {
    if (now >= entry.resetAt) counters.delete(key);
  }
  // still full of live entries: forget the oldest rather than grow without bound
  if (counters.size >= MAX_TRACKED_CLIENTS) counters.delete(counters.keys().next().value);
}

export function resetRateLimits() {
  counters.clear();
}
