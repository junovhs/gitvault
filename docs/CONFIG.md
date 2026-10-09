# Configuration and CLI

Copy `.gitvault.example.yml` to `.gitvault.yml`, change `repo` and `viewer`, and keep the source workspace Git-ignored. `gitvault init` creates a starter configuration automatically.

| Field | Example | Meaning |
| --- | --- | --- |
| version | `1` | Configuration format |
| repo | `owner/repo` | Public GitHub repository used by generated viewer links |
| viewer | `https://junovhs.github.io/gitvault/` | Decryption viewer origin |
| source | `.gitvault/plain` | Local, ignored plaintext folder |
| output | `private` | Generated tracked artifact folder |
| mode | `passphrase` or `recipient` | age encryption mode |
| recipient | `age1...` | Public recipient required in recipient mode |

CLI usage: `tsx src/cli.ts init`, `encrypt`, `decrypt`, `hook install`.

- `encrypt`: reads local files, writes `.age`, landing page and QR. Set `GITVAULT_PASSPHRASE` for passphrase encryption or use a public recipient in config.
- `decrypt`: decrypts `.age` files to ignored source folder. Set `GITVAULT_PASSPHRASE` or `GITVAULT_IDENTITY`. Refuses to overwrite existing restored files.
- `hook install`: installs a local pre-commit hook, refusing to clobber an existing hook. Requires target repository to define an `npm run vault:encrypt` script and have its CLI dependencies installed. It stages generated output. It does not protect against a manual `git add -f` of plaintext.

The tool is not yet distributed via npm. `npm run cli -- encrypt` works from this repository checkout. Git hooks do not travel with a clone: re-install or configure them on every workstation. The source directory is the primary guard.

## Limitations

No glob-based config, no multi-recipient/password hybrid envelopes, no Git credential integration, no edit-and-commit in browser, no private repository support, and no archive-style hidden directory structure yet. GitHub filenames, sizes, and history stay public.
