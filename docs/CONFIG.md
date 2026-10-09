# Configuration and CLI

The CLI is launched by `bin/gitvault.mjs` and uses the installed TypeScript runtime. Run `npm ci` in this checkout, then `npm link` for a local `gitvault` command, or call the launcher by absolute path. No CLI build step is needed. This project is not published as an npm package.

Commands resolve the target Git working-tree root from the caller's current directory, including when called from a subdirectory.

## Configuration

`gitvault init` creates `.gitvault.yml`, adds rooted ignore patterns for `.gitvault/plain/` and `.gitvault/keys/`, and creates the private workspace. It refuses to overwrite an existing configuration.

| Field | Meaning |
| --- | --- |
| `version: 1` | Supported configuration version |
| `repo: owner/repo` | Public repository used by viewer links |
| `viewer` | Trusted HTTPS viewer URL; HTTP only for localhost development |
| `source` | Git-ignored local plaintext directory, default `.gitvault/plain` |
| `output` | Dedicated generated-artifact directory, default `private` |
| `mode` | `passphrase` or `recipient` |
| `recipient` | Required public age recipient in recipient mode; never a private identity |
| `ref` | Optional branch, tag or commit used in public links |

Source and output must not overlap. Unsafe relative paths and Git internals are rejected. If you change the source directory, update `.gitignore` first. A directory probe and every actual source file must be ignored; no source file may already be tracked.

## Commands

### `gitvault encrypt [--stage]`

Read the ignored workspace and generate a `.age` payload, a Markdown landing page, and an SVG QR per file. Markdown originals retain their filename for the landing page; other originals receive a `.md` suffix. A public `.gitvault-manifest.json` records the expected generated names.

Passphrase mode prompts without echoing input and confirms new encryption passwords. Noninteractive use accepts `GITVAULT_PASSPHRASE` in the process environment. The minimum length is 16 characters; that is not a strength guarantee. Public-key mode uses only the configured recipient and needs no decryption identity.

`--stage` adds only the exact generated paths to Git. It does not stage arbitrary changes or the plaintext workspace. Review the staged diff before committing. Ciphertexts are randomized on each encryption; unchanged originals can still produce new ciphertext.

The tool refuses to adopt unowned output directories or overwrite unknown files. Source deletion is not an automatic deletion request: restore removed sources before re-encrypting. There is no prune command yet.

### `gitvault decrypt` / `gitvault unlock`

Read the CLI manifest, decrypt its payloads and restore files into the ignored source directory. All destination files are checked before decryption; existing files are never overwritten. Incorrect keys fail before any prepared plaintext is written. Writes are not a whole-folder filesystem transaction.

Password mode prompts, or uses `GITVAULT_PASSPHRASE`. Key mode accepts `GITVAULT_IDENTITY_FILE` or `GITVAULT_IDENTITY`. Standard age identity files with comment lines are supported. Securely back up the original identity: generating a new one cannot decrypt files addressed to the old one.

Browser-generated one-off ZIP bundles do not include a CLI ownership manifest. They can be read and edited in the browser but are not automatically imported into a CLI-managed vault.

### `gitvault keygen`

Generate an age identity in ignored `.gitvault/keys/identity.txt`, mode 0600, refusing an existing file. The terminal prints the public recipient only. Back up the private file outside Git before relying on it.

### `gitvault check` / `gitvault status`

Validate configuration, paths, and ignored/untracked plaintext. This is a workspace guard, not a scan of Git history or a cryptographic audit.

### `gitvault hook install`

Install a local pre-commit hook with an absolute reference to this Node/GitVault installation. It runs `encrypt --stage` from the target repo root and honors custom output directories. It refuses existing hooks and custom `core.hooksPath` settings rather than overwriting them.

Hooks do not travel with clones. Noninteractive commits need an environment password or recipient mode. `--no-verify` can bypass hooks. A hook cannot undo a plaintext commit or protect unrelated files outside the configured source path.

## Current scope

One ignored source tree per vault, no glob remapping, no automatic deletion/pruning, no encrypted folder mount, no direct GitHub writes from the viewer, and no CLI WebAuthn prompt. Passkey files created in the browser can be recovered with their independent age identity.
