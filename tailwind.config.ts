import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0f0f0f",
        surface: "#1a1a1a",
        surface2: "#242424",
        surface3: "#2e2e2e",
        text1: "#f0f0f0",
        text2: "#999999",
        text3: "#666666",
        accent: {
          DEFAULT: "#00e5a0",
          dark: "#00b87a",
        },
        warn: "#ff9f43",
        danger: "#ff6b6b",
        info: "#74b9ff",
      },
      fontFamily: {
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
        mono: ['"DM Mono"', "ui-monospace", "monospace"],
      },
      borderRadius: {
        xs: "6px",
        sm: "10px",
        DEFAULT: "16px",
      },
    },
  },
  plugins: [],
} satisfies Config;
