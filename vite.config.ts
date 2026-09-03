import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  build: {
    outDir: "dist/client",
    sourcemap: false,
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
  },
});
