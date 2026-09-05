/**
 * Report theming and the chart palette.
 *
 * White-label branding controls the *chrome* (agency name, accent rules, logo)
 * and deliberately never touches the *data* colours. An agency setting a lime
 * accent must not be able to break the encoding or the contrast guarantees of
 * the charts, so series colours come from a validated palette and stay fixed.
 * @module report/theme
 */

/**
 * Chart palette. The share-of-voice chart is an emphasis form - one series is
 * the point, the rest are context - so the brand takes a single validated hue
 * and competitors take the de-emphasis gray, with every bar directly labelled.
 * Adjacent separation for that pair: CVD dE 15.8, normal-vision dE 17.8, both
 * clear of the floors; contrast >= 3:1 on the report surface.
 */
export const PALETTE = {
  surface: '#fcfcfb',
  brand: '#2a78d6',
  context: '#8a8a85',
  // Sequential blue ramp, light -> dark, for magnitude encoding.
  seq: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#2a78d6', '#256abf', '#184f95'],
  status: {
    good: '#0ca30c',
    warning: '#fab219',
    serious: '#ec835a',
    critical: '#d03b3b',
  },
  ink: {
    primary: '#0b0b0b',
    secondary: '#52514e',
    muted: '#77766f',
    rule: '#e4e3df',
    panel: '#f6f5f2',
  },
};

/** Status colours are never carried by hue alone; each ships with a label. */
export const STATUS_META = {
  pass: { label: 'Pass', color: PALETTE.status.good, mark: '+' },
  warn: { label: 'Needs work', color: PALETTE.status.warning, mark: '!' },
  fail: { label: 'Failing', color: PALETTE.status.critical, mark: 'x' },
  info: { label: 'Info', color: PALETTE.ink.muted, mark: 'i' },
};

export const SEVERITY_META = {
  critical: { label: 'Critical', color: PALETTE.status.critical },
  high: { label: 'High', color: PALETTE.status.serious },
  medium: { label: 'Medium', color: PALETTE.status.warning },
  low: { label: 'Low', color: PALETTE.ink.muted },
};

/**
 * Resolve branding with safe defaults.
 * @param {import('../types.js').Branding} [b]
 */
export function resolveBranding(b = {}) {
  const accent = /^#[0-9a-f]{6}$/i.test(String(b.accent || '')) ? b.accent : '#1f2933';
  return {
    agencyName: b.agencyName || '',
    logoUrl: b.logoUrl || '',
    accent,
    contactEmail: b.contactEmail || '',
    website: b.website || '',
    footerNote: b.footerNote || '',
  };
}

/** Map a 0..1 score onto a step of the sequential ramp. @param {number} v */
export function seqStep(v) {
  const idx = Math.min(PALETTE.seq.length - 1,
    Math.max(0, Math.round((Number(v) || 0) * (PALETTE.seq.length - 1))));
  return PALETTE.seq[idx];
}

/** Score band colour, used for the headline gauge only. @param {number} v */
export function scoreColor(v) {
  if (v === null || v === undefined) return PALETTE.ink.muted;
  if (v >= 0.7) return PALETTE.status.good;
  if (v >= 0.45) return PALETTE.status.warning;
  return PALETTE.status.critical;
}
