#!/usr/bin/env node
// Hook PostToolUse: lint de diseño determinista.
// Si encuentra problemas termina con código 2: Claude ve el mensaje y lo corrige solo.
// Reglas y excepciones en design-lint.config.json. Línea exenta: agregar "design-lint-ignore".
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

// Líneas que la sesión tocó respecto de HEAD. null = juzgar el archivo entero
// (archivo nuevo, repo sin git o cualquier error: ante la duda se revisa todo).
function changedLines(file, root) {
  try {
    const rel = path.relative(root, file);
    const git = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8", timeout: 8000 });
    if (git(["ls-files", "--error-unmatch", "--", rel]).status !== 0) return null;
    const d = git(["diff", "-U0", "HEAD", "--", rel]);
    if (d.status !== 0) return null;
    const set = new Set();
    for (const m of d.stdout.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
      const count = m[2] === undefined ? 1 : +m[2];
      for (let i = 0; i < count; i++) set.add(+m[1] + i);
    }
    return set;
  } catch (e) {
    return null;
  }
}

let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  try {
    const data = JSON.parse(input || "{}");
    let file = data.tool_input && (data.tool_input.file_path || data.tool_input.path);
    // Git Bash en Windows entrega /c/Users/...: Node no la resuelve y el hook salía en silencio.
    if (file && !fs.existsSync(file) && /^\/[a-zA-Z]\//.test(file)) file = file[1].toUpperCase() + ":" + file.slice(2);
    if (!file || !fs.existsSync(file)) return;
    const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const cfgPath = path.join(root, ".claude", "hooks", "design-lint.config.json");
    const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, "utf8")) : {};
    const ext = path.extname(file).toLowerCase();
    if (!(cfg.checkFiles || []).includes(ext)) return;

    const relPosix = path.relative(root, file).split(path.sep).join("/");
    if ((cfg.ignoreFiles || []).some((s) => ("/" + relPosix).includes(s))) return;
    // Superficies con la marca del negocio: color y tipografía son suyos; el movimiento se sigue controlando.
    const branded = (cfg.brandedPaths || []).some((s) => relPosix.startsWith(s));
    const rules = Object.assign({}, cfg.rules || {}, branded ? { fontsFromDesign: false, colorsFromDesign: false } : {});
    const touched = cfg.scope === "file" ? null : changedLines(file, root);

    const src = fs.readFileSync(file, "utf8");
    const lines = src.split("\n");
    const problems = [];
    const allowedFonts = (cfg.allowedFonts || []).map((f) => f.toLowerCase());
    const allowedColors = (cfg.allowedHexColors || []).map((c) => c.toLowerCase());
    const genericFonts = /^(sans-serif|serif|monospace|system-ui|inherit|initial|unset|var\(|ui-)/i;

    lines.forEach((line, i) => {
      const n = i + 1;
      if (touched && !touched.has(n)) return;
      if (/design-lint-ignore/.test(line)) return;

      if (rules.noEaseIn !== false && /\bease-in\b(?!-out)/.test(line))
        problems.push(`${n}: "ease-in" en interfaz (el arranque lento se siente pesado justo cuando el usuario mira). Usá ease-out o una curva custom de DESIGN.md.`);

      if (rules.noTransitionAll !== false && /\btransition(?:-property)?\s*:\s*all\b|\btransition-all\b/.test(line))
        problems.push(`${n}: "transition: all" anima propiedades de layout sin querer. Nombrá solo transform y opacity.`);

      const lay = line.match(/transition(?:-property)?\s*:[^;]*\b(width|height|top|left|right|bottom|margin|padding)\b/);
      if (rules.noLayoutAnimation !== false && lay)
        problems.push(`${n}: animás "${lay[1]}" (propiedad de layout, provoca reflow y tirones). Animá transform u opacity.`);

      if (rules.fontsFromDesign !== false && allowedFonts.length) {
        // CSS (`font-family:`) y objetos de estilo en JS/JSX (`fontFamily:`), que el kit original no veía.
        const m =
          line.match(/font-family\s*:\s*([^;}"']+(?:["'][^"']*["'][^;}]*)*)/i) ||
          line.match(/\bfontFamily\s*:\s*["'`]([^"'`]+)["'`]/);
        if (m) {
          const fonts = m[1].split(",").map((s) => s.replace(/["']/g, "").trim()).filter(Boolean);
          const bad = fonts.filter((f) => !allowedFonts.includes(f.toLowerCase()) && !genericFonts.test(f));
          if (bad.length) problems.push(`${n}: fuente fuera de DESIGN.md: ${bad.join(", ")}.`);
        }
      }

      if (rules.colorsFromDesign !== false && allowedColors.length) {
        (line.match(/#[0-9a-fA-F]{3,8}\b/g) || []).forEach((h) => {
          if (!allowedColors.includes(h.toLowerCase()))
            problems.push(`${n}: color ${h} no es un token de DESIGN.md. Usá la variable correspondiente.`);
        });
      }
    });

    if (rules.reducedMotion !== false) {
      // En modo "changed" sólo cuenta la animación que la sesión agregó, no la que ya estaba.
      const motionSrc = touched ? lines.filter((_, i) => touched.has(i + 1)).join("\n") : src;
      const animates = /@keyframes|animation\s*:|gsap\.|useAnimate|<motion\.|motion\(|animate\(|\.to\(|\.from\(|\.timeline\(/.test(motionSrc);
      const guarded = /prefers-reduced-motion|useReducedMotion|reducedMotion|matchMedia\(/.test(src);
      if (animates && !guarded)
        problems.push(`archivo: hay animación sin contemplar prefers-reduced-motion. Agregá la comprobación (CSS @media o hook) y un fallback sin movimiento.`);
    }

    if (problems.length) {
      process.stderr.write(
        `[design-lint] ${path.relative(root, file)}\n` +
          problems.map((p) => " - " + p).join("\n") +
          "\nCorregí estos puntos antes de continuar. Si alguno es una excepción justificada, agregá el comentario design-lint-ignore en esa línea y explicame por qué.\n"
      );
      process.exit(2);
    }
  } catch (e) {
    /* nunca bloquear por un error del propio linter */
  }
});
