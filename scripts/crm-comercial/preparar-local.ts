// Deja el negocio de prueba listo para operar el CRM comercial EN ESTA MÁQUINA: interruptor «crm-comercial»
// prendido, usuarios (Dirección, dos comerciales, uno por puesto) con la clave LOCAL de demo, sus miembros del
// CRM y la carga de los leads y los clientes activos. Idempotente. Sólo base local (nunca Neon).
//   DATABASE_URL=<local> npx tsx scripts/crm-comercial/preparar-local.ts [--negocio mia-producciones]
// Lo llama scripts/crm-comercial/prueba-local.mjs después del seed.
import "dotenv/config";
import { hashPassword } from "../../src/lib/auth-password";
import { baseLocalParaSeed } from "../../src/lib/seed/guarda-base";
import { tenantTransaction } from "../../src/lib/rls";
import { filaDeInterruptor, estadoDesdeFilas, filtroDeFilasValidas } from "../../src/cambios/interruptores-core";
import { CRM_COMERCIAL, crmComercialPrendido } from "../../src/cambios/interruptores";
import { PUESTOS } from "../../src/lib/crm-comercial/permisos";
import * as repo from "../../src/lib/crm-comercial/repo";
import { cargarPrueba, guardaDeBase, LOTE_POR_DEFECTO, negocioPorSlug } from "../../src/lib/crm-comercial/carga-prueba";
import { leerArchivos, NEGOCIO_POR_DEFECTO, salir, texto } from "./comun";

/** Clave de DEMO LOCAL (no es real; la base vive en memoria y desaparece al cerrar). */
export const CLAVE_LOCAL = process.env.CRM_PRUEBA_CLAVE ?? "crm-prueba-local-2026";
const DOMINIO = "crm-prueba.example";

type Alta = { email: string; nombre: string; role: "OWNER" | "RECEPTION"; rol: "DIRECCION" | "COMERCIAL" | "PUESTO"; puesto?: string };
export const USUARIOS: Alta[] = [
  { email: `direccion@${DOMINIO}`, nombre: "Dirección (prueba)", role: "OWNER", rol: "DIRECCION" },
  { email: `comercial1@${DOMINIO}`, nombre: "Comercial Uno (prueba)", role: "RECEPTION", rol: "COMERCIAL" },
  { email: `comercial2@${DOMINIO}`, nombre: "Comercial Dos (prueba)", role: "RECEPTION", rol: "COMERCIAL" },
  ...PUESTOS.map((p): Alta => ({ email: `puesto-${p.replace("_", "-")}@${DOMINIO}`, nombre: `Puesto ${p} (prueba)`, role: "RECEPTION", rol: "PUESTO", puesto: p })),
];

async function main() {
  const url = process.env.DATABASE_URL;
  for (const g of [guardaDeBase(url), baseLocalParaSeed(url)]) if (!g.ok) salir({ ok: false, motivo: g.motivo }, 1);
  const slug = texto("negocio", NEGOCIO_POR_DEFECTO);
  const negocio = await negocioPorSlug(slug);
  if (!negocio) salir({ ok: false, motivo: `No hay un negocio con el slug «${slug}» (¿corrió el seed?).` }, 1);
  const tenantId = (negocio as { id: string }).id;
  const hash = await hashPassword(CLAVE_LOCAL);

  const ids = await tenantTransaction(
    async (tx) => {
      // Interruptor: el mismo rastro que deja la consola de GSG («operator:», canal operador).
      const filas = await tx.auditLog.findMany({ where: filtroDeFilasValidas(tenantId), orderBy: [{ createdAt: "desc" }, { id: "desc" }], distinct: ["entity", "entityId"], select: { id: true, entity: true, entityId: true, action: true, actor: true, channel: true, createdAt: true } });
      if (!crmComercialPrendido(estadoDesdeFilas(filas))) {
        await tx.auditLog.create({ data: filaDeInterruptor({ tenantId, interruptor: CRM_COMERCIAL, accion: "encender", operador: "crm-prueba-local" }) });
      }
      const out: Record<string, string> = {};
      for (const u of USUARIOS) {
        const ya = await tx.user.findFirst({ where: { tenantId, email: u.email }, select: { id: true } });
        out[u.email] = ya ? ya.id : (await tx.user.create({ data: { tenantId, email: u.email, name: u.nombre, role: u.role, passwordHash: hash }, select: { id: true } })).id;
      }
      return out;
    },
    { tenantId },
  );

  // Miembros por la misma función que la pantalla Equipo: Dirección se da de alta sola (arranque) y suma al resto.
  const dir = ids[USUARIOS[0].email];
  const miembros: unknown[] = [];
  for (const u of USUARIOS) {
    const r = await repo.guardarMiembro({ tenantId, userId: dir }, { userId: ids[u.email], rol: u.rol, puesto: u.puesto ?? null }, { esDuenioDelNegocio: u.rol === "DIRECCION" });
    if (!r.ok) salir({ ok: false, motivo: `No se pudo dar de alta a ${u.email}: ${r.motivo}` }, 1);
    miembros.push({ email: u.email, rol: u.rol, puesto: u.puesto ?? null });
  }

  const { leads, clientes } = leerArchivos(slug);
  const carga = await cargarPrueba({ slug, leads, clientes, lote: LOTE_POR_DEFECTO });
  salir({ ok: true, negocio: slug, interruptor: "crm-comercial prendido", usuarios: miembros, clave: "la local de demo (CRM_PRUEBA_CLAVE o la de docs/crm-comercial/PRUEBA.md)", carga });
}
main().catch((e) => salir({ ok: false, motivo: e instanceof Error ? e.message : String(e) }, 1));
