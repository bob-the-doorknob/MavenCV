import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text } from 'react-native';

import { radii, spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function Sheet({ visible, onClose, title, children }: SheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={onClose} style={styles.overlay}>
        <Pressable style={styles.panel}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    overlay: {
      backgroundColor: theme.colors.overlay,
      flex: 1,
      justifyContent: 'flex-end',
    },
    panel: {
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: radii.header,
      borderTopRightRadius: radii.header,
      gap: spacing.md,
      padding: spacing.xl,
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
