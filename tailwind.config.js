/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fbf3f1',
          100: '#f5ddd8',
          200: '#e9bdb5',
          300: '#d79186',
          400: '#c7675a',
          500: '#b23a32',
          600: '#9B1919',
          700: '#821313',
          800: '#6B0B0B',
          900: '#4f0909',
          950: '#2b0303',
        },
        sice: {
          base: '#9B1919',
          background: '#F7F4EB',
          text: '#4A4741',
          accent: '#D1A153',
          reference: '#D1C2B0',
          density: '#6B0B0B',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
