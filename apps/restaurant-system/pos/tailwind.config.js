/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../../../packages/ui/src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        slate: { 500: '#5B6B82' },
        jaman: {
          navy: '#0B253A',
          deepNavy: '#0B2B39',
          saffron: '#E66817',
          // The same orange, one step deeper, for orange *text* on light surfaces (5:1 instead of 3:1).
          saffronText: '#B04A0B',
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
