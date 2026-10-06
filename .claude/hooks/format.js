#!/usr/bin/env node
// Hook PostToolUse: formatea el archivo recién editado con el formateador del proyecto (Biome o Prettier).
// Nunca bloquea: si no hay formateador o falla, no pasa nada.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  try {
    const data = JSON.parse(input || "{}");
    const file = data.tool_input && (data.tool_input.file_path || data.tool_input.path);
    if (!file || !fs.existsSync(file)) return;
    const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const ext = path.extname(file).toLowerCase();
    const webExt = [".js", ".jsx", ".ts", ".tsx", ".css", ".scss", ".json", ".md", ".mdx", ".html", ".vue", ".svelte", ".astro", ".yaml", ".yml", ".cds"];
    if (!webExt.includes(ext)) return;
    const has = (n) => fs.existsSync(path.join(root, "node_modules", ".bin", n));
    const q = `"${file}"`;
    if (has("biome")) execSync(`npx biome format --write ${q}`, { cwd: root, stdio: "ignore" });
    else if (has("prettier")) execSync(`npx prettier --write ${q}`, { cwd: root, stdio: "ignore" });
  } catch (e) {
    /* nunca bloquear por el formateador */
  }
});
