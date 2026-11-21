// The public host identifies the signed-in workspace in the HTML document.
// An anonymous visitor's imports stay in their tab's session storage.
function locationFor(key: string) {
  const owner = typeof document === "undefined"
    ? undefined
    : document.querySelector<HTMLMetaElement>('meta[name="journey-storage-user"]')?.content;
  if (!owner) return { storage: window.localStorage, key };
  return {
    storage: owner === "guest" ? window.sessionStorage : window.localStorage,
    key: `journey:${owner}:${key}`,
  };
}

export const workspaceStorage = {
  getItem(key: string) {
    const item = locationFor(key);
    return item.storage.getItem(item.key);
  },
  setItem(key: string, value: string) {
    const item = locationFor(key);
    item.storage.setItem(item.key, value);
  },
  removeItem(key: string) {
    const item = locationFor(key);
    item.storage.removeItem(item.key);
  },
};
