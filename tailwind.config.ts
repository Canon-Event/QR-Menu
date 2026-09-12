import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#FFF3EA',
          100: '#FFE1C7',
          200: '#FDBE8A',
          300: '#F79A5C',
          400: '#F37A2E',
          500: '#F15A00',
          600: '#D94F00',
          700: '#A83E02',
        },
        ink: {
          DEFAULT: '#101A15',
        },
        forest: {
          DEFAULT: '#123A2A',
          deep: '#0D2B20',
        },
        sage: {
          DEFAULT: '#E7EDE5',
          dark: '#677867',
        },
        muted: '#6D746F',
        cream: {
          DEFAULT: '#FAF7F1',
          100: '#F6F0E6',
        },
        surface: {
          warm: '#E7EDE5',
        },
      },
      fontFamily: {
        sans: ['var(--font-manrope)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['var(--font-dm-serif)', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}

export default config
