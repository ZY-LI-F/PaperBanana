import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--bg-canvas)',
        surface: 'var(--bg-surface)',
        subtle: 'var(--bg-subtle)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        primary: 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        muted: 'var(--text-muted)',
        accent1: 'var(--accent-1)',
        accent2: 'var(--accent-2)',
        danger: 'var(--danger)',
        warn: 'var(--warn)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['var(--text-2xs)', { lineHeight: 'var(--leading-body)' }],
        xs: ['var(--text-xs)', { lineHeight: 'var(--leading-body)' }],
        sm: ['var(--text-sm)', { lineHeight: 'var(--leading-body)' }],
        base: ['var(--text-base)', { lineHeight: 'var(--leading-body)' }],
        md: ['var(--text-md)', { lineHeight: 'var(--leading-body)' }],
        lg: ['var(--text-lg)', { lineHeight: 'var(--leading-body)' }],
        xl: ['var(--text-xl)', { lineHeight: 'var(--leading-heading)', letterSpacing: 'var(--tracking-tight)' }],
        '2xl': ['var(--text-2xl)', { lineHeight: 'var(--leading-heading)', letterSpacing: 'var(--tracking-tight)' }],
        '3xl': ['var(--text-3xl)', { lineHeight: 'var(--leading-heading)', letterSpacing: 'var(--tracking-tight)' }],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        pill: 'var(--radius-pill)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
      },
      spacing: {
        '1': 'var(--sp-1)',
        '2': 'var(--sp-2)',
        '3': 'var(--sp-3)',
        '4': 'var(--sp-4)',
        '6': 'var(--sp-6)',
        '8': 'var(--sp-8)',
        '12': 'var(--sp-12)',
        '16': 'var(--sp-16)',
      },
    },
  },
  plugins: [],
} satisfies Config;

