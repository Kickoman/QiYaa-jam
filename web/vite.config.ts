import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    target: "es2020",
    assetsInlineLimit: 0,
  },
  server: {
    proxy: {
      "/ws": { target: "ws://localhost:8090", ws: true },
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
  },
});
