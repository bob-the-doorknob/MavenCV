import {
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from '@expo-google-fonts/geist';
import { useFonts } from 'expo-font';

/** Keys must match the fontFamily values in tokens.ts. */
const fontAssets = {
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
};

/**
 * True once the app may render. A load failure also returns true — the app
 * falls back to system fonts rather than sitting on the splash forever.
 */
export const useAppFonts = (): boolean => {
  const [loaded, error] = useFonts(fontAssets);
  return loaded || error !== null;
};
