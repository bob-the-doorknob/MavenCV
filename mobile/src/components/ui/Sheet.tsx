import { useMemo } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radii, spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Set false when the sheet content already contains a bounded ScrollView. */
  scrollable?: boolean;
}

export function Sheet({ visible, onClose, title, children, scrollable = true }: SheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(theme, insets.bottom), [theme, insets.bottom]);
  const dismissKeyboardOrClose = () => {
    if (Keyboard.isVisible()) {
      Keyboard.dismiss();
      return;
    }
    onClose();
  };
  const panel = (
    <Pressable accessible={false} onPress={Keyboard.dismiss} style={styles.panel}>
      {title ? (
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
      ) : null}
      {children}
    </Pressable>
  );

  return (
    <Modal animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={dismissKeyboardOrClose} transparent visible={visible}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        <Pressable
          accessibilityLabel="Dismiss keyboard or close sheet"
          accessibilityRole="button"
          onPress={dismissKeyboardOrClose}
          style={styles.overlay}
        />
        {scrollable ? (
          <ScrollView
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            style={styles.panelScroll}
          >
            {panel}
          </ScrollView>
        ) : (
          <View style={styles.panelScroll}>{panel}</View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (theme: Theme, bottomInset: number) =>
  StyleSheet.create({
    container: {
      backgroundColor: theme.colors.overlay,
      flex: 1,
      justifyContent: 'flex-end',
    },
    overlay: {
      bottom: 0,
      left: 0,
      position: 'absolute',
      right: 0,
      top: 0,
    },
    panelScroll: {
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: radii.header,
      borderTopRightRadius: radii.header,
      flexGrow: 0,
      maxHeight: '90%',
    },
    // flexShrink lets a non-scrolling sheet fit its 90% cap by shrinking its own list.
    panel: {
      flexShrink: 1,
      gap: spacing.md,
      padding: spacing.xl,
      paddingBottom: spacing.xl + bottomInset,
    },
    title: {
      color: theme.colors.textPrimary,
      fontFamily: typography.heading.fontFamily,
      fontSize: typography.heading.fontSize,
      fontWeight: typography.heading.fontWeight,
      letterSpacing: typography.heading.letterSpacing,
      lineHeight: typography.heading.lineHeight,
    },
  });
