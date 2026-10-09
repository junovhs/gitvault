# Contributing to GitVault

GitVault handles secrets. Prefer a smaller correct change over a new feature that weakens a trust boundary.

## Local setup

Use Node.js 22.16 or newer. Install the committed dependency lock with `npm ci`. Run `npm run build`, `npm test`, and `npm run test:e2e` before proposing a change. Browser testing requires `npx playwright install chromium`; CI installs its system dependencies too.

The CLI launcher needs no compilation. Run `node bin/gitvault.mjs --help` or `npm link`. Always test destructive or Git-mutating behavior in a temporary repository, not your working repository.

## Security invariants

- Plaintext, passwords and private identities must not enter Git, generated bundles, QR codes, URLs, logs, screenshots or analytics.
- Use the established age library. New payload containers do not justify inventing new cryptography.
- Default to fail-closed behavior for unsafe paths, missing credentials, overwritten files and unsupported authenticators.
- Keep browser secrets out of localStorage, sessionStorage, IndexedDB and service workers.
- Never activate untrusted document HTML, remote images or script-bearing markup in a decrypted preview.
- Every passkey encryption flow needs an independently tested recovery route.
- A public QR is a locator, not an authorization mechanism.
- Do not silently add an external host to the Content Security Policy or network allowlist.

## Tests and evidence

Add regression tests for any discovered bug. Filesystem tests use disposable repositories. Interoperability tests run the official age CLI. Browser tests execute the built application and test real workers; WebAuthn tests use a virtual authenticator with and without PRF.

Synthetic fixtures are public by design. Do not replace a demo password with a real password. Screenshot-publishing workflows have explicit file allowlists and verified-run provenance. Keep write permissions isolated from general CI.

A passing test run is not an independent audit. Clearly distinguish implemented, experimentally supported, automatically tested, physically tested and planned behavior in documentation.

## Dependency changes

Update the lockfile deliberately. The maintenance workflow generates only allowlisted lock/demo artifacts after build and tests, and refuses to publish artifacts from stale source inputs. Review the production audit and the actual diff rather than blindly accepting upgrades.

## Release checklist

Confirm the exact main commit has a successful Verify GitVault run. Download its static artifact and browser evidence. Check that documentation matches current behavior. Pages configuration is separate: a successful verification workflow does not itself mean the site is live.
