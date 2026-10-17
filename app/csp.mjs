// Content-Security-Policy for the static pages. Every page here uses inline <script>/<style>
// blocks and nothing from other origins, so the policy allows exactly the inline scripts that are
// in the served file (by SHA-256 hash) instead of 'unsafe-inline', which would defeat the point.
import { createHash } from 'node:crypto';

const SCRIPT_BLOCK = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;

// Browsers turn CRLF and lone CR into LF while parsing HTML, and hash the script text after that,
// so a file saved with Windows line endings must be hashed the way the browser will see it.
const normalizeNewlines = (text) => text.replace(/\r\n?/g, '\n');

const sha256 = (text) => `'sha256-${createHash('sha256').update(normalizeNewlines(text), 'utf8').digest('base64')}'`;

/** Hashes of the inline script bodies in an HTML document (external scripts have no body). */
export function inlineScriptHashes(html) {
  return [...html.matchAll(SCRIPT_BLOCK)].filter((match) => match[1].trim() !== '').map((match) => sha256(match[1]));
}

/** The policy for one HTML document. Styles may be inline: injecting CSS cannot run code. */
export function policyFor(html) {
  const scripts = inlineScriptHashes(html);
  return [
    "default-src 'self'",
    `script-src ${scripts.length > 0 ? scripts.join(' ') : "'none'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
