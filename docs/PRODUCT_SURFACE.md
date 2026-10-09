# Product surface — GitVault

**Status:** Product-experience proposal on the `product-surface` branch. This is a presentation and documentation pass over a working but unaudited prototype, **not** a claim that its future unified vault and sharing features already exist.

## Product in one sentence

**Your repo has a private side.**

Keep private project notes, research, tentative business plans, and documents in the context of public open-source work. Git stores only encrypted publication artifacts; opening them should feel like opening files, not operating an encryption toolkit.

## What this is for

- A developer has many public GitHub repositories and wants private project thinking in the corresponding repositories.
- A document may remain **for me** or eventually be **shared with selected recipients** without turning the entire repository private.
- Users prefer one calm experience, with security and format controls available when needed.
- Active production credentials should continue to use dedicated secrets management. GitVault is unaudited; encryption is not retroactive removal from Git history.

## The product promise

1. **Small surface, real depth.** A repository, files, folders, open, add, and (later) share. Avoid crypto vocabulary until an unlock or recovery decision requires it.
2. **Local-first and portable.** No proprietary encryption. Use age and keep independent key recovery. No account, telemetry, or secret-bearing backend.
3. **Private by default; sharing is an action.** A file should not require a different container or product just to be shared. Recipient UX is future work.
4. **Meaningful metadata privacy.** Some documents can be publicly discoverable (landing page + link). Other private thinking needs concealed internal filenames and paths. Both remain first-class.
5. **A fail-closed publishing story.** The ignored plaintext workspace and pre-commit checks are essential; they must never be hidden or weakened in the name of UX simplicity.
6. **No false magic.** Never suggest that viewing a public repo authenticates a GitHub user, that a QR conveys authority, or that a website silently saves a changed document to GitHub.

## Navigation in this branch

| Primary destination | Purpose | What currently works |
| --- | --- | --- |
| **Workspace** | Open a known public GitHub repository and browse public files, encrypted documents and concealed-folder containers | Manual `owner/repo` entry, demo link, branch/ref selection, in-context Add action, folder-viewer routing |
| **Add a file** | Write a new Markdown note or select a local file, then encrypt and explicitly download | Same `#page=encrypt` route and age encryption; GitHub bundle controls disclosed on demand; project destination can be prefilled |
| **More** | Explicit secondary paths and information | Open local ciphertext, encrypted-folder experiment, passkey lab, how-it-works, security notes |

The global experimental-folder announcement is gone. **More** is intentional progressive disclosure, not deprecation: direct links to the advanced routes are preserved. The regular `#page=open`, `#page=encrypt`, `#page=passkeys`, `#page=about`, existing GitHub locators, and `folder.html` links must continue to work.

This branch does **not** invent an automatic repository list, account-based onboarding, a stored master key, automatic commits, or a merged folder/document decryption format. Concealed folders **appear in the same repository browser** as encrypted documents but still use the separate, existing folder viewer. A private note is an in-memory draft until explicitly encrypted and downloaded. The workspace label is the desired mental model, while present behavior is still a **public repository browser**.

## Core journeys

### Come back to a project

1. Open GitVault and enter `owner/repo`, or follow an existing GitVault link in the GitHub repository.
2. Browse public entries or unlock a file using its configured method.
3. Read, preview, or explicitly export. A decrypted plaintext download is outside GitVault's protection.

### Add a private note

1. Create or edit it inside the CLI's Git-ignored workspace, **or** use **Add a file → Write a note / Choose a file** in the browser. The note editor does not save a draft to browser storage.
2. Encrypt locally. Inspect the generated encrypted file and optional public landing assets.
3. With the CLI, stage only allowlisted generated artifacts and commit; with the browser, download the bundle and commit it manually.

### Keep even the name private

Select an encrypted folder from a project's repository browser, or use the experimental folder-creation path from **More** or from the add-file screen. Its internal names and files are hidden inside one age ciphertext. The outer file, size, and Git history remain public; edits require re-encrypting the entire container. This is not a mounted or incrementally synchronized workspace.

### Share deliberately (future)

Choose a private document, select **Share**, grant a recipient public key, and create a link. Do not imply that link sharing alone encrypts for a recipient or that removing a recipient revokes copies already downloaded. This flow and its recipient-management design are **not implemented**.

## What should stay behind the surface

The CLI, age payloads, workers, manifests, WebAuthn PRF, folder JSON format, import/export mechanics, resource limits, repository refs, QR generation, security diagnostics, and deployment checks. They remain documented and reachable, but should not each require a permanent tab.

Recovery is an exception: essential recovery decisions **must** remain explicit at the moment they matter, even if that adds friction.

## Next product consolidation, not implemented here

1. Decide a consistent personal age-identity and backup onboarding story across repos; never silently persist keys in browser storage.
2. Design a unified file tree: public discoverable documents and concealed documents appear as files/folders after unlock, not as unrelated products.
3. Prototype a versioned encrypted index with opaque per-file IDs to update a single concealed file without rewriting a large encrypted folder. Keep the format interoperable and threat-modeled; do not deploy without review.
4. Provide a deliberate share/recipient UI with explicit key rotation and revoked-access limitations.
5. Make CLI setup and repository updates frictionless and safe; prefer that over dashboards, account creation, or a broad settings console.

## Review criteria

- A new user can explain the product as “a private side to my public project” without learning the file format.
- The default interface has no more than three primary navigation choices; adding a note and finding a concealed folder require no new top-level page.
- A README and an automated test show how to find every advanced feature.
- Existing GitHub link and QR routes continue to work; no public URL contains a decryption secret.
- No encrypted bytes, plaintext, recovery, filesystem safety, or remote-write behavior is weakened by the UI change.
- Every claim distinguishes **working**, **experimental**, and **planned**.
- Regenerate screenshots and run full browser/security CI on this branch before merging. This branch was created from `main` at `750586d` and does not modify `main`.

## Related reading

- [Product decision notes](PRODUCT_NOTES.md)
- [Current UX behavior](UX.md)
- [Security model](SECURITY.md)
- [Encrypted-folder experiment](FOLDERS.md)
- [Current roadmap](ROADMAP.md)
