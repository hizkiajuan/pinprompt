/** False once the extension was reloaded or removed and this script's context is orphaned. */
export function isExtensionAlive(): boolean {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}
