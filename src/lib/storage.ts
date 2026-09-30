/**
 * Defensive localStorage access: storage can be unavailable (private mode, blocked cookies,
 * quota) or contain corrupted data. Callers always get a value or `null`, never an exception.
 * `readJson` returns `unknown`: callers must validate the shape of what they read.
 */
export function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore: nothing to remove when storage is unavailable.
  }
}

/** Per-tab storage (survives refresh, not new tabs). Same defensive contract as above. */
export function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSession(key: string, value: string | null): void {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the screen simply is not restored after a refresh.
  }
}
