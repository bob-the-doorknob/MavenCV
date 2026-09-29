import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import Constants from 'expo-constants';

import { Card, SectionLabel } from '../../components/ui';
import { PrivacyControls } from '../../components/PrivacyControls';
import { usePressScale } from '../../components/ui/usePressScale';
import { resolveRoleTitle } from '../../data/roles';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { checkProEntitlement } from '../../services/proStatus';
import { restorePurchases } from '../../services/revenueCat';
import { EditTargetSheet } from '../roadmap/EditTargetSheet';
import { ProUpsellSheet } from '../cv/ProUpsellSheet';
import { useActiveTarget, useAppStore } from '../../store/useAppStore';
import { minTouchTarget, spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { formatExportText } from '../../utils/exportText';
import { formatMonthYear } from '../../utils/targetDate';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

const APP_VERSION = Constants.expoConfig?.version ?? '0.1.0';

const ABOUT_LINE =
  'Maven turns a target role into a short roadmap, scores how ready you are, and writes a CV bullet each time you finish something.';

export function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Navigation>();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const target = useActiveTarget();
  const [restoring, setRestoring] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [upsellVisible, setUpsellVisible] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const targetCount = useAppStore((state) => state.targets.length);

  /** Same gate and warning as the roadmap's switcher. */
  const startRegenerate = async (): Promise<void> => {
    if (!target || regenerating) return;
    setRegenerating(true);
    try {
      if (!(await checkProEntitlement())) {
        setUpsellVisible(true);
        return;
      }
      const doneCount = target.roadmap.filter((entry) => entry.status === 'done').length;
      const openCount = target.roadmap.length - doneCount;
      Alert.alert(
        'Regenerate this roadmap?',
        `${doneCount} finished ${doneCount === 1 ? 'milestone' : 'milestones'} and the CV bullets they earned are kept. ${openCount} unfinished ${openCount === 1 ? 'milestone is' : 'milestones are'} replaced with a fresh set built from your current experience.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Regenerate', onPress: () => navigation.navigate('RegenerateRoadmap') },
        ],
      );
    } catch (error) {
      Alert.alert('Unable to regenerate', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setRegenerating(false);
    }
  };

  const confirmDeleteTarget = (): void => {
    if (!target) return;
    const isLast = targetCount === 1;
    Alert.alert(
      'Delete this target?',
      isLast
        ? "This deletes this target, its roadmap and its CV bullets. You'll start again from setup."
        : 'This deletes this target, its roadmap and its CV bullets. Your other targets are untouched.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            useAppStore.getState().removeTarget(target.id);
            if (navigation.canGoBack()) navigation.goBack();
          },
        },
      ],
    );
  };

  /** Plain text, shared through the OS sheet — email, notes, wherever. */
  const exportEverything = async (): Promise<void> => {
    if (!target) {
      Alert.alert('Nothing to export', 'Create a target role first.');
      return;
    }
    try {
      await Share.share({
        message: formatExportText(target, useAppStore.getState().cvEntries, formatMonthYear),
      });
    } catch {
      Alert.alert('Export failed', 'The share sheet could not be opened. Please try again.');
    }
  };

  const restore = async (): Promise<void> => {
    if (restoring) {
      return;
    }
    setRestoring(true);
    try {
      const isPro = await restorePurchases();
      Alert.alert(
        isPro ? 'Purchases restored' : 'Nothing to restore',
        isPro
          ? 'Your Pro features are active on this device.'
          : 'No previous purchase was found for this account.',
      );
    } catch (error) {
      Alert.alert('Restore failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  const confirmReset = (): void => {
    Alert.alert(
      'Reset all data',
      "This deletes your roadmaps and CV bullets from this device. This can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => useAppStore.getState().resetAll(),
        },
      ],
    );
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.topBarTitle}>Settings</Text>
        {/* Balances the back button so the title stays centred. */}
        <View style={styles.topBarSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      >
        <View style={styles.section}>
          <SectionLabel>Target</SectionLabel>
          <Card>
            <SettingsRow
              isFirst
              onPress={() => navigation.navigate('AddTarget')}
              subtitle={
                target
                  ? `Currently ${resolveRoleTitle(target.roleId, target.customTitle)}`
                  : 'No target role yet'
              }
              title="Change target role"
            />
            <SettingsRow
              isFirst={false}
              onPress={() => setEditVisible(true)}
              subtitle="Level, company and experience — your roadmap stays as it is"
              title="Edit this target"
            />
            <SettingsRow
              isFirst={false}
              onPress={() => void startRegenerate()}
              subtitle="Rebuild unfinished milestones from your current experience"
              title="Regenerate roadmap"
            />
            <SettingsRow
              isDanger
              isFirst={false}
              onPress={confirmDeleteTarget}
              subtitle="Removes this target, its roadmap and its CV bullets"
              title="Delete this target"
            />
          </Card>
        </View>

        <View style={styles.section}>
          <SectionLabel>Purchases</SectionLabel>
          <Card>
            <SettingsRow
              isFirst
              onPress={() => void restore()}
              subtitle={restoring ? 'Checking with the store' : 'Bring back Pro on this device'}
              title="Restore purchases"
            />
          </Card>
        </View>

        <View style={styles.section}>
          <SectionLabel>Data</SectionLabel>
          <Card>
            <SettingsRow
              isFirst
              onPress={() => void exportEverything()}
              subtitle="Share your target, milestones and CV bullets as plain text"
              title="Export everything"
            />
            <SettingsRow
              isDanger
              isFirst={false}
              onPress={confirmReset}
              subtitle="Deletes every roadmap and CV bullet on this device"
              title="Reset all data"
            />
          </Card>
        </View>

        <View style={styles.section}>
          <SectionLabel>Privacy &amp; AI</SectionLabel>
          <Card>
            <PrivacyControls />
          </Card>
        </View>

        <View style={styles.section}>
          <SectionLabel>About Maven</SectionLabel>
          <Card>
            <Text style={styles.about}>{ABOUT_LINE}</Text>
            <Text style={styles.version}>Version {APP_VERSION}</Text>
          </Card>
        </View>
      </ScrollView>

      <EditTargetSheet onClose={() => setEditVisible(false)} target={target} visible={editVisible} />
      <ProUpsellSheet
        onClose={() => setUpsellVisible(false)}
        trigger="regenerate"
        visible={upsellVisible}
      />
    </View>
  );
}

interface SettingsRowProps {
  title: string;
  subtitle: string;
  isFirst: boolean;
  isDanger?: boolean;
  onPress: () => void;
}

function SettingsRow({ title, subtitle, isFirst, isDanger = false, onPress }: SettingsRowProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const press = usePressScale();

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityLabel={`${title}. ${subtitle}`}
        accessibilityRole="button"
        android_ripple={{ color: theme.colors.border }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[styles.row, !isFirst && styles.rowDivided]}
      >
        <View style={styles.rowCopy}>
          <Text style={[styles.rowTitle, isDanger && styles.rowTitleDanger]}>{title}</Text>
          <Text style={styles.rowSubtitle}>{subtitle}</Text>
        </View>
        <Svg fill="none" height={18} viewBox="0 0 24 24" width={18}>
          <Path
            d="M9 5 L16 12 L9 19"
            stroke={theme.colors.textMuted}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
        </Svg>
      </Pressable>
    </Animated.View>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const press = usePressScale();

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityLabel="Back"
        accessibilityRole="button"
        android_ripple={{ borderless: true, color: theme.colors.border }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={styles.iconButton}
      >
        <Svg fill="none" height={24} viewBox="0 0 24 24" width={24}>
          <Path
            d="M15 5 L8 12 L15 19"
            stroke={theme.colors.textPrimary}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
        </Svg>
      </Pressable>
    </Animated.View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: {
      backgroundColor: theme.colors.background,
      flex: 1,
    },
    topBar: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingBottom: spacing.sm,
      paddingHorizontal: spacing.sm,
    },
    topBarTitle: {
      color: theme.colors.textSecondary,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      fontWeight: '600',
    },
    topBarSpacer: {
      width: minTouchTarget,
    },
    iconButton: {
      alignItems: 'center',
      height: minTouchTarget,
      justifyContent: 'center',
      width: minTouchTarget,
    },
    content: {
      gap: spacing.xl,
      padding: spacing.lg,
    },
    section: {
      gap: spacing.sm,
    },
    row: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.md,
      minHeight: minTouchTarget,
      paddingVertical: spacing.sm,
    },
    rowDivided: {
      borderTopColor: theme.colors.divider,
      borderTopWidth: 1,
      marginTop: spacing.sm,
      paddingTop: spacing.md,
    },
    rowCopy: {
      flex: 1,
      gap: 2,
    },
    rowTitle: {
      color: theme.colors.textPrimary,
      fontFamily: typography.rowTitle.fontFamily,
      fontSize: typography.rowTitle.fontSize,
      fontWeight: typography.rowTitle.fontWeight,
      lineHeight: typography.rowTitle.lineHeight,
    },
    rowTitleDanger: {
      color: theme.colors.danger,
    },
    rowSubtitle: {
      color: theme.colors.textSecondary,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    about: {
      color: theme.colors.textSecondary,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
    },
    version: {
      color: theme.colors.textMuted,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      marginTop: spacing.md,
    },
  });
