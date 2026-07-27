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
          // Loss/danger family, var-backed so it flips per theme like the
          // surfaces (dark: lifted reds readable on ink; light: deep red
          // that clears AA on white). Values live in globals.css.
          DEFAULT: "rgb(var(--oxblood) / <alpha-value>)",
          light: "rgb(var(--oxblood-light) / <alpha-value>)",
          dark: "rgb(var(--oxblood-dark) / <alpha-value>)",
        },
        brass: {
          // Accent family — ember orange since the 2026-07 reskin (the
          // token keeps its historical "brass" name to avoid touching 28
          // files). All three tiers are var-backed and flip per theme:
          // dark mode gets bright ember on ink, light mode gets deep
          // ember that passes AA on white. Values live in globals.css.
          DEFAULT: "rgb(var(--brass) / <alpha-value>)",
          light: "rgb(var(--brass-light) / <alpha-value>)",
          dark: "rgb(var(--brass-dark) / <alpha-value>)",
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
        // Var-backed so each theme defines its own card treatment: dark
        // keeps the faint parchment plate lines; light gets real soft
        // shadows (white cards on a near-white page need them for
        // definition). Values live in globals.css.
        plate: "var(--shadow-plate)",
        plateHover: "var(--shadow-plate-hover)",
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
