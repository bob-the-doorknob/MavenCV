import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Chip, EmptyState, ProgressBar, Sheet, TextArea, TextField } from '../components/ui';
import { spacing, typography, type Theme } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

/**
 * Temporary review harness rendering every design-system component in
 * every state. Delete once the real screens are built on top of it.
 */
export function UiGalleryScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [chipSelection, setChipSelection] = useState<'draft' | 'review' | 'final'>('review');
  const [progress, setProgress] = useState(35);
  const [notes, setNotes] = useState('Led a small migration project.');
  const [company, setCompany] = useState('');

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <Text style={styles.display}>{progress}%</Text>

      <Section title="Button">
        <Row>
          <Button label="Primary" onPress={() => {}} variant="primary" />
          <Button label="Secondary" onPress={() => {}} variant="secondary" />
          <Button label="Ghost" onPress={() => {}} variant="ghost" />
        </Row>
        <Row>
          <Button label="Loading" loading onPress={() => {}} variant="primary" />
          <Button disabled label="Disabled" onPress={() => {}} variant="primary" />
          <Button disabled label="Disabled" onPress={() => {}} variant="secondary" />
        </Row>
      </Section>

      <Section title="Card">
        <Card style={styles.stacked}>
          <Text style={styles.body}>Base surface card.</Text>
        </Card>
        <Card raised>
          <Text style={styles.body}>Raised surface card.</Text>
        </Card>
      </Section>

      <Section title="ProgressBar">
        <ProgressBar style={styles.stacked} value={progress} />
        <ProgressBar value={100} />
        <Row style={styles.stacked}>
          <Button label="-10" onPress={() => setProgress((value) => Math.max(0, value - 10))} variant="secondary" />
          <Button label="+10" onPress={() => setProgress((value) => Math.min(100, value + 10))} variant="secondary" />
        </Row>
      </Section>

      <Section title="Chip">
        <Row>
          <Chip label="Draft" onPress={() => setChipSelection('draft')} selected={chipSelection === 'draft'} />
          <Chip label="Review" onPress={() => setChipSelection('review')} selected={chipSelection === 'review'} />
          <Chip label="Final" onPress={() => setChipSelection('final')} selected={chipSelection === 'final'} />
          <Chip disabled label="Disabled" onPress={() => {}} />
        </Row>
      </Section>

      <Section title="TextArea">
        <TextArea label="Notes" maxLength={60} onChangeText={setNotes} placeholder="What did you do?" value={notes} />
        <TextArea label="At limit" maxLength={12} numberOfLines={2} onChangeText={() => {}} value="Twelve chars" />
      </Section>

      <Section title="TextField">
        <TextField label="Target company" onChangeText={setCompany} placeholder="e.g. Google" value={company} />
        <TextField label="With a limit" maxLength={20} onChangeText={() => {}} value="Twelve chars" />
        <TextField error="This field is required." label="With an error" onChangeText={() => {}} value="" />
        <TextField disabled label="Disabled" onChangeText={() => {}} value="Can't edit this" />
      </Section>

      <Section title="EmptyState">
        <Card>
          <EmptyState message="Generate a roadmap to get started." title="No roadmap yet" />
        </Card>
        <Card raised style={styles.stacked}>
          <EmptyState
            action={{ label: 'Create roadmap', onPress: () => {} }}
            message="Generate a roadmap to get started."
            title="No roadmap yet"
          />
        </Card>
      </Section>

      <Section title="Sheet">
        <Button label="Open sheet" onPress={() => setSheetVisible(true)} variant="primary" />
        <Sheet onClose={() => setSheetVisible(false)} title="Bottom sheet" visible={sheetVisible}>
          <Text style={styles.body}>Built on React Native&apos;s Modal, sliding up from the bottom.</Text>
          <Button label="Close" onPress={() => setSheetVisible(false)} variant="secondary" />
        </Sheet>
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ children, style }: { children: React.ReactNode; style?: object }) {
  const rowStyles = StyleSheet.create({ row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm } });
  return <View style={[rowStyles.row, style]}>{children}</View>;
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: {
      backgroundColor: theme.colors.background,
      flex: 1,
    },
    content: {
      gap: spacing.xxl,
      padding: spacing.lg,
    },
    display: {
      color: theme.colors.accent,
      fontFamily: typography.display.fontFamily,
      fontSize: typography.display.fontSize,
      fontWeight: typography.display.fontWeight,
      letterSpacing: typography.display.letterSpacing,
      lineHeight: typography.display.lineHeight,
    },
    section: {
      gap: spacing.md,
    },
    heading: {
      color: theme.colors.textPrimary,
      fontFamily: typography.heading.fontFamily,
      fontSize: typography.heading.fontSize,
      fontWeight: typography.heading.fontWeight,
      letterSpacing: typography.heading.letterSpacing,
      lineHeight: typography.heading.lineHeight,
    },
    body: {
      color: theme.colors.textSecondary,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
    },
    stacked: {
      marginBottom: spacing.sm,
    },
  });
