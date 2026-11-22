# Chrome Web Store listing

Copy for the developer dashboard. Keep it in step with `packages/extension/manifest.json`.

## Store listing

- **Name:** Pinprompt (from the manifest)
- **Summary (manifest `description`, max 132 characters, not editable in the dashboard):** Pin parts of your local React app, describe each change, and export one precise Markdown prompt for any AI tool.
- **Category:** Developer Tools
- **Language:** English

### Description

Paste this into the Description field.

```text
Point at it. Say what to change.

Pinprompt lets you comment on your running React app the way you comment in Figma, then hands your AI tool one short, precise prompt instead of "change that card, no, the other one".

HOW IT WORKS
1. Press Ctrl+Shift+P (Shift+Command+P on a Mac) or click the toolbar button. Hovering names the React component under the cursor; clicks never reach your app.
2. Click an element, or drag over a region. A numbered pin drops on it and a comment box opens right there. Write what should change; Ctrl+Enter (Command+Enter) saves.
3. Click Copy prompt on the bubble in the corner and paste into Claude, Cursor, ChatGPT or any other AI tool.

SHORT ON PURPOSE
Each pin becomes two lines: what the element is, in names your AI tool can search the code for, and what should change. About 250 characters a pin, not a DOM dump.

WHAT IT KNOWS
- Your components by name: reads React's development build for the component and its parents (PlanCard > BillingPage, not "the third div").
- shadcn/ui: spots Button, Card, Input and the rest from data-slot, on Tailwind v3 and v4.
- Routes: up to 10 pins a tab, across the routes of a single-page app.
- Pins survive a reload, and the bubble can sit in any corner.

PRIVATE BY DESIGN
- Runs only on the origins you allow. localhost and 127.0.0.1 work right away; a LAN or tailnet host is added in Settings, one at a time.
- No account, no server, no analytics. Pins stay in your browser; nothing leaves it unless you copy or download the prompt.
- Its interface lives in a shadow root, so your styles can't break it and it can't break yours.

Free. For Chrome 130 and later. More at https://pinprompt.hizkiajuan.com
```

### Images (all in `docs/store/`)

| Field                          | File                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| Store icon 128 x 128           | `store-icon-128.png` (96 px logo in 16 px of transparent padding)                      |
| Screenshots 1280 x 800         | `screenshots/1-comment-mode.png`, `2-comment.png`, `3-pins-and-tray.png` (from `bun run --cwd packages/site shots`) |
| Small promo tile 440 x 280     | `small-promo-tile-440x280.png`                                                         |
| Marquee promo tile 1400 x 560  | `marquee-1400x560.png`                                                                 |
| Global promo video             | none                                                                                   |

### Additional fields

- **Official URL:** pick `pinprompt.hizkiajuan.com` (its own Search Console property, verified through the `hizkiajuan.com` domain property). The dropdown only lists sites verified on the same Google account as the developer account.
- **Homepage URL:** https://pinprompt.hizkiajuan.com
- **Support URL:** https://github.com/hizkiajuan/pinprompt/issues once the repo is public; https://pinprompt.hizkiajuan.com until then
- **Mature content:** No

## Package tab

- **Item ID:** `ajicjcpdaedggebapaoppicnhhocgfkf`; the store page will be https://chromewebstore.google.com/detail/ajicjcpdaedggebapaoppicnhhocgfkf (the landing page's `STORE_URL` once it's approved).
- **Verified CRX uploads:** leave off for now. Opting in means every upload must be a `.crx` signed with a private key I keep; `bun run package` makes a plain zip, and a lost key means no more updates. Turn it on once the release script signs builds and the key is stored safely.

## Privacy tab

- **Single purpose:** Pin elements of a locally running web app, comment on each, and copy the comments as one Markdown prompt for an AI tool.
- **Remote code:** No.
- **Data usage:** collects no user data. Tick nothing under data types; certify the three disclosures (not sold, not used for unrelated purposes, not used for creditworthiness).
- **Privacy policy URL:** https://pinprompt.hizkiajuan.com/privacy

The host permission triggers a notice that the review may take longer ("in-depth review"). That's expected for any extension with host access; the justifications below keep it short.

### Permission justifications (one field each)

**activeTab**

```text
Pinprompt attaches a small screenshot of each pinned element to the user's notes. Chrome allows captureVisibleTab only after the user invokes the extension on that tab (toolbar button or keyboard shortcut), which is what activeTab grants. No page content is read for anything else or sent anywhere.
```

**scripting**

```text
Injects Pinprompt's comment overlay (its content script) into the development origins the user has allowed, including tabs that were already open when the extension was installed or an origin was added. Scripts are registered only for those origins.
```

**storage**

```text
Keeps the user's pins and unsent comments for the current browser session (chrome.storage.session) and the list of origins the user allowed (chrome.storage.local). Nothing is synced or sent to a server.
```

**Host permission**

```text
The only required hosts are http(s)://localhost and 127.0.0.1, where local dev servers run, so the overlay works on the user's own app without setup. Any other host is an optional permission, requested one origin at a time only when the user adds it in Settings (for example a dev server on their LAN). The extension never runs on pages outside these origins.
```

## Distribution

**Public**, all regions, free. Unlisted would only be a soft launch (it goes through the same review); the extension is tested and the reviewer steps need no account.

## Test instructions (Access, Test instructions)

Leave **Username** and **Password** empty. Paste this into **Additional instructions** (475 of the 500 characters):

```text
No account needed. 1. Start any React dev server on localhost, e.g. npm create vite@latest demo -- --template react, then npm install and npm run dev. 2. Open it in Chrome and click the Pinprompt toolbar button (or press Ctrl+Shift+P). 3. Click any element: a numbered pin and a comment box appear. Type a change and press Ctrl+Enter. 4. Click Copy prompt in the bubble at the bottom right and paste anywhere. localhost works with no setup; other hosts are added in Settings.
```

## After approval

- Set `STORE_URL` (the store page above) for the landing page build, so "Download for Chrome" becomes "Add to Chrome".
- Install from the store on another machine to check.

## Releasing an update

1. `bun run release` (bumps the version in `package.json`, `manifest.json` and the workspace packages, writes the changelog, tags and publishes a GitHub release).
2. `bun run package` writes `dist/pinprompt-<version>.zip`. CI attaches the same zip to every run.
3. Upload the zip in the developer dashboard and submit for review.
