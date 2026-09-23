import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { Button, Card, SectionLabel } from '../../components/ui';
import type { Level } from '../../data/roles';
import { generateRoadmap } from '../../services/api';
import { getErrorMessage, type ErrorMessage } from '../../services/errorMessages';
import { useAppStore } from '../../store/useAppStore';
import { headerColors, radii, spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { DrawingPath } from './DrawingPath';

const STATUS_LINES = [
  'Reading your experience…',
  'Mapping what this role expects…',
  'Picking your first milestones…',
];
const STATUS_LINE_INTERVAL_MS = 2_000;

interface GeneratingScreenProps {
  roleId: string;
  customTitle: string | undefined;
  level: Level;
  employer: string | undefined;
  experience: string;
  /** Chosen during onboarding; applied once the target exists. */
  targetDate?: string | undefined;
  onDone: () => void;
  onBack: () => void;
}

export function GeneratingScreen({
  roleId,
  customTitle,
  level,
  employer,
  experience,
  targetDate,
  onDone,
  onBack,
}: GeneratingScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorInfo, setErrorInfo] = useState<ErrorMessage | null>(null);
  const [lineIndex, setLineIndex] = useState(0);
  const isInFlightRef = useRef(false);

  const runGeneration = useCallback(async () => {
    if (isInFlightRef.current) {
      return;
    }
    isInFlightRef.current = true;
    setStatus('loading');
    setErrorInfo(null);
    try {
      const roadmap = await generateRoadmap({
        roleId,
        level,
        experience,
        ...(customTitle ? { customTitle } : {}),
        ...(employer ? { employer } : {}),
      });
      useAppStore.getState().addTarget({
        roleId,
        level,
        experience,
        roadmap,
        ...(customTitle ? { customTitle } : {}),
        ...(employer ? { employer } : {}),
      });
      // addTarget makes this the active target, so the date and schedule land
      // on the roadmap that was just generated.
      if (targetDate) {
        useAppStore.getState().setTargetDate(targetDate);
        useAppStore.getState().applySchedule('comfortable');
      }
      onDone();
    } catch (error) {
      setErrorInfo(getErrorMessage(error));
      setStatus('error');
    } finally {
      isInFlightRef.current = false;
    }
  }, [roleId, customTitle, level, employer, experience, targetDate, onDone]);

  // Exactly once per mount (per "attempt" — Retry calls runGeneration again explicitly).
  useEffect(() => {
    void runGeneration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== 'loading') {
      return undefined;
    }
    const interval = setInterval(() => {
      setLineIndex((index) => (index + 1) % STATUS_LINES.length);
    }, STATUS_LINE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (status === 'loading') {
        return true; // ignored while loading
      }
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [status, onBack]);

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      {status === 'loading' ? (
        <View style={[styles.block, { paddingTop: insets.top + spacing.xxl }]}>
          <StatusBar style="light" />
          <SectionLabel color={headerColors.textSecondary}>Building your roadmap</SectionLabel>
          <DrawingPath />
          <Text style={styles.statusLine}>{STATUS_LINES[lineIndex]}</Text>
        </View>
      ) : (
        <View style={styles.center}>
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>{errorInfo?.title}</Text>
            <Text style={styles.errorMessage}>{errorInfo?.message}</Text>
            <View style={styles.actions}>
              {errorInfo?.canRetry ? (
                <Button label="Retry" onPress={() => void runGeneration()} />
              ) : null}
              <Button label="Back" onPress={onBack} variant="secondary" />
            </View>
          </Card>
        </View>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: {
      backgroundColor: theme.colors.background,
      flex: 1,
    },
    center: {
      alignItems: 'center',
      flex: 1,
      gap: spacing.lg,
      justifyContent: 'center',
      padding: spacing.xl,
    },
    // The same dark block as the roadmap header, so the wait already looks
    // like the app you are about to land in.
    block: {
      alignItems: 'center',
      backgroundColor: headerColors.background,
      borderBottomLeftRadius: radii.header,
      borderBottomRightRadius: radii.header,
      flex: 1,
      gap: spacing.xl,
      paddingBottom: spacing.xxxl,
      paddingHorizontal: spacing.xl,
    },
    statusLine: {
      color: headerColors.textSecondary,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
      textAlign: 'center',
    },
    errorCard: {
      gap: spacing.md,
      width: '100%',
    },
    errorTitle: {
      color: theme.colors.textPrimary,
      fontFamily: typography.heading.fontFamily,
      fontSize: typography.heading.fontSize,
      fontWeight: typography.heading.fontWeight,
      letterSpacing: typography.heading.letterSpacing,
      lineHeight: typography.heading.lineHeight,
    },
    errorMessage: {
      color: theme.colors.textSecondary,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
    },
    actions: {
      gap: spacing.sm,
    },
  });
