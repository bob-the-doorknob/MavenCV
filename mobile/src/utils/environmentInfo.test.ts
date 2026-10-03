import { afterEach, describe, expect, it, vi } from 'vitest';

import { devEnvironmentAvailable, environmentLines } from './environmentInfo';

describe('the Environment (dev) row guard', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is hidden when __DEV__ is false, and when it is undefined', () => {
    vi.stubGlobal('__DEV__', false);
    expect(devEnvironmentAvailable()).toBe(false);
    vi.stubGlobal('__DEV__', undefined);
    expect(devEnvironmentAvailable()).toBe(false);
  });

  it('is shown in a development build', () => {
    vi.stubGlobal('__DEV__', true);
    expect(devEnvironmentAvailable()).toBe(true);
  });
});

describe('environmentLines', () => {
  it('lists the facts in a fixed order', () => {
    expect(environmentLines({ executionEnvironment: 'bare', appOwnership: null, appVersion: '0.1.0' })).toEqual([
      'Execution environment: bare',
      'App ownership: none',
      'App version: 0.1.0',
    ]);
  });

  it('shows a value as given, and "none" for a missing one', () => {
    expect(environmentLines({ executionEnvironment: 'storeClient', appOwnership: 'expo', appVersion: '1.2.3' })[0]).toBe(
      'Execution environment: storeClient',
    );
    expect(environmentLines({ executionEnvironment: undefined, appOwnership: '', appVersion: 'x' })).toEqual([
      'Execution environment: none',
      'App ownership: none',
      'App version: x',
    ]);
  });
});
