import type { DataCounts } from '../services/account';
import { conflictCopy } from './accountCopy';

/**
 * The two-step "this Google account already has data" prompt, as plain data
 * so it can be tested without a screen. Every way out of it — Cancel, a tap
 * outside, the Android back button — ends the same way: the pending conflict
 * is cancelled and the device is left exactly as it was. Nothing is removed
 * until the user confirms the second step.
 */

export type ConflictChoice = 'cloud' | 'device';

export interface PromptButton {
  text: string;
  style?: 'cancel' | 'destructive';
  onPress: () => void;
}

export interface PromptSpec {
  title: string;
  message: string;
  buttons: PromptButton[];
  /** cancelable: false stops Android closing it by a tap outside or Back; onDismiss still covers it if it does. */
  options: { cancelable: false; onDismiss: () => void };
}

export interface ConflictPromptHandlers {
  cancel: () => void;
  resolve: (choice: ConflictChoice) => void;
  show: (spec: PromptSpec) => void;
}

interface Entry {
  text: string;
  style?: 'cancel' | 'destructive';
  run: () => void;
}

export const startConflictPrompt = (cloud: DataCounts, device: DataCounts, handlers: ConflictPromptHandlers): void => {
  const copy = conflictCopy(cloud, device);
  let finished = false;
  const finish = (action: () => void): void => {
    if (finished) return;
    finished = true;
    action();
  };

  const makeSpec = (title: string, message: string, entries: Entry[]): PromptSpec => {
    // A button press hands off to the next step. The dialog closing after it
    // must not count as the user walking away, or it would cancel mid-choice.
    let answered = false;
    return {
      title,
      message,
      buttons: entries.map((entry) => ({
        text: entry.text,
        ...(entry.style ? { style: entry.style } : {}),
        onPress: () => {
          answered = true;
          entry.run();
        },
      })),
      options: {
        cancelable: false,
        onDismiss: () => {
          if (!answered) finish(handlers.cancel);
        },
      },
    };
  };

  const cancelEntry: Entry = { text: 'Cancel', style: 'cancel', run: () => finish(handlers.cancel) };
  const confirm = (step: { title: string; message: string; action: string }, choice: ConflictChoice): PromptSpec =>
    makeSpec(step.title, step.message, [
      cancelEntry,
      { text: step.action, style: 'destructive', run: () => finish(() => handlers.resolve(choice)) },
    ]);

  handlers.show(
    makeSpec(copy.choose.title, copy.choose.message, [
      cancelEntry,
      { text: "Keep account's", run: () => handlers.show(confirm(copy.confirmCloud, 'cloud')) },
      { text: "Keep this phone's", run: () => handlers.show(confirm(copy.confirmDevice, 'device')) },
    ]),
  );
};
