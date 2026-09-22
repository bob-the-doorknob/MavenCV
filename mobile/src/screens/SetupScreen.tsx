import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiResponseError } from '../services/api';
import { CvFileError, pickAndExtractCv } from '../services/cvProfile';
import { generateTargetRole, loadRoleCatalog, type RoleCatalog, type RoleOption } from '../services/roadmap';
import { useAppStore } from '../store/useAppStore';
import { colors, radius, spacing, typography } from '../theme/tokens';

const generationError = (error: unknown): string => {
  if (error instanceof ApiResponseError) {
    if (error.status === 429) return 'Too many requests. Please try again shortly.';
    if (error.status === 401) return 'Authentication failed. Check your Firebase setup and try again.';
  }
  return 'Could not generate your roadmap. Check your connection and try again.';
};

export function SetupScreen() {
  const [catalog, setCatalog] = useState<RoleCatalog | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const [selectedRole, setSelectedRole] = useState<RoleOption | null>(null);
  const [experience, setExperience] = useState('');
  const [cvQuestions, setCvQuestions] = useState<string[]>([]);
  const [cvExtracted, setCvExtracted] = useState(false);
  const [cvConfirmed, setCvConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const setTargetRoles = useAppStore((state) => state.setTargetRoles);
  const setActiveTargetRole = useAppStore((state) => state.setActiveTargetRole);

  const loadCatalog = () => {
    setCatalogError(false);
    void loadRoleCatalog().then(setCatalog).catch(() => setCatalogError(true));
  };

  useEffect(() => { loadCatalog(); }, []);

  const extractCv = async () => {
    if (!selectedRole) {
      setError('Choose a target role first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const profile = await pickAndExtractCv(selectedRole.id);
      if (profile) {
        setExperience(profile.experience);
        setCvQuestions(profile.questions);
        setCvExtracted(true);
        setCvConfirmed(false);
      }
    } catch (caught: unknown) {
      setError(caught instanceof CvFileError ? caught.message : 'Could not read your CV. Check the PDF and try again.');
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    if (!selectedRole) {
      setError('Choose a target role first.');
      return;
    }
    const trimmedExperience = experience.trim();
    if (!trimmedExperience) {
      setError('Tell us about your current experience first.');
      return;
    }
    if (cvExtracted && !cvConfirmed) {
      setError('Review and confirm the extracted experience first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const target = await generateTargetRole(selectedRole, trimmedExperience);
      setTargetRoles([target]);
      setActiveTargetRole(target.id);
    } catch (caught: unknown) {
      setError(generationError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>TRAJECTORY</Text>
      <Text style={styles.title}>Choose your target role</Text>
      <Text style={styles.body}>We’ll build a roadmap around the role you want and the experience you have today.</Text>

      {catalogError ? (
        <View style={styles.notice}>
          <Text style={styles.body}>Could not load roles. Check your connection.</Text>
          <Pressable accessibilityRole="button" onPress={loadCatalog}>
            <Text style={styles.retry}>Try again</Text>
          </Pressable>
        </View>
      ) : !catalog ? (
        <ActivityIndicator accessibilityLabel="Loading roles" color={colors.primary} />
      ) : (
        catalog.categories.map((category) => (
          <View key={category.id} style={styles.group}>
            <Text style={styles.groupTitle}>{category.title}</Text>
            <View style={styles.options}>
              {category.roles.map((role) => {
                const selected = selectedRole?.id === role.id;
                return (
                  <Pressable
                    key={role.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      if (selectedRole?.id !== role.id) {
                        setCvQuestions([]);
                        setCvExtracted(false);
                        setCvConfirmed(false);
                      }
                      setSelectedRole(role);
                      setError('');
                    }}
                    style={[styles.option, selected && styles.selectedOption]}
                  >
                    <Text style={[styles.optionText, selected && styles.selectedOptionText]}>{role.title}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))
      )}

      <View style={styles.group}>
        <Text style={styles.groupTitle}>Start with your CV</Text>
        <Text style={styles.body}>Choose a PDF CV (up to 2 MB). We send it to our AI backend to extract experience; you review the summary before generating a roadmap.</Text>
        <Pressable accessibilityRole="button" disabled={busy || !catalog} onPress={() => { void extractCv(); }} style={styles.uploadButton}>
          <Text style={styles.uploadButtonText}>Choose PDF CV</Text>
        </Pressable>
      </View>

      <Text style={styles.groupTitle}>{cvExtracted ? 'Review your experience' : 'Or describe your experience'}</Text>
      <TextInput
        accessibilityLabel="Your current experience"
        maxLength={4000}
        multiline
        onChangeText={(text) => { setExperience(text); setCvConfirmed(false); }}
        placeholder="Courses, projects, skills, or internships you have completed"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        textAlignVertical="top"
        value={experience}
      />
      {cvExtracted ? (
        <View style={styles.notice}>
          <Text style={styles.body}>Check these details, add anything your CV missed, and answer any questions in the experience box above.</Text>
          {cvQuestions.map((question) => <Text key={question} style={styles.body}>• {question}</Text>)}
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: cvConfirmed }} onPress={() => setCvConfirmed(!cvConfirmed)}>
            <Text style={styles.retry}>{cvConfirmed ? '✓ ' : '○ '}I confirm this describes my experience</Text>
          </Pressable>
        </View>
      ) : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        disabled={busy || !catalog}
        onPress={() => { void generate(); }}
        style={[styles.button, (busy || !catalog) && styles.disabledButton]}
      >
        {busy ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>Generate my roadmap</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md, padding: spacing.lg },
  eyebrow: { color: colors.primary, fontSize: typography.caption, fontWeight: '800', letterSpacing: 2 },
  title: { color: colors.text, fontSize: typography.title, fontWeight: '800' },
  body: { color: colors.textMuted, fontSize: typography.body, lineHeight: 24 },
  group: { gap: spacing.sm, marginTop: spacing.sm },
  groupTitle: { color: colors.text, fontSize: typography.body, fontWeight: '700' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, padding: spacing.md },
  selectedOption: { backgroundColor: colors.primaryMuted, borderColor: colors.primary },
  optionText: { color: colors.text, fontSize: typography.caption, fontWeight: '600' },
  selectedOptionText: { color: colors.primary },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, color: colors.text, fontSize: typography.body, minHeight: 110, padding: spacing.md },
  error: { color: '#B42318', fontSize: typography.caption },
  notice: { backgroundColor: colors.primaryMuted, borderRadius: radius.md, gap: spacing.sm, padding: spacing.md },
  retry: { color: colors.primary, fontSize: typography.body, fontWeight: '700' },
  uploadButton: { alignItems: 'center', borderColor: colors.primary, borderRadius: radius.md, borderWidth: 1, minHeight: 48, justifyContent: 'center', padding: spacing.md },
  uploadButtonText: { color: colors.primary, fontSize: typography.body, fontWeight: '700' },
  button: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.md, minHeight: 52, justifyContent: 'center', padding: spacing.md },
  disabledButton: { opacity: 0.5 },
  buttonText: { color: colors.surface, fontSize: typography.body, fontWeight: '700' },
});
