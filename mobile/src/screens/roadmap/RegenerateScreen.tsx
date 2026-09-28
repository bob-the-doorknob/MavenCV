import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Button, Card, SectionLabel } from '../../components/ui';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { generateRoadmap } from '../../services/api';
import { getErrorMessage, type ErrorMessage } from '../../services/errorMessages';
import { useActiveTarget, useAppStore } from '../../store/useAppStore';
import { headerColors, spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { DrawingPath } from '../onboarding/DrawingPath';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

const STATUS_LINES = [
  'Re-reading your experience…',
  'Keeping what you have finished…',
  'Picking your next milestones…',
];
const STATUS_LINE_INTERVAL_MS = 2_000;

/**
 * The same wait as onboarding, but it rebuilds the active target instead of
 * creating one. Finished milestones and their bullets are kept by the store.
 */
export function RegenerateScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Navigation>();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const target = useActiveTarget();

  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorInfo, setErrorInfo] = useState<ErrorMessage | null>(null);
  const [lineIndex, setLineIndex] = useState(0);
  const isInFlightRef = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [navigation]);

  const run = useCallback(async () => {
    if (isInFlightRef.current || !target) {
      return;
    }
    isInFlightRef.current = true;
    setStatus('loading');
    setErrorInfo(null);
    try {
      const roadmap = await generateRoadmap({
        roleId: target.roleId,
        level: target.level,
        experience: target.experience,
        ...(target.customTitle ? { customTitle: target.customTitle } : {}),
        ...(target.employer ? { employer: target.employer } : {}),
      });
      if (!mounted.current) {
        return;
      }
      useAppStore.getState().replaceUnfinishedRoadmap(roadmap);
      useAppStore.getState().showCompletionNotice('Roadmap rebuilt. Finished milestones kept.');
      goBack();
    } catch (error) {
      if (!mounted.current) {
        return;
      }
      setErrorInfo(getErrorMessage(error));
      setStatus('error');
    } finally {
      isInFlightRef.current = false;
    }
  }, [goBack, target]);

  useEffect(() => {
    void run();
    // Once per mount; Retry calls run() again explicitly.
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
        return true; // a half-written roadmap is worse than waiting
      }
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [goBack, status]);

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      {status === 'loading' ? (
        <View style={[styles.block, { paddingTop: insets.top + spacing.xxl }]}>
          <StatusBar style="light" />
          <SectionLabel color={headerColors.textSecondary}>Rebuilding your roadmap</SectionLabel>
          <DrawingPath />
          <Text style={styles.statusLine}>{STATUS_LINES[lineIndex]}</Text>
        </View>
      ) : (
        <View style={styles.center}>
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>{errorInfo?.title}</Text>
            <Text style={styles.errorMessage}>{errorInfo?.message}</Text>
            <Text style={styles.errorMessage}>Your roadmap has not been changed.</Text>
            <View style={styles.actions}>
              {errorInfo?.canRetry ? <Button label="Try again" onPress={() => void run()} /> : null}
              <Button label="Back to roadmap" onPress={goBack} variant="secondary" />
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
    block: {
      alignItems: 'center',
      backgroundColor: headerColors.background,
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
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
    center: {
      alignItems: 'center',
      flex: 1,
      gap: spacing.lg,
      justifyContent: 'center',
      padding: spacing.xl,
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
