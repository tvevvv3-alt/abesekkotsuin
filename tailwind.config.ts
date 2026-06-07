import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#07111F",
          dark: "#050D18",
          light: "#0B1A30",
        },
        gold: {
          DEFAULT: "#C9A84C",
          light: "#E2C97A",
          dim: "#A07830",
          pale: "rgba(201,168,76,0.12)",
        },
        ink: "#F2F5F9",
      },
      fontFamily: {
        serif: ["var(--font-noto-serif)", "serif"],
        sans: ["var(--font-noto-sans)", "sans-serif"],
        bebas: ["var(--font-bebas)", "sans-serif"],
      },
      letterSpacing: {
        widest2: "0.2em",
        widest3: "0.3em",
      },
    },
  },
  plugins: [],
};

export default config;
