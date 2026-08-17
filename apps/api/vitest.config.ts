import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Tests share module state (the in-memory stores), so run files in
    // separate processes rather than letting them leak into each other.
    pool: "forks",
  },
});
