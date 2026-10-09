# Security policy

## Reporting a vulnerability

Please report security issues privately. Do not open a public issue.

Use GitHub private vulnerability reporting:

1. Go to the repository's **Security** tab:
   https://github.com/Joseph-Brendan/Frame-Relay/security
2. Click **Report a vulnerability**.
3. Describe the issue, including the affected version, steps to reproduce, and the impact you see.

Alternatively, open a draft security advisory directly:
https://github.com/Joseph-Brendan/Frame-Relay/security/advisories/new

What to expect: a reply from the maintainer, usually within a few days. If the report is valid, we
will work on a fix and credit you in the advisory unless you prefer otherwise. Please give us a
reasonable window before disclosing the issue publicly.

## Live mode security model

Live mode pairs the Figma plugin with your AI agent over a local connection. Its design keeps the
connection private to your computer:

- The bridge binds to `127.0.0.1` only. It is unreachable from other machines on your network.
- The server accepts WebSocket connections only when the `Origin` header is missing or `"null"`,
  which is what the Figma plugin iframe sends. Any other origin is rejected with HTTP 401.
- Pairing needs a six-digit code. Codes expire after 10 minutes and rotate after three wrong
  attempts. A session token is required before any selection can be sent.
- Session tokens are random, held in memory, and valid for 12 hours or until `stop_live` is called.
- Selections and preview images are kept in memory only. They are never written to disk.
- The only live mode file on disk is `.frame-relay/live.json`, which stores the port, pairing code,
  code expiry, paired flag and start time. It is deleted when the bridge stops, and `sync` adds it
  to `.gitignore`.

## Supported versions

Frame-Relay is public beta. Security fixes land on `main` and go out in the next published version.
There are no long-term support branches yet.
