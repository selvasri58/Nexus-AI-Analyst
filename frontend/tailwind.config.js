/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Syne'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
        body: ["'DM Sans'", "sans-serif"],
      },
      colors: {
        obsidian: {
          950: "#030712",
          900: "#0a0f1e",
          800: "#0f172a",
          700: "#1e293b",
        },
        acid: {
          400: "#a3e635",
          500: "#84cc16",
          600: "#65a30d",
        },
        plasma: {
          400: "#38bdf8",
          500: "#0ea5e9",
          600: "#0284c7",
        },
        ember: {
          400: "#fb923c",
          500: "#f97316",
        },
        violet: {
          400: "#a78bfa",
          500: "#8b5cf6",
        }
      },
      animation: {
        "fade-up": "fadeUp 0.5s ease forwards",
        "fade-in": "fadeIn 0.3s ease forwards",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "shimmer": "shimmer 2s linear infinite",
        "slide-right": "slideRight 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "glow": "glow 2s ease-in-out infinite alternate",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        slideRight: {
          "0%": { opacity: "0", transform: "translateX(-20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        glow: {
          "0%": { boxShadow: "0 0 20px rgba(163, 230, 53, 0.2)" },
          "100%": { boxShadow: "0 0 40px rgba(163, 230, 53, 0.5)" },
        },
      },
    },
  },
  plugins: [],
};
