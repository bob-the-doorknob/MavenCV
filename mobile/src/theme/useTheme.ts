import { useColorScheme } from 'react-native';

import { categoryTints, themes, type CategoryKey, type CategoryTint, type Theme } from './tokens';

/** Resolves the active theme from the device color scheme. Defaults to light. */
export const useTheme = (): Theme => {
  const scheme = useColorScheme();
  return themes[scheme === 'dark' ? 'dark' : 'light'];
};

/** The chip tint for a roadmap category in the active theme. */
export const useCategoryTint = (category: CategoryKey): CategoryTint => {
  const theme = useTheme();
  return categoryTints[theme.mode][category];
};
