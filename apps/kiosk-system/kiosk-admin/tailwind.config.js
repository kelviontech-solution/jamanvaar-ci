/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../../../shared/ui/src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        jaman: {
          navy: '#0B253A',
          saffron: '#E66817',
          ivory: '#FBF9F5',
          teal: '#00A99D',
          border: '#EBE6DD'
        }
      }
    },
  },
  plugins: [],
}
