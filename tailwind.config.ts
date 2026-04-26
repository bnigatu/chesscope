import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // "Tournament hall after hours", deep ink, parchment, oxblood, brass.
        ink: {
          900: "#0d0e0c",
          800: "#14161a",
          700: "#1c1f24",
          600: "#272b32",
          500: "#3a3f48",
        },
        parchment: {
          50: "#f5efe2",
          100: "#ede5d2",
          200: "#dcd0b6",
          300: "#c2b291",
        },
        oxblood: {
          DEFAULT: "#7a1e22",
          light: "#9a2c30",
          dark: "#5c1418",
        },
        brass: {
          DEFAULT: "#b8924a",
          light: "#d4ae5e",
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
