# Product UX specification

## A. GitHub landing page

User clicks `private/strategy.md` on GitHub. GitHub renders an automatically generated Markdown explanation, direct **Open in GitVault** link, QR image, and link to `strategy.md.age`. Link/QR contains only `repo` and `file` query values. The ciphertext is stored separately so GitHub renders a clean landing page instead of a wall of gibberish.

## B. Browser viewer

User follows the link. Viewer shows repo/path and an unlock form (password or private age identity for this prototype). It fetches public ciphertext and decrypts in local browser memory. If successful, it displays UTF-8 plaintext, including Markdown *source* (rendered Markdown is a follow-up); if incorrect it displays an error. No plaintext or key is transmitted to GitVault servers.

## C. Phone QR

User scans the GitHub landing-page QR and opens the same viewer on the phone, then unlocks *on the phone* if they possess the required key. A separate desktop-approval flow is a future feature, not implied by the QR.

## D. Local workflow

Use ignored private workspace, run CLI encryption before commit, publish only generated artifacts. Later: clone the repo, provide decryption secret, run `gitvault decrypt`, work on ignored plaintext. Never use post-push encryption; once plaintext lands in Git history, it is exposed.

## E. Evolution

Phase 1: password and age key UX. Phase 2: Markdown rendering with sanitized HTML, local editing/re-encrypting, ZIP archive encryption for hidden filenames. Phase 3: WebAuthn PRF passkeys and robust credential recovery; per-file wrapped symmetric keys enabling multiple unlock methods. Phase 4: opt-in authenticated GitHub commits and cross-device QR approvals.
