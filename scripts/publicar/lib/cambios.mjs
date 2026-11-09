// ============================================================================
// Qué toca el PR: rutas que el pipeline NO publica solo, y migraciones nuevas.
// ============================================================================
//
// Por qué hay rutas «sensibles». El workflow de publicación confía en tres cosas: el CI del PR
// (gates.yml, release.yml), el build de Vercel (scripts/vercel-build.mjs, que migra) y él mismo.
// Un PR que cambia cualquiera de esas piezas puede «aprobarse a sí mismo» (p. ej. un gates.yml
// que ya no corre la valla visual da verde). Esos PR los publica el dueño a mano.

export const RUTAS_SENSIBLES = [
  { prefijo: ".github/", motivo: "workflows y configuración de GitHub (el CI y este pipeline)" },
  { prefijo: "scripts/publicar/", motivo: "el propio pipeline de publicación" },
  { prefijo: "scripts/release/", motivo: "vallas del CI (tren de releases y checklist del Gate)" },
  { exacta: "scripts/vercel-build.mjs", motivo: "el build de producción (migra la base)" },
  { exacta: "scripts/vercel-ignore.mjs", motivo: "decide si Vercel construye" },
  { exacta: "scripts/predeploy-check.mts", motivo: "frenos del build de producción" },
  { exacta: "scripts/preview-base.mjs", motivo: "build de producción/preview" },
  { exacta: "scripts/verify-gates.mjs", motivo: "vallas del CI" },
  { exacta: "scripts/visual-gate.mjs", motivo: "valla visual bloqueante" },
  { exacta: "prisma/rls/check-rls-live.mjs", motivo: "corre en el build con la cadena de migración" },
  { exacta: "vercel.json", motivo: "comando de build y crons de producción" },
  { exacta: "prisma/migrations/migration_lock.toml", motivo: "proveedor de migraciones" },
  { exacta: "prisma.config.ts", motivo: "dónde lee Prisma el schema y las migraciones" },
  { exacta: "tsconfig.json", motivo: "qué revisa la valla de tipos (tsc)" },
];

export function rutaSensible(ruta) {
  for (const r of RUTAS_SENSIBLES) {
    if (r.exacta && ruta === r.exacta) return r.motivo;
    if (r.prefijo && ruta.startsWith(r.prefijo)) return r.motivo;
  }
  return null;
}

/** Nombres que vienen del PR, para un comentario: sin backticks (rompen el formato) ni menciones. */
const s = (t) => String(t).replace(/`/g, "'").replace(/@/g, "@\u200b");

const RE_MIGRACION = /^prisma\/migrations\/([^/]+)\/migration\.sql$/;

/**
 * Clasifica los archivos del PR (forma de la API `GET /pulls/{n}/files`:
 * { filename, status, previous_filename? }).
 * @param {Array<{filename:string,status:string,previous_filename?:string}>} archivos
 * @param {string[]} migracionesEnMain nombres de carpeta ya presentes en main
 * @returns {{ bloqueos: string[], avisos: string[], nuevas: string[], tocaSchema: boolean, tocaPackageJson: boolean }}
 */
export function clasificarArchivos(archivos, migracionesEnMain = []) {
  const bloqueos = [];
  const avisos = [];
  const nuevas = [];
  let tocaSchema = false;
  let tocaPackageJson = false;
  const ultimaEnMain = [...migracionesEnMain].filter((m) => /^\d{14}_/.test(m)).sort().at(-1) ?? "";

  for (const a of archivos) {
    const rutas = [a.filename, a.previous_filename].filter(Boolean);
    for (const r of rutas) {
      const motivo = rutaSensible(r);
      if (motivo) bloqueos.push(`\`${s(r)}\` (${s(a.status)}): ${motivo}. Este PR lo publica el dueño a mano.`);
    }
    if (rutas.includes("prisma/schema.prisma")) tocaSchema = true;
    if (rutas.includes("package.json")) tocaPackageJson = true;

    const enMigraciones = rutas.filter((r) => r.startsWith("prisma/migrations/") && r !== "prisma/migrations/migration_lock.toml");
    if (enMigraciones.length === 0) continue;

    const m = RE_MIGRACION.exec(a.filename);
    if (a.status === "added" && m && !a.previous_filename) {
      const carpeta = m[1];
      if (migracionesEnMain.includes(carpeta)) {
        bloqueos.push(`\`${s(a.filename)}\`: la carpeta \`${s(carpeta)}\` ya existe en main.`);
        continue;
      }
      nuevas.push(carpeta);
      if (!/^\d{14}_[A-Za-z0-9_]+$/.test(carpeta))
        avisos.push(`\`${s(carpeta)}\`: el nombre no sigue el formato \`AAAAMMDDhhmmss_nombre\`.`);
      else if (ultimaEnMain && carpeta <= ultimaEnMain)
        avisos.push(`\`${s(carpeta)}\` es anterior a la última de main (\`${ultimaEnMain}\`): se aplica igual, pero fuera de orden.`);
      continue;
    }
    if (a.status === "added") {
      avisos.push(`\`${s(a.filename)}\`: archivo nuevo en prisma/migrations que no es un migration.sql (Prisma lo ignora).`);
      continue;
    }
    // Modificar, borrar o renombrar una migración que ya existe: lo aplicado en producción y lo
    // que dice el repo dejan de coincidir. Nunca se publica solo.
    bloqueos.push(
      `\`${s(a.previous_filename ?? a.filename)}\`${a.previous_filename ? ` → \`${s(a.filename)}\`` : ""} (${s(a.status)}): cambia una migración existente. Lo aplicado en producción no se reescribe.`,
    );
  }
  return { bloqueos, avisos, nuevas: [...new Set(nuevas)].sort(), tocaSchema, tocaPackageJson };
}

/** Las líneas útiles de prisma/lote-deploy.txt (sin comentarios ni vacías). */
export function leerLote(texto) {
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"));
}

/**
 * Compara `scripts` (y la config `prisma`) de package.json entre main y el PR: el CI corre
 * `npm test`, `postinstall`, etc. Cambiarlos puede vaciar una valla sin tocar ningún workflow.
 * @returns {string | null} motivo del bloqueo, o null si no cambian.
 */
export function cambioDeScripts(pkgMainTexto, pkgPrTexto) {
  let a;
  let b;
  try {
    a = JSON.parse(pkgMainTexto);
    b = JSON.parse(pkgPrTexto);
  } catch {
    return "package.json no se puede leer como JSON.";
  }
  for (const campo of ["scripts", "prisma", "workspaces", "overrides"]) {
    if (JSON.stringify(ordenar(a?.[campo])) !== JSON.stringify(ordenar(b?.[campo])))
      return `package.json cambia \`${campo}\` (lo que corre el CI y el build). Este PR lo publica el dueño a mano.`;
  }
  return null;
}

function ordenar(v) {
  if (Array.isArray(v)) return v.map(ordenar);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordenar(v[k])]));
  return v;
}
