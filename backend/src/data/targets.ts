export interface TargetRoleSeed {
  id: string;
  title: string;
}

export const targetRoleSeeds = [
  {
    id: 'software-engineer',
    title: 'Software Engineer',
  },
  {
    id: 'quantitative-trader',
    title: 'Quantitative Trader',
  },
  {
    id: 'management-consultant',
    title: 'Management Consultant',
  },
] as const satisfies readonly TargetRoleSeed[];
