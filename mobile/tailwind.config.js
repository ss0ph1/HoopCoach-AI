/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        court: "#f97316",
        ink: "#070b0d",
        panel: "#11191d"
      }
    }
  },
  plugins: []
};
