import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { radii, spacing, typography, type Theme } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

interface BrandSplashProps {
  /** Shown under the wordmark — a loading line, or a load failure. */
  message?: string;
  isError?: boolean;
  children?: React.ReactNode;
}

/**
 * The JS half of the splash: identical paper and wordmark to the native
 * splash, so handing over from one to the other is invisible. Also the shell
 * for the storage-failure state, which needs a button the native splash
 * cannot show.
 */
export function BrandSplash({ message, isError = false, children }: BrandSplashProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.screen}>
      <View style={styles.brand}>
        <Text style={styles.wordmark}>Maven</Text>
        {/* The one ember on an otherwise paper screen — the brand mark. */}
        <View style={styles.mark} />
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
    </View>
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
      backgroundColor: theme.colors.accent,
      borderRadius: radii.pill,
      height: 10,
      marginTop: spacing.md,
      width: 10,
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
