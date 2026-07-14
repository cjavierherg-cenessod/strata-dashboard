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
          50: '#eefaff',
          100: '#d9f5fd',
          200: '#b8ecf9',
          300: '#7eddf6',
          400: '#1BC4F3',
          500: '#0870A9',
          600: '#0870A9',
          700: '#075b8a',
          800: '#084d70',
          900: '#0a405d',
          950: '#06283c',
        },
        strata: {
          black: '#000000',
          blue: '#0870A9',
          cyan: '#1BC4F3',
          steel: '#6B809B',
          gray: '#727376',
          silver: '#D2D3D5',
          white: '#FEFEFE',
        },
        slate: {
          50: '#FEFEFE',
          100: '#FEFEFE',
          200: '#D2D3D5',
          300: '#D2D3D5',
          400: '#6B809B',
          500: '#727376',
          600: '#6B809B',
          700: '#727376',
          800: '#000000',
          900: '#000000',
          950: '#000000',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
