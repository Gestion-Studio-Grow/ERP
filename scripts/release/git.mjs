// Lecturas de git para los CLI del tren de releases. Sin shell (argumentos como lista), sólo
// lectura salvo `crearTagLocal`, que crea un tag ANOTADO LOCAL y nunca lo pushea.

import { spawnSync } from "node:child_process";

/** Corre git y devuelve stdout (trim). Lanza si git falla. */
export function git(args, { cwd = process.cwd(), permitirFalla = false } = {}) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    if (permitirFalla) return null;
    throw new Error(`git ${args[0]} falló: ${(r.stderr || "").trim().split("\n")[0]}`);
  }
  return r.stdout.trim();
}

/** ¿Existe la referencia? */
export function existeRef(ref, opts) {
  return git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { ...opts, permitirFalla: true }) !== null;
}

export function tags(opts) {
  return (git(["tag", "--list"], opts) ?? "").split("\n").filter(Boolean);
}

const SEP_CAMPO = "\x1f";
const SEP_COMMIT = "\x1e";

/** Commits de `desde..hasta` (o toda la historia si `desde` es null), del más nuevo al más viejo. */
export function commits(desde, hasta = "HEAD", opts) {
  const rango = desde ? `${desde}..${hasta}` : hasta;
  const salida = git(["log", "--no-color", `--format=%H${SEP_CAMPO}%s${SEP_CAMPO}%b${SEP_COMMIT}`, rango], opts);
  return salida
    .split(SEP_COMMIT)
    .map((b) => b.replace(/^\n/, ""))
    .filter((b) => b.trim() !== "")
    .map((b) => {
      const [hash, asunto, cuerpo] = b.split(SEP_CAMPO);
      return { hash: hash.trim(), asunto: asunto ?? "", cuerpo: cuerpo ?? "" };
    });
}

/**
 * URL pública del repo para los links de las notas. Nunca imprime credenciales: sólo acepta un
 * remoto de github.com y arma la URL desde dueño/repo. En CI usa las variables de GitHub.
 */
export function urlDelRepo(opts) {
  if (process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY) {
    return `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}`;
  }
  const remoto = git(["remote", "get-url", "origin"], { ...opts, permitirFalla: true }) ?? "";
  const m = /github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(remoto);
  if (m) return `https://github.com/${m[1]}/${m[2]}`;
  // Remoto detrás de un proxy local (sesiones de agente): la ruta termina en dueño/repo.
  const p = /\/git\/([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(remoto);
  return p ? `https://github.com/${p[1]}/${p[2]}` : null;
}

/** Crea un tag anotado LOCAL. No pushea: publicar el tag es decisión del dueño. */
export function crearTagLocal(tag, mensaje, opts) {
  git(["tag", "-a", tag, "-m", mensaje], opts);
}
