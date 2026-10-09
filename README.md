# GitVault

**Public repo. Private side.**

Private documents beside public code: standard age encryption, automatically generated GitHub landing pages, a scannable QR, and a static viewer that unlocks files on your device.

[![Verify GitVault](https://github.com/junovhs/gitvault/actions/workflows/ci.yml/badge.svg)](https://github.com/junovhs/gitvault/actions/workflows/ci.yml)

[See the actual interface](docs/screenshots/README.md) · [Open the example GitHub landing page](examples/private/welcome.md) · [Security model](docs/SECURITY.md)

![GitVault desktop interface](docs/screenshots/desktop-home.png)

> **Working prototype, not security-audited software.** Automated tests cover the core workflow, but do not use this as your only copy of sensitive information or as a production credentials manager.

## The idea, in one minute

```text
your computer                      public GitHub                   any device

.gitvault/plain/strategy.md
            |
       gitvault encrypt
            |
            +--------------------> private/strategy.md
                                   public landing page + QR ---------> viewer
                                   private/strategy.md.age               |
                                   encrypted contents -------------------+
                                                                         |
                                                            unlock on your device
                                                            read / edit / re-encrypt
```

You write the original in a **Git-ignored workspace**. GitVault encrypts it **before committing**, then generates a readable Markdown landing page and QR beside the encrypted file. A week later, on another computer or phone, follow that page's link and unlock in the viewer. No clone is required for reading.

The permanent QR contains a **public viewer URL**, not a password or key. Scanning opens the viewer on the phone; it does not automatically unlock a laptop.

## What is implemented

| Feature | State |
| --- | --- |
| Password and age-key encryption/decryption | Implemented; tested in CLI and browser |
| Generated GitHub Markdown landing pages and SVG QR codes | Implemented |
| Public repo explorer, branch/ref selection and file filtering | Implemented |
| Open a local encrypted file without GitHub requests | Implemented |
| Safe Markdown preview, local editing and re-encrypted downloads | Implemented |
| Download ciphertext-only GitHub ZIP bundles | Implemented |
| Ignored-workspace CLI, key generation, exact staging and local pre-commit hook | Implemented; integration-tested |
| Passkey PRF with a separate age recovery key | Experimental; see [passkey compatibility and tests](docs/PASSKEYS.md) |
| Static deployment, verified build artifacts and screenshot gallery | Implemented; Pages needs one-time repository setup |
| Custom phone-to-desktop QR pairing, direct GitHub commits, encrypted folder archives | Not implemented |

Each file must have been encrypted for its chosen unlock method. A password-only file does not become passkey-enabled just because the viewer has a passkey option.

## Try the viewer

Requires **Node.js 22.16+** for local development:

```sh
git clone https://github.com/junovhs/gitvault.git
cd gitvault
npm ci
npm run dev
```

Open the Vite address with `/gitvault/` as its base path. Use **Try the public demo**, **Open a file**, or **Encrypt**. The intentionally public demo password is:

```text
gitvault-demo-not-a-secret
```

The hosted URL is configured as `https://junovhs.github.io/gitvault/`, but it is not live until GitHub Pages is enabled and deployed. In this repository, set **Settings > Pages > Build and deployment > Source: GitHub Actions**. The deployment workflow publishes only a verified current build. See [deployment](docs/DEPLOYMENT.md).

The deployed viewer is static: visitors do not install Node, build the app, sign in, or pay for a GitVault backend. It still makes ordinary public requests to GitHub when browsing a repository.

## Use the CLI in your own public repository

Install dependencies in the GitVault checkout, then optionally link its local command:

```sh
# Inside the GitVault checkout:
npm ci
npm link

# Inside the repository whose private documents you want to protect:
cd /path/to/your-public-repo
gitvault init
```

No CLI compilation step is needed. To avoid a global command, use `node /absolute/path/to/gitvault/bin/gitvault.mjs` instead of `gitvault`.

Edit the generated `.gitvault.yml`:

```yaml
version: 1
repo: your-name/your-public-repo
viewer: https://junovhs.github.io/gitvault/
source: .gitvault/plain
output: private
mode: passphrase
# Optional: ref: main
```

The viewer URL must be a trusted, deployed HTTPS origin, or localhost during development. Then:

```sh
mkdir -p .gitvault/plain
# Write your private documents in this ignored folder.
# Do not create or commit a plaintext copy elsewhere in the public repo.
gitvault encrypt --stage
# Enter and confirm a strong password in the hidden terminal prompt.
git add .gitvault.yml .gitignore
git diff --cached --stat
git commit -m "Add encrypted private documents"
git push
```

For repeat encryption, use the same password unless deliberately rotating access. Noninteractive hooks accept `GITVAULT_PASSPHRASE` from the process environment; never put it in config, scripts or a public workflow.

To use public-key encryption, run `gitvault keygen`, back up the ignored identity file, and set `mode: recipient` plus the printed public `recipient: age1...` in the config. Encryption then needs only the public recipient, not the private key.

### Coming back on another computer

For reading: **GitHub landing page → viewer → configured unlock method → read**.

For local editing:

```sh
git clone https://github.com/your-name/your-public-repo.git
cd your-public-repo
gitvault decrypt
# Password mode prompts locally.
# Key mode: set GITVAULT_IDENTITY_FILE to your backed-up identity file.
# Edit restored documents under .gitvault/plain/.
gitvault encrypt --stage
git commit -m "Update encrypted documents"
git push
```

`decrypt` restores only to the ignored workspace and refuses to overwrite existing local files. The CLI uses a public manifest to identify its artifacts. Browser-generated standalone bundles have no CLI manifest; use the browser for those or establish a separate CLI-managed output directory.

### Automatic local encryption

```sh
gitvault hook install
```

The hook runs before a commit, stages only generated files, honors the configured output directory, and aborts when encryption fails. It does not overwrite existing hooks. It is local to each clone and references the GitVault installation used to create it. Reinstall it on every computer.

**A hook is not a security boundary.** `--no-verify`, `git add -f`, earlier Git history, and plaintext outside the configured workspace are not magically protected. The ignored workspace is the primary safeguard.

## How much of this is actually tested?

CI installs locked dependencies, compiles TypeScript, builds the site, runs unit/integration tests, checks compatibility with the official age CLI, audits production dependencies at the configured threshold, and runs real Chromium browser tests. The browser tests exercise worker-based decryption, local editing/re-encryption, safe preview and ciphertext-only bundles. Passkey tests use virtual authenticators; they are not physical-phone certification.

The workflow preserves the built site, browser reports and screenshots. See [development checkpoints](docs/DEVELOPMENT.md) and the current Actions result for the exact tested commit. A green test run is not an independent security audit.

## Security boundaries

GitHub can retain every old ciphertext and expose filenames, sizes and history. Password guesses happen offline. A compromised viewer host, dependency or browser extension can steal an entered key. Decrypted downloads, screenshots and editor backups are outside GitVault protection. Losing all unlock methods means losing access. Key rotation cannot revoke old copies already downloaded by someone else.

The CLI rejects unsafe paths, symlinks/hardlinks, tracked plaintext, unowned output files and generated-name collisions. It preflights writes and uses per-file atomic replacement, but does not promise a whole-vault transaction or protection from a hostile process running as the same OS user.

The current prototype is deliberately bounded: 16 MiB per original file, 24 MiB per downloaded ciphertext, and 64 MiB per CLI encryption operation. Large archives, automatic pruning and hidden filenames are future work.

## Project map

- [Configuration and commands](docs/CONFIG.md)
- [Architecture and trust boundaries](docs/ARCHITECTURE.md)
- [Security model](docs/SECURITY.md)
- [Experimental passkeys and recovery](docs/PASSKEYS.md)
- [Product workflow](docs/UX.md)
- [Roadmap](docs/ROADMAP.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Actual screenshots](docs/screenshots/README.md)

TypeScript, Vite, standard age encryption. No React, database, tracking, custom cipher, or server-side decryption. MIT licensed.
