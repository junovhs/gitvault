# Architecture and trust boundaries

GitVault consists of a local Node CLI and a static browser UI. The CLI reads ignored plaintext from `.gitvault/plain/` and writes standard age-encrypted files to `private/`, plus a readable Markdown landing page and scannable QR PNG for each input. The browser uses the public GitHub Contents API to navigate public repos and fetch base64 content. Decryption is performed in browser memory using `age-encryption`.

## Data flow

1. Edit private source **only** under the ignored workspace. Pre-commit hook is optional defense in depth; it is not a substitute for .gitignore. Never create tracked plaintext.
2. Encrypt before staging/committing. Every source file becomes an `.age` payload, an explanatory Markdown file at its original name, and a sibling `.qr.png` file.
3. GitHub renders the landing page. QR/link goes to `https://junovhs.github.io/gitvault/?repo=owner/repo&file=private/path.age`. It is a public pointer and contains no key.
4. The viewer fetches ciphertext directly from GitHub and asks for a passphrase or age identity. Decryption remains in the browser. Standard unencrypted public files are displayed as escaped plaintext.
5. On a new computer, either visit the viewer and unlock with a remembered password or an imported identity; or clone and run the CLI decrypt command to rebuild the ignored workspace.

## Keys

In passphrase mode, age uses its standard scrypt passphrase mode. An attacker has the ciphertext and can attack candidate passphrases offline. Long, random, unique passphrases are essential. In recipient mode, files are encrypted to an age public recipient; identity material must be backed up offline and never committed. Changing methods requires re-encrypting the source.

## No backend

The static website can be deployed on GitHub Pages. There is no GitVault user database, account, or hosted document store. The viewer does make network requests to GitHub for **public encrypted bytes and public repository metadata**. A deployed JavaScript site is not automatically trustworthy: compromise of the origin or its dependencies can steal keys entered into a viewer. This prototype requires dependency review, testing, and independent security review before sensitive production use.

## Future phone / passkey flow

A permanent QR on GitHub opens the public viewer on the phone; it is not an unlock token. A separate passkey-based path needs WebAuthn PRF support, credential-specific wrapping of a randomly generated document key, explicit recovery, and browser/device compatibility testing. A QR scan that releases access back to the desktop requires an authenticated, ephemeral cross-device channel and cannot be achieved through ordinary QR links alone. Do not label QR scanning as authentication.
