import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "#22d3ee",
          50: "#ecfeff",
          100: "#cffafe",
          200: "#a5f3fc",
          300: "#67e8f9",
          400: "#22d3ee",
          500: "#06b6d4",
          600: "#0891b2",
          700: "#0e7490",
          800: "#155e75",
          900: "#164e63",
        },
        ink: {
          950: "#07090b",
          900: "#0b0e11",
          850: "#10141a",
          800: "#151a21",
          700: "#1e252e",
          600: "#2b3440",
        },
      },
      fontFamily: {
        display: ["Clash Display", "Syne", "sans-serif"],
        body: ["Space Grotesk", "DM Mono", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      letterSpacing: {
        micro: "0.22em",
        tightest: "-0.045em",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "gradient-x": {
          "0%, 100%": { "background-position": "0% 50%" },
          "50%": { "background-position": "100% 50%" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "0.8" },
        },
        "caret-blink": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) both",
        "fade-in": "fade-in 0.6s ease-out both",
        "gradient-x": "gradient-x 8s ease infinite",
        "pulse-glow": "pulse-glow 4s ease-in-out infinite",
        "caret-blink": "caret-blink 1s step-end infinite",
        float: "float 6s ease-in-out infinite",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(34, 211, 238, 0.25), 0 0 32px -8px rgba(34, 211, 238, 0.35)",
        // per-theme value lives in globals.css (--shadow-card)
        card: "var(--shadow-card)",
      },
    },
  },
  plugins: [],
};

export default config;
