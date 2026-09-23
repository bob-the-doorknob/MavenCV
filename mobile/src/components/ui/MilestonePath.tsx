import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { motion, radii, spacing, typography, type CategoryKey, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import type { TaskStatus } from '../../types';
import { CategoryChip } from './CategoryChip';
import { StatusNode } from './StatusNode';
import { usePressScale } from './usePressScale';

export interface MilestoneItem {
  id: string;
  title: string;
  status: TaskStatus;
  /** Supporting line under the title, e.g. the done-when condition. */
  detail?: string;
  /** Status line under the title, e.g. "Med · In progress · 2/4 steps". */
  meta?: string;
  /** Timing line, e.g. "Due 12 May" or "~3 weeks". Colored by its tone. */
  schedule?: { text: string; tone: 'none' | 'on_track' | 'due_soon' | 'overdue' };
  category?: CategoryKey;
}

interface MilestonePathProps {
  items: MilestoneItem[];
  /** The task highlighted as a white card. Defaults to the first unfinished item. */
  currentId?: string;
  onPressItem?: (id: string) => void;
}

const RAIL_WIDTH = 36;
const LINE_WIDTH = 2;

export function MilestonePath({ items, currentId, onPressItem }: MilestonePathProps) {
  const resolvedCurrentId =
    currentId ?? items.find((item) => item.status !== 'done')?.id ?? items[items.length - 1]?.id;
  const travelledIndex = items.findIndex((item) => item.id === resolvedCurrentId);

  return (
    <View>
      {items.map((item, index) => (
        <MilestoneRow
          key={item.id}
          index={index}
          isCurrent={item.id === resolvedCurrentId}
          isFirst={index === 0}
          isLast={index === items.length - 1}
          item={item}
          travelledIndex={travelledIndex}
          {...(onPressItem ? { onPress: () => onPressItem(item.id) } : {})}
        />
      ))}
    </View>
  );
}

interface MilestoneRowProps {
  item: MilestoneItem;
  index: number;
  travelledIndex: number;
  isFirst: boolean;
  isLast: boolean;
  isCurrent: boolean;
  onPress?: () => void;
}

/**
 * The accent fill stops halfway down the current row — that node is where
 * the travelled path ends.
 */
const travelledFraction = (index: number, travelledIndex: number): number => {
  if (travelledIndex < 0 || index > travelledIndex) return 0;
  return index === travelledIndex ? 0.5 : 1;
};

function MilestoneRow({
  item,
  index,
  travelledIndex,
  isFirst,
  isLast,
  isCurrent,
  onPress,
}: MilestoneRowProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const reducedMotion = useReducedMotion();
  const press = usePressScale();
  const target = travelledFraction(index, travelledIndex);
  const fill = useSharedValue(reducedMotion ? target : 0);

  useEffect(() => {
    fill.value = reducedMotion ? target : withTiming(target, { duration: motion.pathSegmentDuration });
  }, [fill, reducedMotion, target]);

  const travelledStyle = useAnimatedStyle(() => ({ height: `${fill.value * 100}%` }));

  const content = (
    <View style={[styles.content, isCurrent && styles.currentCard]}>
      <View style={styles.copy}>
        <Text style={[styles.title, item.status === 'done' && styles.titleDone]}>{item.title}</Text>
        {item.meta || item.schedule ? (
          <Text style={styles.detail}>
            {item.meta}
            {item.meta && item.schedule ? ' · ' : ''}
            {item.schedule ? (
              <Text
                style={
                  item.schedule.tone === 'overdue'
                    ? styles.scheduleOverdue
                    : item.schedule.tone === 'due_soon'
                      ? styles.scheduleDueSoon
                      : undefined
                }
              >
                {item.schedule.text}
              </Text>
            ) : null}
          </Text>
        ) : null}
        {item.detail ? <Text style={styles.detail}>{item.detail}</Text> : null}
        {item.category ? (
          <View style={styles.chipRow}>
            <CategoryChip category={item.category} />
          </View>
        ) : null}
      </View>
      {isCurrent && onPress ? (
        <Svg fill="none" height={20} viewBox="0 0 24 24" width={20}>
          <Path
            d="M9 5 L16 12 L9 19"
            stroke={theme.colors.textMuted}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
        </Svg>
      ) : null}
    </View>
  );

  return (
    <View style={styles.row}>
      <View style={styles.rail}>
        <View
          style={[
            styles.line,
            { top: isFirst ? '50%' : 0, bottom: isLast ? '50%' : 0 },
          ]}
        >
          <Animated.View style={[styles.travelled, travelledStyle]} />
        </View>
        <StatusNode backgroundColor={theme.colors.background} status={item.status} />
      </View>
      {onPress ? (
        <Animated.View style={[styles.contentWrapper, press.style]}>
          <Pressable
            accessibilityLabel={item.meta ? `${item.title}. ${item.meta}` : item.title}
            accessibilityRole="button"
            android_ripple={{ color: theme.colors.border }}
            onPress={onPress}
            onPressIn={press.onPressIn}
            onPressOut={press.onPressOut}
          >
            {content}
          </Pressable>
        </Animated.View>
      ) : (
        <View style={styles.contentWrapper}>{content}</View>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    rail: {
      alignItems: 'center',
      justifyContent: 'center',
      width: RAIL_WIDTH,
    },
    line: {
      backgroundColor: theme.colors.node,
      position: 'absolute',
      width: LINE_WIDTH,
    },
    travelled: {
      backgroundColor: theme.colors.accent,
      width: LINE_WIDTH,
    },
    contentWrapper: {
      flex: 1,
      paddingVertical: spacing.xs,
    },
    content: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
      paddingVertical: spacing.md,
    },
    copy: {
      flex: 1,
      gap: spacing.xs,
    },
    currentCard: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      padding: spacing.lg,
    },
    title: {
      color: theme.colors.textPrimary,
      fontFamily: typography.rowTitle.fontFamily,
      fontSize: typography.rowTitle.fontSize,
      fontWeight: typography.rowTitle.fontWeight,
      letterSpacing: typography.rowTitle.letterSpacing,
      lineHeight: typography.rowTitle.lineHeight,
    },
    titleDone: {
      color: theme.colors.textSecondary,
    },
    detail: {
      color: theme.colors.textSecondary,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    chipRow: {
      alignItems: 'flex-start',
      marginTop: spacing.xs,
    },
    scheduleDueSoon: {
      color: theme.colors.accentText,
    },
    scheduleOverdue: {
      color: theme.colors.danger,
    },
  });
