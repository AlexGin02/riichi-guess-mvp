import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17211c",
        felt: "#18705f",
        jade: "#d7efe7",
        ember: "#c94f37",
        paper: "#f8f5ee"
      }
    }
  },
  plugins: []
};

export default config;
