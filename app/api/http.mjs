// Small HTTP helpers shared by the API handlers: JSON in, JSON out, one error shape.
const MAX_BODY_BYTES = 64 * 1024;

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

/** An error that maps straight onto an HTTP response: { error: { code, message, details? } }. */
export class ApiError extends Error {
  constructor(status, code, message, details, headers) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.headers = headers ?? {};
  }
}

export function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, { ...JSON_HEADERS, ...headers });
  response.end(JSON.stringify(payload));
}

export function sendEmpty(response, status) {
  response.writeHead(status, { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end();
}

export function sendError(response, error, headers = {}) {
  const body = { code: error.code, message: error.message };
  if (error.details) body.details = error.details;
  sendJson(response, error.status, { error: body }, { ...error.headers, ...headers });
}

async function readRaw(request) {
  // Refuse an oversized body before reading any of it (the answer then reaches the client cleanly).
  if (Number(request.headers['content-length']) > MAX_BODY_BYTES) {
    throw new ApiError(413, 'payload_too_large', 'Request body is too large');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new ApiError(413, 'payload_too_large', 'Request body is too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Reads the request body as a JSON object. Requests without a body yield {}. */
export async function readJsonBody(request) {
  const raw = await readRaw(request);
  if (raw === '') return {};
  const type = String(request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') {
    throw new ApiError(415, 'unsupported_media_type', 'Content-Type must be application/json');
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError(400, 'invalid_json', 'Request body is not valid JSON');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ApiError(400, 'invalid_body', 'Request body must be a JSON object');
  }
  return parsed;
}
