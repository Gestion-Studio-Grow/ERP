#!/usr/bin/env node
// Hook PostToolUse: lint de diseño determinista.
// Si encuentra problemas termina con código 2: Claude ve el mensaje y lo corrige solo.
// Reglas y excepciones en design-lint.config.json. Línea exenta: agregar "design-lint-ignore".
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
    const cfgPath = path.join(root, ".claude", "hooks", "design-lint.config.json");
    const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, "utf8")) : {};
    const rules = cfg.rules || {};
    const ext = path.extname(file).toLowerCase();
    if (!(cfg.checkFiles || []).includes(ext)) return;

    const src = fs.readFileSync(file, "utf8");
    const lines = src.split("\n");
    const problems = [];
    const allowedFonts = (cfg.allowedFonts || []).map((f) => f.toLowerCase());
    const allowedColors = (cfg.allowedHexColors || []).map((c) => c.toLowerCase());
    const genericFonts = /^(sans-serif|serif|monospace|system-ui|inherit|initial|unset|var\(|ui-)/i;

    lines.forEach((line, i) => {
      const n = i + 1;
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
      const animates = /@keyframes|animation\s*:|gsap\.|useAnimate|<motion\.|motion\(|animate\(|\.to\(|\.from\(|\.timeline\(/.test(src);
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
