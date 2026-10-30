// Design tokens ported from the web app's "kasi night" theme (src/theme.css): Ink / King violet / Crown gold.
export type Palette = {
  bg: string; surface: string; surface2: string; text: string; muted: string; border: string;
  accent: string; accent2: string; accentText: string; accentSoft: string; gold: string;
  own: string; ownText: string; other: string; otherText: string;
  danger: string; success: string; online: string; tick: string;
  nameColors: string[];
};

export const light: Palette = {
  bg: '#f6f4ff', surface: '#ffffff', surface2: '#efebff', text: '#17112e', muted: '#645d86', border: '#e6e1f7',
  accent: '#6b46f5', accent2: '#8a63ff', accentText: '#ffffff', accentSoft: '#ede8ff', gold: '#f5b83d',
  own: '#6a45f0', ownText: '#ffffff', other: '#ffffff', otherText: '#17112e',
  danger: '#d12f48', success: '#17875a', online: '#22c55e', tick: '#8fe3ff',
  nameColors: ['#0d8f83', '#d33a52', '#a86d0a', '#2a64d8', '#2c8a46', '#6b46f5'],
};

export const dark: Palette = {
  bg: '#0e0a1e', surface: '#161230', surface2: '#211b45', text: '#f2efff', muted: '#a39bc7', border: '#2b2456',
  accent: '#9b83ff', accent2: '#b39dff', accentText: '#120a33', accentSoft: '#2a2160', gold: '#f5b83d',
  own: '#5a38e2', ownText: '#ffffff', other: '#221c45', otherText: '#f2efff',
  danger: '#ff7387', success: '#4fd195', online: '#22c55e', tick: '#8fe3ff',
  nameColors: ['#2dd4bf', '#ff7a8c', '#f5b83d', '#6fa0ff', '#7ddb92', '#a996ff'],
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 18, pill: 999 } as const;
export const type = {
  title: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.4 },
  h2: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.2 },
  body: { fontSize: 16, fontWeight: '400' as const },
  strong: { fontSize: 16, fontWeight: '600' as const },
  small: { fontSize: 13, fontWeight: '400' as const },
} as const;
export const MIN_TOUCH = 44; // accessibility minimum touch target (px)
