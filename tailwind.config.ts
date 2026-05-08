import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', '"Cascadia Code"', '"Source Code Pro"', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        // Surfaces
        base: 'var(--bg-base)',
        surface: 'var(--bg-surface)',
        elevated: 'var(--bg-elevated)',
        hover: 'var(--bg-hover)',

        // Borders
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',

        // Text — exposed as text-primary / text-secondary / text-tertiary
        primary: 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        tertiary: 'var(--text-tertiary)',

        // Brand + state
        accent: {
          DEFAULT: 'var(--accent)',
          soft: 'var(--accent-soft)',
          glow: 'var(--accent-glow)',
        },
        success: {
          DEFAULT: 'var(--success)',
          soft: 'var(--success-soft)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          soft: 'var(--danger-soft)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          soft: 'var(--warning-soft)',
        },
      },
      fontSize: {
        // Scaled +33% globally (15→20 ratio) for "readable from a few
        // steps away" comfort. Line-heights scaled in lockstep.
        '2xs': ['15px', '19px'],
        xs: ['16px', '21px'],
        sm: ['17px', '24px'],
        base: ['19px', '28px'],
        md: ['20px', '29px'],
        lg: ['21px', '32px'],
        xl: ['24px', '35px'],
        '2xl': ['29px', '37px'],
        '3xl': ['35px', '43px'],
        '4xl': ['40px', '45px'],
      },
      letterSpacing: {
        title: '-0.02em',
        snug: '-0.01em',
        tight: '-0.025em',
        wider: '0.04em',
        widest: '0.08em',
      },
      borderRadius: {
        sm: '5px',
        DEFAULT: '7px',
        md: '7px',
        lg: '10px',
        xl: '12px',
      },
      boxShadow: {
        'btn-primary':
          '0 1px 0 rgba(255,255,255,0.1) inset, 0 0 0 1px var(--accent), 0 4px 14px var(--accent-glow)',
        'glow-accent': '0 0 20px var(--accent-glow)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [animate],
}

export default config
