/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        court: "#d04f20",
        ink: "#17202a",
        mint: "#188263"
      }
    }
  },
  plugins: []
};
