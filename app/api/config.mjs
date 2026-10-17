// Switches for running the API on the public internet. Read at call time (not import time) so
// tests can flip them. Everything is off by default: local runs and the test suite behave as before.
//
//   HARDENED=1     public mode: the shared demo account is read-only, X-Tenant is ignored (everyone
//                  uses the one default tenant), requests are rate limited per IP, and the default
//                  tenant is wiped on a timer so visitors cannot fill it up.
//   TRUST_PROXY=1  the server sits behind one reverse proxy (Render, Railway, ...) that appends the
//                  caller's address to X-Forwarded-For; rate limits then use that address.
const isOn = (name) => process.env[name] === '1';

export const isHardened = () => isOn('HARDENED');
export const trustsProxy = () => isOn('TRUST_PROXY');

/** How often the default tenant is wiped in hardened mode. */
export const RESET_INTERVAL_MS = 60 * 60 * 1000;
