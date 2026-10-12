/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#00B2B1', dark: '#008C8B', soft: '#E3F6F6', ink: '#06403F' },
        hot: { DEFAULT: '#ED1847', soft: '#FDE6EC' },
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        raised: 'rgb(var(--raised) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        mute: 'rgb(var(--mute) / <alpha-value>)',
        primary: 'rgb(var(--primary) / <alpha-value>)',
        'primary-ink': 'rgb(var(--primary-ink) / <alpha-value>)',
      },
      fontFamily: { sans: ['"Nunito Variable"', 'system-ui', 'sans-serif'] },
      borderRadius: { pill: '999px' },
    },
  },
  plugins: [],
};
