// Prueba de la SEGUNDA muralla: el candado de tenant en la capa de aplicación
// (src/lib/tenant-scope.ts), medido con RLS DELIBERADAMENTE FUERA DE JUEGO.
//
// Corre con el rol dueño de las tablas (exento de RLS), así que si algo bloquea el
// acceso cross-tenant acá, lo bloqueó la app y no la base. Es la contracara de
// aislamiento-ataque-db.mjs, que mide la muralla de abajo.
//
// Uso:
//   DATABASE_URL=... FORCE_TENANT_SLUG=beauty-spa npx tsx prisma/rls/aislamiento-capa-app.ts
//   (y lo mismo con RLS_ENFORCEMENT=on, para verificar que el candado sobrevive a
//    la extensión de RLS: la de RLS re-despacha sobre el cliente base, así que si
//    el candado quedara por dentro se saltearía sin hacer ruido.)

import { basePrisma, RLS_ENFORCEMENT } from "../../src/lib/prisma-base";
import { prisma } from "../../src/lib/db";
import { tenantTransaction } from "../../src/lib/rls";

const A_SLUG = process.env.FORCE_TENANT_SLUG ?? "beauty-spa";
const B_SLUG = "tenant-b";

let fallas = 0;
function chequear(nombre: string, ok: boolean, detalle: string) {
  console.log(`${ok ? "OK  " : "FALLA"}  ${nombre} — ${detalle}`);
  if (!ok) fallas++;
}

async function main() {
  const a = await basePrisma.tenant.findUnique({ where: { slug: A_SLUG } });
  const b = await basePrisma.tenant.findUnique({ where: { slug: B_SLUG } });
  if (!a || !b) throw new Error(`faltan tenants: ${A_SLUG}=${!!a} ${B_SLUG}=${!!b}`);

  const clienteB = await basePrisma.client.findFirst({ where: { tenantId: b.id } });
  const turnoB = await basePrisma.appointment.findFirst({ where: { tenantId: b.id } });
  const totalClientes = await basePrisma.client.count();
  const clientesA = await basePrisma.client.count({ where: { tenantId: a.id } });

  console.log(
    `\nEscenario: ${totalClientes} clientes en la base, ${clientesA} del tenant A.` +
      `\nRLS_ENFORCEMENT=${RLS_ENFORCEMENT ? "on" : "off"} · rol: dueño de las tablas (RLS exento)\n`,
  );

  // 1) Listado sin where: el caso de getClients(), que hoy no filtra nada.
  const listado = await prisma.client.findMany({ orderBy: { name: "asc" } });
  chequear(
    "findMany sin where sólo trae el tenant propio",
    listado.length === clientesA && listado.every((c) => c.tenantId === a.id),
    `trajo ${listado.length} de ${totalClientes}`,
  );

  // 2) IDOR de lectura: id ajeno en la URL.
  const leido = await prisma.client.findUnique({ where: { id: clienteB!.id } });
  chequear(
    "findUnique con el id de un cliente ajeno devuelve null",
    leido === null,
    leido === null ? "null" : `devolvió ${leido.name}`,
  );

  // 3) IDOR de escritura: id ajeno en un campo del formulario.
  let bloqueado = false;
  let codigo = "";
  try {
    if (turnoB) {
      await prisma.appointment.update({
        where: { id: turnoB.id },
        data: { status: "CANCELLED" },
      });
    }
  } catch (e) {
    bloqueado = true;
    codigo = (e as { code?: string }).code ?? (e as Error).message.slice(0, 60);
  }
  chequear(
    "update sobre un turno ajeno no lo toca",
    bloqueado,
    bloqueado ? `rechazado (${codigo})` : "PASÓ: el turno ajeno se modificó",
  );
  if (turnoB) {
    const despues = await basePrisma.appointment.findUnique({ where: { id: turnoB.id } });
    chequear(
      "el turno ajeno quedó como estaba",
      despues?.status === turnoB.status,
      `${turnoB.status} → ${despues?.status}`,
    );
  }

  // 4) Borrado masivo sin where.
  const borrables = await prisma.cashMovement.count();
  const totalMovimientos = await basePrisma.cashMovement.count();
  chequear(
    "count sin where no cuenta los movimientos ajenos",
    borrables <= totalMovimientos && borrables === (await basePrisma.cashMovement.count({ where: { tenantId: a.id } })),
    `${borrables} de ${totalMovimientos}`,
  );

  // 5) Dentro de tenantTransaction el callback recibe un `tx` crudo, sin extensiones:
  //    es por donde escriben 87 operaciones del repo. Tiene que estar igual de atado.
  const dentroDeTx = await tenantTransaction(async (tx) => {
    const leido = await tx.client.findUnique({ where: { id: clienteB!.id } });
    const listado = await tx.client.findMany({});
    return { leido, listado: listado.length };
  });
  chequear(
    "dentro de tenantTransaction el id ajeno tampoco se lee",
    dentroDeTx.leido === null,
    dentroDeTx.leido === null ? "null" : `devolvió ${dentroDeTx.leido.name}`,
  );
  chequear(
    "dentro de tenantTransaction el listado sólo trae el tenant propio",
    dentroDeTx.listado === clientesA,
    `${dentroDeTx.listado} de ${totalClientes}`,
  );

  // 6) El candado no debe pisar un tenant puesto a propósito (workers por tenant).
  const explicito = await prisma.client.findMany({ where: { tenantId: b.id } });
  chequear(
    "un tenantId explícito del código se respeta",
    explicito.length > 0 && explicito.every((c) => c.tenantId === b.id),
    `${explicito.length} clientes de B leídos a propósito`,
  );

  await basePrisma.$disconnect();
  console.log(fallas === 0 ? "\nTodo bloqueado por la capa de app.\n" : `\n${fallas} FALLA(S)\n`);
  process.exit(fallas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
