// Piezas puras del pipeline de publicación (sin red): nombres, títulos y lectura de estados.

/** respaldo-pre-pr-<n>-<AAAAMMDD-hhmmss> (UTC). La hora evita choques si se reintenta el mismo día. */
export function nombreRespaldo(pr, fecha = new Date()) {
  const n = Number(pr);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`número de PR inválido: ${pr}`);
  const iso = fecha.toISOString(); // 2026-11-08T15:30:12.345Z
  const f = `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}`;
  return `respaldo-pre-pr-${n}-${f}`;
}

/**
 * Título del commit de merge. Se quitan las marcas que scripts/vercel-ignore.mjs lee del mensaje
 * ([sin-deploy], [preview]): un merge publicado por el pipeline SIEMPRE construye en Vercel.
 */
export function tituloMerge(pr, titulo) {
  const limpio = String(titulo ?? "")
    .replace(/\[\s*sin-deploy\s*\]/gi, "")
    .replace(/\[\s*preview\s*\]/gi, "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return `Merge PR #${pr}: ${limpio || "(sin título)"}`.slice(0, 250);
}

const EN_CURSO = new Set(["BUILDING", "QUEUED", "INITIALIZING"]);

/**
 * Producción sana antes de publicar: el último deploy de producción que no fue cancelado tiene que
 * estar READY. Uno en curso o en ERROR frena («rojo vigente»: no se apila otro encima).
 * @param {Array<{uid:string, state?:string, readyState?:string, created:number}>} deploys
 * @returns {{ ok: boolean, motivo: string, deploy?: object }}
 */
export function evaluarProduccion(deploys) {
  const orden = [...deploys].sort((a, b) => b.created - a.created);
  for (const d of orden) {
    const st = d.state ?? d.readyState;
    if (st === "CANCELED") continue;
    if (st === "READY") return { ok: true, motivo: `último deploy de producción READY (${d.uid})`, deploy: d };
    if (EN_CURSO.has(st)) return { ok: false, motivo: `hay un deploy de producción en curso (${d.uid}, ${st}): uno a la vez`, deploy: d };
    return { ok: false, motivo: `el último deploy de producción está en ${st} (${d.uid}): hay un rojo vigente, se para`, deploy: d };
  }
  return { ok: false, motivo: "no se encontró ningún deploy de producción para comparar" };
}

/** El deploy de producción del commit pedido (el más nuevo si hay varios). */
export function deployDelCommit(deploys, sha) {
  return (
    [...deploys]
      .filter((d) => (d.meta?.githubCommitSha ?? "") === sha)
      .sort((a, b) => b.created - a.created)[0] ?? null
  );
}

/** Estado de un deploy: "ok" (READY), "rojo" (ERROR/CANCELED) o "esperar". */
export function estadoDeploy(d) {
  const st = d?.state ?? d?.readyState;
  if (st === "READY") return "ok";
  if (st === "ERROR" || st === "CANCELED") return "rojo";
  return "esperar";
}

/** /api/health sirve el commit publicado y dice ok. */
export function saludOk(cuerpo, sha) {
  return !!cuerpo && cuerpo.status === "ok" && typeof cuerpo.commit === "string" && cuerpo.commit === sha;
}

/** Permisos de quien pone la etiqueta (GET /collaborators/{u}/permission). */
export function puedePublicar(permiso, usuario, permitidos) {
  const lista = String(permitidos ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (lista.length > 0 && !lista.includes(String(usuario).toLowerCase()))
    return { ok: false, motivo: `${usuario} no está en PUBLICAR_QUIENES` };
  const rol = permiso?.role_name ?? permiso?.permission;
  if (!["admin", "maintain", "write"].includes(rol)) return { ok: false, motivo: `${usuario} tiene permiso «${rol ?? "ninguno"}» en el repo (hace falta write o más)` };
  return { ok: true, motivo: `${usuario} (${rol})` };
}
