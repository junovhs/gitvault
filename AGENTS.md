# Working on GitVault

Use Node.js 22.16+, TypeScript and the existing age library. Keep the deployed application static. See CONTRIBUTING.md and docs/SECURITY.md before changing encryption, filesystem or browser trust boundaries.

## Verify changes

- Install the committed lock with `npm ci`.
- Run `npm run build` and `npm test`.
- Run `npm run test:e2e` after browser changes; install Playwright Chromium first.
- For compatibility checks, use `GITVAULT_BROWSER=firefox` or `webkit` with the corresponding browser installed.
- Set `GITVAULT_AGE_BINARY=age` to include native interoperability.

Tests must use disposable repositories and synthetic data. Never place real credentials or private documents into fixtures, public demos, screenshots, logs or generated bundles. Do not weaken a failing security test to make CI green without addressing the underlying behavior.

## Preserve invariants

Plaintext stays in an ignored workspace. Encrypt before commit, never after push. A public landing-page URL or QR contains no decryption capability. Browser previews must not activate untrusted HTML or fetch remote document images. No localStorage/IndexedDB secret persistence is needed. Passkey encryption needs independent recovery and honest compatibility labels.

Use explicit size/path checks for public inputs. Do not automatically overwrite unowned output files, private keys or existing restored plaintext. Repository write workflows must stay narrowly scoped, use allowlisted generated outputs and non-force updates, and avoid exposing write tokens during dependency installation.

## Documentation

Distinguish implemented code, tests actually run, virtual-authenticator evidence, physical-device coverage and future plans. State which commit was verified. A successful build is not an audit; a successful Pages workflow that skipped an unconfigured site is not a deployment.

## Product-surface experiment (this branch)

The `product-surface` branch is deliberately isolated from `main`. See [docs/PRODUCT_SURFACE.md](docs/PRODUCT_SURFACE.md) and [docs/PRODUCT_NOTES.md](docs/PRODUCT_NOTES.md) before changing the UI. Preserve one calm default workspace, an add-file action, and a secondary More section for specialized tools. Old `#page=...` routes and `folder.html` public landing links must remain valid. Do not imply repository discovery, authentication, local key persistence, direct GitHub commits, or multi-recipient controls that have not been implemented. UI consolidation must not weaken security checks.
