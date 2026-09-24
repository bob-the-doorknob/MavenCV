import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { hasAiConsent, legalLinks, loadConsent, setAiConsent, useConsent } from '../services/privacy';
import { spacing, typography, type Theme } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { Button } from './ui';

export function LegalLinks() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [error, setError] = useState('');
  return <View style={styles.group}>
    <View style={styles.links}>{legalLinks().map(({ label, url }) => <Pressable key={label} accessibilityRole="link" style={styles.link} onPress={() => {
      if (!url) { setError('This link is not configured in this development build.'); return; }
      setError('');
      void Linking.openURL(url).catch(() => setError('Could not open the link. Please try again.'));
    }}><Text style={styles.linkText}>{label}</Text></Pressable>)}</View>
    {error ? <Text accessibilityRole="alert" style={styles.body}>{error}</Text> : null}
  </View>;
}

/** Also serves existing users who never saw the onboarding consent step. */
export function PrivacyControls() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { loaded, acceptedAt, busy, error, unsavedChoice } = useConsent();
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { void loadConsent(); }, []);
  return <View style={styles.group}>
    <Text style={styles.title}>Your data and AI</Text>
    {acceptedAt ? <Button label={expanded ? 'Hide privacy details' : 'Review privacy details'} variant="ghost" onPress={() => setExpanded(!expanded)} /> : null}
    {!acceptedAt || expanded ? <View style={styles.group}>
    <Text style={styles.body}>With your permission, Maven sends your experience, selected role and level, optional CV PDF, and task completion notes through our backend to Google Gemini to extract experience and generate roadmaps and CV bullets. Remove contact details and sensitive information before submitting.</Text>
    <Text style={styles.body}>Your roadmap, experience and bullets stay on this device in storage that Maven does not encrypt or cloud-sync. PDFs are not saved by our backend; the temporary picker copy is removed after processing. Google may retain or process submitted data under the terms of our configured service. Review the Privacy Policy before agreeing.</Text>
    <Text style={styles.body}>Permission covers future AI requests, including pending CV bullets when you open the CV tab. You can withdraw here at any time. Offline tasks and saved bullets remain available. Withdrawal stops new requests; it cannot recall data already sent or cancel a subscription.</Text>
    </View> : null}
    <LegalLinks />
    {acceptedAt ? <Text style={styles.body}>AI sharing enabled. You can manage this choice in the CV tab.</Text> : <Text style={styles.body}>AI sharing is off. No personal content will be sent until you agree.</Text>}
    <Button disabled={!loaded || busy} label={acceptedAt ? 'Withdraw AI consent' : 'I agree to AI processing'} onPress={() => void setAiConsent(!hasAiConsent())} variant={acceptedAt ? 'secondary' : 'primary'} />
    {error ? <Text accessibilityRole="alert" style={styles.body}>{error}</Text> : null}
    {unsavedChoice !== null ? <Button label="Retry saving privacy choice" disabled={busy} onPress={() => void setAiConsent(unsavedChoice)} variant="secondary" /> : null}
  </View>;
}

const createStyles = (theme: Theme) => StyleSheet.create({
  group: { gap: spacing.sm },
  body: { ...typography.caption, color: theme.colors.textSecondary },
  title: { ...typography.rowTitle, color: theme.colors.textPrimary },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  link: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  linkText: { ...typography.caption, color: theme.colors.textPrimary, textDecorationLine: 'underline' },
});
