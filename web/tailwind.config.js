/** @type {import('tailwindcss').Config} */
// Design tokens are final (Design Brief §4.2 / README). Do not substitute.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F5F6F4',
        sheet: '#FFFFFF',
        ink: { DEFAULT: '#1B1F24', 2: '#5A6270' },
        rule: '#D9DDE3',
        signal: { DEFAULT: '#E4572E', hover: '#CF4B25' },
        ok: '#2F7D4F',
        hold: '#B7791F',
        fail: '#9B2C2C',
        // interaction shades (README §Color)
        'ink-btn-hover': '#2B3038',
        'row-hover': '#F8F9F7',
        'nav-hover': '#ECEEEB',
        'nav-active': '#E6E8E4',
        'frame-hl': '#FBE9E3',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        13: ['13px', '1.5'],
        14: ['14px', '1.5'],
        16: ['16px', '1.55'],
        20: ['20px', '1.3'],
        28: ['28px', '1.2'],
      },
      borderRadius: {
        control: '6px',
        sheet: '10px',
        pill: '16px',
      },
      maxWidth: {
        content: '1280px',
        read: '760px',
        script: '68ch',
      },
      boxShadow: {
        float: '0 8px 24px rgba(27,31,36,.12)',
      },
      keyframes: {
        'gs-pulse': {
          '0%': { boxShadow: '0 0 0 0 rgba(228,87,46,.55)' },
          '70%': { boxShadow: '0 0 0 8px rgba(228,87,46,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(228,87,46,0)' },
        },
      },
      animation: {
        'gs-pulse': 'gs-pulse 0.8s ease-out 1',
      },
    },
  },
  plugins: [],
};
