import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Apple-style design tokens
        label: {
          primary: '#1D1D1F',
          secondary: '#6E6E73',
          tertiary: '#AEAEB2',
        },
        accent: {
          blue: '#0071E3',
          green: '#34C759',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          elevated: '#F5F5F7',
          separator: 'rgba(0,0,0,0.07)',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '20px',
      },
    },
  },
  plugins: [],
};

export default config;
