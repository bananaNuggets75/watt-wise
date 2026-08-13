import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // jsdom supplies localStorage and fetch's surroundings, which the auth
    // and API clients both assume.
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Values the Supabase client reads at import time.
    env: {
      VITE_SUPABASE_URL: "https://test-project.supabase.co",
      VITE_SUPABASE_ANON_KEY: "test-anon-key",
      VITE_API_URL: "http://localhost:4000",
    },
  },
});
