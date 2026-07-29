import { defineConfig } from "vite";

const apiProxy = {
  "/api": {
    target: "https://aura-giftcards-api.onrender.com",
    changeOrigin: true,
    // Render's certificate chain is validated by Vercel in production. The
    // local Windows Node runtime does not always expose the system CA bundle.
    secure: false,
  },
};

export default defineConfig({
  build: {
    target: "es2020",
    sourcemap: false,
  },
  server: {
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
});
