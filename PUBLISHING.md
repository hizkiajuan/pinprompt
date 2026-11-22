# Publishing Pinprompt

Pinprompt ships through the Chrome Web Store. Everything the dashboard asks for is ready in the
repository except the account and the hosted privacy policy.

## Ready

- Icons (16, 32, 48, 128) in `packages/extension/icons/`, wired in the manifest
- Store copy, permission justifications and reviewer test steps: `docs/store/listing.md`
- Privacy policy text: `docs/store/privacy-policy.md`
- A store zip: `bun run package` writes `dist/pinprompt-<version>.zip` (CI uploads the same zip as
  an artifact on every run)
- Versioning: `bun run release` keeps `package.json` and `manifest.json` in step; a test fails if
  they drift

## Still to do (by hand)

1. Register a Chrome Web Store developer account (one-time 5 USD):
   https://chrome.google.com/webstore/devconsole
2. Host the privacy policy at a public URL: the site serves it at https://pinprompt.hizkiajuan.com/privacy.
3. Take the screenshots listed in `docs/store/listing.md` (1280 x 800).
4. Create the item, upload the zip, fill the listing and privacy tabs from `docs/store/listing.md`,
   choose **Unlisted**, and submit for review (usually one to three days).

## Updating

`bun run release`, then `bun run package`, then upload the new zip and resubmit.
