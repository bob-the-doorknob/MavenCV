/**
 * The "Environment (dev)" row in Settings: a read-only description of the build
 * the app is running in, for telling an Expo Go session from a development
 * build from a release build. Display only — nothing here changes behaviour.
 */

/** Development builds only; the same guard as the other dev rows. */
export const devEnvironmentAvailable = (): boolean => typeof __DEV__ !== 'undefined' && __DEV__;

export interface EnvironmentInfo {
  executionEnvironment: string | null | undefined;
  appOwnership: string | null | undefined;
  appVersion: string;
}

const shown = (value: string | null | undefined): string => (value === null || value === undefined || value === '' ? 'none' : value);

/** One line per fact, in a fixed order. */
export const environmentLines = (info: EnvironmentInfo): string[] => [
  `Execution environment: ${shown(info.executionEnvironment)}`,
  `App ownership: ${shown(info.appOwnership)}`,
  `App version: ${info.appVersion}`,
];
