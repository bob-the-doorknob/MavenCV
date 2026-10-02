import type { LoadFailure } from '../store/useAppStore';

/**
 * What the could-not-load screen offers, in order, and how loudly. A
 * permanent failure (the data is unreadable, not unavailable) leads with
 * Export — reading it again cannot help, so Retry steps back. A transient
 * one (storage full, a failed read) leads with Retry, because that is what
 * may actually fix it.
 */
export type LoadAction = 'retry' | 'export' | 'startFresh';
export type LoadActionStyle = 'primary' | 'secondary' | 'ghost';

export interface LoadActionSpec {
  action: LoadAction;
  style: LoadActionStyle;
}

export const loadErrorActions = (failure: LoadFailure | null): LoadActionSpec[] =>
  failure === 'permanent'
    ? [
        { action: 'export', style: 'primary' },
        { action: 'retry', style: 'secondary' },
        { action: 'startFresh', style: 'ghost' },
      ]
    : [
        { action: 'retry', style: 'primary' },
        { action: 'export', style: 'secondary' },
        { action: 'startFresh', style: 'ghost' },
      ];

export const retryLabel = (checking: boolean): string => (checking ? 'Checking…' : 'Retry loading saved data');

export const STILL_UNREADABLE = "Still can't read your saved data.";

/** Shown once a retry has finished and failed again — and cleared when the next one starts. */
export const showStillUnreadable = (state: { retried: boolean; checking: boolean; error: string | null }): boolean =>
  state.retried && !state.checking && state.error !== null;

export const START_FRESH_NOTE = 'Clears the data on this phone and sets a copy aside.';
