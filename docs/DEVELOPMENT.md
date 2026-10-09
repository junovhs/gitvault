# Development progress

This file distinguishes committed work from verified behavior. An unchecked item is not a working feature claim.

## Committed

- [x] Initial TypeScript CLI and static browser viewer.
- [x] Product, configuration, architecture, security, and roadmap documentation.
- [x] Initial encryption, path, and landing-page smoke tests.
- [x] GitHub Actions workflow for installation, build, tests, and a production dependency audit.

## Next verification and implementation priorities

- [ ] Install dependencies and confirm the actual age-encryption API and runtime requirements.
- [ ] Run the build and tests; fix failures before claiming the prototype works.
- [ ] Verify the GitHub Actions result.
- [ ] Harden source/output path validation, symlink handling, and generated-file collisions.
- [ ] Fix hook generation and make staging honor the configured output directory.
- [ ] Test a complete disposable-repository encrypt, commit, clone, and decrypt workflow.
- [ ] Improve the mobile viewer, loading states, unlock errors, and local file opening.
- [ ] Add a clearly labeled public demo with no real secrets.
- [ ] Add and verify static-site deployment separately from CI.

## Release boundaries

Password and age-identity support require successful interoperability tests. Passkeys and phone-to-desktop QR approval remain planned, not implemented. A permanent landing-page QR opens a public viewer URL; it does not carry a decryption secret.

The project remains an unreviewed prototype. Do not publish real credentials or rely on it as the only copy of sensitive information.
