import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

export default defineConfig({
  server: { port: 3000 },
  // Vite 8 resolves tsconfig `paths` natively. No vite-tsconfig-paths.
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    // tanstackStart() MUST precede viteReact(), or route generation and
    // server-function compilation silently no-op.
    tanstackStart({
      // We emit sitemap.xml from a server route because it needs live category
      // data. The build-time sitemap would shadow that route with a stale file.
      sitemap: { enabled: false },
      // No prerender. The stats strip is on every page and is live data, so a
      // build-time HTML snapshot would ship stale numbers and then visibly
      // correct itself on hydration. CDN s-maxage gives the same latency with
      // none of that.
    }),
    viteReact(),
    nitro(),
  ],
});
