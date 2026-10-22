export const AUTH_REVISION_KEY = 'keynes-auth-revision';

export function authRevision(): string | null {
  try {
    return window.localStorage.getItem(AUTH_REVISION_KEY);
  } catch {
    return null;
  }
}

export function navigateAfterAuth(destination: string) {
  try {
    // This marker lets restored documents and other tabs detect a session change.
    // The actual session remains in the server's HttpOnly cookie.
    window.localStorage.setItem(AUTH_REVISION_KEY, crypto.randomUUID());
  } catch {
    // Authentication still works when browser storage is unavailable.
  }
  window.location.replace(destination);
}
