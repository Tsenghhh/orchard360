import type { Config } from "tailwindcss"

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["class"],
  theme: {
    extend: {},
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config
