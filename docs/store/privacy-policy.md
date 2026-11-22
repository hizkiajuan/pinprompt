# Pinprompt privacy policy

Last updated: 20 November 2026

Pinprompt is a Chrome extension for developers. It runs only on the web origins you allow (by
default `http://localhost:3000`) and helps you turn parts of your own running app into one
Markdown prompt.

## What Pinprompt reads

When you pin an element on an allowed origin, Pinprompt reads from that page:

- the element's tag, selector, visible text, a short HTML snippet, CSS classes and a few
  attributes (such as `aria-label`, `role`, `data-slot`, `data-testid`);
- React component names around the element, when the page is a React app in development mode;
- a screenshot of the pinned area.

It reads nothing on pages whose origin you have not allowed, and nothing on allowed pages until
you pin something.

## Where it is kept

- **Pins, instructions and screenshots** stay in your browser's session storage
  (`chrome.storage.session`). They are removed when you clear the session, close the tab, or quit
  the browser.
- **Your list of allowed origins** and which corner the bubble sits in are kept in
  `chrome.storage.local` so they survive restarts.

## What leaves your browser

Nothing. Pinprompt makes no network requests, has no server, no analytics, no tracking and no
account. Its fonts and code ship inside the extension.

Data only leaves the extension when you do it yourself: **Copy prompt** puts the Markdown on your
clipboard and **Download .md** saves a file. Where you paste or send it is up to you.

## Permissions

| Permission                                       | Why                                                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `activeTab`                                      | Take the screenshot of a pinned area, after you click the toolbar button or press its shortcut.                    |
| `scripting`                                      | Run the comment overlay on your allowed origins, including tabs that were already open.                             |
| `storage`                                        | Keep pins for the current browser session and your allowed origins.                                                |
| Access to `localhost` and `127.0.0.1`            | The default place a local dev server runs.                                                                          |
| Optional access to other hosts                   | Only requested, host by host, when you add such an origin yourself (for example a dev server on your LAN). |

## Contact

Questions about this policy: open an issue in the Pinprompt repository or write to the address
on the Chrome Web Store listing.
