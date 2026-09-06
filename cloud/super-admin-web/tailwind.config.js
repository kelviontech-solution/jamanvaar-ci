/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        jaman: {
          navy: '#0B253A',
          deepNavy: '#0B2B39',
          saffron: '#E66817',
          orange: '#F97316',
          ivory: '#FBF9F5',
          cream: '#FAF7F2',
          teal: '#00A99D',
          darkTeal: '#0D9488',
          border: '#EBE6DD',
          darkBorder: '#1E3A4C'
        }
      }
    },
  },
  plugins: [],
}
