import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';

import { CUSTOM_ROLE_ID, type Level } from '../../data/roles';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../theme/useTheme';
import { EXPERIENCE_MIN_LENGTH } from '../../utils/experienceLimits';
import { truncateText } from '../../utils/sanitizeText';
import { AboutYouScreen } from './AboutYouScreen';
import { GeneratingScreen } from './GeneratingScreen';
import { ReadyByScreen } from './ReadyByScreen';
import { RoleScreen } from './RoleScreen';

type Step = 'role' | 'aboutYou' | 'readyBy' | 'generating';

const MAX_CUSTOM_TITLE_LENGTH = 60;

/**
 * The only place holding onboarding-in-progress state. Screens below it are
 * presentational, driven entirely by props. Nothing is saved to the store
 * until GeneratingScreen's generateRoadmap call succeeds.
 *
 * Steps stay a plain useState switch rather than a nested navigator — the
 * flow is linear and its state dies with it.
 */
export function OnboardingFlow() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const finish = useCallback(() => {
    // The draft has served its purpose once a target exists.
    useAppStore.getState().clearOnboardingDraft();
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation]);
  const theme = useTheme();

  // Read once on mount: the draft seeds the form, it does not drive it.
  const [draft] = useState(() => useAppStore.getState().onboardingDraft);
  const [step, setStep] = useState<Step>(draft?.step ?? 'role');
  const [roleId, setRoleId] = useState<string | null>(draft?.roleId ?? null);
  const [customTitle, setCustomTitle] = useState(draft?.customTitle ?? '');
  const [level, setLevel] = useState<Level | null>(draft?.level ?? null);
  const [employer, setEmployer] = useState(draft?.employer ?? '');
  const [experience, setExperience] = useState(draft?.experience ?? '');
  const [targetDate, setTargetDate] = useState<string | null>(draft?.targetDate ?? null);

  /**
   * Saved on every answer, so quitting mid-flow loses nothing. 'generating'
   * is never stored — coming back into a wait that is no longer running
   * would strand the user.
   */
  useEffect(() => {
    if (step === 'generating') {
      return;
    }
    useAppStore.getState().saveOnboardingDraft({
      step,
      roleId,
      customTitle,
      level,
      employer,
      experience,
      targetDate,
      savedAt: new Date().toISOString(),
    });
  }, [step, roleId, customTitle, level, employer, experience, targetDate]);

  const handleCustomTitleChange = useCallback((text: string) => {
    setCustomTitle(truncateText(text, MAX_CUSTOM_TITLE_LENGTH));
  }, []);

  const canContinueRole = roleId !== null && (roleId !== CUSTOM_ROLE_ID || customTitle.trim().length > 0);
  const canContinueAboutYou = level !== null && experience.trim().length >= EXPERIENCE_MIN_LENGTH;

  const trimmedCustomTitle = roleId === CUSTOM_ROLE_ID ? customTitle.trim() : undefined;
  const trimmedEmployer = employer.trim() || undefined;
  const trimmedExperience = experience.trim();

  if (step === 'readyBy') {
    return (
      <ReadyByScreen
        onBack={() => setStep('aboutYou')}
        onContinue={() => setStep('generating')}
        onPickDate={setTargetDate}
        onSkip={() => {
          setTargetDate(null);
          setStep('generating');
        }}
        targetDate={targetDate}
      />
    );
  }

  if (step === 'generating') {
    return (
      <GeneratingScreen
        customTitle={trimmedCustomTitle}
        employer={trimmedEmployer}
        experience={trimmedExperience}
        level={level as Level}
        targetDate={targetDate ?? undefined}
        onBack={() => setStep('readyBy')}
        // Saving the target is what ends onboarding: the root navigator sees
        // the new target and swaps this flow out for the roadmap.
        onDone={finish}
        roleId={roleId as string}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {step === 'role' ? (
        <RoleScreen
          canContinue={canContinueRole}
          customTitle={customTitle}
          onContinue={() => setStep('aboutYou')}
          onCustomTitleChange={handleCustomTitleChange}
          onSelectRole={setRoleId}
          selectedRoleId={roleId}
        />
      ) : (
        <AboutYouScreen
          customTitle={trimmedCustomTitle}
          canContinue={canContinueAboutYou}
          employer={employer}
          experience={experience}
          level={level}
          onBack={() => setStep('role')}
          onContinue={() => setStep('readyBy')}
          onEmployerChange={setEmployer}
          onExperienceChange={setExperience}
          onSelectLevel={setLevel}
          roleId={roleId}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
