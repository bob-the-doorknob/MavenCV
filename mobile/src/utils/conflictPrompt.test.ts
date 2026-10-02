import { describe, expect, it, vi } from 'vitest';

import { startConflictPrompt, type PromptSpec } from './conflictPrompt';

const cloud = { roadmaps: 3, bullets: 5 };
const device = { roadmaps: 1, bullets: 2 };

const setup = () => {
  const shown: PromptSpec[] = [];
  const cancel = vi.fn();
  const resolve = vi.fn();
  startConflictPrompt(cloud, device, { cancel, resolve, show: (spec) => shown.push(spec) });
  const current = (): PromptSpec => shown[shown.length - 1] as PromptSpec;
  const press = (spec: PromptSpec, text: string): void => {
    spec.buttons.find((button) => button.text === text)?.onPress();
  };
  return { shown, cancel, resolve, current, press };
};

describe('conflict prompt', () => {
  it('is not cancelable on Android, in every step', () => {
    const { current, press } = setup();
    expect(current().options.cancelable).toBe(false);
    press(current(), "Keep account's");
    expect(current().options.cancelable).toBe(false);
  });

  it('shows both sides with counts', () => {
    expect(setup().current().message).toContain('3 roadmaps and 5 CV bullets');
    expect(setup().current().message).toContain('1 roadmap and 2 CV bullets');
  });

  it.each([
    ['the Cancel button', (ctx: ReturnType<typeof setup>) => ctx.press(ctx.current(), 'Cancel')],
    ['an outside tap or Back', (ctx: ReturnType<typeof setup>) => ctx.current().options.onDismiss()],
  ])('cancels once, and resolves nothing, on %s of the first step', (_label, exit) => {
    const ctx = setup();
    exit(ctx);
    expect(ctx.cancel).toHaveBeenCalledTimes(1);
    expect(ctx.resolve).not.toHaveBeenCalled();
  });

  it.each([
    ['the Cancel button', (ctx: ReturnType<typeof setup>) => ctx.press(ctx.current(), 'Cancel')],
    ['an outside tap or Back', (ctx: ReturnType<typeof setup>) => ctx.current().options.onDismiss()],
  ])('cancels, and resolves nothing, on %s of the confirmation', (_label, exit) => {
    const ctx = setup();
    ctx.press(ctx.current(), "Keep this phone's");
    exit(ctx);
    expect(ctx.cancel).toHaveBeenCalledTimes(1);
    expect(ctx.resolve).not.toHaveBeenCalled();
  });

  it('does not treat the dialog closing after a button press as walking away', () => {
    const ctx = setup();
    const first = ctx.current();
    ctx.press(first, "Keep account's");
    // Android reports the first dialog dismissed after its button was pressed.
    first.options.onDismiss();
    expect(ctx.cancel).not.toHaveBeenCalled();

    ctx.press(ctx.current(), "Remove this phone's data");
    expect(ctx.resolve).toHaveBeenCalledExactlyOnceWith('cloud');
  });

  it('only resolves on the explicit destructive confirmation, for the side chosen', () => {
    const ctx = setup();
    ctx.press(ctx.current(), "Keep this phone's");
    expect(ctx.resolve).not.toHaveBeenCalled();
    ctx.press(ctx.current(), "Replace account's data");
    expect(ctx.resolve).toHaveBeenCalledExactlyOnceWith('device');
  });

  it('ignores anything after the flow has ended', () => {
    const ctx = setup();
    ctx.press(ctx.current(), 'Cancel');
    ctx.current().options.onDismiss();
    ctx.press(ctx.current(), 'Cancel');
    expect(ctx.cancel).toHaveBeenCalledTimes(1);
  });
});
