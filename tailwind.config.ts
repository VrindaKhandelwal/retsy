import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F7F2E9", // receipt paper
        paperDim: "#EFE8D9",
        ink: "#211D18", // near-black thermal-print ink
        inkSoft: "#5B5448",
        stamp: "#B6402B", // rubber-stamp red, used for urgency/deadlines
        sage: "#5C7A5E", // confirmed / safe state
        mustard: "#C3902F", // "soon" warning state
        line: "#DCD3BE",
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "Georgia", "serif"],
        body: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      backgroundImage: {
        perf: "repeating-linear-gradient(90deg, transparent 0 6px, #DCD3BE 6px 7px)",
      },
    },
  },
  plugins: [],
};

export default config;
