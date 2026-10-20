const KEY = 'jv_qr_session2';
let memory = '';
/** Persist server-signed browser proof across closure. Never put it in URLs or copy links. */
export function readGuestSession(): string {
  if (memory) return memory;
  try {
    memory = sessionStorage.getItem(KEY) || '';
  } catch {
    /* private storage */
  }
  if (!memory)
    try {
      memory = localStorage.getItem(KEY) || '';
    } catch {
      /* private storage */
    }
  if (memory) saveGuestSession(memory);
  return memory;
}
export function saveGuestSession(value: string): void {
  memory = value;
  try {
    sessionStorage.setItem(KEY, value);
  } catch {
    /* use memory */
  }
  try {
    localStorage.setItem(KEY, value);
  } catch {
    /* use tab storage */
  }
}
