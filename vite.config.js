import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = "http://127.0.0.1:" + (env.PORT || "3000");

  return {
    root: "client",
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      proxy: { "/api": target, "/api-docs": target },
    },
  };
});
