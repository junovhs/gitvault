# Development checkpoints

## Verified checkpoint: October 9, 2026

Source commit `7fc8cf5c4e86b30615713440cdb75e09309a4ca1` passed the complete verification workflow:

- TypeScript compilation and both production static entrypoints.
- **52 Node unit/integration tests**, no skips in CI, including official age CLI interoperability.
- **15 Chromium browser tests**, including virtual PRF passkeys, independent recovery, encrypted folders, worker-based decryption, local editing, safe preview and public bundles.
- **2 Firefox compatibility checks** and **2 WebKit compatibility checks** for password/identity unlock and mobile-width layout.
- Full production/development dependency audit at the configured high-severity threshold.
- Static website and browser evidence uploaded as workflow artifacts.

[Successful verification run](https://github.com/junovhs/gitvault/actions/runs/37997989908)

### Audit follow-up

That checkpoint's audit still reported one **moderate** issue in `fflate` 0.8.2, below the prior failure threshold. The manifest is being updated to patched **0.8.3**, followed by lockfile regeneration and another complete verification. GitVault's production folder format does not use ZIP decompression, but a known vulnerable dependency should not be retained merely because current application paths avoid it.

Reference: [GHSA-px8p-9vwx-vf98](https://github.com/advisories/GHSA-px8p-9vwx-vf98).

## Implemented since the first bootstrap

The repository now includes a mobile-responsive document viewer, no-build CLI launcher, pre-commit integration, passkey/recovery experiment, private-folder experiment, synthetic demo and real screenshot gallery. These are functioning implementations rather than UI-only mockups; current behavior still depends on the exact commit's verification result.

## Remaining boundaries

GitHub Pages requires its one-time repository setting before the site is live. Custom phone-to-desktop pairing, direct GitHub writes from the viewer, CLI glob remapping and whole-vault transactional updates are not implemented. Physical device/provider passkey testing and independent security review remain outstanding.

The current branch can be newer than the checkpoint above. The latest **Verify GitVault** run is authoritative for its own commit. A green test run is not a security audit, and a Pages workflow that skips an unconfigured site is not a deployment.
