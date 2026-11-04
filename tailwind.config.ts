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
          50: '#E8F4F6',
          100: '#D5EAF0',
          200: '#B3DCE4',
          300: '#8AC9D5',
          400: '#66BDCF',
          500: '#4C9DB0',
          600: '#26788B',
          700: '#1B5E6D',
        },
        ink: {
          DEFAULT: '#101828',
        },
        forest: {
          DEFAULT: '#4C9DB0',
          deep: '#26788B',
        },
        sage: {
          DEFAULT: '#E8F4F6',
          dark: '#667085',
        },
        muted: '#667085',
        cream: {
          DEFAULT: '#F8FAFC',
          100: '#F2F4F7',
        },
        surface: {
          warm: '#E8F4F6',
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
