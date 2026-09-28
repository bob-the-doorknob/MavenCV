import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Sheet } from '../../components/ui';
import { LegalLinks } from '../../components/PrivacyControls';
import { presentProPaywall, restorePurchases } from '../../services/revenueCat';
import { useProStatus } from '../../services/useProStatus';
import { spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

const PRO_FEATURES = [
  'Export every bullet at once, ready to paste',
  'Unlimited target roles and roadmaps',
] as const;

interface ProUpsellSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function ProUpsellSheet({ visible, onClose }: ProUpsellSheetProps) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const availableHeight = Math.max(100, height - insets.top - insets.bottom - 180);
  const styles = useMemo(() => createStyles(theme, availableHeight), [theme, availableHeight]);
  const { refresh } = useProStatus();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const handleUpgrade = async (): Promise<void> => {
    setBusy(true); setMessage('');
    try { const entitled = await presentProPaywall(); await refresh(); if (entitled) onClose(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Purchase failed.'); }
    finally { setBusy(false); }
  };

  const handleRestore = async (): Promise<void> => {
    setBusy(true); setMessage('');
    try { const entitled = await restorePurchases(); await refresh(); if (entitled) onClose(); else setMessage('No active Pro purchase was found.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Restore failed.'); }
    finally { setBusy(false); }
  };

  return (
    <Sheet onClose={onClose} title="Export all bullets is a Pro feature" visible={visible}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
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
      {message ? <Text accessibilityRole="alert" style={styles.body}>{message}</Text> : null}
      <Button disabled={busy} label="Upgrade" onPress={() => void handleUpgrade()} />
      <LegalLinks />
      <Button disabled={busy} label="Restore purchases" onPress={() => void handleRestore()} variant="ghost" />
      <Button label="Not now" onPress={onClose} variant="ghost" />
      </ScrollView>
    </Sheet>
  );
}

const createStyles = (theme: Theme, availableHeight: number) =>
  StyleSheet.create({
    scroll: { maxHeight: availableHeight },
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
