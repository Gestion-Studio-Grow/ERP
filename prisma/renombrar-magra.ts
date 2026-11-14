// ============================================================================
// RENOMBRAR «Magra» → «GSG Carnes al vacío» en MAILS y COMPROBANTES del negocio `magra` (D11 a)
// ============================================================================
//
// QUÉ HACE. Sobre el negocio con slug EXACTO `magra` (cualquier otro, o inexistente, aborta con
// exit 2), en UNA transacción del negocio (tenantTransaction). Núcleo y relevamiento de columnas:
// src/lib/carniceria/renombrar-demo.ts. El nombre nuevo es MARCA_DEMO_GSG.nombre (src/lib/marca-demo.ts).
//   · Tenant.name, si dice «Magra»: pasa entero al nombre nuevo (tickets, etiquetas, mails de acuse).
//   · MessageTemplate (canal EMAIL) subject/body: sólo la palabra «Magra» (mail de recordatorio).
//   · Fiscales (razón social, domicilio fiscal y del emisor, IIBB): NUNCA se cambian. Si dicen
//     «Magra» se listan con «no se cambia (fiscal)» para que decida el dueño.
//   No toca slug, subdominio, User, emails de login, contraseñas, CUIT, condición IVA ni punto de venta.
//
// CÓMO LO CORRE ORQ (sólo con OK del dueño, y con respaldo Neon previo):
//   DATABASE_URL="<conexión directa>" npm run renombrar:magra                    # DRY-RUN: lista, no escribe
//   DATABASE_URL="<conexión directa>" CONFIRMO_TENANT=magra npm run renombrar:magra -- --aplicar
//   Imprime una línea por campo: tabla · id · campo · «viejo» → «nuevo». Nunca la URL ni secretos.
//   La 2.ª corrida imprime «Nada que cambiar».
//
// ROLLBACK (a mano, en una transacción, con `tenantId` = id del negocio magra). Cada fila cambiada
// dejó una fila en AuditLog con actor 'system:renombrar-magra', action 'renombrar-marca-demo',
// entity = tabla ('Tenant' | 'MessageTemplate'), entityId = id de la fila y
// changes = { <campo>: { antes, despues } }. Para deshacer: por cada una, UPDATE de esa tabla
// SET <campo> = changes-><campo>->>'antes' WHERE id = entityId (y "tenantId" = … en MessageTemplate).
// ============================================================================

import "dotenv/config";
import { DemoAbortada, leerArgsDemo } from "@/lib/carniceria/demo-datos";
import { describirPlanRenombre, ejecutarRenombreMagra } from "@/lib/carniceria/renombrar-demo";

const TAG = "[renombrar:magra]";

/** Un error del driver puede traer host o cadena de conexión: se tapan antes de imprimir. */
function sinUrls(s: string): string {
  return s.replace(/postgres(ql)?:\/\/\S+/gi, "<url>").replace(/\b[\w.-]+\.neon\.tech(:\d+)?/gi, "<host>");
}

async function main(): Promise<number> {
  const args = leerArgsDemo(process.argv.slice(2), process.env.CONFIRMO_TENANT);
  console.log(`${TAG} ${args.aplicar ? "MODO ESCRITURA (--aplicar)" : "DRY-RUN (no escribe nada)"} · negocio "${args.slug}"`);
  try {
    const r = await ejecutarRenombreMagra(args);
    for (const linea of describirPlanRenombre(r.plan)) console.log(`${TAG} ${linea}`);
    if (r.cambiados !== null) console.log(`${TAG} Escrito: ${r.cambiados} campos, con su rastro en AuditLog.`);
    else if (!args.aplicar && r.plan.cambios.length) console.log(`${TAG} Para escribir: CONFIRMO_TENANT=magra npm run renombrar:magra -- --aplicar`);
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
