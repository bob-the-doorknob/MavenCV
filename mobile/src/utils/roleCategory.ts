import { findRolePreset, type RoleCategory } from '../data/roles';
import type { CategoryKey } from '../theme/tokens';

const CATEGORY_KEYS: Readonly<Record<RoleCategory, CategoryKey>> = {
  'Tech & engineering': 'engineering',
  'Data & AI': 'dataAi',
  'Product & design': 'productDesign',
  'Business & finance in tech': 'businessFinance',
};

/** Chip tint for a role. Custom roles have no preset, so they read as engineering. */
export const categoryKeyForRole = (roleId: string): CategoryKey => {
  const preset = findRolePreset(roleId);
  return preset ? CATEGORY_KEYS[preset.category] : 'engineering';
};

export const categoryLabelForRole = (roleId: string): string =>
  findRolePreset(roleId)?.category ?? 'Other';
