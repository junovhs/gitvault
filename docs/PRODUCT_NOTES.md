# Product decision notes

These notes capture the **small surface, depth where you look** direction for the `product-surface` experiment. They are not an implementation checklist the development agent should silently execute on `main`.

## Decisions reflected in code

**Keep:** “Your repo has a private side.” This is more specific than a general cloud-drive or secrets-manager pitch.

**One calm home:** Open a project by entering its public GitHub `owner/repo`, or start with a file. No suggested account sign-in and no fabricated “all my projects” list.

**Three tabs:** Workspace, Add a file, More. Put passkey research, individual ciphertext opening, folder-container tools and reference docs under More.

**No banner:** Removing the experimental-folder announcement keeps the default workflow focused. Direct folder, passkey and old URL routes remain supported.

**Use existing crypto:** The new note editor and in-context project actions still call the original age encryption and download paths; there is no new ciphertext format or implicit network write.

**Private note creation:** The Add screen can compose Markdown directly without requiring a preexisting file. Draft text remains in the open page until encryption/navigation; it isn't automatically saved. The note filename is visibly marked as public when published individually.

**One visible repository list:** The existing public GitHub explorer now recognizes `.gvfolder.age` as an encrypted folder and links to the correct viewer, retaining project/branch context. Internal folder contents remain hidden until successful decryption; this is not a unified key or file format.

**Progressive publishing:** GitHub bundle controls start collapsed for standalone notes/files, but expand and prefill the repository when users choose Add from a project. No authentication, token or background GitHub write was added.

## Tradeoffs

| Choice | Benefit | Cost / honest boundary |
| --- | --- | --- |
| Manual public repository input | No account or token; simple mental model | No automatic “all your repos” workspace |
| In-browser note drafting | No editor or file needed to start; local encryption path is reused | No autosave; leaving the page loses an unsaved draft |
| Concealed-folder experiment via More | Hides sensitive internal filenames without polluting default UI | Whole container rewritten after every change; 128-file/8-MiB limits |
| Existing single-file encryption | Small portable files; familiar GitHub landing pages | Public individual filenames and paths |
| Age identity and password support | Interoperability and independent recovery | User must secure keys; no password-reset server |
| Experimental passkeys kept reachable | Explore future easy unlock | No physical-device certification; hostname and PRF support constraints |
| Manual browser bundle download | No GitHub write credentials in the site | No one-click sync or automatic commits |

## Questions to resolve deliberately

1. **What counts as a workspace?** One public repository at a time now. Should the long-term experience have a local-only collection of repo shortcuts, or an authenticated GitHub integration? Do not conflate either with an account.
2. **Which names should be public?** Discoverable file landing pages and concealed folders must both exist. Define safe defaults without assuming every document has the same metadata policy.
3. **What is the canonical key story?** A secure backed-up age identity reused by choice across projects could reduce password sprawl, but compromise affects every file addressed to it. Key separation and rotation are real product decisions.
4. **How does sharing work?** Recipient public keys, explicit add/remove operations, and warnings about old encrypted Git revisions. Never say “revoke” without clarifying already downloaded copies.
5. **What happens after an edit?** Make it clear whether a change is only in memory, downloaded locally, or actually committed. Do not imply GitHub synchronization until it exists.
6. **How do we know it's safe enough?** Independent security review and real-device testing remain prerequisites for sensitive use.

## Keep out of the default UI

Dashboards, analytics, profiles, account management, a dedicated QR tab, a permanent passkey tab, exposed age format switches as primary actions, one tab per encryption container, and any fake save/sync indicator.

## Handoff / branch isolation

- `product-surface` is for product experience consolidation and explanatory notes.
- `main` is preserved for the other agent's existing work; do not force-update, merge, or rewrite it.
- Review this branch against later `main` changes before choosing to merge.
- No real secrets should be used in demos or fixtures. Keep security caveats visible and honest.
