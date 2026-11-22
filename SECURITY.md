# Security policy

## Supported versions

Only the latest release receives security fixes.

## Reporting a vulnerability

Please do not open a public issue. Report the problem privately through GitHub: **Security → Report a vulnerability** on [hizkiajuan/pinprompt](https://github.com/hizkiajuan/pinprompt/security/advisories/new). If you cannot use GitHub, email oss@hizkiajuan.com.

Include the Pinprompt and Chrome versions, the steps to reproduce, and the effect you observed. You will get a first reply within 7 days. When the fix is released, the advisory is published and credits you unless you ask otherwise.

## Scope

Pinprompt runs in Chrome on the origins you allow. It keeps pins in the extension's session storage and its settings in local storage, takes screenshots of the visible tab only after you press the toolbar button or the shortcut, and sends nothing anywhere unless you copy or download the prompt. Problems in that boundary are in scope, for example the in-page UI running on an origin you did not allow, the page's scripts reading or changing Pinprompt's data or UI, a host permission kept after you removed its origin, or anything that sends data off the machine.
