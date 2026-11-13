// ============================================================================
// PEDÍ LOCAL · DATOS DE EJEMPLO PARA LA PRUEBA CERRADA DE BITÁCORA — con freno anti-producción.
// ============================================================================
//
// QUÉ HACE: deja una base de QA VACÍA lista para que el dueño y el titular de Bitácora prueben la
// tienda en un preview: el negocio `bitacora` (rubro cafetería), su dueño con cambio de contraseña
// obligatorio, la carta REAL del local (su menú de Fudo, 13/11/2026: carta-bitacora.ts) y dos zonas
// de envío de ejemplo. Aditivo e
// idempotente: correrlo dos veces no duplica nada ni pisa lo que se haya editado en la base.
//
// DÓNDE CORRE: sólo en la rama de Neon de QA (`qa-pedi-local`, sólo estructura, sin datos reales) o
// en una base local. NUNCA en la rama `main` de Neon. Dos frenos, los dos antes de escribir nada:
//   1. `frenoPorUrl`: corta si la URL es la del endpoint de la rama `main` (directo, pooler o por
//      `options=endpoint=`). El id del endpoint se verificó contra Neon el 10/11/2026 (sólo lectura).
//   2. `frenoPorContenido`: corta si la base tiene CUALQUIER negocio que no sea `bitacora`. Una rama
//      sólo con estructura nace sin negocios; si aparece `beauty-spa`, `magra` u otro, es una copia
//      con datos reales y no se toca. Es más estricto que el freno del preview (scripts/preview-base.mjs).
//
// Sin migración: usa sólo tablas que ya existen (Tenant, User, BusinessSettings, Product, AuditLog).
// La CLI está en scripts/tenants/bitacora-qa-seed.mts. Tests: qa-seed.test.ts.

import type { PrismaClient } from "@/generated/prisma/client";
import { provisionTenant } from "../../../scripts/provision-tenant";
import { CARTA_BITACORA } from "./carta-bitacora";
import { guardarConfigEnviosEnTx, leerConfigEnvios, type ConfigEnvios } from "@/lib/envios/config";

export const SLUG_QA = "bitacora";

/** Endpoint de la rama `main` (producción) del proyecto Neon `old-frost-91078346`. */
export const ENDPOINT_NEON_MAIN = "ep-little-credit-act3cxpe";

/** Negocios reales (o copias de ellos). Si aparece uno, la base no es la de QA. */
export const SLUGS_REALES = ["beauty-spa", "magra", "shinevelas", "adosmanos"] as const;

export type ResultadoFreno = { ok: true } | { ok: false; motivo: string };

/** Freno 1: la URL no puede ser la de la rama `main` de Neon. Puro: no abre conexión. */
export function frenoPorUrl(url: string | undefined): ResultadoFreno {
  const u = (url ?? "").trim();
  if (!u) return { ok: false, motivo: "falta la URL de la base de QA (QA_DATABASE_URL)." };
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return { ok: false, motivo: "la URL de la base no se puede leer." };
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    return { ok: false, motivo: `la URL no es de Postgres (${parsed.protocol}).` };
  }
  // Se mira la URL entera y decodificada: el endpoint puede venir en el host o en `options=endpoint%3D…`.
  let plano = u.toLowerCase();
  try {
    plano = decodeURIComponent(plano);
  } catch {
    // Una URL con un % suelto se compara tal cual.
  }
  if (plano.includes(ENDPOINT_NEON_MAIN)) {
    return { ok: false, motivo: `la URL apunta a la rama main de Neon (${ENDPOINT_NEON_MAIN}): es producción.` };
  }
  return { ok: true };
}

type LectorDeNegocios = { tenant: { findMany(args: { select: { slug: true } }): Promise<{ slug: string }[]> } };

/** Freno 2: la base sólo puede tener (como mucho) el negocio de QA. */
export async function frenoPorContenido(db: LectorDeNegocios): Promise<ResultadoFreno> {
  let slugs: string[];
  try {
    slugs = (await db.tenant.findMany({ select: { slug: true } })).map((t) => t.slug);
  } catch (e) {
    return { ok: false, motivo: `no se pudo mirar la base (${e instanceof Error ? e.message : String(e)}).` };
  }
  const real = slugs.find((s) => SLUGS_REALES.some((r) => s === r || s.startsWith(`${r}-`)));
  if (real) return { ok: false, motivo: `la base tiene el negocio «${real}»: es producción o una copia con datos reales.` };
  const otros = slugs.filter((s) => s !== SLUG_QA);
  if (otros.length > 0) {
    return { ok: false, motivo: `la base de QA tiene que estar vacía y tiene ${otros.length} negocio(s) más (${otros.slice(0, 3).join(", ")}).` };
  }
  return { ok: true };
}

/**
 * La carta de Bitácora para la prueba: código, nombre y precio de carta-bitacora.ts (su menú de
 * Fudo, 13/11/2026). Precios PROVISIONALES A CONFIRMAR: cambian seguido, revalidar antes de
 * publicar. Categoría, foto, descripción y destacado van por la config (`cfg.carta`), no por acá.
 */
export const CARTA_DEL_SEED: readonly { codigo: string; name: string; price: number }[] = Object.freeze(
  CARTA_BITACORA.flatMap((c) => c.productos.map((p) => ({ codigo: p.codigo, name: p.nombre, price: p.precio }))),
);

/** Envíos DE EJEMPLO: retiro en el local y dos zonas. El local carga las reales en Ajustes → Envíos. */
export const ENVIOS_DE_EJEMPLO: Readonly<ConfigEnvios> = Object.freeze({
  retiroEnLocal: true,
  horarioRetiro: "Lunes a sábado de 8 a 20 (ejemplo)",
  pedidoMinimoEnvio: 6000,
  zonas: [
    { id: "qa-centro", nombre: "Monte Grande centro (ejemplo)", costo: 1500, gratisDesde: 25000, franjas: ["L-S 8-20"] },
    { id: "qa-alrededores", nombre: "Hasta 4 km (ejemplo)", costo: 2500, gratisDesde: null, franjas: ["L-S 8-20"] },
  ],
  franjasRetiro: ["L-S 8-20"],
  tiendaPausada: null,
});

export type OpcionesSeedQA = { ownerEmail: string; ownerPassword: string };

export type ResultadoSeedQA = {
  tenantId: string;
  tenantCreado: boolean;
  ownerCreado: boolean;
  productosNuevos: number;
  enviosCargados: boolean;
};

/**
 * Siembra la prueba cerrada. Corre el freno por contenido ANTES de escribir; el de URL lo corre la
 * CLI antes de conectar (acá llega un cliente ya abierto). Tira si un freno corta.
 */
export async function sembrarBitacoraQA(prisma: PrismaClient, o: OpcionesSeedQA): Promise<ResultadoSeedQA> {
  const freno = await frenoPorContenido(prisma);
  if (!freno.ok) throw new Error(`Freno anti-producción: ${freno.motivo} No se escribió nada.`);
  if (o.ownerPassword.length < 12) throw new Error("La contraseña provisoria del dueño tiene que tener 12 caracteres o más.");

  const alta = await provisionTenant(prisma, {
    name: "Bitácora Café",
    slug: SLUG_QA,
    blueprint: "cafeteria",
    skipCatalog: true,
    owner: { name: "Bitácora Café", email: o.ownerEmail, password: o.ownerPassword },
    branding: {
      shortLabel: "Bitácora Café",
      city: "Monte Grande",
      hoursLabel: "Lunes a sábado de 8 a 20 (provisional a confirmar)",
      contactNote: "Prueba cerrada: carta de Fudo del 13/11/2026, precios a revalidar con el local.",
    },
    platform: { status: "TRIAL" },
  });
  const tenantId = alta.tenantId;

  return prisma.$transaction(async (tx) => {
    // Con RLS, todo lo que sigue va parado en el negocio (igual que provisionTenant). Local a la transacción.
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    let productosNuevos = 0;
    for (const p of CARTA_DEL_SEED) {
      const existe = await tx.product.findUnique({ where: { tenantId_codigo: { tenantId, codigo: p.codigo } }, select: { id: true } });
      if (existe) continue; // Lo que ya está no se pisa: el dueño puede haberlo editado en la prueba.
      await tx.product.create({ data: { tenantId, codigo: p.codigo, name: p.name, price: p.price, saleUnit: "UNIT", unit: "unidades", active: true } });
      productosNuevos++;
    }
    const envios = await leerConfigEnvios(tx, tenantId);
    let enviosCargados = false;
    if (envios.version === null) {
      await guardarConfigEnviosEnTx(tx, tenantId, { config: ENVIOS_DE_EJEMPLO, actor: "system:qa-seed", versionLeida: null });
      enviosCargados = true;
    }
    return { tenantId, tenantCreado: alta.tenantCreated, ownerCreado: alta.ownerCreated, productosNuevos, enviosCargados };
  });
}
