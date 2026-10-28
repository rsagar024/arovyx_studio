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
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-100%)" },
        },
        "page-in": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "none" },
        },
        "word-up": {
          "0%": { opacity: "0", transform: "translateY(110%)" },
          "100%": { opacity: "1", transform: "none" },
        },
        settle: {
          "0%": { transform: "scale(1.12)" },
          "100%": { transform: "scale(1)" },
        },
        pop: {
          "0%": { transform: "scale(0.6) rotate(-12deg)", opacity: "0" },
          "60%": { transform: "scale(1.08) rotate(3deg)", opacity: "1" },
          "100%": { transform: "scale(1) rotate(0)", opacity: "1" },
        },
        "bounce-y": {
          "0%, 100%": { transform: "translateY(0)", opacity: "0.4" },
          "50%": { transform: "translateY(8px)", opacity: "1" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) both",
        "fade-in": "fade-in 0.6s ease-out both",
        "gradient-x": "gradient-x 8s ease infinite",
        "pulse-glow": "pulse-glow 4s ease-in-out infinite",
        "caret-blink": "caret-blink 1s step-end infinite",
        float: "float 6s ease-in-out infinite",
        marquee: "marquee 40s linear infinite",
        "bounce-y": "bounce-y 1.8s ease-in-out infinite",
        // `backwards`, not `both`: a held opacity animation makes the wrapper a
        // backdrop root, which stops the glass cards blurring what is behind them
        "page-in": "page-in 0.55s cubic-bezier(0.16, 1, 0.3, 1) backwards",
        "word-up": "word-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) both",
        settle: "settle 1.6s cubic-bezier(0.16, 1, 0.3, 1) both",
        pop: "pop 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both",
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
