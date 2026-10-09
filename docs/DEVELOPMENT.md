# Development checkpoints

## Verified checkpoint: October 9, 2026

Source commit `d4bcefe4da8b579b07e46dda9511a232ad5b3623` passed the complete verification workflow:

- TypeScript compilation and both production static entrypoints.
- **55 Node unit/integration tests**, including official age CLI interoperability and deployment-source guards.
- **15 Chromium browser tests**, including virtual PRF passkeys, independent recovery, encrypted folders, worker decryption, editing, safe preview and ciphertext-only bundles.
- **2 Firefox compatibility checks** and **2 WebKit compatibility checks** for password/identity unlock and mobile-width layout.
- Full production/development dependency audit with failure on **moderate or higher** reported issues.
- Static website and browser evidence uploaded as workflow artifacts.

[Successful verification run](https://github.com/junovhs/gitvault/actions/runs/37998722523)

### Audit follow-up completed

The earlier checkpoint reported a moderate issue in `fflate` 0.8.2. The dependency and lockfile now use patched **0.8.3**, and the stricter audit passed. GitVault's production folder format does not use ZIP decompression, but the vulnerable dependency was still replaced.

Reference: [GHSA-px8p-9vwx-vf98](https://github.com/advisories/GHSA-px8p-9vwx-vf98).

## Published UI evidence

The repository gallery now includes desktop/mobile home, locked/unlocked documents, the private folder tree, the passkey/recovery lab and mobile-width unlocked content. These are screenshots from the actual built application using synthetic fixtures. Each gallery refresh records its tested source commit.

[Open the screenshot gallery](screenshots/README.md)

## What the prototype now includes

A static mobile-responsive viewer, no-build CLI launcher, pre-commit integration, passkey/recovery experiment, private-folder experiment, public demo, locked dependencies, browser-engine checks and verification-gated deployment. Additional keyboard-navigation improvements are accompanied by new browser tests; inspect the latest run for their result.

## Remaining boundaries

GitHub Pages requires its one-time repository setting before the site is live. Custom phone-to-desktop pairing, direct GitHub writes from the viewer, CLI glob remapping and whole-vault transactional updates are not implemented. Physical device/provider passkey testing and independent security review remain outstanding.

The current branch can be newer than this checkpoint. The latest **Verify GitVault** run is authoritative for its own commit. A green test run is not a security audit, and a Pages workflow that skips an unconfigured site is not a deployment.
