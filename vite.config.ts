import { defineConfig } from "vite";
import { readFileSync } from "node:fs";

export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "ship-font-licenses",
      generateBundle() {
        for (const name of ["Inter", "BigShouldersDisplay"])
          this.emitFile({
            type: "asset",
            fileName: `licenses/${name}-OFL.txt`,
            source: readFileSync(
              new URL(`./assets/ui/fonts/${name}-OFL.txt`, import.meta.url),
              "utf8",
            ),
          });
      },
    },
  ],
});
