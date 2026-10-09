# GitVault

**Public repo. Private side.**

Private documents beside public code: standard age encryption, automatically generated GitHub landing pages, scannable QR codes, and a static viewer that unlocks files on your device.

[![Verify GitVault](https://github.com/junovhs/gitvault/actions/workflows/ci.yml/badge.svg)](https://github.com/junovhs/gitvault/actions/workflows/ci.yml)

[See the real interface](docs/screenshots/README.md) · [Example GitHub landing page](examples/private/welcome.md) · [Security model](docs/SECURITY.md)

![GitVault desktop interface](docs/screenshots/desktop-home.png)

> **Working prototype, not security-audited software.** Use test documents first, keep independent backups, and do not treat this as a production credentials manager.

## The workflow

```text
Your computer                    Public GitHub                   Any device

.gitvault/plain/strategy.md
         |
    gitvault encrypt
         |
         +---------------------> private/strategy.md ------------> viewer
                                 landing page + QR                   |
                                 private/strategy.md.age ------------+
                                 encrypted contents                  |
                                                          unlock on your device
                                                          read / edit / re-encrypt
```

Write the original in a **Git-ignored workspace**. Encrypt it **before committing**. GitVault generates a readable Markdown landing page and QR beside the ciphertext. A week later, follow that page's link from any computer or phone and use the configured unlock method. **No clone is required for reading.**

The permanent QR contains a public viewer URL, never a password or key. Scanning opens the viewer on the phone; it does not automatically unlock a laptop.

## What works

| Capability | Status |
| --- | --- |
| Password and age-key encryption/decryption, including armored files | Implemented and tested |
| Generated GitHub Markdown landing pages and SVG QR codes | Implemented and tested |
| Public repo explorer, branch/ref selection, filtering and local file opening | Implemented and browser-tested |
| Safe Markdown preview, editing and re-encrypted downloads | Implemented and browser-tested |
| Ciphertext-only GitHub ZIP bundles | Implemented and tested |
| Ignored-workspace CLI, key generation, exact staging and local pre-commit hook | Implemented and integration-tested |
| Passkey PRF plus independently verified age recovery | Experimental; virtual-authenticator tests passed |
| Encrypted folders with hidden internal filenames and private tree browsing | Experimental; unit and browser tests passed |
| Firefox and WebKit basic password/key unlock | Automated engine smoke checks passed |
| Custom phone-to-desktop pairing and direct GitHub commits from the viewer | Not implemented |

A file must have been encrypted for its chosen unlock method. A password-only file does not become passkey-enabled just because the UI offers passkeys. Physical iPhone/Android/passkey-provider compatibility has not been certified.

## Run the viewer

Use **Node.js 22.16+** for local development:

```sh
git clone https://github.com/junovhs/gitvault.git
cd gitvault
npm ci
npm run dev
```

Open the Vite address with `/gitvault/` as its base path. Try **Browse**, **Open a file**, **Encrypt**, **Passkey lab**, or **Explore encrypted folders**. The intentionally public demo password is:

```text
gitvault-demo-not-a-secret
```

The configured hosted address is `https://junovhs.github.io/gitvault/`. **It is not live until Pages is enabled and deployed.** In this repository, set **Settings > Pages > Build and deployment > Source: GitHub Actions**. The deployment workflow publishes only a verified current build. See [deployment instructions](docs/DEPLOYMENT.md).

The deployed site is static: visitors need no Node installation, build step, GitHub account or paid GitVault backend. Browsing still makes ordinary public requests to GitHub; local-file opening does not need GitHub requests.

## Use the CLI in another public repo

```sh
# In the GitVault checkout:
npm ci
npm link

# In the repository you want to protect:
cd /path/to/your-public-repo
gitvault init
```

The CLI does not need compilation. Without a global command, substitute `node /absolute/path/to/gitvault/bin/gitvault.mjs` for `gitvault`.

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

Use a trusted, deployed HTTPS viewer or localhost for development. Then:

```sh
mkdir -p .gitvault/plain
# Write private documents only inside this ignored workspace.
gitvault encrypt --stage
# Enter and confirm a strong password in the hidden terminal prompt.
git add .gitvault.yml .gitignore
git diff --cached --stat
git commit -m "Add encrypted private documents"
git push
```

Use the same password for later updates unless deliberately rotating access. For noninteractive commits, the process can supply `GITVAULT_PASSPHRASE`; never put it in Git, config or a public workflow.

For key-based encryption, run `gitvault keygen`, securely back up the ignored identity, and set `mode: recipient` with the printed public `recipient: age1...`. Encryption then needs only the public recipient.

### Come back on another computer

For reading: **GitHub landing page → viewer → configured unlock method → read**.

For local editing, clone the repository and run `gitvault decrypt`. Password mode prompts. Key mode uses `GITVAULT_IDENTITY_FILE` pointing to your backed-up key. Edit the restored documents in `.gitvault/plain/`, then run `gitvault encrypt --stage` before the next commit. Restore refuses existing local files rather than overwriting your work.

The CLI owns its generated directory through a public manifest. Browser-created standalone bundles do not include that manifest; use the browser for those or establish a separate CLI-managed output directory.

### Automatic encryption before commits

```sh
gitvault hook install
```

The hook runs encryption and exact staging before a commit, honors the configured output directory, and aborts on failure. It does not overwrite existing hooks. It is local to each clone and references the GitVault installation used to create it.

**Hooks are not a security boundary.** Reinstall on each computer. `--no-verify`, `git add -f`, plaintext elsewhere in the repo and already-published Git history are not magically protected. The ignored workspace is the primary safeguard.

## Passkeys and private folders

The [passkey lab](docs/PASSKEYS.md) uses WebAuthn PRF and requires a separately downloaded age recovery key. It verifies that recovery locally before offering encrypted downloads. Hostname scope and provider compatibility matter; recovery must not depend only on a phone.

The [folder experiment](docs/FOLDERS.md) encrypts file paths and contents together as one `.gvfolder.age` file. Its separate viewer displays the internal tree only after unlock. It supports up to 128 files and 8 MiB total; exports are explicit, and the whole folder is re-encrypted after changes. This is not a live filesystem mount.

## Verification, not just scaffolding

CI builds the actual static site, runs unit and disposable-Git-repository tests, checks compatibility with the official age CLI, audits dependencies and executes real Chromium browser tests. Firefox and WebKit jobs separately check basic password and identity unlocking. Passkey tests use virtual authenticators, not physical phones.

A documented checkpoint passed **52 Node tests, 15 Chromium tests, 2 Firefox checks and 2 WebKit checks**. See [development checkpoints](docs/DEVELOPMENT.md) and the latest Actions result for the exact tested commit. Later changes require their own successful run.

Builds, browser reports and screenshots are preserved as workflow artifacts. The [repo screenshot gallery](docs/screenshots/README.md) contains actual app captures with test provenance. A green build is not an independent security audit.

## Security boundaries

GitHub exposes outer filenames, sizes and history. Password guessing is offline. A compromised viewer host, dependency, extension or OS can steal an entered key. Plaintext downloads and screenshots are outside GitVault protection. Losing every unlock method means losing access; rotating a key cannot revoke old copies.

The CLI rejects unsafe paths, symlinks/hardlinks, tracked plaintext, unowned output files and name collisions. Reads are bounded and writes are atomic per file, but not across an entire vault or against an actively hostile same-user process. See the [full security model](docs/SECURITY.md).

## Project guide

[Configuration](docs/CONFIG.md) · [Architecture](docs/ARCHITECTURE.md) · [Passkeys](docs/PASSKEYS.md) · [Folders](docs/FOLDERS.md) · [Testing](docs/TESTING.md) · [Deployment](docs/DEPLOYMENT.md) · [Roadmap](docs/ROADMAP.md) · [Contributing](CONTRIBUTING.md)

TypeScript, Vite and standard age encryption. No React, database, tracking, custom cipher or server-side decryption. MIT licensed.
