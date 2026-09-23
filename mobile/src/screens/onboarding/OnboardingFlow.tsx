import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';

import { CUSTOM_ROLE_ID, type Level } from '../../data/roles';
import { useTheme } from '../../theme/useTheme';
import { EXPERIENCE_MIN_LENGTH } from '../../utils/experienceLimits';
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
  const finish = useCallback(() => { if (navigation.canGoBack()) navigation.goBack(); }, [navigation]);
  const theme = useTheme();
  const [step, setStep] = useState<Step>('role');
  const [roleId, setRoleId] = useState<string | null>(null);
  const [customTitle, setCustomTitle] = useState('');
  const [level, setLevel] = useState<Level | null>(null);
  const [employer, setEmployer] = useState('');
  const [experience, setExperience] = useState('');
  const [targetDate, setTargetDate] = useState<string | null>(null);

  const handleCustomTitleChange = useCallback((text: string) => {
    setCustomTitle(text.slice(0, MAX_CUSTOM_TITLE_LENGTH));
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
