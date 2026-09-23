import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type Theme as NavigationTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { CvVaultScreen } from '../screens/cv/CvVaultScreen';
import { OnboardingFlow } from '../screens/onboarding/OnboardingFlow';
import { RoadmapScreen } from '../screens/roadmap/RoadmapScreen';
import { TaskDetailScreen } from '../screens/task/TaskDetailScreen';
import { UiGalleryScreen } from '../screens/UiGalleryScreen';
import { useAppStore } from '../store/useAppStore';
import { typography, type Theme } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export type RootStackParamList = {
  Onboarding: undefined;
  MainTabs: undefined;
  TaskDetail: { taskId: string };
  UiGallery: undefined;
};

export type MainTabParamList = {
  Roadmap: undefined;
  Cv: undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

/** Icon, label and padding, before the device's bottom inset is added. */
const TAB_BAR_HEIGHT = 60;

interface TabIconProps {
  focused: boolean;
  color: string;
}

/** Tab glyphs are drawn, not emoji — DESIGN.md forbids emoji in the UI. */
function RoadmapIcon({ focused, color }: TabIconProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.iconWrapper}>
      <View style={[styles.activeDot, !focused && styles.activeDotHidden]} />
      <Svg fill="none" height={22} viewBox="0 0 24 24" width={22}>
        <Path d="M6 4 V20" stroke={color} strokeLinecap="round" strokeWidth={2} />
        <Path d="M6 7 H16" stroke={color} strokeLinecap="round" strokeWidth={2} />
        <Path d="M6 12 H19" stroke={color} strokeLinecap="round" strokeWidth={2} />
        <Path d="M6 17 H13" stroke={color} strokeLinecap="round" strokeWidth={2} />
      </Svg>
    </View>
  );
}

function CvIcon({ focused, color }: TabIconProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.iconWrapper}>
      <View style={[styles.activeDot, !focused && styles.activeDotHidden]} />
      <Svg fill="none" height={22} viewBox="0 0 24 24" width={22}>
        <Path
          d="M6 3 H15 L19 7 V21 H6 Z"
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
        />
        <Path d="M9 12 H16" stroke={color} strokeLinecap="round" strokeWidth={2} />
        <Path d="M9 16 H14" stroke={color} strokeLinecap="round" strokeWidth={2} />
      </Svg>
    </View>
  );
}

function MainTabs() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.textPrimary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        // A fixed height would swallow the home indicator / gesture bar and
        // clip the labels, so the bottom inset is added on top of it.
        tabBarStyle: [
          styles.tabBar,
          { height: TAB_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom + 6 },
        ],
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tab.Screen
        component={RoadmapScreen}
        name="Roadmap"
        options={{ tabBarLabel: 'Roadmap', tabBarIcon: RoadmapIcon }}
      />
      <Tab.Screen component={CvVaultScreen} name="Cv" options={{ tabBarLabel: 'CV', tabBarIcon: CvIcon }} />
    </Tab.Navigator>
  );
}

/** Keeps React Navigation's own surfaces on our palette, so there is no white flash. */
const navigationThemeFor = (theme: Theme): NavigationTheme => {
  const base = theme.mode === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: theme.mode === 'dark',
    colors: {
      ...base.colors,
      primary: theme.colors.accent,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.textPrimary,
      border: theme.colors.border,
      notification: theme.colors.accent,
    },
  };
};

export function RootNavigator() {
  const theme = useTheme();
  const hasTargets = useAppStore((state) => state.targets.length > 0);
  const navigationTheme = useMemo(() => navigationThemeFor(theme), [theme]);

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        {hasTargets ? (
          <Stack.Group>
            <Stack.Screen component={MainTabs} name="MainTabs" />
            <Stack.Screen component={TaskDetailScreen} name="TaskDetail" />
            {__DEV__ ? <Stack.Screen component={UiGalleryScreen} name="UiGallery" /> : null}
          </Stack.Group>
        ) : (
          <Stack.Screen component={OnboardingFlow} name="Onboarding" />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    tabBar: {
      backgroundColor: theme.colors.surface,
      borderTopColor: theme.colors.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      elevation: 0,
      paddingTop: 8,
    },
    tabItem: {
      paddingVertical: 0,
    },
    tabLabel: {
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      // Geist's descenders get clipped without room for the full line box.
      lineHeight: typography.caption.lineHeight,
      fontWeight: '600',
      marginTop: 2,
    },
    iconWrapper: {
      alignItems: 'center',
      gap: 3,
    },
    activeDot: {
      backgroundColor: theme.colors.accent,
      borderRadius: 3,
      height: 5,
      width: 5,
    },
    activeDotHidden: {
      opacity: 0,
    },
  });
