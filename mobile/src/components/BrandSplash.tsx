import { useMemo } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radii, spacing, typography, type Theme } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

interface BrandSplashProps {
  /** Shown under the wordmark — a loading line, or a load failure. */
  message?: string;
  isError?: boolean;
  /**
   * Lets the content scroll instead of overflowing. For the failure screen,
   * which carries several buttons and notes: at the largest system text size,
   * or in Display Zoom, they would not fit the screen and would clip.
   */
  scrollable?: boolean;
  children?: React.ReactNode;
}

/**
 * The JS half of the splash: identical paper and wordmark to the native
 * splash, so handing over from one to the other is invisible. Also the shell
 * for the storage-failure state, which needs a button the native splash
 * cannot show.
 */
export function BrandSplash({ message, isError = false, scrollable = false, children }: BrandSplashProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const content = (
    <>
      <View style={styles.brand}>
        {/* eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro bundles a local image only through require() */}
        <Image accessibilityIgnoresInvertColors source={require('../../assets/maven-mark.png')} style={styles.mark} />
        {/* The wordmark is the logo, not reading text: capped so it cannot crowd out the message. */}
        <Text maxFontSizeMultiplier={1.2} style={styles.wordmark}>
          Maven
        </Text>
      </View>
      {message ? (
        <Text
          accessibilityRole={isError ? 'alert' : 'text'}
          style={[styles.message, isError && styles.messageError]}
        >
          {message}
        </Text>
      ) : null}
      {children}
    </>
  );

  if (!scrollable) {
    return <View style={styles.screen}>{content}</View>;
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: insets.bottom + spacing.xl, paddingTop: insets.top + spacing.xl },
      ]}
      style={styles.scroll}
    >
      {content}
    </ScrollView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: {
      alignItems: 'center',
      backgroundColor: theme.colors.background,
      flex: 1,
      gap: spacing.lg,
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
    },
    scroll: {
      backgroundColor: theme.colors.background,
      flex: 1,
    },
    // flexGrow keeps the content centred when it is short, and lets it run past the screen — and scroll — when it is not.
    scrollContent: {
      alignItems: 'center',
      flexGrow: 1,
      gap: spacing.lg,
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
    },
    brand: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
    },
    wordmark: {
      color: theme.colors.textPrimary,
      fontFamily: typography.display.fontFamily,
      fontSize: 44,
      fontWeight: typography.display.fontWeight,
      letterSpacing: -1.2,
      lineHeight: 48,
    },
    mark: {
      borderRadius: radii.md,
      height: 48,
      width: 48,
    },
    message: {
      color: theme.colors.textSecondary,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
      textAlign: 'center',
    },
    messageError: {
      color: theme.colors.textPrimary,
    },
  });
