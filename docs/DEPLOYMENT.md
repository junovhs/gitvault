# Static deployment

GitVault is TypeScript compiled by Vite. Deployment needs only `dist/`; no running Node server, database or user-account service is required. There are two entrypoints: `index.html` for documents/passkeys and `folder.html` for encrypted folders.

## GitHub Pages: one-time setting

Set **Settings > Pages > Build and deployment > Source: GitHub Actions** in this repository.

Until that setting is enabled, the deployment workflow records the requirement and skips deployment. A successful skipped workflow is not a live website. No extra password, PAT or secret is requested.

After enabling Pages, run **Deploy verified site to GitHub Pages**, or push a change and allow verification to complete. The configured project URL is `https://junovhs.github.io/gitvault/`; the folder viewer lives at `/gitvault/folder.html`.

## Deploy the tested artifact, not a different rebuild

The Pages workflow downloads `gitvault-static` from a successful main-branch **Verify GitVault** run. It does not rebuild dependencies during deployment. The run must have tested the current source tree.

An automatically generated screenshot-gallery commit can follow a successful run. Such a commit is allowed only when the **complete, non-truncated Git trees match outside `docs/screenshots/`**. Code, dependencies, workflow changes, file modes and unrelated documentation changes still block deployment until verified. This avoids publishing unverified source while allowing tested screenshots to appear in GitHub.

## Run locally

```sh
npm ci
npm run dev
```

Open the Vite URL with `/gitvault/` as its base. For production output:

```sh
npm run build
npm run preview
```

Use localhost or HTTPS. Opening HTML with a `file:` URL does not provide the required module/worker/secure-context behavior.

## Download verification artifacts

A successful **Verify GitVault** run includes `gitvault-static`, `browser-evidence`, and Firefox/WebKit evidence artifacts. The repository's screenshot gallery updates from successful main runs and records its tested commit. Every published screenshot uses synthetic public fixtures.

Serve the static artifact on a trusted host with the correct base path. To change that path, set `VITE_BASE` when building and update each consuming repo's configured viewer URL.

Changing the hostname changes passkey relying-party scope. Preserve an independent age recovery identity before moving a passkey-enabled vault. HTTPS and a static host do not remove the need to trust the JavaScript served from that origin.
