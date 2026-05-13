import { api } from "../api";

/**
 * Triggers the OS folder picker, or returns null with a sentinel telling the
 * caller to open the remote-path modal.
 *
 * @param {string} prompt — dialog title
 * @returns {Promise<{ path: string } | { remote: true } | null>}
 *          - { path } on success
 *          - { remote: true } when the server says we're a remote device
 *          - null on cancel/error (caller treats as no-op)
 */
export async function pickFolder(prompt) {
  try {
    const res = await api.browseFolder(prompt);
    if (res?.remote) return { remote: true };
    if (res?.path) return { path: res.path };
    return null;
  } catch {
    return null;
  }
}
