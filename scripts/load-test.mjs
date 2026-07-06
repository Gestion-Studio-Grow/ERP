// ============================================================================
// PRUEBA DE CARGA / STRESS — Célula 2 (Confiabilidad)
// ============================================================================
//   node scripts/load-test.mjs [--url http://localhost:3000] [--stages 5,10,25,50,100]
//                              [--seconds 15] [--p95 800] [--errRate 0.02]
//
// Qué hace: somete las RUTAS CRÍTICAS de lectura a carga concurrente creciente
// (rampa de "usuarios virtuales") y mide, por escalón, latencia p50/p95/p99,
// throughput y tasa de error. Reporta EN QUÉ ESCALÓN se rompe según umbrales
// (p95 o tasa de error superados) → ese es "a qué carga se rompe".
//
// Zero-dep: usa `fetch` nativo (Node ≥18). No instala nada.
//
// ⛔ NUNCA contra producción. El target por defecto es localhost. Si la URL
// apunta a un dominio que parece prod (.netlify.app / dominio real), ABORTA salvo
// que se pase LOAD_TEST_ALLOW_PROD=1 explícito. Correr esto contra prod en el plan
// free de Neon quema compute y afecta a tenants reales (CH, Magra). Correlo contra
// LOCAL o contra el ambiente de STAGING (branch de Neon) — ver
// docs/runbooks/hardening-produccion.md §1.
//
// Sólo GETs idempotentes: no crea turnos ni ventas (no ensucia datos). Para probar
// escritura, hacerlo contra staging con un script dedicado y limpieza posterior.
// ============================================================================

// ── Parseo de flags ──────────────────────────────────────────────────────────
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const BASE = arg("url", process.env.LOAD_TEST_URL ?? "http://localhost:3000").replace(/\/$/, "");
const STAGES = arg("stages", "5,10,25,50,100").split(",").map((n) => parseInt(n, 10));
const SECONDS = parseInt(arg("seconds", "15"), 10);
const P95_BUDGET_MS = parseInt(arg("p95", "800"), 10);
const ERR_BUDGET = parseFloat(arg("errRate", "0.02")); // 2%

// Rutas críticas (GET). Ajustá según lo que exponga el tenant bajo prueba.
// - /api/health: liveness del proceso (piso de latencia, sin DB).
// - /: landing / home (SSR con branding por tenant → toca DB por request).
// - /reserva: agenda/turnos (ruta caliente del vertical estética).
// - /tienda: vidriera retail (ruta caliente del vertical mostrador/Magra).
const ROUTES = (arg("routes", "/api/health,/,/reserva,/tienda")).split(",");

// ── Guarda anti-producción ────────────────────────────────────────────────────
function looksLikeProd(url) {
  const h = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0") return false;
  // Cualquier host no-local se trata como potencialmente prod/compartido.
  return true;
}
if (looksLikeProd(BASE) && process.env.LOAD_TEST_ALLOW_PROD !== "1") {
  console.error(
    `⛔ El target (${BASE}) no es local. Cargar prod/staging compartido puede afectar\n` +
      "   tenants reales y quemar compute de Neon (plan free). Si es un ambiente de\n" +
      "   prueba dedicado y estás seguro, reejecutá con LOAD_TEST_ALLOW_PROD=1.",
  );
  process.exit(2);
}

// ── Percentiles ───────────────────────────────────────────────────────────────
function pct(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Math.round(sorted[idx]);
}

// Un "usuario virtual": pega en bucle a una ruta al azar durante `untilMs`.
async function virtualUser(untilMs, latencies, counters) {
  while (Date.now() < untilMs) {
    const route = ROUTES[Math.floor(Math.random() * ROUTES.length)];
    const t0 = Date.now();
    try {
      const res = await fetch(BASE + route, { redirect: "manual" });
      const dt = Date.now() - t0;
      latencies.push(dt);
      counters.total++;
      // 2xx y 3xx (redirect de auth) cuentan como OK a nivel infra; 5xx = error.
      if (res.status >= 500) counters.errors++;
    } catch {
      latencies.push(Date.now() - t0);
      counters.total++;
      counters.errors++; // conexión caída / timeout de socket
    }
  }
}

async function runStage(concurrency) {
  const latencies = [];
  const counters = { total: 0, errors: 0 };
  const untilMs = Date.now() + SECONDS * 1000;
  const users = Array.from({ length: concurrency }, () =>
    virtualUser(untilMs, latencies, counters),
  );
  const wallStart = Date.now();
  await Promise.all(users);
  const wallSec = (Date.now() - wallStart) / 1000;

  latencies.sort((a, b) => a - b);
  const errRate = counters.total ? counters.errors / counters.total : 0;
  return {
    concurrency,
    total: counters.total,
    rps: Math.round(counters.total / wallSec),
    p50: pct(latencies, 50),
    p95: pct(latencies, 95),
    p99: pct(latencies, 99),
    errRate,
    broke: errRate > ERR_BUDGET || pct(latencies, 95) > P95_BUDGET_MS,
  };
}

// ── Smoke previo: el target tiene que estar arriba ────────────────────────────
async function smoke() {
  try {
    const res = await fetch(BASE + "/api/health");
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  console.log(`🎯 Target: ${BASE}`);
  console.log(`   Rutas: ${ROUTES.join(", ")}`);
  console.log(`   Escalones (VUs): ${STAGES.join(", ")} · ${SECONDS}s c/u`);
  console.log(`   Presupuesto: p95 ≤ ${P95_BUDGET_MS}ms · error ≤ ${(ERR_BUDGET * 100).toFixed(1)}%\n`);

  if (!(await smoke())) {
    console.error(
      `❌ ${BASE}/api/health no responde. ¿Levantaste el server? (npm run build && npm start,\n` +
        "   o npm run dev). Abortado antes de generar carga.",
    );
    process.exit(2);
  }

  console.log("VUs   reqs    rps    p50     p95     p99     err%    estado");
  console.log("────  ─────   ────   ─────   ─────   ─────   ─────   ──────");
  let firstBreak = null;
  for (const c of STAGES) {
    const r = await runStage(c);
    if (r.broke && firstBreak === null) firstBreak = r.concurrency;
    console.log(
      `${String(r.concurrency).padEnd(4)}  ${String(r.total).padEnd(6)}  ${String(r.rps).padEnd(
        4,
      )}   ${String(r.p50 + "ms").padEnd(6)}  ${String(r.p95 + "ms").padEnd(6)}  ${String(
        r.p99 + "ms",
      ).padEnd(6)}  ${(r.errRate * 100).toFixed(1).padStart(4)}%   ${r.broke ? "🔴 ROTO" : "🟢 ok"}`,
    );
  }

  console.log("");
  if (firstBreak !== null) {
    console.log(
      `📉 Se ROMPE a partir de ~${firstBreak} usuarios concurrentes (superó p95 ${P95_BUDGET_MS}ms\n` +
        `   o error ${(ERR_BUDGET * 100).toFixed(1)}%). Ese es el techo de carga actual del ambiente probado.`,
    );
  } else {
    console.log(
      `✅ Aguantó todos los escalones (hasta ${STAGES[STAGES.length - 1]} VUs) dentro de presupuesto.\n` +
        "   Subí --stages para encontrar el techo real.",
    );
  }
  console.log(
    "\nNota: números atados al ambiente (local ≠ Netlify ≠ staging) y al plan de Neon. Compará\n" +
      "escalones entre sí, no contra un absoluto. Registrá el resultado en el runbook.",
  );
}

main().catch((e) => {
  console.error("❌ Error en la prueba de carga:", e?.message ?? e);
  process.exit(2);
});
