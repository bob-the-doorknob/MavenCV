import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CUSTOM_ROLE_ID, type Level } from '../../data/roles';
import { useTheme } from '../../theme/useTheme';
import { EXPERIENCE_MIN_LENGTH } from '../../utils/experienceLimits';
import { AboutYouScreen } from './AboutYouScreen';
import { GeneratingScreen } from './GeneratingScreen';
import { RoadmapPreview } from './RoadmapPreview';
import { RoleScreen } from './RoleScreen';

type Step = 'role' | 'aboutYou' | 'generating' | 'preview';

const MAX_CUSTOM_TITLE_LENGTH = 60;

/**
 * The only place holding onboarding-in-progress state. Screens below it are
 * presentational, driven entirely by props. Nothing is saved to the store
 * until GeneratingScreen's generateRoadmap call succeeds.
 *
 * React Navigation isn't installed yet, so steps are a plain useState
 * switch rather than a navigator.
 */
export function OnboardingFlow() {
  const theme = useTheme();
  const [step, setStep] = useState<Step>('role');
  const [roleId, setRoleId] = useState<string | null>(null);
  const [customTitle, setCustomTitle] = useState('');
  const [level, setLevel] = useState<Level | null>(null);
  const [employer, setEmployer] = useState('');
  const [experience, setExperience] = useState('');

  const handleCustomTitleChange = useCallback((text: string) => {
    setCustomTitle(text.slice(0, MAX_CUSTOM_TITLE_LENGTH));
  }, []);

  const canContinueRole = roleId !== null && (roleId !== CUSTOM_ROLE_ID || customTitle.trim().length > 0);
  const canContinueAboutYou = level !== null && experience.trim().length >= EXPERIENCE_MIN_LENGTH;

  const trimmedCustomTitle = roleId === CUSTOM_ROLE_ID ? customTitle.trim() : undefined;
  const trimmedEmployer = employer.trim() || undefined;
  const trimmedExperience = experience.trim();

  if (step === 'preview') {
    return <RoadmapPreview />;
  }

  if (step === 'generating') {
    return (
      <GeneratingScreen
        customTitle={trimmedCustomTitle}
        employer={trimmedEmployer}
        experience={trimmedExperience}
        level={level as Level}
        onBack={() => setStep('aboutYou')}
        onDone={() => setStep('preview')}
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
          canContinue={canContinueAboutYou}
          employer={employer}
          experience={experience}
          level={level}
          onBack={() => setStep('role')}
          onContinue={() => setStep('generating')}
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
