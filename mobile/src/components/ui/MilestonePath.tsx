import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { fontFamily, motion, radii, spacing, typography, type CategoryKey, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import type { TaskStatus } from '../../types';
import { CategoryChip } from './CategoryChip';
import { StatusNode } from './StatusNode';
import { usePressScale } from './usePressScale';
import { REORDER_HINT, spokenMilestone } from '../../utils/spokenText';

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
/** Just enough for the dragged row to read as picked up. */
const DRAG_LIFT_SCALE = 1.02;

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

export interface MilestoneRowProps {
  item: MilestoneItem;
  index: number;
  travelledIndex: number;
  isFirst: boolean;
  isLast: boolean;
  isCurrent: boolean;
  onPress?: () => void;
  /** Starts a drag. Long-press only, so a tap still opens the milestone. */
  onLongPress?: () => void;
  /** True while this row is the one being dragged. */
  isDragging?: boolean;
  /** Changing this replays the node's completion pop. */
  pulseKey?: string | undefined;
  /**
   * Screen-reader alternative to drag-to-reorder: offered as the row's
   * "Move up" / "Move down" accessibility actions. Omit at the top or bottom.
   */
  onMoveUp?: (() => void) | undefined;
  onMoveDown?: (() => void) | undefined;
}

/**
 * The accent fill stops halfway down the current row — that node is where
 * the travelled path ends.
 */
const travelledFraction = (index: number, travelledIndex: number): number => {
  if (travelledIndex < 0 || index > travelledIndex) return 0;
  return index === travelledIndex ? 0.5 : 1;
};

export function MilestoneRow({
  item,
  index,
  travelledIndex,
  isFirst,
  isLast,
  isCurrent,
  onPress,
  onLongPress,
  isDragging = false,
  pulseKey,
  onMoveUp,
  onMoveDown,
}: MilestoneRowProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const reducedMotion = useReducedMotion();
  const press = usePressScale();
  const target = travelledFraction(index, travelledIndex);
  const fill = useSharedValue(reducedMotion ? target : 0);
  const lift = useSharedValue(1);

  useEffect(() => {
    fill.value = reducedMotion ? target : withTiming(target, { duration: motion.pathSegmentDuration });
  }, [fill, reducedMotion, target]);

  useEffect(() => {
    if (reducedMotion) {
      lift.value = 1;
      return;
    }
    lift.value = withTiming(isDragging ? DRAG_LIFT_SCALE : 1, { duration: motion.pressOutDuration });
  }, [isDragging, lift, reducedMotion]);

  const travelledStyle = useAnimatedStyle(() => ({ height: `${fill.value * 100}%` }));
  const liftStyle = useAnimatedStyle(() => ({ transform: [{ scale: lift.value }] }));

  const content = (
    <View style={[styles.content, isCurrent && styles.currentCard, isDragging && styles.draggingCard]}>
      <View style={styles.copy}>
        <Text style={[styles.title, item.status === 'done' && styles.titleDone]}>{item.title}</Text>
        {/* A done milestone is history: the filled node carries it, so the row
            drops its meta and schedule rather than repeating them. */}
        {item.status !== 'done' && (item.meta || item.schedule) ? (
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
        {/* The completion haptic comes from the mark-done sheet, so the node
            pops silently rather than buzzing a second time. */}
        {/* The row's own label already says the status; the node is decoration to a reader. */}
        <StatusNode
          accessibilityHidden
          backgroundColor={theme.colors.background}
          haptics={false}
          pulseKey={pulseKey}
          status={item.status}
        />
      </View>
      {onPress ? (
        <Animated.View style={[styles.contentWrapper, press.style, liftStyle]}>
          <Pressable
            accessibilityActions={[
              ...(onMoveUp ? [{ name: 'moveUp', label: 'Move up' }] : []),
              ...(onMoveDown ? [{ name: 'moveDown', label: 'Move down' }] : []),
            ]}
            accessibilityHint={onMoveUp || onMoveDown ? REORDER_HINT : undefined}
            accessibilityLabel={spokenMilestone({ ...item, isCurrent })}
            accessibilityRole="button"
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'moveUp') onMoveUp?.();
              if (event.nativeEvent.actionName === 'moveDown') onMoveDown?.();
            }}
            android_ripple={{ color: theme.colors.border }}
            delayLongPress={220}
            onLongPress={onLongPress}
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
      borderRadius: radii.xl,
      borderWidth: 1,
      padding: spacing.lg,
    },
    draggingCard: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.textPrimary,
      borderRadius: radii.xl,
      borderWidth: 1,
      paddingHorizontal: spacing.lg,
    },
    title: {
      color: theme.colors.textPrimary,
      fontFamily: typography.rowTitle.fontFamily,
      fontSize: typography.rowTitle.fontSize,
      fontWeight: typography.rowTitle.fontWeight,
      letterSpacing: typography.rowTitle.letterSpacing,
      lineHeight: typography.rowTitle.lineHeight,
    },
    // Travelled rows recede to body weight — see DESIGN.md §5.
    titleDone: {
      color: theme.colors.textSecondary,
      fontFamily: fontFamily.body,
      fontSize: typography.body.fontSize,
      fontWeight: typography.body.fontWeight,
      letterSpacing: typography.body.letterSpacing,
      lineHeight: typography.body.lineHeight,
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
      color: theme.colors.textPrimary,
      fontFamily: fontFamily.bodySemiBold,
      fontWeight: '600',
    },
    scheduleOverdue: {
      color: theme.colors.danger,
    },
  });
