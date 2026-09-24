import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Button, Chip, ProgressBar, SectionLabel, TextArea, TextField } from '../../components/ui';
import { usePressScale } from '../../components/ui/usePressScale';
import type { Level } from '../../data/roles';
import { levelLabels } from '../../data/roles';
import { extractProfile } from '../../services/api';
import type { ErrorMessage } from '../../services/errorMessages';
import { deleteCachedPdf, getFilePickerErrorMessage, pickPdf, readPdfBase64 } from '../../services/filePicker';
import { radii, spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { EXPERIENCE_MAX_LENGTH, getExperienceFeedback } from '../../utils/experienceLimits';
import { PrivacyControls } from '../../components/PrivacyControls';
import { hasAiConsent, useConsent } from '../../services/privacy';

const LEVEL_DESCRIPTIONS: Readonly<Record<Level, string>> = {
  internship: 'A summer or placement role while you are still studying.',
  'entry-level': 'Your first full-time role after graduating.',
};

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
  customTitle?: string | undefined;
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
  customTitle,
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
  const acceptedAt = useConsent((state) => state.acceptedAt);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [mode, setMode] = useState<InputMode>('write');
  const [pickedFileName, setPickedFileName] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<ErrorMessage | null>(null);
  const [showFilledNote, setShowFilledNote] = useState(false);
  const [questions, setQuestions] = useState<string[]>([]);
  const revision = useRef(0);
  const picking = useRef(false);
  useEffect(() => () => { revision.current += 1; }, []);

  const feedback = getExperienceFeedback(experience);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [onBack]);

  const handleSelectMode = (nextMode: InputMode) => {
    revision.current += 1;
    setMode(nextMode);
    setExtractError(null);
    setPickedFileName(null);
    setShowFilledNote(false);
  };

  const handleExperienceTextChange = (text: string) => {
    revision.current += 1;
    onExperienceChange(text);
    setShowFilledNote(false);
  };

  const handleChoosePdf = async () => {
    if (!hasAiConsent()) return;
    if (picking.current) return;
    picking.current = true;
    setIsExtracting(true);
    const requestRevision = ++revision.current;
    setExtractError(null);
    let file;
    try {
      file = await pickPdf();
    } catch (error) {
      setExtractError(getFilePickerErrorMessage(error));
      picking.current = false;
      setIsExtracting(false);
      return;
    }
    if (!file) {
      picking.current = false;
      setIsExtracting(false);
      return; // cancelled — silent, existing text untouched
    }

    try {
      if (revision.current !== requestRevision) return;
      setPickedFileName(file.name);
      // The backend takes the PDF as base64 JSON, so the bytes are read here
      // and api.ts stays free of native file modules.
      const pdfBase64 = await readPdfBase64(file.uri);
      const result = await extractProfile({ pdfBase64 }, roleId ?? undefined, customTitle);
      if (revision.current !== requestRevision) return;
      setQuestions(result.questions);
      onExperienceChange(result.experienceText);
      setMode('write');
      setShowFilledNote(true);
    } catch (error) {
      if (revision.current === requestRevision) setExtractError(getFilePickerErrorMessage(error));
    } finally {
      deleteCachedPdf(file.uri);
      picking.current = false;
      setIsExtracting(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'android' ? 'height' : 'padding'} style={styles.flex}>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom }]}>
          <View style={styles.headerBlock}>
            <SectionLabel>Step 2 of 3</SectionLabel>
            <Text style={styles.title}>Tell us about you</Text>
            <Text style={styles.subtitle}>
              This is what your roadmap is built from, so be concrete.
            </Text>
          </View>

          <View style={styles.field}>
            <SectionLabel>Level</SectionLabel>
            <View style={styles.levelList}>
              <LevelRow
                description={LEVEL_DESCRIPTIONS.internship}
                isFirst
                onPress={() => onSelectLevel('internship')}
                selected={level === 'internship'}
                title={levelLabels.internship}
              />
              <LevelRow
                description={LEVEL_DESCRIPTIONS['entry-level']}
                isFirst={false}
                onPress={() => onSelectLevel('entry-level')}
                selected={level === 'entry-level'}
                title={levelLabels['entry-level']}
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
            <SectionLabel>Your experience</SectionLabel>
            <PrivacyControls />
            {questions.length > 0 ? <Text style={styles.subtitle}>Review the extracted claims. Add answers to these questions in your experience text:{'\n'}{questions.join('\n')}</Text> : null}
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
                  {feedback.hintText}
                </Text>
              </View>
            ) : (
              <View style={styles.uploadContainer}>
                <Button
                  disabled={isExtracting || !acceptedAt}
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
          <Button label="Continue" onPress={onContinue} disabled={!canContinue || !acceptedAt} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

interface LevelRowProps {
  title: string;
  description: string;
  selected: boolean;
  isFirst: boolean;
  onPress: () => void;
}

function LevelRow({ title, description, selected, isFirst, onPress }: LevelRowProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const press = usePressScale();

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityLabel={`${title}. ${description}`}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        android_ripple={{ color: theme.colors.border }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[styles.levelRow, !isFirst && styles.levelRowDivided]}
      >
        <View style={styles.levelCopy}>
          <Text style={styles.levelTitle}>{title}</Text>
          <Text style={styles.levelDescription}>{description}</Text>
        </View>
        {selected ? (
          <Svg fill="none" height={18} viewBox="0 0 24 24" width={18}>
            <Path
              d="M4 12.5 L9.5 18 L20 6.5"
              stroke={theme.colors.textPrimary}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
            />
          </Svg>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    flex: {
      flex: 1,
    },
    headerBlock: {
      gap: spacing.sm,
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
    },
    levelList: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      overflow: 'hidden',
    },
    levelRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.md,
      minHeight: 72,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    levelRowDivided: {
      borderTopColor: theme.colors.divider,
      borderTopWidth: 1,
    },
    levelCopy: {
      flex: 1,
      gap: 2,
    },
    levelTitle: {
      color: theme.colors.textPrimary,
      fontFamily: typography.rowTitle.fontFamily,
      fontSize: typography.rowTitle.fontSize,
      fontWeight: typography.rowTitle.fontWeight,
      lineHeight: typography.rowTitle.lineHeight,
    },
    levelDescription: {
      color: theme.colors.textSecondary,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
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
      gap: spacing.sm,
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
      color: theme.colors.accentText,
      fontWeight: '600',
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
      backgroundColor: theme.colors.surface,
      borderTopColor: theme.colors.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      padding: spacing.lg,
    },
  });
