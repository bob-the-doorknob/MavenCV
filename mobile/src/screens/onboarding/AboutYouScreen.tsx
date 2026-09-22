import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, BackHandler, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip, ProgressBar, TextArea, TextField } from '../../components/ui';
import type { Level } from '../../data/roles';
import { levelLabels } from '../../data/roles';
import { extractProfile } from '../../services/api';
import type { ErrorMessage } from '../../services/errorMessages';
import { getFilePickerErrorMessage, pickPdf } from '../../services/filePicker';
import { spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { EXPERIENCE_MAX_LENGTH, getExperienceFeedback } from '../../utils/experienceLimits';

const EXPERIENCE_EXAMPLES: Readonly<Record<string, string>> = {
  'software-engineer':
    'E.g. Built a REST API in Node.js for a class project, contributed a merged PR to an open-source repo, completed a data structures course.',
  'frontend-mobile':
    'E.g. Built a React Native app for a class project, redesigned a page for performance, completed a mobile development course.',
  'backend-cloud':
    'E.g. Deployed a service to AWS for a class project, wrote integration tests, completed a databases course.',
  'devops-sre':
    'E.g. Set up a CI pipeline for a class project, containerized an app with Docker, completed a systems course.',
  cybersecurity:
    'E.g. Completed a CTF challenge, found and reported a vulnerability in a practice app, completed a security course.',
  'embedded-hardware':
    'E.g. Programmed a microcontroller for a robotics project, built a sensor-driven prototype, completed an embedded systems course.',
  'data-scientist':
    'E.g. Analyzed a public dataset in Python, built a regression model for a class project, completed a statistics course.',
  'ml-ai-engineer':
    'E.g. Trained a classification model for a class project, fine-tuned a pretrained model, completed a machine learning course.',
  'data-analyst':
    'E.g. Built a dashboard from a public dataset, wrote SQL queries for a class project, completed a statistics course.',
  'product-manager':
    'E.g. Ran user interviews for a class project, wrote a product spec, led a small team to ship a feature.',
  'ui-ux':
    'E.g. Redesigned an app flow in Figma, ran 3 usability tests, built a portfolio case study.',
  'business-analyst':
    'E.g. Analyzed a business process for a class project, built a financial model, presented findings to a team.',
  quant:
    'E.g. Backtested a trading strategy in Python, completed a probability course, placed in a case competition.',
  'growth-marketing':
    'E.g. Ran an A/B test for a class project, grew a social account from 0, completed a marketing analytics course.',
};

const DEFAULT_EXPERIENCE_EXAMPLE =
  'E.g. Led a class project, completed a relevant course, built something you can point to.';

const getExperienceExample = (roleId: string | null): string =>
  (roleId && EXPERIENCE_EXAMPLES[roleId]) || DEFAULT_EXPERIENCE_EXAMPLE;

type InputMode = 'write' | 'upload';

interface AboutYouScreenProps {
  roleId: string | null;
  level: Level | null;
  onSelectLevel: (level: Level) => void;
  employer: string;
  onEmployerChange: (text: string) => void;
  experience: string;
  onExperienceChange: (text: string) => void;
  canContinue: boolean;
  onContinue: () => void;
  onBack: () => void;
}

export function AboutYouScreen({
  roleId,
  level,
  onSelectLevel,
  employer,
  onEmployerChange,
  experience,
  onExperienceChange,
  canContinue,
  onContinue,
  onBack,
}: AboutYouScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [mode, setMode] = useState<InputMode>('write');
  const [pickedFileName, setPickedFileName] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<ErrorMessage | null>(null);
  const [showFilledNote, setShowFilledNote] = useState(false);

  const feedback = getExperienceFeedback(experience);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [onBack]);

  const handleSelectMode = (nextMode: InputMode) => {
    setMode(nextMode);
    setExtractError(null);
    setPickedFileName(null);
    setShowFilledNote(false);
  };

  const handleExperienceTextChange = (text: string) => {
    onExperienceChange(text);
    setShowFilledNote(false);
  };

  const handleChoosePdf = async () => {
    setExtractError(null);
    let file;
    try {
      file = await pickPdf();
    } catch (error) {
      setExtractError(getFilePickerErrorMessage(error));
      return;
    }
    if (!file) {
      return; // cancelled — silent, existing text untouched
    }

    setPickedFileName(file.name);
    setIsExtracting(true);
    try {
      const result = await extractProfile({ uri: file.uri, name: file.name }, roleId ?? undefined);
      onExperienceChange(result.experienceText);
      setMode('write');
      setShowFilledNote(true);
    } catch (error) {
      setExtractError(getFilePickerErrorMessage(error));
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'android' ? 'height' : 'padding'} style={styles.flex}>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom }]}>
          <Text style={styles.title}>Tell us about you</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Level</Text>
            <View style={styles.row}>
              <Chip
                label={levelLabels.internship}
                onPress={() => onSelectLevel('internship')}
                selected={level === 'internship'}
              />
              <Chip
                label={levelLabels['entry-level']}
                onPress={() => onSelectLevel('entry-level')}
                selected={level === 'entry-level'}
              />
            </View>
          </View>

          <TextField
            accessibilityLabel="Target company"
            label="Target company (optional)"
            onChangeText={onEmployerChange}
            placeholder="e.g. Google"
            value={employer}
          />

          <View style={styles.field}>
            <Text style={styles.label}>Your experience</Text>
            <View style={styles.row}>
              <Chip label="Write it" onPress={() => handleSelectMode('write')} selected={mode === 'write'} />
              <Chip
                label="Upload CV (PDF)"
                onPress={() => handleSelectMode('upload')}
                selected={mode === 'upload'}
              />
            </View>

            {mode === 'write' ? (
              <View style={styles.field}>
                <TextArea
                  maxLength={EXPERIENCE_MAX_LENGTH}
                  numberOfLines={8}
                  onChangeText={handleExperienceTextChange}
                  placeholder={`Paste your CV text or list your achievements. ${getExperienceExample(roleId)}`}
                  showCount={feedback.showRawCount}
                  value={experience}
                />

                {showFilledNote ? (
                  <Text style={styles.filledNote}>
                    We filled this from your CV. Check it and edit anything before generating.
                  </Text>
                ) : null}

                <ProgressBar height={6} value={feedback.progressToRecommended * 100} />
                <Text style={[styles.hint, feedback.tone === 'sufficient' && styles.hintPositive]}>
                  {feedback.tone === 'sufficient' ? `✓ ${feedback.hintText}` : feedback.hintText}
                </Text>
              </View>
            ) : (
              <View style={styles.uploadContainer}>
                <Button
                  disabled={isExtracting}
                  label="Choose PDF"
                  loading={isExtracting}
                  onPress={() => void handleChoosePdf()}
                  variant="secondary"
                />
                {isExtracting ? (
                  <View style={styles.extractingRow}>
                    <ActivityIndicator color={theme.colors.accent} />
                    <Text style={styles.extractingText}>
                      {pickedFileName ? `${pickedFileName} — ` : ''}Reading your CV…
                    </Text>
                  </View>
                ) : null}
                {extractError ? (
                  <View style={styles.field}>
                    <Text style={styles.errorTitle}>{extractError.title}</Text>
                    <Text style={styles.errorMessage}>{extractError.message}</Text>
                  </View>
                ) : null}
              </View>
            )}
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom }]}>
          <Button label="Generate my roadmap" onPress={onContinue} disabled={!canContinue} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    flex: {
      flex: 1,
    },
    screen: {
      backgroundColor: theme.colors.background,
      flex: 1,
    },
    content: {
      gap: spacing.xl,
      padding: spacing.lg,
    },
    title: {
      color: theme.colors.textPrimary,
      fontFamily: typography.title.fontFamily,
      fontSize: typography.title.fontSize,
      fontWeight: typography.title.fontWeight,
      letterSpacing: typography.title.letterSpacing,
      lineHeight: typography.title.lineHeight,
    },
    field: {
      gap: spacing.xs,
    },
    label: {
      color: theme.colors.textSecondary,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      fontWeight: '700',
    },
    row: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    hint: {
      color: theme.colors.textMuted,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
    },
    hintPositive: {
      color: theme.colors.accent,
      fontWeight: '700',
    },
    filledNote: {
      color: theme.colors.textSecondary,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    uploadContainer: {
      gap: spacing.sm,
    },
    extractingRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
    },
    extractingText: {
      color: theme.colors.textSecondary,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
    },
    errorTitle: {
      color: theme.colors.danger,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
      fontWeight: '700',
    },
    errorMessage: {
      color: theme.colors.textSecondary,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
    },
    footer: {
      borderTopColor: theme.colors.border,
      borderTopWidth: 1,
      padding: spacing.lg,
    },
  });
