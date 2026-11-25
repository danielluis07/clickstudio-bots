// Response headers for every route (#149), applied in next.config.ts.
//
// No nonces: Cache Components prerender static shells, which never see a
// per-request nonce, so inline scripts stay allowed and the policy instead
// limits which origins the page may load from, connect to and be framed by.

// Meta's JavaScript SDK, which runs Embedded Signup. The signup itself opens
// in a popup (not governed by CSP); the SDK frames and calls facebook.com.
const metaSdk = "https://connect.facebook.net";
const facebook = "https://*.facebook.com";

// Ably's realtime connection: its primary hosts and its fallback hosts, over
// WebSocket with an HTTP fallback.
const ablyHosts = ["*.ably.io", "*.ably.net", "*.ably-realtime.com"];
const ably = ablyHosts.flatMap((host) => [`https://${host}`, `wss://${host}`]);

export const contentSecurityPolicy = ({ development }: { development: boolean }) =>
  [
    "default-src 'self'",
    // React rebuilds server error stacks with eval in development only.
    `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""} ${metaSdk}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${facebook}`,
    "font-src 'self'",
    `connect-src 'self' ${ably.join(" ")} ${facebook}`,
    `frame-src ${facebook}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

export const securityHeaders = ({ development }: { development: boolean }) => [
  { key: "Content-Security-Policy", value: contentSecurityPolicy({ development }) },
  // frame-ancestors' predecessor, for browsers that ignore CSP framing rules.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];
