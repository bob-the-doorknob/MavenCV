import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { CvEntry, RoadmapTask, TargetRole } from '../types';

interface AppState {
  targetRoles: TargetRole[];
  activeTargetRoleId: string | null;
  cvEntries: CvEntry[];
  setTargetRoles: (targetRoles: TargetRole[]) => void;
  setActiveTargetRole: (targetRoleId: string | null) => void;
  upsertRoadmapTask: (targetRoleId: string, task: RoadmapTask) => void;
  addCvEntry: (entry: CvEntry) => void;
  reset: () => void;
}

const initialState = {
  targetRoles: [],
  activeTargetRoleId: null,
  cvEntries: [],
} satisfies Pick<AppState, 'targetRoles' | 'activeTargetRoleId' | 'cvEntries'>;

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      ...initialState,
      setTargetRoles: (targetRoles) => set({ targetRoles }),
      setActiveTargetRole: (activeTargetRoleId) => set({ activeTargetRoleId }),
      upsertRoadmapTask: (targetRoleId, task) =>
        set((state) => ({
          targetRoles: state.targetRoles.map((targetRole) => {
            if (targetRole.id !== targetRoleId) {
              return targetRole;
            }

            const existingIndex = targetRole.tasks.findIndex(({ id }) => id === task.id);
            const tasks = [...targetRole.tasks];

            if (existingIndex === -1) {
              tasks.push(task);
            } else {
              tasks[existingIndex] = task;
            }

            return { ...targetRole, tasks };
          }),
        })),
      addCvEntry: (entry) =>
        set((state) => ({ cvEntries: [...state.cvEntries, entry] })),
      reset: () => set(initialState),
    }),
    {
      name: 'trajectory-app-state',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ targetRoles, activeTargetRoleId, cvEntries }) => ({
        targetRoles,
        activeTargetRoleId,
        cvEntries,
      }),
    },
  ),
);
