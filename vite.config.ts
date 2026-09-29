import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Two entries: index.html is the public visitor board, kiosk.html is the booth screen.
// The base path matches the GitHub Pages project site (user/org "uoe-shuttle-departures").
export default defineConfig({
  base: "/uoe-shuttle-departures/",
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        kiosk: "kiosk.html",
      },
    },
  },
});
