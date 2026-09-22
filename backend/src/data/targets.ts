export interface TargetRoleDefinition {
  id: string;
  title: string;
  guidance: string;
}

export interface TargetRoleCategory {
  id: string;
  title: string;
  roles: readonly TargetRoleDefinition[];
}

export const targetRoleCategories = [
  {
    id: 'tech-engineering', title: 'Tech & engineering', roles: [
      { id: 'software-engineer', title: 'Software Engineer', guidance: 'Focus on programming fundamentals, tested software projects, code review, and explaining engineering tradeoffs.' },
      { id: 'frontend-mobile', title: 'Frontend / Mobile Developer', guidance: 'Focus on accessible interfaces, responsive or native app development, state management, testing, and shipped user flows.' },
      { id: 'backend-cloud', title: 'Backend / Cloud Engineer', guidance: 'Focus on APIs, data modeling, deployment, reliability, observability, and security.' },
      { id: 'devops-sre', title: 'DevOps / SRE', guidance: 'Focus on CI/CD, infrastructure as code, monitoring, incident response, and reliability evidence.' },
      { id: 'cybersecurity', title: 'Cybersecurity', guidance: 'Focus on authorized security labs, threat modeling, secure configuration, vulnerability analysis, and responsible reporting.' },
      { id: 'embedded-hardware', title: 'Embedded / Hardware Engineer', guidance: 'Focus on circuits, firmware, microcontroller prototypes, measurement, debugging, and documented hardware tests.' },
    ],
  },
  {
    id: 'data-ai', title: 'Data & AI', roles: [
      { id: 'data-scientist', title: 'Data Scientist', guidance: 'Focus on statistical reasoning, experimental design, reproducible analysis, model evaluation, and communicating findings.' },
      { id: 'ml-ai-engineer', title: 'ML / AI Engineer', guidance: 'Focus on data pipelines, model evaluation, deployment, monitoring, and reproducible ML systems.' },
      { id: 'data-analyst', title: 'Data Analyst', guidance: 'Focus on SQL, data cleaning, dashboards, descriptive analysis, and actionable stakeholder insights.' },
    ],
  },
  {
    id: 'product-design', title: 'Product & design', roles: [
      { id: 'product-manager', title: 'Product Manager', guidance: 'Focus on user research, problem framing, prioritization, product specs, metrics, and communicating decisions.' },
      { id: 'ui-ux', title: 'UI/UX Designer', guidance: 'Focus on user research, flows, prototypes, accessibility, usability testing, and portfolio case studies.' },
    ],
  },
  {
    id: 'business-finance-tech', title: 'Business & finance in tech', roles: [
      { id: 'business-analyst', title: 'Business / Strategy Analyst', guidance: 'Focus on market sizing, structured analysis, financial or operating models, recommendations, and clear presentations.' },
      { id: 'quant', title: 'Quant / Trading', guidance: 'Focus on probability, statistics, Python or other quantitative coding, reproducible backtesting, risk, and clear evaluation of assumptions. Prefer simulated or historical data and avoid requiring live trading.' },
      { id: 'growth-marketing', title: 'Growth / Product Marketing', guidance: 'Focus on audience research, positioning, campaign experiments, funnel metrics, and measurable product growth.' },
    ],
  },
] as const satisfies readonly TargetRoleCategory[];

export const findTargetRole = (id: string): TargetRoleDefinition | undefined => {
  for (const category of targetRoleCategories) {
    const role = category.roles.find((candidate) => candidate.id === id);
    if (role) return role;
  }
  return undefined;
};

export const publicTargetRoleCategories = targetRoleCategories.map((category) => ({
  id: category.id,
  title: category.title,
  roles: category.roles.map(({ id, title }) => ({ id, title })),
}));
