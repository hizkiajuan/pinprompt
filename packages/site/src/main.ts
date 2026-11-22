// Shortcuts differ by platform: the page is written with Windows and Linux keys and switches to
// the Mac ones in a Mac browser (Chrome binds Alt to Option there).
const mac = /Mac|iPhone|iPad/.test(navigator.userAgent);

for (const element of document.querySelectorAll<HTMLElement>("[data-keys]")) {
  const keys = (mac ? element.dataset.mac : element.dataset.other)?.split(" ") ?? [];
  const small = element.hasAttribute("data-small");

  element.replaceChildren(
    ...keys.flatMap((key, index) => {
      const kbd = document.createElement("kbd");
      kbd.textContent = key;

      if (small) {
        kbd.className = "small";
      }

      return index === 0 ? [kbd] : [document.createTextNode(" "), kbd];
    }),
  );
}

for (const element of document.querySelectorAll<HTMLElement>("[data-keys-alt]")) {
  element.textContent = (mac ? element.dataset.mac : element.dataset.other) ?? "";
}
