#!/usr/bin/env node
// ============================================================================
// PUBLICAR UN PR A PRODUCCIÓN — los pasos del workflow .github/workflows/publicar.yml.
// ============================================================================
//
// Uso (lo llama el workflow, un paso por vez):
//   node scripts/publicar/publicar.mjs <precondiciones|ci|cambios|respaldo|merge|vercel|comentar>
//
// Las reglas son las del dueño (Factory-GSG CLAUDE.md, «la orquestadora gestiona las cuentas» y
// «Autorización del dueño: publicar PR»): respaldo en Neon, CI igual que main, migraciones sólo
// aditivas (las aplica `prisma migrate deploy` dentro del build de Vercel), Vercel READY sin
// errores nuevos, un PR a la vez y, ante un rojo nuevo, se para y se comenta.
//
// Cada paso agrega su parte al informe ($PUBLICAR_INFORME) y sale con código 1 si frena; el
// workflow no corre los pasos siguientes y el último (`comentar`) publica el informe en el PR.
//
// SEGURIDAD: este script corre desde main (pull_request_target), NUNCA ejecuta código del PR:
// los archivos del PR se leen como texto por la API. Nunca imprime secretos.

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { analizarSql } from "./lib/sql.mjs";
import { clasificarArchivos, leerLote, cambioDeScripts } from "./lib/cambios.mjs";
import { compararJobs, ultimaPorEvento, elegirBaseMain } from "./lib/ci.mjs";
import {
  nombreRespaldo,
  tituloMerge,
  evaluarProduccion,
  deployDelCommit,
  estadoDeploy,
  saludOk,
  puedePublicar,
} from "./lib/util.mjs";

const env = process.env;
const PASO = process.argv[2];
const REPO = env.GITHUB_REPOSITORY;
const PR = Number(env.PR_NUMBER);
const RAMA = env.RAMA_BASE || "main";
const ETIQUETA = env.ETIQUETA || "gsg:publicar";
const INFORME = env.PUBLICAR_INFORME || "publicar-informe.md";
const MODO = (env.PUBLICAR_MODO || "").trim().toLowerCase() === "real" ? "real" : "simulacion";
const PROD_URL = (env.PROD_URL || "https://chestetica-erp.vercel.app").replace(/\/+$/, "");
const WORKFLOWS_CI = (env.CI_WORKFLOWS || "gates.yml,release.yml")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const minutos = (v, def) => (Number(v) > 0 ? Number(v) : def) * 60_000;
const ESPERA_CI = minutos(env.CI_ESPERA_MIN, 60);
const ESPERA_VERCEL = minutos(env.VERCEL_ESPERA_MIN, 45);
const SONDEO = Number(env.PUBLICAR_SONDEO_MS) > 0 ? Number(env.PUBLICAR_SONDEO_MS) : 30_000;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Informe ─────────────────────────────────────────────────────────────────
function anotar(linea = "") {
  appendFileSync(INFORME, `${linea}\n`);
  console.log(linea);
}
/** @returns {never} */
function frenar(motivo) {
  anotar(`\n**Frenado en «${PASO}»:** ${motivo}`);
  process.exit(1);
}
function salida(clave, valor) {
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `${clave}=${valor}\n`);
}

// ── HTTP ────────────────────────────────────────────────────────────────────
// GET se reintenta ante red/5xx/429; lo que escribe (POST/PUT) nunca, para no duplicar.
/**
 * @param {string} url
 * @param {{ token?: string, method?: string, body?: unknown, headers?: Record<string,string>, crudo?: boolean, permitir?: number[] }} [op]
 * @returns {Promise<{ status: number, json?: any, texto?: string }>}
 */
async function pedir(url, { token, method = "GET", body, headers = {}, crudo = false, permitir = [] } = {}) {
  const intentos = method === "GET" ? 4 : 1;
  let ultimo;
  for (let k = 1; k <= intentos; k++) {
    let r;
    try {
      r = await fetch(url, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      ultimo = `${method} ${redactar(url)}: ${e.message}`;
      if (k < intentos) await dormir(2000 * k);
      continue;
    }
    if (r.ok || permitir.includes(r.status)) {
      if (crudo) return { status: r.status, texto: await r.text() };
      const t = await r.text();
      let json = null;
      try {
        json = t ? JSON.parse(t) : null;
      } catch {
        json = null; // una página de error en HTML no es JSON: queda null y el paso decide
      }
      return { status: r.status, json };
    }
    const t = (await r.text()).slice(0, 300);
    ultimo = `${method} ${redactar(url)} → HTTP ${r.status}: ${t}`;
    if (!(r.status >= 500 || r.status === 429) || k === intentos) break;
    await dormir(2000 * k);
  }
  throw new Error(ultimo);
}
const redactar = (u) => String(u).replace(/([?&](?:token|key)=)[^&]+/gi, "$1***");

const GH = `${(env.GITHUB_API_URL || "https://api.github.com").replace(/\/+$/, "")}/repos/${REPO}`;
const ghHeaders = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
const gh = (ruta, op = {}) =>
  pedir(ruta.startsWith("http") ? ruta : `${GH}${ruta}`, {
    token: env.GH_TOKEN,
    ...op,
    headers: { ...ghHeaders, ...(op.headers ?? {}) },
  });
async function ghTodas(ruta, clave) {
  const out = [];
  for (let page = 1; page <= 40; page++) {
    const sep = ruta.includes("?") ? "&" : "?";
    const { json } = await gh(`${ruta}${sep}per_page=100&page=${page}`);
    const lista = clave ? json[clave] : json;
    out.push(...lista);
    if (lista.length < 100) break;
  }
  return out;
}
async function ghCrudo(ruta, ref) {
  const r = await gh(`/contents/${ruta.split("/").map(encodeURIComponent).join("/")}?ref=${ref}`, {
    headers: { Accept: "application/vnd.github.raw+json" },
    crudo: true,
  });
  return r.texto;
}

const vercelQS = () => (env.VERCEL_TEAM_ID ? `&teamId=${encodeURIComponent(env.VERCEL_TEAM_ID)}` : "");
const vercel = (ruta) => pedir(`${env.PUBLICAR_VERCEL_API || "https://api.vercel.com"}${ruta}`, { token: env.VERCEL_TOKEN });
async function deploysProduccion() {
  const { json } = await vercel(
    `/v6/deployments?projectId=${encodeURIComponent(env.VERCEL_PROJECT_ID)}&target=production&limit=20${vercelQS()}`,
  );
  return json.deployments ?? [];
}

const NEON = `${env.PUBLICAR_NEON_API || "https://console.neon.tech/api/v2"}/projects/${encodeURIComponent(env.NEON_PROJECT_ID ?? "")}`;
const neon = (ruta, op = {}) =>
  pedir(`${NEON}${ruta}`, { token: env.NEON_API_KEY, ...op, headers: { Accept: "application/json" } });

async function salud() {
  const r = await pedir(`${PROD_URL}/api/health?publicar=${Date.now()}`, {
    headers: { "Cache-Control": "no-cache" },
    permitir: [500, 502, 503, 504],
  });
  return r;
}

// ── Pasos ───────────────────────────────────────────────────────────────────
const pasos = {
  async precondiciones() {
    anotar(`### Publicación del PR #${PR} — modo **${MODO === "real" ? "REAL" : "SIMULACIÓN"}**`);
    anotar(`Corrida: ${env.GITHUB_SERVER_URL}/${REPO}/actions/runs/${env.GITHUB_RUN_ID}\n`);
    if (/^(1|true|si|sí|yes)$/i.test((env.PUBLICAR_PAUSADO || "").trim()))
      frenar("la publicación automática está pausada (variable de repo PUBLICAR_PAUSADO).");

    const faltan = ["NEON_API_KEY", "NEON_PROJECT_ID", "VERCEL_TOKEN", "VERCEL_PROJECT_ID", "PUBLICAR_GH_TOKEN"].filter(
      (k) => !(env[k] ?? "").trim(),
    );
    if (faltan.length) frenar(`faltan secretos del repo: ${faltan.join(", ")} (ver docs/operacion/publicar-por-actions.md).`);

    const quien = env.SENDER;
    const { json: permiso } = await gh(`/collaborators/${encodeURIComponent(quien)}/permission`);
    const p = puedePublicar(permiso, quien, env.PUBLICAR_QUIENES);
    if (!p.ok) frenar(`quien puso la etiqueta no puede publicar: ${p.motivo}.`);
    anotar(`- Etiqueta puesta por ${p.motivo}.`);

    let pr;
    for (let k = 0; k < 6; k++) {
      ({ json: pr } = await gh(`/pulls/${PR}`));
      if (pr.mergeable !== null) break;
      await dormir(5000);
    }
    if (pr.state !== "open") frenar(`el PR está ${pr.state}.`);
    if (pr.draft) frenar("el PR es borrador.");
    if (pr.base.ref !== RAMA) frenar(`el PR apunta a \`${pr.base.ref}\`, no a \`${RAMA}\`.`);
    if (pr.head.repo?.full_name !== REPO) frenar("el PR viene de un fork: no se publica automáticamente.");
    if (!(pr.labels ?? []).some((l) => l.name === ETIQUETA)) frenar(`el PR ya no tiene la etiqueta ${ETIQUETA}.`);
    if (pr.mergeable !== true) frenar(`GitHub no lo puede mergear (mergeable=${pr.mergeable}, estado=${pr.mergeable_state}).`);

    const headSha = pr.head.sha;
    const { json: ref } = await gh(`/git/ref/heads/${encodeURIComponent(RAMA)}`);
    const baseSha = ref.object.sha;
    const { json: cmp } = await gh(`/compare/${baseSha}...${headSha}`);
    if (cmp.behind_by !== 0)
      frenar(`la rama está ${cmp.behind_by} commit(s) atrás de \`${RAMA}\`: actualizala con ${RAMA} para que el CI pruebe exactamente lo que se publica.`);
    anotar(`- PR al día con \`${RAMA}\` (${baseSha.slice(0, 7)}); se publica el commit ${headSha.slice(0, 7)}.`);
    salida("head_sha", headSha);
    salida("base_sha", baseSha);

    const prod = evaluarProduccion(await deploysProduccion());
    if (!prod.ok) frenar(`producción: ${prod.motivo}.`);
    anotar(`- Producción: ${prod.motivo}.`);
    const s = await salud();
    if (s.status !== 200 || s.json?.status !== "ok") frenar(`producción no responde sana: ${PROD_URL}/api/health → HTTP ${s.status}.`);
    anotar(`- ${PROD_URL}/api/health OK (commit ${String(s.json.commit).slice(0, 7)}).`);
  },

  async ci() {
    const sha = env.HEAD_SHA;
    const baseSha = env.BASE_SHA;
    const limite = Date.now() + ESPERA_CI;
    const heredados = [];
    const nuevos = [];
    const avisos = [];
    for (const wf of WORKFLOWS_CI) {
      for (;;) {
        const corridasPr = ultimaPorEvento(
          (await gh(`/actions/workflows/${wf}/runs?head_sha=${sha}&per_page=50`)).json.workflow_runs ?? [],
          sha,
        );
        const base = elegirBaseMain(
          (await gh(`/actions/workflows/${wf}/runs?branch=${encodeURIComponent(RAMA)}&event=push&per_page=30`)).json
            .workflow_runs ?? [],
          baseSha,
        );
        const enCurso = corridasPr.length === 0 || corridasPr.some((c) => c.status !== "completed") || base.esperar;
        if (enCurso) {
          if (Date.now() > limite)
            frenar(
              corridasPr.length === 0
                ? `\`${wf}\` no corrió sobre ${sha.slice(0, 7)} en ${ESPERA_CI / 60000} min.`
                : `\`${wf}\` no terminó en ${ESPERA_CI / 60000} min (PR o main).`,
            );
          console.log(`… esperando ${wf}`);
          await dormir(SONDEO);
          continue;
        }
        if (base.aviso) avisos.push(`\`${wf}\`: ${base.aviso}`);
        const jobsMain = base.corrida
          ? await ghTodas(`/actions/runs/${base.corrida.id}/jobs?filter=latest`, "jobs")
          : [];
        let pendiente = false;
        const parcialNuevos = [];
        const parcialHeredados = [];
        for (const c of corridasPr) {
          const jobs = await ghTodas(`/actions/runs/${c.id}/jobs?filter=latest`, "jobs");
          const r = compararJobs(jobs, jobsMain, { mismoEvento: c.event === "push" });
          if (r.pendientes.length) pendiente = true;
          for (const x of r.nuevos) parcialNuevos.push(`\`${wf}\` (${c.event}) ${x} — ${c.html_url}`);
          for (const x of r.heredados) parcialHeredados.push(`\`${wf}\` (${c.event}) ${x}`);
        }
        if (pendiente && Date.now() <= limite) {
          await dormir(SONDEO);
          continue;
        }
        if (pendiente) parcialNuevos.push(`\`${wf}\`: quedan jobs sin terminar.`);
        nuevos.push(...parcialNuevos);
        heredados.push(...parcialHeredados);
        anotar(`- CI \`${wf}\`: ${corridasPr.map((c) => `${c.event} ${c.conclusion}`).join(", ")}; base main ${base.corrida ? base.corrida.head_sha.slice(0, 7) : "—"}.`);
        break;
      }
    }
    for (const a of avisos) anotar(`- Aviso: ${a}`);
    for (const h of heredados) anotar(`- Rojo heredado de main (no frena): ${h}`);
    if (nuevos.length) frenar(`el CI del PR tiene rojos que main no tiene:\n${nuevos.map((n) => `  - ${n}`).join("\n")}`);
    anotar("- CI igual que main: sin rojos nuevos.");
  },

  async cambios() {
    const sha = env.HEAD_SHA;
    const baseSha = env.BASE_SHA;
    const archivos = await ghTodas(`/pulls/${PR}/files`);
    if (archivos.length >= 3000) frenar("el PR tiene 3000 archivos o más: la API no los lista todos, no se puede revisar.");
    const { json: dir } = await gh(`/contents/prisma/migrations?ref=${baseSha}`);
    const enMain = (dir ?? []).filter((e) => e.type === "dir").map((e) => e.name);
    const c = clasificarArchivos(archivos, enMain);
    const bloqueos = [...c.bloqueos];
    const avisos = [...c.avisos];

    if (c.tocaPackageJson) {
      const motivo = cambioDeScripts(await ghCrudo("package.json", baseSha), await ghCrudo("package.json", sha));
      if (motivo) bloqueos.push(motivo);
    }
    if (c.tocaSchema && c.nuevas.length === 0)
      avisos.push("cambia `prisma/schema.prisma` sin migración nueva (si cambia el modelo de datos, falta la migración).");

    for (const m of c.nuevas) {
      const sql = await ghCrudo(`prisma/migrations/${m}/migration.sql`, sha);
      const r = analizarSql(sql);
      anotar(`- Migración nueva \`${m}\`: ${r.bloqueos.length ? "**NO ADITIVA**" : "aditiva"}${r.rlsNuevas.length ? ` (RLS por tenant en ${r.rlsNuevas.length} tabla(s) nueva(s))` : ""}.`);
      for (const b of r.bloqueos) bloqueos.push(`\`${m}\` línea ${b.linea} — ${b.regla}: ${b.motivo}. \`${b.fragmento}\``);
      for (const a of r.avisos) avisos.push(`\`${m}\` línea ${a.linea} — ${a.regla}: ${a.motivo}.`);
    }
    if (c.nuevas.length) {
      const lote = leerLote(await ghCrudo("prisma/lote-deploy.txt", sha));
      const fuera = c.nuevas.filter((m) => !lote.includes(m));
      if (fuera.length)
        bloqueos.push(
          `migración(es) nueva(s) que no están en \`prisma/lote-deploy.txt\`: ${fuera.join(", ")}. El build de producción frenaría (paso 1b) con main ya mergeado.`,
        );
      const { json } = await vercel(`/v9/projects/${encodeURIComponent(env.VERCEL_PROJECT_ID)}/env?${vercelQS().slice(1)}`);
      const tiene = (json.envs ?? []).some(
        (e) => e.key === "MIGRATE_DATABASE_URL" && [].concat(e.target ?? []).includes("production"),
      );
      if (!tiene)
        bloqueos.push(
          "hay migraciones nuevas y Vercel Production no tiene `MIGRATE_DATABASE_URL`: el build frenaría con la base atrasada.",
        );
    } else anotar("- Sin migraciones nuevas.");

    for (const a of avisos) anotar(`- Aviso: ${a}`);
    if (bloqueos.length)
      frenar(`el PR no se publica solo (owner-level o no aditivo):\n${bloqueos.map((b) => `  - ${b}`).join("\n")}`);
    anotar("- Cambios: nada sensible, migraciones aditivas.");
    salida("migraciones", c.nuevas.join(" "));
  },

  async respaldo() {
    const nombre = nombreRespaldo(PR);
    let padre = (env.NEON_BRANCH_ID || "").trim();
    if (!padre) {
      const { json } = await neon("/branches");
      const def = (json.branches ?? []).find((b) => b.default === true || b.primary === true);
      if (!def) frenar("no se encontró la rama por defecto del proyecto de Neon (configurá NEON_BRANCH_ID).");
      padre = def.id;
    }
    if (MODO !== "real") {
      await neon(`/branches/${encodeURIComponent(padre)}`);
      anotar(`- SIMULACIÓN: Neon accesible; se crearía la rama \`${nombre}\` desde ${padre}.`);
      return;
    }
    const { json } = await neon("/branches", { method: "POST", body: { branch: { name: nombre, parent_id: padre } } });
    const rama = json.branch;
    const ops = (json.operations ?? []).map((o) => o.id);
    const limite = Date.now() + 10 * 60_000;
    for (const id of ops) {
      for (;;) {
        const { json: o } = await neon(`/operations/${id}`);
        const st = o.operation?.status;
        if (st === "finished" || st === "skipped") break;
        if (st === "failed" || st === "error" || st === "cancelled")
          frenar(`la operación de Neon ${id} terminó en ${st}: no hay respaldo, no se publica.`);
        if (Date.now() > limite) frenar("Neon no terminó de crear el respaldo en 10 min: no se publica.");
        await dormir(3000);
      }
    }
    const { json: ver } = await neon(`/branches/${encodeURIComponent(rama.id)}`);
    if (ver.branch?.name !== nombre) frenar("el respaldo de Neon no quedó con el nombre esperado.");
    anotar(`- Respaldo Neon: rama \`${nombre}\` (${rama.id}) desde ${padre}.`);
    salida("respaldo", nombre);
  },

  async merge() {
    const sha = env.HEAD_SHA;
    const baseSha = env.BASE_SHA;
    if (MODO !== "real") {
      anotar(`- SIMULACIÓN: no se mergea. Se habría mergeado ${sha.slice(0, 7)} sobre ${baseSha.slice(0, 7)}.`);
      return;
    }
    const { json: pr } = await gh(`/pulls/${PR}`);
    if (pr.state !== "open") frenar(`el PR pasó a ${pr.state} durante la publicación.`);
    if (!(pr.labels ?? []).some((l) => l.name === ETIQUETA)) frenar("se quitó la etiqueta durante la publicación: se cancela.");
    if (pr.head.sha !== sha) frenar("el PR recibió commits nuevos durante la publicación: hay que volver a etiquetarlo.");
    const { json: ref } = await gh(`/git/ref/heads/${encodeURIComponent(RAMA)}`);
    if (ref.object.sha !== baseSha) frenar(`\`${RAMA}\` se movió durante la publicación: hay que actualizar la rama y volver a etiquetar.`);

    const titulo = tituloMerge(PR, pr.title);
    const r = await pedir(`${GH}/pulls/${PR}/merge`, {
      token: env.PUBLICAR_GH_TOKEN,
      method: "PUT",
      headers: ghHeaders,
      body: {
        sha,
        merge_method: "merge",
        commit_title: titulo,
        commit_message: `Publicado por publicar.yml (${env.GITHUB_SERVER_URL}/${REPO}/actions/runs/${env.GITHUB_RUN_ID}).\nRespaldo Neon: ${env.RESPALDO || "—"}.`,
      },
    }).catch((e) => frenar(`GitHub rechazó el merge: ${e.message}`));
    if (!r.json?.merged) frenar(`GitHub no mergeó: ${r.json?.message ?? "sin detalle"}.`);
    const mergeSha = r.json.sha;
    salida("merge_sha", mergeSha);
    const { json: commit } = await gh(`/commits/${mergeSha}`);
    const padres = (commit.parents ?? []).map((p) => p.sha);
    if (padres.length !== 2 || padres[0] !== baseSha || padres[1] !== sha)
      frenar(`el commit de merge ${mergeSha.slice(0, 7)} no tiene los padres esperados (${padres.map((p) => p.slice(0, 7)).join(", ")}). Revisar main a mano.`);
    anotar(`- Mergeado: ${mergeSha.slice(0, 7)} en \`${RAMA}\`.`);
  },

  async vercel() {
    if (MODO !== "real") {
      anotar("- SIMULACIÓN: no hay deploy que esperar.");
      return;
    }
    const sha = env.MERGE_SHA;
    if (!sha) frenar("no hay commit de merge.");
    const inicio = Date.now();
    const limite = inicio + ESPERA_VERCEL;
    let d = null;
    for (;;) {
      d = deployDelCommit(await deploysProduccion(), sha);
      if (!d && Date.now() - inicio > 10 * 60_000)
        frenar(`Vercel no arrancó ningún deploy de producción para ${sha.slice(0, 7)} en 10 min. **El merge ya está en ${RAMA}**; producción sigue con el deploy anterior.`);
      const st = d ? estadoDeploy(d) : "esperar";
      if (st === "ok") break;
      if (st === "rojo")
        frenar(`el deploy de Vercel ${d.uid} terminó en ${d.state ?? d.readyState} (${d.inspectorUrl ?? "sin enlace"}). **El merge ya está en ${RAMA}**; producción sigue sirviendo el deploy anterior. Respaldo Neon: \`${env.RESPALDO || "—"}\`. El próximo PR etiquetado va a frenar hasta que esto se resuelva.`);
      if (Date.now() > limite) frenar(`el deploy de Vercel no llegó a READY en ${ESPERA_VERCEL / 60000} min.`);
      await dormir(SONDEO);
    }
    anotar(`- Vercel: deploy ${d.uid} READY.`);
    // «Sin errores nuevos»: el dominio de producción sirve ESTE commit y la app responde con base.
    const limiteSalud = Date.now() + 5 * 60_000;
    for (;;) {
      const s = await salud().catch(() => null);
      if (s && s.status === 200 && saludOk(s.json, sha)) break;
      if (Date.now() > limiteSalud)
        frenar(`${PROD_URL}/api/health no muestra el commit ${sha.slice(0, 7)} sano (HTTP ${s?.status ?? "—"}, commit ${String(s?.json?.commit ?? "—").slice(0, 7)}).`);
      await dormir(10_000);
    }
    const listo = await pedir(`${PROD_URL}/api/ready?publicar=${Date.now()}`, { permitir: [503] }).catch((e) => ({ status: 0, err: e.message }));
    if (listo.status !== 200) frenar(`${PROD_URL}/api/ready → HTTP ${listo.status}: la app publicada no llega a la base.`);
    anotar(`- ${PROD_URL} sirve ${sha.slice(0, 7)}: /api/health y /api/ready OK.`);
  },

  async comentar() {
    const estado = env.JOB_STATUS || "failure";
    const cuerpoInforme = existsSync(INFORME) ? readFileSync(INFORME, "utf8") : "(sin informe)";
    let titulo;
    if (estado === "success") titulo = MODO === "real" ? "PUBLICADO en producción" : "SIMULACIÓN OK (no se publicó nada)";
    else if (estado === "cancelled") titulo = "CANCELADO (la corrida se interrumpió)";
    else titulo = "FRENADO: no se publicó";
    const cuerpo = `## publicar.yml — ${titulo}\n\n${cuerpoInforme}\n\n<sub>Para reintentar: corregir lo indicado y volver a poner la etiqueta \`${ETIQUETA}\`.</sub>`;
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, cuerpo);
    await gh(`/issues/${PR}/comments`, { method: "POST", body: { body: cuerpo.slice(0, 65000) } });
    await gh(`/issues/${PR}/labels/${encodeURIComponent(ETIQUETA)}`, { method: "DELETE", permitir: [404] }).catch((e) =>
      console.log(`no se pudo quitar la etiqueta: ${e.message}`),
    );
  },
};

if (!pasos[PASO]) {
  console.error(`paso desconocido: ${PASO}. Pasos: ${Object.keys(pasos).join(", ")}`);
  process.exit(2);
}
if (!REPO || !Number.isInteger(PR) || PR <= 0) {
  console.error("faltan GITHUB_REPOSITORY o PR_NUMBER");
  process.exit(2);
}
try {
  await pasos[PASO]();
} catch (e) {
  frenar(`error inesperado: ${e.message}`);
}
