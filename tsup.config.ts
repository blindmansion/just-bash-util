import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "command/index": "src/command/index.ts",
    "config/index": "src/config/index.ts",
    "path/index": "src/path/index.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  outDir: "dist",
});
