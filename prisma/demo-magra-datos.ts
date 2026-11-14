// ============================================================================
// DATOS DEMO del negocio `magra` — script IDEMPOTENTE que SÓLO AGREGA lo que falta (piloto Magra, T8)
// ============================================================================
//
// QUÉ HACE. Sobre el negocio con slug EXACTO `magra` (cualquier otro, incluso beauty-spa o
// magra-demo, aborta con exit 2), en UNA transacción del negocio (tenantTransaction):
//   · 8 cortes al vacío por kg (nombres y precios DEMO de prisma/seed-magra.ts), cada uno con su
//     movimiento de stock inicial (AJUSTE «Stock inicial», por el ledger). Se busca por nombre: el que ya existe no se toca.
//   · Etiqueta de paquete y rango de frío (0 a 4 °C, provisional a confirmar): sólo si el negocio
//     no los tiene guardados. Lo guardado por el negocio no se pisa.
//   · 4 lotes al vacío (DEMO-L-001..004, ninguno vencido) y 3 lecturas de frío: sólo si la base
//     tiene las tablas (prisma/pending-gate2/). Si no, imprime «Gate 2 pendiente» y las saltea.
//   Nunca borra ni actualiza filas; nunca toca User, contraseñas, Tenant ni BusinessSettings. Sin
//   plata real, sin ARCA, sin MP. NO APLICA MIGRACIONES.
//
// CÓMO LO CORRE ORQ (sólo con OK del dueño, y con respaldo Neon previo):
//   DATABASE_URL="<conexión directa>" npm run demo:magra                      # DRY-RUN: imprime el plan, no escribe
//   DATABASE_URL="<conexión directa>" CONFIRMO_TENANT=magra npm run demo:magra -- --aplicar   # escribe
//   Correrlo dos veces da lo mismo: la segunda imprime «Nada que agregar».
//   Imprime conteos y nombres; nunca la URL ni secretos.
//
// ROLLBACK (a mano, en una transacción, con `tenantId` = id del negocio magra). Todo lo creado
// lleva el autor "system:demo-magra" o la nota "Dato de demostración (GSG)":
//   · RegistroFrio WHERE "tenantId"=… AND "nota"='Dato de demostración (GSG)'
//   · ProductBatch WHERE "tenantId"=… AND "createdBy"='system:demo-magra'  (DEMO-L-001..004)
//   · AuditLog WHERE "tenantId"=… AND "entity"='ConfigCajaRapida' AND "actor"='system:demo-magra'
//   · StockMovement WHERE "tenantId"=… AND "createdBy"='system:demo-magra', y después los
//     Product creados: Lomo, Ojo de bife, Bife de chorizo, Asado de tira, Vacío, Milanesas de
//     nalga, Carne picada especial, Pollo entero (sólo los que ese movimiento señala y sin ventas).
// ============================================================================

import "dotenv/config";
import { DemoAbortada, describirPlan, ejecutarDemoMagra, leerArgsDemo } from "@/lib/carniceria/demo-datos";

const TAG = "[demo:magra]";

/** Un error del driver puede traer host o cadena de conexión: se tapan antes de imprimir. */
function sinUrls(s: string): string {
  return s.replace(/postgres(ql)?:\/\/\S+/gi, "<url>").replace(/\b[\w.-]+\.neon\.tech(:\d+)?/gi, "<host>");
}

async function main(): Promise<number> {
  const args = leerArgsDemo(process.argv.slice(2), process.env.CONFIRMO_TENANT);
  console.log(`${TAG} ${args.aplicar ? "MODO ESCRITURA (--aplicar)" : "DRY-RUN (no escribe nada)"} · negocio "${args.slug}"`);
  try {
    const r = await ejecutarDemoMagra(args);
    for (const linea of describirPlan(r.plan)) console.log(`${TAG} ${linea}`);
    if (r.creado) {
      const c = r.creado;
      console.log(`${TAG} Escrito: ${c.cortes} cortes, ${c.lotes} lotes, ${c.lecturas} lecturas${c.etiqueta ? ", etiqueta" : ""}${c.rango ? ", rango de frío" : ""}.`);
    } else if (!args.aplicar) {
      console.log(`${TAG} Para escribir: CONFIRMO_TENANT=magra npm run demo:magra -- --aplicar`);
    }
    return 0;
  } catch (err) {
    if (err instanceof DemoAbortada) {
      console.error(`${TAG} ${err.message}`);
      return 2;
    }
    console.error(`${TAG} Falló; no se escribió nada (la transacción se revierte entera).`, sinUrls(err instanceof Error ? err.message : ""));
    return 1;
  }
}

main().then((code) => process.exit(code));
