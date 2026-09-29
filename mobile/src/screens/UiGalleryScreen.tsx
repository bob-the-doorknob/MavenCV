import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  Card,
  CategoryChip,
  Chip,
  EmptyState,
  MilestonePath,
  ProgressBar,
  ScoreArc,
  SectionLabel,
  Sheet,
  StatusNode,
  TextArea,
  TextField,
  type MilestoneItem,
} from '../components/ui';
import { BrandSplash } from '../components/BrandSplash';
import { headerColors, radii, spacing, typography, type CategoryKey, type Theme } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

const initialMilestones: MilestoneItem[] = [
  { id: '1', title: 'Ship 1 REST API with 5 endpoints', status: 'done', category: 'engineering' },
  { id: '2', title: 'Write 200 words on your systems project', status: 'done', category: 'productDesign' },
  { id: '3', title: 'Solve 20 array problems', status: 'done', category: 'engineering' },
  {
    id: '4',
    title: 'Build 1 dashboard with 3 live metrics',
    detail: 'Done when the dashboard reads from a real data source.',
    status: 'in_progress',
    category: 'dataAi',
  },
  { id: '5', title: 'Draft 3 STAR answers', status: 'not_started', category: 'businessFinance' },
  { id: '6', title: 'Publish 1 case study of 800 words', status: 'not_started', category: 'productDesign' },
  { id: '7', title: 'Run 2 mock system-design walkthroughs', status: 'not_started', category: 'engineering' },
];

const categories: CategoryKey[] = ['engineering', 'dataAi', 'productDesign', 'businessFinance'];

/**
 * Temporary review harness rendering every design-system component in
 * every state. Delete once the real screens are built on top of it.
 */
export function UiGalleryScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [chipSelection, setChipSelection] = useState<'draft' | 'review' | 'final'>('review');
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>('engineering');
  const [progress, setProgress] = useState(35);
  const [milestones, setMilestones] = useState(initialMilestones);
  const [notes, setNotes] = useState('Led a small migration project.');
  const [company, setCompany] = useState('');

  const completeNext = () => {
    setMilestones((items) => {
      const index = items.findIndex((item) => item.status !== 'done');
      if (index < 0) return items;
      return items.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, status: 'done' as const }
          : itemIndex === index + 1
            ? { ...item, status: 'in_progress' as const }
            : item,
      );
    });
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      style={styles.screen}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.xl }]}>
        <SectionLabel color={headerColors.textSecondary}>Software engineering · Intern</SectionLabel>
        <ScoreArc value={47} />
        <ProgressBar trackColor={headerColors.track} value={47} />
        <Text style={styles.headerCaption}>3 of 7 milestones done</Text>
      </View>

      <View style={styles.sections}>
        <Section title="ScoreArc">
          <Card>
            <View style={styles.arcRow}>
              <ScoreArc label="Empty roadmap" size={150} value={0} variant="onSurface" />
            </View>
          </Card>
          <Card>
            <View style={styles.arcRow}>
              <ScoreArc label="In progress" size={150} value={47} variant="onSurface" />
            </View>
          </Card>
          <Card>
            <View style={styles.arcRow}>
              <ScoreArc label="Interview ready" size={150} value={100} variant="onSurface" />
            </View>
          </Card>
        </Section>

        <Section title="MilestonePath">
          <MilestonePath items={milestones} onPressItem={() => {}} />
          <Row>
            <Button label="Complete next" onPress={completeNext} variant="secondary" />
            <Button label="Reset" onPress={() => setMilestones(initialMilestones)} variant="ghost" />
          </Row>
        </Section>

        <Section title="StatusNode">
          <Row>
            <StatusNode status="not_started" />
            <StatusNode status="in_progress" />
            <StatusNode status="done" />
          </Row>
        </Section>

        <Section title="Button">
          <Row>
            <Button label="Primary" onPress={() => {}} variant="primary" />
            <Button label="Secondary" onPress={() => {}} variant="secondary" />
            <Button label="Ghost" onPress={() => {}} variant="ghost" />
            <Button label="Danger" onPress={() => {}} variant="danger" />
          </Row>
          <Row>
            <Button label="Loading" loading onPress={() => {}} variant="primary" />
            <Button disabled label="Disabled" onPress={() => {}} variant="primary" />
            <Button disabled label="Disabled" onPress={() => {}} variant="secondary" />
          </Row>
        </Section>

        <Section title="Chip">
          <Row>
            <Chip label="Draft" onPress={() => setChipSelection('draft')} selected={chipSelection === 'draft'} />
            <Chip label="Review" onPress={() => setChipSelection('review')} selected={chipSelection === 'review'} />
            <Chip label="Final" onPress={() => setChipSelection('final')} selected={chipSelection === 'final'} />
            <Chip disabled label="Disabled" onPress={() => {}} />
            <Chip label="Read-only" />
          </Row>
        </Section>

        <Section title="CategoryChip">
          <Row>
            {categories.map((category) => (
              <CategoryChip
                category={category}
                key={category}
                onPress={() => setSelectedCategory(category)}
                selected={selectedCategory === category}
              />
            ))}
          </Row>
          <Row>
            {categories.map((category) => (
              <CategoryChip category={category} key={`static-${category}`} />
            ))}
          </Row>
        </Section>

        <Section title="Card">
          <Card>
            <Text style={styles.body}>Base surface card, 18pt radius.</Text>
          </Card>
          <Card raised>
            <Text style={styles.body}>Raised card, 20pt radius — the current task.</Text>
          </Card>
        </Section>

        <Section title="ProgressBar">
          <ProgressBar value={progress} />
          <ProgressBar value={100} />
          {/* Not readiness, so not accent — see DESIGN.md §2. */}
          <ProgressBar fillColor={theme.colors.textMuted} height={6} value={progress} />
          <Row>
            <Button label="-10" onPress={() => setProgress((value) => Math.max(0, value - 10))} variant="secondary" />
            <Button label="+10" onPress={() => setProgress((value) => Math.min(100, value + 10))} variant="secondary" />
          </Row>
        </Section>

        <Section title="TextField">
          <TextField label="Target company" onChangeText={setCompany} placeholder="e.g. Google" value={company} />
          <TextField label="With a limit" maxLength={20} onChangeText={() => {}} value="Twelve chars" />
          <TextField error="This field is required." label="With an error" onChangeText={() => {}} value="" />
          <TextField disabled label="Disabled" onChangeText={() => {}} value="Can't edit this" />
        </Section>

        <Section title="TextArea">
          <TextArea label="Notes" maxLength={60} onChangeText={setNotes} placeholder="What did you do?" value={notes} />
          <TextArea label="At limit" maxLength={12} numberOfLines={2} onChangeText={() => {}} value="Twelve chars" />
        </Section>

        <Section title="EmptyState">
          <Card>
            <EmptyState message="Generate a roadmap to get started." title="No roadmap yet" />
          </Card>
          <Card>
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

        <Section title="BrandSplash">
          <View style={styles.splashPreview}>
            <BrandSplash message="Loading your saved roadmap" />
          </View>
          <View style={styles.splashPreview}>
            <BrandSplash isError message="Saved data could not be read." />
          </View>
        </Section>
      </View>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.section}>
      <SectionLabel>{title}</SectionLabel>
      {children}
    </View>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return <View style={styles.row}>{children}</View>;
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: {
      backgroundColor: theme.colors.background,
      flex: 1,
    },
    content: {
      gap: spacing.xxl,
    },
    header: {
      alignItems: 'center',
      backgroundColor: headerColors.background,
      borderBottomLeftRadius: radii.header,
      borderBottomRightRadius: radii.header,
      gap: spacing.lg,
      paddingBottom: spacing.xl,
      paddingHorizontal: spacing.lg,
    },
    headerCaption: {
      color: headerColors.textSecondary,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    sections: {
      gap: spacing.xxl,
    },
    body: {
      color: theme.colors.textSecondary,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
    },
    section: {
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    row: {
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    arcRow: {
      alignItems: 'center',
    },
    splashPreview: {
      borderColor: theme.colors.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      height: 180,
      overflow: 'hidden',
    },
  });
