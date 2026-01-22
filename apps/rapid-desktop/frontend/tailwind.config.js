/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // shadcn/ui CSS variable colors
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
        },
        // RAPID Design System - Legacy support
        // Clean, minimal dark theme with violet-blue accent
        rapid: {
          // Backgrounds
          bg: 'hsl(240 10% 4%)', // Main background
          surface: 'hsl(240 10% 6%)', // Card/surface background
          elevated: 'hsl(240 6% 10%)', // Elevated surfaces

          // Borders
          border: 'hsl(240 4% 16%)',
          'border-subtle': 'hsl(240 4% 12%)',

          // Text
          text: 'hsl(0 0% 98%)',
          muted: 'hsl(240 5% 55%)',

          // Primary/Brand - Violet-blue
          accent: 'hsl(245 85% 67%)',
          'accent-muted': 'hsl(245 60% 50%)',
          'accent-subtle': 'hsl(245 40% 25%)',

          // Status colors
          success: 'hsl(142 71% 45%)',
          warning: 'hsl(45 93% 47%)',
          error: 'hsl(0 72% 51%)',
          info: 'hsl(217 91% 60%)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        // System fonts for body text
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        // Berkeley Mono for headings/code (with fallbacks)
        mono: [
          'Berkeley Mono',
          'ui-monospace',
          'SF Mono',
          'Menlo',
          'Monaco',
          'Cascadia Mono',
          'monospace',
        ],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
        glow: 'glow 2s ease-in-out infinite',
        'cursor-blink': 'cursorBlink 1s step-end infinite',
        'orb-pulse': 'orbPulse 8s ease-in-out infinite',
        'float-drift': 'floatDrift 20s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        glow: {
          '0%, 100%': {
            boxShadow: '0 0 20px hsl(245 85% 67% / 0.15)',
          },
          '50%': {
            boxShadow: '0 0 30px hsl(245 85% 67% / 0.25)',
          },
        },
        cursorBlink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        orbPulse: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.6' },
          '50%': { transform: 'scale(1.15)', opacity: '0.9' },
        },
        floatDrift: {
          '0%, 100%': { transform: 'translate(0, 0)', opacity: '0.1' },
          '25%': { transform: 'translate(10px, -20px)', opacity: '0.2' },
          '50%': { transform: 'translate(-5px, -10px)', opacity: '0.15' },
          '75%': { transform: 'translate(15px, 10px)', opacity: '0.18' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        glow: '0 0 20px hsl(245 85% 67% / 0.15)',
        'glow-strong': '0 4px 20px hsl(245 85% 67% / 0.3)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
