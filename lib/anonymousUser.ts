/**
 * Anonymous user identity.
 *
 * MVP has no login. We persist a stable UUID in localStorage and pass it to
 * the API so the feed can be personalised per browser.
 */

const STORAGE_KEY = "trailerflow.anonymousUserId";

/** RFC4122 v4 UUID, preferring the native crypto implementation. */
function generateUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for very old environments.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Returns the persisted anonymous user id, creating and storing one on first
 * use. Safe to call only in the browser.
 */
export function getOrCreateAnonymousUserId(): string {
  if (typeof window === "undefined") {
    throw new Error("getOrCreateAnonymousUserId must be called in the browser");
  }

  let id: string | null = null;
  try {
    id = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // localStorage can throw (private mode, blocked cookies). Fall through.
  }

  if (!id) {
    id = generateUuid();
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Non-persistent session — id lives only for this page load.
    }
  }

  return id;
}
