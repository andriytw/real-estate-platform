/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}", // Added to ensure components are scanned
    "./**/*.{js,ts,jsx,tsx}", // Catch-all for root level files
  ],
  theme: {
    extend: {},
  },
  plugins: [],
  darkMode: 'class',
}

