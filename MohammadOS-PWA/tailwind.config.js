/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'base': '#0B0F14',
        'card': '#131922',
        'subtle': '#232B36',
        'main': '#E8ECF1',
        'muted': '#6B7684',
        'amber-active': '#F5A623',
        'steel-blue': '#4FA8E0',
        'sage-green': '#4FAE87',
        'blue-gray': '#8B93A6',
        'muted-purple': '#9C8BC9',
      },
      fontFamily: {
        sans: ['Vazirmatn', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
