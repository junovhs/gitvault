# Encrypted folder experiment

The regular CLI encrypts files individually, which leaves their public filenames visible. The separate **folder experiment** packages a small folder into one encrypted `.gvfolder.age` file. Internal names, paths and contents all stay inside that ciphertext.

Open `folder.html` on the same static site or local Vite server. For example, local preview serves it at `/gitvault/folder.html`.

## Workflow

Select a local folder, choose a password or public age recipient, and encrypt. Download the single encrypted file, or a GitHub bundle containing that ciphertext plus a Markdown landing page and SVG QR. The landing page points to the folder viewer, not the ordinary single-document viewer.

Later, follow the landing page or open the encrypted folder file locally. Supply the configured password or private age identity. The folder viewer lists the internal directories and lets you preview text/Markdown safely or download individual files. **Download plaintext folder ZIP** is an explicit export outside GitVault protection.

The whole folder must be re-encrypted after changes. This is not a live filesystem mount or automatic CLI folder mode. The selected outer folder name is omitted from internal paths; choose a non-sensitive name for the public encrypted bundle.

## Format

Encryption remains standard age. The decrypted payload is a deliberately small, versioned JSON data container:

```json
{"format":"gitvault-folder","version":1,"files":[{"path":"notes/plan.md","data":"BASE64_FILE_BYTES"}]}
```

This is data packaging, not a custom cipher. It contains no scripts, links, compression, timestamps or executable metadata. The official age CLI can decrypt it; `unpackFolder` in `src/folder-format.ts` describes the complete payload format. The browser can export a normal uncompressed ZIP after decryption.

## Limits and safeguards

The experiment supports 1–128 files, at most 8 MiB of original contents and a 12 MiB encoded container. It rejects traversal, duplicate paths, file/directory collisions, case/Unicode aliases, Windows device names, invalid base64 and unsupported versions. It never automatically writes an archive to the filesystem. It does not inflate untrusted compressed archives.

The outer file name, aggregate ciphertext size, public landing page, QR and Git history remain visible. These limits are intentional for browser memory and reviewability. Empty directories and filesystem permissions are not preserved. Password strength and viewer-origin trust remain essential. The experiment is unaudited and should be used with test data first.
