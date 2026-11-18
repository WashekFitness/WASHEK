export interface Tier {
  name: 'Progress' | 'Performance' | 'Elite';
  description: string;
  features: string[];
  priceId: { month: string; year: string };
  defaultPrice: string;
  unitAmountCents: number;
}

export type TierKey = 'progress' | 'performance' | 'elite';

export const STRIPE_PRICE_IDS: Record<TierKey, string> = {
  progress: 'price_1TTYrbRuQpZftYKRoSyLbQ0c',
  performance: 'price_1TTYs8RuQpZftYKR8ZzpNg7x',
  elite: 'price_1TTYsWRuQpZftYKRKIm8V10E',
};

export const STRIPE_PAYMENT_LINKS: Record<TierKey, string> = {
  progress: 'https://buy.stripe.com/test_9B67sNcsOaiW1ETgLtg3603',
  performance: 'https://buy.stripe.com/test_8x23cx50m9eS97l52Lg3605',
  elite: 'https://buy.stripe.com/test_28E3cxboK2Qu3N1cvdg3604',
};

export const STRIPE_DEFAULT_PRICES: Record<TierKey, { formattedTotal: string; unitAmountCents: number; priceId: string; currencyCode: string }> = {
  progress: {
    priceId: STRIPE_PRICE_IDS.progress,
    formattedTotal: '$9.99',
    unitAmountCents: 999,
    currencyCode: 'USD',
  },
  performance: {
    priceId: STRIPE_PRICE_IDS.performance,
    formattedTotal: '$17.99',
    unitAmountCents: 1799,
    currencyCode: 'USD',
  },
  elite: {
    priceId: STRIPE_PRICE_IDS.elite,
    formattedTotal: '$34.99',
    unitAmountCents: 3499,
    currencyCode: 'USD',
  },
};

export const STRIPE_TIERS: Tier[] = [
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
    priceId: {
      month: STRIPE_PRICE_IDS.progress,
      year: '',
    },
    defaultPrice: '$9.99',
    unitAmountCents: 999,
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
    priceId: {
      month: STRIPE_PRICE_IDS.performance,
      year: '',
    },
    defaultPrice: '$17.99',
    unitAmountCents: 1799,
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
    priceId: {
      month: STRIPE_PRICE_IDS.elite,
      year: '',
    },
    defaultPrice: '$34.99',
    unitAmountCents: 3499,
  },
];

export function getTierKey(name: Tier['name'] | string): TierKey {
  return String(name || '').trim().toLowerCase() as TierKey;
}

export function getTierByKey(key: string): Tier | undefined {
  const clean = String(key || '').trim().toLowerCase();
  return STRIPE_TIERS.find((t) => getTierKey(t.name) === clean);
}

export function isValidStripePriceId(value?: string | null): boolean {
  return typeof value === 'string' && /^price_[a-zA-Z0-9]+$/.test(value.trim());
}
