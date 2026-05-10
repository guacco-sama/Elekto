/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dj: {
          950: '#0a0a0f',
          900: '#12121a',
          800: '#1a1a2e',
          700: '#252542',
          600: '#35355a',
          500: '#4a4a7a',
          400: '#6a6a9a',
          300: '#8a8aba',
          200: '#aaaaca',
          100: '#ccccea',
          50: '#e8e8f8',
          accent: '#7c3aed',
          'accent-hover': '#6d28d9',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}