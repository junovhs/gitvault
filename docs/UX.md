# Product workflow

## Creating a private document

A user has a free public repository and wants a private document beside its code. They can either use the local CLI's ignored workspace or select the document in the browser.

The CLI generates a `.age` file, Markdown landing page and SVG QR before committing. The browser can download the same public artifact bundle as a ZIP; the user extracts and commits only those generated files. Neither route requires putting plaintext into Git history.

## Finding it a week later

The user clicks the generated Markdown page on GitHub. It says the document is encrypted, names the configured public file, and offers an **Open in GitVault** link and QR. The link/QR contains no key.

Following the link opens a static viewer that fetches public ciphertext. The user chooses the unlock method that was configured for that file: password, private age identity, or a compatible experimental encryption passkey. Successful decryption renders the document locally. No clone is needed.

## Editing

The regular viewer has preview, source and edit modes for UTF-8 documents. **Encrypt edited copy** opens fresh encryption settings; it does not silently preserve or infer all previous recipients. The user deliberately chooses the new unlock method and downloads a replacement ciphertext or public bundle.

The website does not automatically commit to GitHub. Local editing after cloning uses `gitvault decrypt`, an ignored plaintext workspace, then `gitvault encrypt --stage` before the next commit.

## Phone experience

The permanent QR opens the same viewer on the phone. The user still needs the configured password, identity or compatible passkey. GitVault does not implement a custom phone-to-desktop pairing channel. A platform's own cross-device passkey prompt is distinct and is not guaranteed to carry PRF output.

## Private folders

The separate folder experiment packages a small directory into one age-encrypted container. GitHub sees the outer file but not its internal paths. After unlocking, the browser displays a private file tree and safe previews, with deliberate individual-file or plaintext ZIP exports. The whole folder is re-encrypted after edits; this is not a filesystem mount.

## Recovery and clear failure

Wrong keys, unsupported authenticators, oversized inputs, rate limits and unsafe paths must produce actionable failures rather than plaintext fallback. Passkey creation requires an independent recovery key. A user can open a downloaded ciphertext locally even when GitHub API access is unavailable.

Lock controls and idle locking remove private content from the UI. The product must not imply forensic memory erasure, retroactive Git-history deletion or security against a compromised viewer host.
