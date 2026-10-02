/**
 * Launch gates. A flag here is a promise that a human did something, so the
 * default is always the safe answer.
 *
 * SYNC_COPY_REVIEWED: flip to true only when EVERY item in
 * docs/launch-checklist.md is done — above all the rewritten privacy text,
 * the sync disclosure, and the published policy. While it is false, a test
 * (src/config/launch.test.ts) fails the build if a real Google sign-in
 * provider is wired in, so account sync cannot ship by accident.
 */
export const SYNC_COPY_REVIEWED = false;
