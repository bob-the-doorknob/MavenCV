import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Sheet } from '../../components/ui';
import { spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

const PRO_FEATURES = [
  'Export every bullet at once, ready to paste',
  'Unlimited target roles and roadmaps',
  'Rewrites of any bullet you are not happy with',
] as const;

interface ProUpsellSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function ProUpsellSheet({ visible, onClose }: ProUpsellSheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Sheet onClose={onClose} title="Export all bullets is a Pro feature" visible={visible}>
      <Text style={styles.body}>
        You can still copy bullets one at a time. Pro adds the bulk export and a few other things:
      </Text>
      <View style={styles.list}>
        {PRO_FEATURES.map((feature) => (
          <Text key={feature} style={styles.listItem}>
            • {feature}
          </Text>
        ))}
      </View>
      {/* TODO: the paywall (RevenueCat offering + purchase flow) is owned by
          another teammate — this button stays disabled until it lands. */}
      <Button disabled label="Upgrade" onPress={() => {}} />
      <Button label="Not now" onPress={onClose} variant="ghost" />
    </Sheet>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    body: {
      color: theme.colors.textSecondary,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
    },
    list: {
      gap: spacing.sm,
    },
    listItem: {
      color: theme.colors.textPrimary,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
    },
  });
