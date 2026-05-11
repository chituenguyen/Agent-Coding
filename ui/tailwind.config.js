export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        co: {
          bg: "rgb(var(--co-bg-rgb) / <alpha-value>)",
          surface: "rgb(var(--co-surface-rgb) / <alpha-value>)",
          "surface-l2": "rgb(var(--co-surface-l2-rgb) / <alpha-value>)",
          fg: "rgb(var(--co-fg-rgb) / <alpha-value>)",
          primary: "rgb(var(--co-primary-rgb) / <alpha-value>)",
          "primary-fg": "rgb(var(--co-primary-fg-rgb) / <alpha-value>)",
          accent: "rgb(var(--co-accent-rgb) / <alpha-value>)",
          success: "rgb(var(--co-success-rgb) / <alpha-value>)",
          destructive: "rgb(var(--co-destructive-rgb) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["Figtree", "system-ui", "-apple-system", "sans-serif"],
        mono: [
          '"IBM Plex Mono"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      borderRadius: {
        "co-sm": "6px",
        co: "10px",
        "co-lg": "14px",
      },
    },
  },
  plugins: [],
};
