// Sesión del panel a nivel usuario (ADR-017 §2.c). Resuelve la cookie firmada al
// `User` real de la base, chequeando que siga activo y exista.
//
// RUNTIME NODE (usa Prisma + cookies): NO lo importa `src/proxy.ts` (edge) — el
// proxy hace solo el portón grueso con `readSessionToken` de auth.ts. La
// autorización fina (requireCapability) vive en `authz.ts` (ADR-017 Fase 2) y se
// apoya en este `getCurrentUser`. También da el `actor` real al audit trail.

import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getSessionCookieName, readSessionToken } from "@/lib/auth";
import { getCurrentTenantId } from "@/lib/tenant";
import { isDemoSandbox, DEMO_SESSION_USER } from "@/lib/demo-sandbox";
import { CAPACIDADES_NEGABLES_POR_PUESTO, type PermisoOverride } from "@/lib/capabilities";
import { esTablaAusente, leerOverridesTolerante } from "@/lib/permisos-overrides";
import { tenantTransaction } from "@/lib/rls";
import { agenteDelUsuario } from "@/lib/cuadrilla/consola-core";
import { DECISIONES_DE_PUESTOS } from "@/lib/proyectos/decisiones-puestos";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "RECEPTION" | "PROFESSIONAL";
  professionalId: string | null;
  tenantId: string;
  // Excepciones de la matriz de permisos (PLAN permisos §1). `[]` = rige el rol. Se resuelven con
  // `permisoEfectivo(user, cap)`, nunca con roleHasCapability sobre el rol solo.
  overrides: ReadonlyArray<PermisoOverride>;
};

// La sesión del pedido tal cual: el usuario y si tiene el CAMBIO OBLIGATORIO de contraseña pendiente. Sólo la usan
// el portón (`authz.ts`: requireUser / requireUserConCambioPendiente) y la auditoría (el actor es quien es, aunque
// tenga el cambio pendiente). Todo lo demás pasa por `getCurrentUser()`.
//
// Envuelto en `cache()` de React: se dedupe por request, así los múltiples
// llamadores dentro del mismo render (guard de página + guard del loader +
// auditAdmin) comparten un solo lookup a la base en vez de repetirlo.
export type SesionDelPanel = { user: SessionUser; mustChangePassword: boolean };

// La sesión de la cookie, SIN la guardia del agente OWNER: sólo la usan `getSesionDelPanel` y
// `esSesionDeAgenteDuenio`, acá abajo. No se exporta: toda lectura de la sesión pasa por la guardia.
const leerSesionDeLaCookie = cache(async (): Promise<SesionDelPanel | null> => {
  // Modo SANDBOX de preventa (docs/preventa/plan-acceso-sandbox-sin-password.md):
  // identidad ficticia fija, SIN leer cookie ni tocar Prisma/User en absoluto.
  if (isDemoSandbox()) return { user: DEMO_SESSION_USER, mustChangePassword: false };

  const cookieStore = await cookies();
  const userId = await readSessionToken(cookieStore.get(getSessionCookieName())?.value);
  if (!userId) return null;

  // Lookup tenant-scoped (ADR-017 depende de ADR-015): el usuario tiene que
  // pertenecer al tenant resuelto, estar activo y no borrado.
  // `mustChangePassword` sale en la MISMA consulta (cero viajes extra): la columna está en schema.prisma y el login ya
  // la lee (su `findFirst` sin `select` trae todas las columnas), así que no agrega una dependencia nueva de la base.
  const tenantId = await getCurrentTenantId();
  const fila = await prisma.user.findFirst({
    where: { id: userId, tenantId, active: true, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      professionalId: true,
      tenantId: true,
      mustChangePassword: true,
    },
  });
  if (!fila) return null;
  const { mustChangePassword, ...user } = fila;

  // Consulta aparte (no un `select` anidado) para que la tabla ausente (Gate 2) no tumbe el login:
  // sólo P2021/P2022 → `[]`; otro error se relanza. El cambio rige en el próximo request.
  const overrides = await leerOverridesTolerante(() =>
    prisma.userPermissionOverride.findMany({
      where: { userId: user.id, tenantId },
      select: { capability: true, allowed: true },
    }),
  );
  const negadas = user.role === "OWNER" ? await capacidadesNegadasDelPuesto(user.id, tenantId) : [];
  return { user: { ...user, overrides: [...overrides, ...negadas] }, mustChangePassword: mustChangePassword === true };
});

// MIA-237 · TECHO DE PUESTO. Administración entra como OWNER (Facturación lo exige) pero no administra usuarios ni
// permisos: su ficha de Proyectos lo marca y la sesión le suma la negación, que `permisoEfectivo` respeta en la página,
// la app y la acción (`requireCapability`). Sólo para OWNER (los demás roles no tienen nada que apagar). Sin la tabla de
// Proyectos (Gate 2) no hay fichas: nada que negar; otro error se relanza (falla cerrado).
async function capacidadesNegadasDelPuesto(userId: string, tenantId: string): Promise<PermisoOverride[]> {
  try {
    const persona = await prisma.proyectoPersona.findFirst({ where: { tenantId, userId, activa: true }, select: { rol: true } });
    if (persona) return (DECISIONES_DE_PUESTOS.capacidadesNegadas[persona.rol] ?? []).map((capability) => ({ capability, allowed: false, porPuesto: true as const }));
    // MIA-238: sin ficha activa, la OWNER es la Dueña salvo que tenga una ficha de otro puesto de baja (`rolDelActor`):
    // ésa no hereda usuarios ni permisos.
    const deBaja = await prisma.proyectoPersona.findFirst({ where: { tenantId, userId, activa: false, rol: { not: "DIRECCION" } }, select: { id: true } });
    return deBaja ? CAPACIDADES_NEGABLES_POR_PUESTO.map((capability) => ({ capability, allowed: false, porPuesto: true as const })) : [];
  } catch (e) {
    if (esTablaAusente(e)) return [];
    throw e;
  }
}

// GUARDIA DEL AGENTE OWNER (GSG-MIA-080, seguridad). El usuario de un agente de la Cuadrilla con rol OWNER (cargado
// antes del techo de GSG-MIA-076 o a mano en la base) es un estado anómalo: un agente nunca es dueño. Para ese
// usuario NO HAY SESIÓN DEL PANEL: ni escribe ni lee, por ninguna ruta. Se decide ACÁ, en el punto común que usan
// `requireUser`, `requireUserConCambioPendiente`, `requireCapability` y sus variantes, `getCurrentUser`
// (`canCurrentUser` y las lecturas directas) y la auditoría; así ninguna ruta depende de acordarse de chequearlo.
// La dueña lo ve como alerta en la consola (`accesos.ts`) y lo arregla corrigiendo el rol del usuario del agente.
//
// - Cuesta una transacción corta (la búsqueda del agente) sólo cuando el rol es OWNER; los demás roles, nada extra.
//   `esSesionDeAgenteDuenio` (que relee la cookie) se usa sólo en el camino del rechazo, para elegir el aviso.
// - La consulta corre parada en el negocio de la sesión (`tenantTransaction`, RLS con `app_rls`).
// - Sin la tabla de la Cuadrilla en la base (Gate 2) no hay agentes: nadie es agente. Cualquier otro error se
//   relanza: si no se puede saber, el pedido no sigue (falla cerrado).
async function esUsuarioDeAgenteDuenio(user: SessionUser): Promise<boolean> {
  if (user.role !== "OWNER" || isDemoSandbox()) return false;
  try {
    return (await tenantTransaction((tx) => agenteDelUsuario(tx, user.tenantId, user.id), { tenantId: user.tenantId })) !== null;
  } catch (e) {
    if (esTablaAusente(e)) return false;
    throw e;
  }
}

/** ¿La cookie es de un usuario de agente con rol OWNER? Sólo para elegir el aviso del rechazo (`authz.ts`). */
export const esSesionDeAgenteDuenio = cache(async (): Promise<boolean> => {
  const sesion = await leerSesionDeLaCookie();
  return sesion !== null && (await esUsuarioDeAgenteDuenio(sesion.user));
});

export const getSesionDelPanel = cache(async (): Promise<SesionDelPanel | null> => {
  const sesion = await leerSesionDeLaCookie();
  if (!sesion) return null;
  // Sobre `sesion.user`, sin volver a leer la cookie: fuera de un render `cache()` no guarda nada.
  if (await esUsuarioDeAgenteDuenio(sesion.user)) return null;
  return sesion;
});

// PORTÓN DEL CAMBIO OBLIGATORIO (ENG-104, GSG-SEG-013): con la contraseña provisoria pendiente de cambio, para el
// resto de la app NO HAY SESIÓN. Toda pantalla, Server Action o ruta que pregunta por el usuario recibe null, así
// que el portón no depende de que cada una se acuerde de chequear el flag. Las únicas que pasan con el cambio
// pendiente usan `requireUserConCambioPendiente()` (la pantalla de cambio y su acción); salir no pide sesión.
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const sesion = await getSesionDelPanel();
  return sesion && !sesion.mustChangePassword ? sesion.user : null;
});
