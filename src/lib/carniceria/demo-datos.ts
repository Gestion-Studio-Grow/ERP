// ============================================================================
// DATOS DEMO del negocio `magra` (piloto Magra, T8) — núcleo PURO + ejecutor en la transacción.
// ============================================================================
//
// Lo usa el script prisma/demo-magra-datos.ts (lo corre ORQ, con OK del dueño). Reglas:
//   · SÓLO AGREGA lo que falta, buscando por tenantId + nombre (cortes), código (lotes), equipo +
//     nota de demo (lecturas de frío) y «¿está guardada?» (etiqueta de paquete y rango de frío).
//     Nunca borra ni actualiza filas existentes; nunca toca User, Tenant ni BusinessSettings (la
//     marca la da src/lib/marca-demo.ts por código).
//   · Lotes y lecturas de frío sólo si sus tablas existen (migraciones de prisma/pending-gate2/,
//     Gate 2). Si no, el plan los saltea con un aviso «Gate 2 pendiente». No aplica migraciones.
//   · Sin plata real, sin ARCA, sin MP: precios y costos de DEMO (los de prisma/seed-magra.ts).
//   · Todo en UNA tenantTransaction del negocio, resuelto por slug EXACTO `magra`.
//
// Las funciones puras (plan, guarda, descripción) no tocan la base; el ejecutor recibe el `tx`.

import type { Prisma } from "@/generated/prisma/client";
import { ENTIDAD_CONFIG_CAJA } from "@/lib/supermercado/marcas";
import { guardarEtiquetaPaqueteEnTx, guardarRangoFrioEnTx } from "@/lib/supermercado/config-repo";
import { etiquetaPaqueteDesdeAfuera, ALTO_ETIQUETA_MM, type EtiquetaPaqueteConfig } from "./etiqueta-paquete-config";
import { rangoFrioDesdeAfuera, type RangoFrio } from "./cadena-frio";
import { crearLoteEnTx } from "./lotes-registro";
import { crearProductoConStockInicial } from "@/lib/stock/alta-producto";

type Tx = Prisma.TransactionClient;

/** El único negocio sobre el que corre. Cualquier otro slug (beauty-spa, magra-demo…) aborta. */
export const SLUG_MAGRA = "magra";
/** Quién figura como autor de todo lo creado (sirve para encontrarlo y borrarlo a mano). */
export const ACTOR_DEMO = "system:demo-magra";
/** Nota de las lecturas de frío y lotes de demo (la marca para encontrarlos). */
export const NOTA_DEMO = "Dato de demostración (GSG)";
/** Prefijo del código de los lotes de demo. */
export const PREFIJO_LOTE_DEMO = "DEMO-L-";

export type CorteDemo = { name: string; pricePerKg: number; cost: number; stock: number; low: number };

/** Cortes al vacío por kg. Nombres y precios de prisma/seed-magra.ts (DEMO, no los del local). */
export const CORTES_DEMO: readonly CorteDemo[] = [
  { name: "Lomo", pricePerKg: 18900, cost: 12000, stock: 14, low: 5 },
  { name: "Ojo de bife", pricePerKg: 16900, cost: 11000, stock: 18, low: 5 },
  { name: "Bife de chorizo", pricePerKg: 15900, cost: 10300, stock: 20, low: 5 },
  { name: "Asado de tira", pricePerKg: 11500, cost: 7500, stock: 30, low: 8 },
  { name: "Vacío", pricePerKg: 12500, cost: 8100, stock: 2, low: 6 },
  { name: "Milanesas de nalga", pricePerKg: 12900, cost: 8400, stock: 25, low: 5 },
  { name: "Carne picada especial", pricePerKg: 9500, cost: 6200, stock: 3, low: 10 },
  { name: "Pollo entero", pricePerKg: 4200, cost: 2700, stock: 22, low: 5 },
];

/** Lotes al vacío. Ninguno vencido: un corte con todos sus lotes vencidos no se vende en el mostrador. */
export type LoteDemo = { codigo: string; corte: string; envasadoHaceDias: number; venceEnDias: number; netWeightKg: number; packages: number };
export const LOTES_DEMO: readonly LoteDemo[] = [
  { codigo: `${PREFIJO_LOTE_DEMO}001`, corte: "Lomo", envasadoHaceDias: 6, venceEnDias: 24, netWeightKg: 6.4, packages: 4 },
  { codigo: `${PREFIJO_LOTE_DEMO}002`, corte: "Vacío", envasadoHaceDias: 25, venceEnDias: 3, netWeightKg: 4.2, packages: 3 },
  { codigo: `${PREFIJO_LOTE_DEMO}003`, corte: "Ojo de bife", envasadoHaceDias: 4, venceEnDias: 26, netWeightKg: 7.1, packages: 5 },
  { codigo: `${PREFIJO_LOTE_DEMO}004`, corte: "Asado de tira", envasadoHaceDias: 10, venceEnDias: 15, netWeightKg: 9.8, packages: 6 },
];

/** Una lectura de temperatura por equipo (dentro del rango de demo). */
export type LecturaDemo = { equipo: string; temperaturaC: number };
export const LECTURAS_DEMO: readonly LecturaDemo[] = [
  { equipo: "Cámara 1", temperaturaC: 2.5 },
  { equipo: "Cámara 2", temperaturaC: 1.8 },
  { equipo: "Exhibidora", temperaturaC: 3.4 },
];

/** Provisional a confirmar con Magra. */
export const ETIQUETA_DEMO: EtiquetaPaqueteConfig = { leyenda: "Envasado al vacío. Conservar refrigerado entre 0 y 4 °C", altoMm: ALTO_ETIQUETA_MM };
export const RANGO_DEMO: RangoFrio = { minC: 0, maxC: 4 };

export const AVISO_GATE2_LOTES = "Lotes: Gate 2 pendiente (falta prisma/pending-gate2/CarniceriaRubro.sql); se saltean.";
export const AVISO_GATE2_FRIO = "Lecturas de frío: Gate 2 pendiente (falta prisma/pending-gate2/CadenaDeFrio.sql); se saltean.";

/** Lo que ya hay en el negocio. `null` en lotes/lecturas = la tabla no existe (migración sin aplicar). */
export type EstadoDemo = {
  cortes: string[];
  etiquetaGuardada: boolean;
  rangoGuardado: boolean;
  lotes: string[] | null;
  equiposConLecturaDemo: string[] | null;
};

export type PlanDemo = {
  cortes: CorteDemo[];
  etiqueta: EtiquetaPaqueteConfig | null;
  rango: RangoFrio | null;
  lotes: LoteDemo[];
  lecturas: LecturaDemo[];
  avisos: string[];
};

const clave = (s: string) => s.trim().toLocaleLowerCase("es-AR");

/** PURA. Las altas que faltan, comparando con lo que ya hay. */
export function planDemoMagra(estado: EstadoDemo): PlanDemo {
  const cortesHay = new Set(estado.cortes.map(clave));
  const avisos: string[] = [];
  let lotes: LoteDemo[] = [];
  if (estado.lotes === null) avisos.push(AVISO_GATE2_LOTES);
  else {
    const hay = new Set(estado.lotes.map(clave));
    lotes = LOTES_DEMO.filter((l) => !hay.has(clave(l.codigo)));
  }
  let lecturas: LecturaDemo[] = [];
  if (estado.equiposConLecturaDemo === null) avisos.push(AVISO_GATE2_FRIO);
  else {
    const hay = new Set(estado.equiposConLecturaDemo.map(clave));
    lecturas = LECTURAS_DEMO.filter((l) => !hay.has(clave(l.equipo)));
  }
  return {
    cortes: CORTES_DEMO.filter((c) => !cortesHay.has(clave(c.name))),
    etiqueta: estado.etiquetaGuardada ? null : ETIQUETA_DEMO,
    rango: estado.rangoGuardado ? null : RANGO_DEMO,
    lotes,
    lecturas,
    avisos,
  };
}

export function planVacio(p: PlanDemo): boolean {
  return p.cortes.length === 0 && !p.etiqueta && !p.rango && p.lotes.length === 0 && p.lecturas.length === 0;
}

/** PURA. El plan en líneas para la consola: conteos y nombres, nunca URLs ni secretos. */
export function describirPlan(p: PlanDemo): string[] {
  const nombres = (xs: string[]) => (xs.length ? `: ${xs.join(", ")}` : "");
  return [
    `Cortes al vacío a crear: ${p.cortes.length}${nombres(p.cortes.map((c) => c.name))}`,
    `Etiqueta de paquete: ${p.etiqueta ? "se guarda la de demo" : "ya guardada, no se toca"}`,
    `Rango de frío: ${p.rango ? `se guarda ${p.rango.minC} a ${p.rango.maxC} °C` : "ya guardado, no se toca"}`,
    `Lotes a crear: ${p.lotes.length}${nombres(p.lotes.map((l) => `${l.codigo} (${l.corte})`))}`,
    `Lecturas de frío a crear: ${p.lecturas.length}${nombres(p.lecturas.map((l) => l.equipo))}`,
    ...p.avisos,
    planVacio(p) ? "Nada que agregar: el negocio ya tiene los datos demo." : "",
  ].filter(Boolean);
}

// ── Guarda ────────────────────────────────────────────────────────────────────

export type ArgsDemo = { slug: string; aplicar: boolean; confirmo: string | undefined };

/** PURA. Lee argv (`--tenant <slug>`, `--aplicar`) y el env de confirmación. */
export function leerArgsDemo(argv: string[], confirmo: string | undefined): ArgsDemo {
  const i = argv.indexOf("--tenant");
  const slug = i >= 0 ? (argv[i + 1] ?? "") : SLUG_MAGRA;
  return { slug, aplicar: argv.includes("--aplicar"), confirmo };
}

/** PURA. `null` = puede seguir; si no, el motivo para abortar. */
export function rechazoDeLaGuarda(a: ArgsDemo): string | null {
  if (a.slug !== SLUG_MAGRA) return `Este script sólo corre sobre el negocio "${SLUG_MAGRA}" (pediste "${a.slug}"). Abortado.`;
  if (a.aplicar && a.confirmo !== SLUG_MAGRA) {
    return `Para escribir hace falta --aplicar Y la variable CONFIRMO_TENANT=${SLUG_MAGRA}. Abortado sin escribir.`;
  }
  return null;
}

export class DemoAbortada extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "DemoAbortada";
  }
}

// ── Base ──────────────────────────────────────────────────────────────────────

async function tablaExiste(tx: Tx, tabla: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${tabla}`;
  return Number(rows?.[0]?.n ?? 0) > 0;
}

async function configVigente(tx: Tx, tenantId: string) {
  return tx.auditLog.findFirst({
    where: { tenantId, entity: ENTIDAD_CONFIG_CAJA, entityId: tenantId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, changes: true },
  });
}

/** Lo que ya hay del negocio (sólo lecturas, con el `tenantId` escrito en cada consulta). */
export async function leerEstadoDemoEnTx(tx: Tx, tenantId: string): Promise<EstadoDemo> {
  const productos = await tx.product.findMany({
    where: { tenantId, deletedAt: null, name: { in: CORTES_DEMO.map((c) => c.name), mode: "insensitive" } },
    select: { name: true },
  });
  const cfg = await configVigente(tx, tenantId);
  const cambios = (cfg?.changes ?? null) as { etiquetaPaquete?: unknown; rangoFrio?: unknown } | null;

  let lotes: string[] | null = null;
  if (await tablaExiste(tx, "ProductBatch")) {
    const filas = await tx.$queryRaw<{ code: string }[]>`
      SELECT "code" FROM "ProductBatch" WHERE "tenantId" = ${tenantId} AND "code" LIKE ${`${PREFIJO_LOTE_DEMO}%`}`;
    lotes = filas.map((f) => f.code);
  }
  let equipos: string[] | null = null;
  if (await tablaExiste(tx, "RegistroFrio")) {
    const filas = await tx.$queryRaw<{ equipo: string }[]>`
      SELECT DISTINCT "equipo" FROM "RegistroFrio" WHERE "tenantId" = ${tenantId} AND "nota" = ${NOTA_DEMO}`;
    equipos = filas.map((f) => f.equipo);
  }
  return {
    cortes: productos.map((p) => p.name),
    etiquetaGuardada: etiquetaPaqueteDesdeAfuera(cambios?.etiquetaPaquete) !== null,
    rangoGuardado: rangoFrioDesdeAfuera(cambios?.rangoFrio) !== null,
    lotes,
    equiposConLecturaDemo: equipos,
  };
}

function diaMas(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export type CreadoDemo = { cortes: number; etiqueta: boolean; rango: boolean; lotes: number; lecturas: number };

/**
 * Escribe el plan dentro de la transacción del llamador. Sólo INSERT (y la fila nueva de config,
 * que copia lo vigente sin pisarlo). `hoy` = día del negocio "AAAA-MM-DD" (fechas de los lotes).
 */
export async function aplicarDemoMagraEnTx(tx: Tx, tenantId: string, plan: PlanDemo, hoy: string): Promise<CreadoDemo> {
  for (const c of plan.cortes) {
    // Nace en 0 y el stock inicial lo asienta el ledger (AJUSTE «Stock inicial»), como el alta de la pantalla.
    await crearProductoConStockInicial(tx, {
      tenantId,
      name: c.name,
      unit: "kg",
      lowStockAt: c.low,
      venta: { saleUnit: "WEIGHT", pricePerKg: c.pricePerKg, price: null, trackStock: true },
      stockInicial: c.stock,
      createdBy: ACTOR_DEMO,
    });
  }

  let version = (await configVigente(tx, tenantId))?.id ?? null;
  if (plan.etiqueta) version = await guardarEtiquetaPaqueteEnTx(tx, tenantId, { etiquetaPaquete: plan.etiqueta, actor: ACTOR_DEMO, versionLeida: version });
  if (plan.rango) await guardarRangoFrioEnTx(tx, tenantId, { rangoFrio: plan.rango, actor: ACTOR_DEMO, versionLeida: version });

  if (plan.lotes.length) {
    const productos = await tx.product.findMany({
      where: { tenantId, deletedAt: null, name: { in: plan.lotes.map((l) => l.corte), mode: "insensitive" } },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });
    const idPorCorte = new Map<string, string>();
    for (const p of productos) if (!idPorCorte.has(clave(p.name))) idPorCorte.set(clave(p.name), p.id);
    for (const l of plan.lotes) {
      const productId = idPorCorte.get(clave(l.corte));
      if (!productId) throw new DemoAbortada(`No se encontró el corte "${l.corte}" para el lote ${l.codigo}.`);
      const corte = CORTES_DEMO.find((c) => c.name === l.corte);
      await crearLoteEnTx(tx, tenantId, {
        id: crypto.randomUUID(),
        codigo: l.codigo,
        productId,
        supplierId: null,
        envasado: diaMas(hoy, -l.envasadoHaceDias),
        vence: diaMas(hoy, l.venceEnDias),
        netWeightKg: l.netWeightKg,
        packages: l.packages,
        unitCost: corte?.cost ?? null,
        note: NOTA_DEMO,
        actor: ACTOR_DEMO,
      });
    }
  }

  for (const l of plan.lecturas) {
    await tx.$executeRaw`
      INSERT INTO "RegistroFrio" ("id","tenantId","equipo","temperaturaC","medidoPor","nota")
      VALUES (${crypto.randomUUID()}, ${tenantId}, ${l.equipo}, ${l.temperaturaC}, ${ACTOR_DEMO}, ${NOTA_DEMO})`;
  }

  return { cortes: plan.cortes.length, etiqueta: !!plan.etiqueta, rango: !!plan.rango, lotes: plan.lotes.length, lecturas: plan.lecturas.length };
}

export type ResultadoDemo = { tenantId: string; plan: PlanDemo; creado: CreadoDemo | null };

/**
 * La corrida entera: guarda → negocio por slug → UNA tenantTransaction (lee, planifica y, sólo
 * con `--aplicar` + CONFIRMO_TENANT=magra, escribe). Tira `DemoAbortada` si la guarda no pasa.
 * Importa la base adentro: los tests puros de este archivo no levantan un cliente de Prisma.
 */
export async function ejecutarDemoMagra(args: ArgsDemo, hoy?: string): Promise<ResultadoDemo> {
  const rechazo = rechazoDeLaGuarda(args);
  if (rechazo) throw new DemoAbortada(rechazo);
  const { basePrisma } = await import("@/lib/prisma-base");
  const { tenantTransaction } = await import("@/lib/rls");
  const dia = hoy ?? (await import("@/lib/datetime")).todayInBusinessTz();

  const tenant = await basePrisma.tenant.findUnique({ where: { slug: args.slug }, select: { id: true, slug: true } });
  if (!tenant || tenant.slug !== SLUG_MAGRA) throw new DemoAbortada(`No existe un negocio con slug "${args.slug}". Abortado.`);

  return tenantTransaction(
    async (tx) => {
      const plan = planDemoMagra(await leerEstadoDemoEnTx(tx, tenant.id));
      const creado = args.aplicar && !planVacio(plan) ? await aplicarDemoMagraEnTx(tx, tenant.id, plan, dia) : null;
      return { tenantId: tenant.id, plan, creado };
    },
    { tenantId: tenant.id, timeoutMs: 60_000 },
  );
}
