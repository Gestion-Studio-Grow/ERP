// ============================================================================
// TOPE DE USUARIOS DEL PLAN (R3-F3) — el alta y la reactivación de usuarios del panel.
// ============================================================================
//
// Sin "use server": lo llama user-actions.ts después de `requireCapability("users:manage")`.
// Cuenta los usuarios activos y decide con `decidirAlta` (src/planes/limites.ts) DENTRO de la
// transacción que crea o reactiva, con un candado por negocio: dos altas a la vez no pueden pasar
// las dos por el último lugar. Sin plan del catálogo, o en CH, no hay tope: se comporta como hoy.

import { tenantTransaction } from "@/lib/rls";
import { leerLimitesEnTx } from "@/lib/uso-del-plan";
import { decidirAlta, NO_SE_PUDO_CONTAR, type DecisionDeAlta } from "@/planes/limites";
import { RUTA_TU_PLAN } from "@/app/admin/(dashboard)/usuarios/plan/tu-plan";

type Tx = Parameters<Parameters<typeof tenantTransaction>[0]>[0];

/** A dónde va quien choca con el tope: "Tu plan" muestra el porqué y «Quiero más». */
export const DESTINO_SIN_LUGAR_USUARIOS = `${RUTA_TU_PLAN}?no-se-pudo=usuarios`;

/**
 * EL candado de usuarios del negocio: lo toman el alta, la reactivación y el tope del plan (acá), la baja del
 * panel (`darDeBajaUsuarioSiQuedaDuenio`) y la edición de la consola (editar-usuario-port.ts). Una sola llave
 * para todos: así el panel y la consola no pueden contar dueños a la vez. Es de transacción (se suelta al
 * cerrarla) y reentrante en la misma sesión de Postgres.
 */
export async function bloquearUsuariosDelNegocioEnTx(tx: Pick<Tx, "$executeRaw">, tenantId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`usuarios:${tenantId}`}))`;
}

/** ¿Entra un usuario activo más? Toma el candado de usuarios del negocio (se suelta al cerrar la transacción). */
export async function decidirAltaDeUsuarioEnTx(tx: Tx, tenantId: string): Promise<DecisionDeAlta> {
  await bloquearUsuariosDelNegocioEnTx(tx, tenantId);
  const l = await leerLimitesEnTx(tx, tenantId);
  if (!l) return { ok: false, motivo: NO_SE_PUDO_CONTAR };
  const { limites } = l;
  if (limites.topes.usuarios.valor === null) return { ok: true };
  const usados = await tx.user.count({ where: { tenantId, active: true, deletedAt: null } });
  return decidirAlta(limites, "usuarios", usados);
}

export type ResultadoAltaDeUsuario = { ok: true; id: string } | { ok: false; motivo: string };

/** Crea el usuario sólo si entra en el plan. Un error de la base (email repetido) se propaga. */
export async function crearUsuarioSiEntra(alta: {
  data: {
    tenantId: string;
    name: string;
    email: string;
    role: "OWNER" | "RECEPTION" | "PROFESSIONAL";
    passwordHash: string;
    /** La clave que fija otra persona es provisoria (GSG-SEG-013): el alta desde Usuarios la manda en true. */
    mustChangePassword?: boolean;
  };
}): Promise<ResultadoAltaDeUsuario> {
  const { tenantId } = alta.data;
  return tenantTransaction(
    async (tx): Promise<ResultadoAltaDeUsuario> => {
      const d = await decidirAltaDeUsuarioEnTx(tx, tenantId);
      if (!d.ok) return d;
      const creado = await tx.user.create({ data: alta.data, select: { id: true } });
      return { ok: true, id: creado.id };
    },
    { tenantId },
  );
}

/** Reactiva un usuario dado de baja sólo si entra en el plan (dar de baja nunca se frena por el plan). */
export async function reactivarUsuarioSiEntra(tenantId: string, userId: string): Promise<DecisionDeAlta> {
  return tenantTransaction(
    async (tx): Promise<DecisionDeAlta> => {
      const d = await decidirAltaDeUsuarioEnTx(tx, tenantId);
      if (!d.ok) return d;
      await tx.user.update({ where: { id: userId }, data: { active: true } });
      return { ok: true };
    },
    { tenantId },
  );
}

export type ResultadoBajaDeUsuario = { ok: true } | { ok: false; motivo: "no-encontrado" | "ultimo-owner" };

/**
 * Da de baja a una persona del panel sin dejar el negocio con 0 dueños activos. El conteo y la escritura van
 * en UNA transacción con el candado de usuarios tomado (el mismo que la consola): sin eso, el panel podía
 * contar 2 dueños mientras la consola le bajaba el rol al otro, y quedaban 0. La persona se relee DENTRO del
 * candado: su rol pudo cambiar desde la consola entre la lectura de la pantalla y el clic.
 */
export async function darDeBajaUsuarioSiQuedaDuenio(tenantId: string, userId: string): Promise<ResultadoBajaDeUsuario> {
  return tenantTransaction(
    async (tx): Promise<ResultadoBajaDeUsuario> => {
      await bloquearUsuariosDelNegocioEnTx(tx, tenantId);
      const u = await tx.user.findFirst({
        where: { id: userId, tenantId },
        select: { role: true, active: true, deletedAt: true },
      });
      if (!u) return { ok: false, motivo: "no-encontrado" };
      if (u.role === "OWNER" && u.active && !u.deletedAt) {
        const duenios = await tx.user.count({ where: { tenantId, role: "OWNER", active: true, deletedAt: null } });
        if (duenios <= 1) return { ok: false, motivo: "ultimo-owner" };
      }
      await tx.user.updateMany({ where: { id: userId, tenantId }, data: { active: false } });
      return { ok: true };
    },
    { tenantId },
  );
}
