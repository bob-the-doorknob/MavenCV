/**
 * A counter that moves whenever "whose data is on this device, under which
 * session" changes: link, sign-out, account deletion, a local wipe, or the
 * Firebase session being replaced or cleared.
 *
 * Anything asynchronous that will write back into the store or the session
 * captures it before it starts and checks it before it writes. If it moved,
 * the result belongs to a world that no longer exists and is discarded —
 * which is what stops a sync response from refilling a device the user just
 * cleared, and a token refresh from undoing a sign-out.
 *
 * Dependency-free on purpose: the store, the session layer and sync all use it.
 */
let epoch = 0;

export const currentEpoch = (): number => epoch;

export const bumpEpoch = (): number => {
  epoch += 1;
  return epoch;
};
