import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Claude Design Color Palette
        claude: {
          coral: {
            DEFAULT: '#E89B8F',
            light: '#F4B8A5',
            dark: '#D97B6D',
          },
          gray: {
            50: '#F7F7F6',
            100: '#F0F0EF',
            200: '#E5E5E5',
            300: '#D1D1D1',
            400: '#A8A8A8',
            500: '#6B6B6B',
            600: '#4A4A4A',
            700: '#2D2D2D',
          },
          card: {
            blue: '#E8F2F7',
            beige: '#F5F1ED',
            pink: '#FAF0F0',
            purple: '#F0EDF7',
            green: '#EDF7F0',
          },
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'zoom-in': 'zoomIn 0.2s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        zoomIn: {
          '0%': { transform: 'scale(0.95)' },
          '100%': { transform: 'scale(1)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
