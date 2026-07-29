module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        graphite: "#191A1F",
        ivory: "#F6F2EC",
        aura: "#D93646",
        softblack: "#23242A",
        sand: "#D8AC78",
      },
      fontFamily: {
        title: ["Manrope", "sans-serif"],
        body: ["DM Sans", "sans-serif"],
      },
      boxShadow: {
        soft: "0 12px 32px rgba(25, 26, 31, 0.08)",
        lift: "0 18px 44px rgba(25, 26, 31, 0.14)",
      },
    },
  },
  plugins: [],
};
