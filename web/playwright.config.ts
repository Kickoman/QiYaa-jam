import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    browserName: "chromium",
    headless: true,
    locale: "ru-RU",
    viewport: { width: 390, height: 844 },
  },
});
