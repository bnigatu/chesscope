import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // "Tournament hall after hours" — deep ink, parchment, oxblood, brass.
        //
        // ink-* and parchment-* are wired through CSS variables defined in
        // globals.css so they flip per theme. The `<alpha-value>` placeholder
        // lets Tailwind's /opacity syntax keep working (e.g. bg-ink-800/60).
        // Light-mode values: ink becomes parchment cream→white, parchment
        // becomes deep ink for AA contrast. The class names stay
        // dark-mode-flavored to keep migration cost at zero.
        ink: {
          900: "rgb(var(--ink-900) / <alpha-value>)",
          800: "rgb(var(--ink-800) / <alpha-value>)",
          700: "rgb(var(--ink-700) / <alpha-value>)",
          600: "rgb(var(--ink-600) / <alpha-value>)",
          500: "rgb(var(--ink-500) / <alpha-value>)",
        },
        parchment: {
          50: "rgb(var(--parchment-50) / <alpha-value>)",
          100: "rgb(var(--parchment-100) / <alpha-value>)",
          200: "rgb(var(--parchment-200) / <alpha-value>)",
          300: "rgb(var(--parchment-300) / <alpha-value>)",
        },
        oxblood: {
          // Same hex in both themes — deep red passes AA on both cream
          // (7.5:1) and dark (8:1).
          DEFAULT: "#7a1e22",
          light: "#9a2c30",
          dark: "#5c1418",
        },
        brass: {
          // brass DEFAULT and brass-dark are literal hex (used at low alpha
          // for borders / chrome). brass-light flips per theme via CSS var:
          // dark-mode #d4ae5e (warm light), light-mode #8c6d33 (passes AA on
          // cream). Components keep using `text-brass-light` for emphasis
          // text — the resolved color changes with the theme.
          DEFAULT: "#b8924a",
          light: "rgb(var(--brass-light) / <alpha-value>)",
          dark: "#8c6d33",
        },
        // Chess.com tone — only the board surface and its overlays use these.
        // Surrounding chrome stays ink/parchment/brass.
        chess: {
          light: "#eeeed2",
          dark: "#769656",
          highlight: "#f7ec74",
          selected: "#bbcb44",
          arrow: "rgba(255,170,0,.8)",
        },
      },
      fontFamily: {
        // Distinctive editorial serif for display, modern grotesque for body,
        // monospace for chess data (FIDE IDs, ratings, dates).
        display: ['"Fraunces"', "ui-serif", "Georgia", "serif"],
        body: ['"Inter Tight"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        plate: "0 1px 0 rgba(245,239,226,.04), 0 0 0 1px rgba(245,239,226,.06)",
        plateHover:
          "0 1px 0 rgba(245,239,226,.06), 0 0 0 1px rgba(184,146,74,.4)",
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fade: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        rise: "rise 600ms cubic-bezier(.2,.7,.2,1) both",
        fade: "fade 400ms ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
