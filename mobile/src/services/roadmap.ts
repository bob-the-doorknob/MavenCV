import { getJson, postJson } from './api';
import type { RoadmapTask, TargetRole } from '../types';

export interface RoleOption { id: string; title: string }
export interface RoleCategory { id: string; title: string; roles: RoleOption[] }
export interface RoleCatalog { categories: RoleCategory[] }

export const loadRoleCatalog = (): Promise<RoleCatalog> => getJson('/api/roles');

export const generateTargetRole = async (role: RoleOption, experience: string): Promise<TargetRole> => {
  const result = await postJson<
    { experience: string; targetRole: RoleOption },
    { tasks: RoadmapTask[] }
  >('/api/roadmap', { experience, targetRole: role });
  return {
    id: role.id,
    title: role.title,
    tasks: result.tasks,
    createdAt: new Date().toISOString(),
  };
};
