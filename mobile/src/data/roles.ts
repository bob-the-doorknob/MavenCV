export type RoleCategory =
  | 'Tech & engineering'
  | 'Data & AI'
  | 'Product & design'
  | 'Business & finance in tech';

export interface RolePreset {
  id: string;
  title: string;
  category: RoleCategory;
  description: string;
}

/** Selecting this id requires a free-text title (see Target.customTitle). */
export const CUSTOM_ROLE_ID = 'custom' as const;

export const rolePresets: readonly RolePreset[] = [
  {
    id: 'software-engineer',
    title: 'Software Engineer',
    category: 'Tech & engineering',
    description: 'Build and ship product features across the stack.',
  },
  {
    id: 'frontend-mobile',
    title: 'Frontend / Mobile Developer',
    category: 'Tech & engineering',
    description: 'Craft user-facing interfaces for web and mobile apps.',
  },
  {
    id: 'backend-cloud',
    title: 'Backend / Cloud Engineer',
    category: 'Tech & engineering',
    description: 'Design APIs, services, and cloud infrastructure.',
  },
  {
    id: 'devops-sre',
    title: 'DevOps / SRE',
    category: 'Tech & engineering',
    description: 'Automate deployments and keep systems reliable.',
  },
  {
    id: 'cybersecurity',
    title: 'Cybersecurity',
    category: 'Tech & engineering',
    description: 'Find and fix vulnerabilities before attackers do.',
  },
  {
    id: 'embedded-hardware',
    title: 'Embedded / Hardware Engineer',
    category: 'Tech & engineering',
    description: 'Write low-level software for physical devices.',
  },
  {
    id: 'data-scientist',
    title: 'Data Scientist',
    category: 'Data & AI',
    description: 'Turn raw data into decisions with statistics and modeling.',
  },
  {
    id: 'ml-ai-engineer',
    title: 'ML / AI Engineer',
    category: 'Data & AI',
    description: 'Build and deploy machine learning systems.',
  },
  {
    id: 'data-analyst',
    title: 'Data Analyst',
    category: 'Data & AI',
    description: 'Explore data and report insights to stakeholders.',
  },
  {
    id: 'product-manager',
    title: 'Product Manager',
    category: 'Product & design',
    description: 'Define what to build and why it matters.',
  },
  {
    id: 'ui-ux',
    title: 'UI/UX Designer',
    category: 'Product & design',
    description: 'Design usable, delightful product experiences.',
  },
  {
    id: 'business-analyst',
    title: 'Business / Strategy Analyst',
    category: 'Business & finance in tech',
    description: 'Bridge business needs and technical solutions.',
  },
  {
    id: 'quant',
    title: 'Quant / Trading',
    category: 'Business & finance in tech',
    description: 'Apply math and code to trading and risk models.',
  },
  {
    id: 'growth-marketing',
    title: 'Growth / Product Marketing',
    category: 'Business & finance in tech',
    description: 'Drive user acquisition and retention with data.',
  },
] as const;

export const findRolePreset = (roleId: string): RolePreset | undefined =>
  rolePresets.find((preset) => preset.id === roleId);

/** Resolves a display title from a preset roleId, or a custom title when roleId is CUSTOM_ROLE_ID. */
export const resolveRoleTitle = (roleId: string, customTitle?: string): string => {
  if (roleId === CUSTOM_ROLE_ID) {
    return customTitle?.trim() || 'Custom role';
  }
  return findRolePreset(roleId)?.title ?? roleId;
};

export type Level = 'internship' | 'entry-level';

export const levelLabels: Readonly<Record<Level, string>> = {
  internship: 'Internship',
  'entry-level': 'Full-time (entry-level)',
};
