# Architecture and trust boundaries

GitVault is a local CLI and two static browser entrypoints. Both use the same established `age-encryption` library and standard age ciphertext. There is no GitVault server that receives a password, private identity or decrypted document.

## Components

| Component | Responsibility |
| --- | --- |
| `bin/gitvault.mjs`, `src/cli.ts` | No-build local CLI, ignored-source checks, encryption, ownership manifest, landing assets, exact staging and local hooks |
| `src/crypto.ts` | Standard age password/recipient encryption and identity decryption; armor and resource checks |
| `src/crypto.worker.ts`, `src/crypto-client.ts` | Browser worker isolation for password derivation, one operation at a time, timeout and cancellation |
| `src/github.ts` | Public GitHub directory and bounded raw-file requests, no token or cookies |
| `src/locator.ts`, `src/landing.ts`, `src/bundle.ts` | Public-only locator URLs, escaped Markdown landing pages, QR and ciphertext-only ZIP bundles |
| `src/web.ts`, `src/markdown.ts` | Repo explorer, local unlock, safe document preview, local editing and re-encrypted download |
| `src/passkeys.ts`, `src/passkey-lab.ts` | Experimental WebAuthn PRF plus an independently verified age recovery recipient |
| `src/folder-format.ts`, `src/folder-web.ts` | Bounded folder container, encrypted internal paths, private tree browsing and explicit exports |

## Per-document CLI flow

Plaintext lives only under a configured Git-ignored source directory, default `.gitvault/plain/`. Before a commit, the CLI validates config, every source path, tracking/ignore rules, size limits, ownership and generated filename collisions. It prepares ciphertext and public artifacts in memory before writing generated files.

Each original becomes an `.age` file, a public Markdown landing page and an SVG QR. A `.gitvault-manifest.json` tracks the generated artifacts. Individual replacements are atomic; the entire folder is not a filesystem transaction. The optional `--stage` flag stages only exact generated paths after encryption succeeds.

The local hook invokes that same command with `--stage`. It is optional, local to one clone, and bypassable with Git options. It never transforms a plaintext push retroactively. Git history containing plaintext must be treated as exposed.

## Browser read flow

A generated URL carries public `repo`, `file` and optional `ref` values in a fragment. The static host therefore does not receive those fragment values in the HTTP request, although the browser code and GitHub requests necessarily know the public locator.

The viewer fetches ciphertext directly from GitHub or reads a user-selected local file. Password/identity decryption runs in a short-lived worker. Plaintext is displayed from memory; Markdown is rendered through safe DOM/text operations with no active HTML, remote images or external links. Explicit downloads and browser screenshots are outside this protection.

Navigation, page-hide handling, explicit lock and idle lock clear application references and wipe owned byte arrays where possible. JavaScript strings, browser internals, extensions and OS swap cannot be guaranteed to erase forensic traces.

## Passkeys

The experimental lab uses WebAuthn PRF recipients from the age library. It adds a separate standard X25519 age recovery recipient to the same ciphertext and verifies that recovery by decrypting a local copy before offering downloads. Recovery identities are downloaded separately, never bundled or stored in application persistence.

A passkey is scoped to the relying-party hostname, not a repository or path. Provider synchronization and cross-device PRF support are outside GitVault's control. Tests use virtual authenticators; physical device certification remains outstanding. See [PASSKEYS](PASSKEYS.md).

## Private folders

`folder.html` packs file paths and bytes into a bounded versioned JSON payload, then encrypts it with age. This is payload serialization, not custom cryptography. It deliberately avoids decompression and automatic filesystem extraction. Internal filenames stay inside the ciphertext; the outer filename, total size and Git history stay public. See [FOLDERS](FOLDERS.md).

## Network and deployment

The built site consists only of static files. Repository browsing uses `api.github.com`; local file opening needs no GitHub request. There are no analytics, third-party script CDNs, application accounts or automatic GitHub write tokens.

The viewer host is nevertheless trusted executable code. A compromised origin can replace JavaScript and steal inputs. Content Security Policy, pinned dependencies and local hosting reduce some risks but are not an independent audit.

CI builds and tests the site, compares ciphertext with the official age implementation, audits dependencies, and preserves artifacts. The Pages workflow publishes only a current verified build after the repository's one-time Pages setting is enabled. See [DEPLOYMENT](DEPLOYMENT.md).
