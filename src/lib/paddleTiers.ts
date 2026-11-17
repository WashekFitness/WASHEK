export interface Tier {
  name: 'Progress' | 'Performance' | 'Elite';
  description: string;
  features: string[];
  productId: string;
  priceId: { month: string; year: string };
}

export type TierKey = 'progress' | 'performance' | 'elite';

const viteEnv =
  ((import.meta as unknown as { env?: Record<string, string | undefined> })?.env) || {};

export const PADDLE_TIERS: Tier[] = [
  {
    name: 'Progress',
    description: 'Daily Progression',
    features: [
      '300 Coach Kael messages/month (3x Free)',
      'In-depth Coach Kael — biomechanical rationale & progression milestones',
      'Full custom workout adjustments',
      'Adaptive programming — calibrated from your workout performance',
      'Food & package nutrition scan',
      'Adaptive calorie & macro fueling',
      'Compare progress photos side-by-side',
    ],
    productId: 'pro_01m7j8yvn5p9qk5kpzab25s43d',
    priceId: {
      month: (viteEnv.VITE_PADDLE_PRICE_PROGRESS_MONTH || 'pri_01m7j94jsmj6m6c23fmpx30eb7').trim(),
      year: (viteEnv.VITE_PADDLE_PRICE_PROGRESS_YEAR || '').trim(),
    },
  },
  {
    name: 'Performance',
    description: 'High Performance',
    features: [
      '800 Coach Kael messages/month (8x Free)',
      'High-performance coaching — tempo breakdowns, activation cues & fueling synergy',
      'Everything in Progress',
      'Body composition scanner*',
      'Nutrition insights & suggestions',
      'Workout analytics dashboard',
    ],
    productId: 'pro_01m7j8z8zgpzyxxsjf3agxzh5j',
    priceId: {
      month: (viteEnv.VITE_PADDLE_PRICE_PERFORMANCE_MONTH || 'pri_01m7j980nyk4c5sexqs2anj39h').trim(),
      year: (viteEnv.VITE_PADDLE_PRICE_PERFORMANCE_YEAR || '').trim(),
    },
  },
  {
    name: 'Elite',
    description: 'Masterclass Athlete',
    features: [
      '2,000 Coach Kael messages/month (20x Free)',
      'Masterclass coaching — kinetic chain mastery & recovery diagnostics',
      'Everything in Performance',
      'Live workout adjustments (real-time coaching while training)',
      'Form Lab video analysis',
      'Technical form scoring, rep/hold counting & corrective drills',
      'Elite tips & coaching insights',
      'Deep recovery & deload protocols',
    ],
    productId: 'pro_01m7j8zjcvphk0vjjt48d3d182',
    priceId: {
      month: (viteEnv.VITE_PADDLE_PRICE_ELITE_MONTH || 'pri_01m7j995eanq5e99wbwkpb3dz6').trim(),
      year: (viteEnv.VITE_PADDLE_PRICE_ELITE_YEAR || '').trim(),
    },
  },
];

export function getTierKey(name: Tier['name'] | string): TierKey {
  return String(name || '').trim().toLowerCase() as TierKey;
}

export function getTierByKey(key: string): Tier | undefined {
  const clean = String(key || '').trim().toLowerCase();
  return PADDLE_TIERS.find((t) => getTierKey(t.name) === clean);
}

export function isValidPaddlePriceId(value?: string | null): boolean {
  return typeof value === 'string' && /^pri_[a-zA-Z0-9]+$/.test(value.trim());
}
