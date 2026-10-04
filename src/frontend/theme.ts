/**
 * AACP Platform light enterprise theme palette.
 * Used by all authenticated dashboards. The public marketing site keeps its own dark styles.
 */
export const C = {
  // ── Structure ────────────────────────────────────────────────────────────────
  bg:           '#F6F7F9',  // page / panel background
  bgCard:       '#FFFFFF',  // card / surface
  bgDeep:       '#F1F5F9',  // inset / secondary surface
  bgMuted:      '#F9FAFB',  // subtle alt surface

  // ── Borders ──────────────────────────────────────────────────────────────────
  border:       '#E2E6EA',  // standard border
  borderLight:  '#EEF0F3',  // hairline / divider
  borderStrong: '#CBD5E1',  // stronger separator

  // ── Typography ───────────────────────────────────────────────────────────────
  white:        '#0f172a',  // primary text (token name kept; was bright text on dark)
  grey:         '#475569',  // secondary text
  greyD:        '#94a3b8',  // tertiary / placeholder text
  greyLight:    '#CBD5E1',  // very light label
  slate:        '#64748b',  // neutral slate

  // ── AACP Brand ───────────────────────────────────────────────────────────────
  crimson:      '#8F0909',  // primary accent
  crimsonD:     '#721010',  // hover / pressed accent

  // ── Semantic: green ──────────────────────────────────────────────────────────
  green:        '#16a34a',
  greenBg:      '#F0FDF4',
  greenBorder:  '#BBF7D0',

  // ── Semantic: amber ──────────────────────────────────────────────────────────
  amber:        '#D97706',
  amberBg:      '#FFFBEB',
  amberBorder:  '#FDE68A',

  // ── Semantic: red ────────────────────────────────────────────────────────────
  red:          '#DC2626',
  redBg:        '#FEF2F2',
  redBorder:    '#FECACA',

  // ── Semantic: blue ───────────────────────────────────────────────────────────
  blue:         '#2563EB',
  blueBg:       '#EFF6FF',
  blueBorder:   '#BFDBFE',
} as const;

export type ThemeColor = typeof C;
