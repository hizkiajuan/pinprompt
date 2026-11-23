# Contributing to Pinprompt

Thank you for helping. Pinprompt is a small, focused extension with one maintainer, so please read this page before you open a pull request.

## What is welcome

- **Bug reports.** Use the bug report form, and paste the prompt Pinprompt produced when the problem is in it.
- **Bug-fix pull requests.** Open them directly.
- **Features.** Open an issue first and wait for a reply before you start. Pinprompt deliberately stays small: local React apps, one prompt out.

AI-assisted contributions are welcome when you review and test the change yourself and can explain it in the review.

## Development setup

You need [Bun](https://bun.sh) 1.4.4 or later and Chrome.

```sh
git clone https://github.com/hizkiajuan/pinprompt.git
cd pinprompt
bun install
bun run build
```

Load `packages/extension` with **Load unpacked** on `chrome://extensions` (Developer mode on), and reload it there after each build. `bun dev` serves the landing page (`packages/site`) on `http://127.0.0.1:5180`.

## Checks

Every pull request must pass what CI runs:

```sh
bun run build:ci     # oxlint, bun fmt --check, types, tests, extension build
bun run package      # the store zip
bun run site         # the landing page
```

For UI changes (the in-page bubble, pins, comment box, tray or options page), add before and after screenshots, and say which React app and Chrome version you tried it on.

## Pull requests

- One topic per pull request. Pull requests are squash-merged.
- The title is the commit message, so use a [Conventional Commit](https://www.conventionalcommits.org/) title: `fix: keep pins after a route change`, `feat: ...`, `docs: ...`, `chore: ...`. `feat` and `fix` titles are grouped in the changelog.
- Mark a change that needs the user to act with `!` (`feat!: drop React 16`) and explain it in the description.

## Versions and releases

Versions follow SemVer and tags are `vX.Y.Z`; the version lives in `package.json` and `manifest.json`. Before 1.0, a feature or breaking change bumps the minor version and a fix bumps the patch version. The maintainer cuts releases: the version bump, `CHANGELOG.md` and the tag come from your PR titles, and the release workflow builds the store zip from the tag and attaches it to the GitHub release.

## License

Pinprompt is MIT licensed. By submitting a pull request, you agree that your contribution is licensed under the [MIT License](LICENSE).

## Security

Do not report vulnerabilities in public issues. See [SECURITY.md](SECURITY.md).

## Code of conduct

This project follows the [Contributor Covenant](https://github.com/hizkiajuan/.github/blob/main/CODE_OF_CONDUCT.md).
