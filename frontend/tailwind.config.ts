import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        pearl: "#f8f7f4",
        ink: "#111111",
        mist: "#e9eef3",
        sand: "#d8c5b0",
        pine: "#355a47",
      },
      boxShadow: {
        soft: "0 18px 45px rgba(17, 17, 17, 0.08)",
      },
      backgroundImage: {
        veil: "radial-gradient(circle at top, rgba(216, 197, 176, 0.24), transparent 40%)",
      },
    },
  },
  plugins: [],
} satisfies Config;

