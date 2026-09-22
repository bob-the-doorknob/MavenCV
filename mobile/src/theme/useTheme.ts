import { useColorScheme } from 'react-native';

import { themes, type Theme } from './tokens';

/** Resolves the active theme from the device color scheme. Defaults to light. */
export const useTheme = (): Theme => {
  const scheme = useColorScheme();
  return themes[scheme === 'dark' ? 'dark' : 'light'];
};
