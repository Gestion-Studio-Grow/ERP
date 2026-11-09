// ============================================================================
// «CI igual que main»: el PR no puede tener un rojo que main no tenga.
// ============================================================================
//
// Se compara job por job (por nombre) cada corrida del PR contra la última corrida de main del
// mismo workflow. Un job rojo en el PR que en main también está rojo (deuda, p. ej. lint) es
// «heredado»: se informa y no frena. Todo lo demás frena:
//   · un job rojo (failure, cancelled, timed_out, …) que en main está verde o no existe;
//   · un job que en main corre y en el PR NO aparece (alguien lo sacó o lo salteó);
//   · un job salteado en el PR que en main corre verde (sólo para corridas del mismo evento).

const VERDES = new Set(["success", "neutral"]);

/**
 * @typedef {{ name: string, status: string, conclusion: string | null }} Job
 * @param {Job[]} jobsPr
 * @param {Job[]} jobsMain
 * @param {{ mismoEvento?: boolean }} [opciones] mismoEvento=true cuando la corrida del PR es del
 *   mismo evento que la de main (push): ahí un job ausente o salteado cuenta como rojo.
 * @returns {{ pendientes: string[], nuevos: string[], heredados: string[], verdes: string[] }}
 */
export function compararJobs(jobsPr, jobsMain, opciones = {}) {
  const mismoEvento = opciones.mismoEvento ?? true;
  const main = new Map();
  for (const j of jobsMain) main.set(j.name, j);
  const vistos = new Set();
  const pendientes = [];
  const nuevos = [];
  const heredados = [];
  const verdes = [];

  const nombres = new Map();
  for (const j of jobsPr) nombres.set(j.name, (nombres.get(j.name) ?? 0) + 1);

  for (const j of jobsPr) {
    vistos.add(j.name);
    if (nombres.get(j.name) > 1) {
      nuevos.push(`«${j.name}»: hay ${nombres.get(j.name)} jobs con el mismo nombre; no se puede comparar sin ambigüedad.`);
      nombres.set(j.name, 0);
      continue;
    }
    if (nombres.get(j.name) === 0) continue;
    if (j.status !== "completed") {
      pendientes.push(j.name);
      continue;
    }
    const m = main.get(j.name);
    const mVerde = m && m.status === "completed" && VERDES.has(m.conclusion ?? "");
    if (VERDES.has(j.conclusion ?? "")) {
      verdes.push(j.name);
      continue;
    }
    if (j.conclusion === "skipped") {
      if (mismoEvento && mVerde) nuevos.push(`«${j.name}»: salteado en el PR, en main corre en verde.`);
      else verdes.push(`${j.name} (salteado)`);
      continue;
    }
    // Rojo. ¿Main tiene el mismo rojo?
    const mRojo = m && m.status === "completed" && !VERDES.has(m.conclusion ?? "") && m.conclusion !== "skipped";
    if (mRojo) heredados.push(`«${j.name}»: ${j.conclusion} (en main también: ${m.conclusion}).`);
    else nuevos.push(`«${j.name}»: ${j.conclusion ?? "sin conclusión"}${m ? ` (en main: ${m.conclusion ?? m.status})` : " (no existe en main)"}.`);
  }
  if (mismoEvento) {
    for (const [nombre, m] of main) {
      if (vistos.has(nombre)) continue;
      if (m.conclusion === "skipped") continue;
      nuevos.push(`«${nombre}»: corre en main y no aparece en el PR.`);
    }
  }
  return { pendientes, nuevos, heredados, verdes };
}

/**
 * De las corridas de un workflow para el commit del PR, la última de cada evento.
 * @param {Array<{id:number, event:string, head_sha:string, created_at:string, run_attempt?:number}>} corridas
 */
export function ultimaPorEvento(corridas, sha) {
  const porEvento = new Map();
  for (const c of corridas) {
    if (c.head_sha !== sha) continue;
    if (c.event !== "push" && c.event !== "pull_request") continue;
    const prev = porEvento.get(c.event);
    if (!prev || c.created_at > prev.created_at || (c.created_at === prev.created_at && c.id > prev.id)) porEvento.set(c.event, c);
  }
  return [...porEvento.values()];
}

/**
 * La corrida de main que sirve de base: la del commit de main si ya terminó; si no, la última
 * terminada de main (con aviso). `null` si la del commit está en curso (hay que esperar).
 * @returns {{ corrida: object | null, esperar: boolean, aviso: string | null }}
 */
export function elegirBaseMain(corridasMain, shaMain) {
  const push = corridasMain.filter((c) => c.event === "push").sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const delCommit = push.find((c) => c.head_sha === shaMain);
  if (delCommit) {
    if (delCommit.status !== "completed") return { corrida: null, esperar: true, aviso: null };
    return { corrida: delCommit, esperar: false, aviso: null };
  }
  const ultima = push.find((c) => c.status === "completed");
  if (!ultima) return { corrida: null, esperar: false, aviso: "main no tiene ninguna corrida terminada de este workflow" };
  return {
    corrida: ultima,
    esperar: false,
    aviso: `no hay corrida del commit actual de main (${shaMain.slice(0, 7)}); se compara contra la última terminada (${ultima.head_sha.slice(0, 7)}).`,
  };
}
