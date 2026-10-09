# Static deployment

GitVault is a TypeScript application compiled by Vite. Deployment needs only the contents of `dist/`; no running Node server, database or user-account service is required.

## GitHub Pages

The repository includes a gated Pages workflow. It downloads an already-tested static build from **Verify GitVault** instead of rebuilding different code during deployment. It deploys only when the successful main-branch run matches the current main commit.

GitHub Pages still requires one repository setting:

**Settings > Pages > Build and deployment > Source: GitHub Actions**

When Pages is not enabled, the deployment workflow records that requirement in its summary and skips deployment. It does not request another token or claim that a site is live. After enabling Pages, run **Deploy verified site to GitHub Pages**, or push a change and let verification complete.

The configured project URL is `https://junovhs.github.io/gitvault/`. Its availability depends on Pages being enabled and a successful deployment. The public demo's links use that address.

## Run locally

```sh
npm ci
npm run dev
```

Open the URL printed by Vite with `/gitvault/` as its base path. For the built version:

```sh
npm run build
npm run preview
```

Use localhost or HTTPS. Opening `index.html` directly with a `file:` URL does not provide the required worker/module/secure-context behavior.

## Download the verified static artifact

Open a successful **Verify GitVault** run and download **gitvault-static**. Serve its contents from a static host with the correct base path. Browser screenshots and test reports are in **browser-evidence**; a separately published gallery is also under `docs/screenshots/` when the screenshot workflow has completed.

To host at a different base path, set `VITE_BASE` when building and update the viewer URL in the consuming repositories' `.gitvault.yml` files. A custom hostname changes the passkey relying-party scope. Keep an independent age recovery identity before moving a passkey-enabled vault.

## Trust and privacy

The site does not need a GitHub token to read public ciphertext. Secrets and decrypted documents must never be added to a deployment, build log, analytics system or service worker cache. Browser security headers and self-hosting reduce some risks, but a compromised host can still serve code that steals a key. Review and trust the entire viewer origin.
