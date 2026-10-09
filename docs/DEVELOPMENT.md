# Development checkpoints

## Verified checkpoint: October 9, 2026

The first complete verification run passed on source commit `f23e96fd819dc2d45c83fa39472993a9ebb555d8`:

- TypeScript compilation and production Vite build.
- Unit and disposable-Git-repository integration tests.
- Standard age CLI interoperability, in both directions, including ASCII armor.
- Production dependency audit at the configured high-severity threshold.
- Chromium end-to-end tests: mobile layout, real worker password decryption, local key decryption, privacy-safe Markdown, editing/re-encryption, and ciphertext-only ZIP bundles.
- Static build and browser screenshots uploaded as GitHub Actions artifacts.

[Verification run](https://github.com/junovhs/gitvault/actions/runs/37995601097)

The maintenance workflow separately verified and committed the dependency lockfile and public demo. All demo passwords and documents are intentionally public, not real credentials.

## Continuing work

The current branch can be newer than the verified checkpoint above. The latest **Verify GitVault** run is authoritative for its own commit. A green build is not an independent security audit.

- Experimental passkey integration must include an independent recovery route and explicit compatibility limits.
- Deployment is gated on verification and a one-time Pages setting. It must not request an extra secret or pretend the site is live before it is deployed.
- More tests are being added for resource exhaustion, stale browser state and filesystem safety.

## Product boundaries

No backend, login database or server-side decryption. No automatic GitHub write authorization in the viewer. A public landing-page QR is a link, not a decryption capability. Custom phone-to-desktop approval remains a separate future feature.
