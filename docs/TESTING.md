# Test strategy and evidence

## What verification means

The **Verify GitVault** workflow is tied to an exact commit. Its success requires the configured build, unit/integration tests, native age compatibility, dependency audit and browser checks to pass. It is not a cryptographic review, penetration test or physical-device certification.

## Automated layers

### TypeScript and production build

`npm run build` compiles all source and test TypeScript and builds both static entrypoints, `index.html` and `folder.html`. The same built files are used for browser testing and deployment artifacts.

### Node tests

`npm test` uses disposable Git repositories and synthetic keys. It covers encryption, wrong keys and tampering, armored age files, safe paths, bounded filesystem reads, manifest validation, ignored/tracked source checks, write ownership, hook staging, clone/decrypt recovery, filename collisions, terminal input, public bundles and the folder container.

Set `GITVAULT_AGE_BINARY=age` to run the native reference-implementation test locally. CI installs that binary and does not skip interoperability. GitVault-created ciphertext is opened by the official age tool, and official armored ciphertext is opened by GitVault.

### Chromium full suite

`npm run test:e2e` runs the built UI in Chromium. It exercises real browser workers, local decryption, password failure, idle locking, GitHub rate limits, branch-preserving navigation, safe Markdown preview, local editing/re-encryption, encrypted bundles, folder selection and private tree browsing.

WebAuthn tests use a Chromium virtual authenticator. One exposes PRF; another does not. Tests cover credential creation, passkey encryption/unlock, and independent age recovery after removing the virtual authenticator. That is not a claim of tested iPhone, Android, synced-provider or cross-device QR behavior.

### Firefox and WebKit smoke checks

CI separately runs password and identity unlock, worker execution, safe preview, mobile-width layout and locking in Firefox and WebKit. These run as desktop browser engines on Linux. They are useful compatibility evidence, **not physical mobile device tests** and not passkey-provider certification.

For local engine checks:

```sh
npx playwright install firefox webkit
GITVAULT_BROWSER=firefox npm run test:e2e
GITVAULT_BROWSER=webkit npm run test:e2e
```

## Evidence artifacts

A successful run preserves `gitvault-static`, `browser-evidence`, and per-engine compatibility reports. Screenshots include only intentionally public fixtures. The repository screenshot gallery records its own tested source commit; it can be older than current main.

Inspect the current Actions result before citing a test as passed. New test code being committed is not proof that it ran successfully.
