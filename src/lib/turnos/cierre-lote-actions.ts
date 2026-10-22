"use server";

// ============================================================================
// CERRAR LO PENDIENTE EN LOTE — la Server Action (reingeniería CH, Tanda 1).
// ============================================================================
//
// `cerrarTurnosEnLote(fd)`: hasta `TOPE_DEL_LOTE` turnos de una vez, desde la bandeja «Cerrar lo
// pendiente». NUNCA un lote transaccional: cada línea corre en SU transacción, reusando las mismas
// acciones que el turno suelto (`completeAppointment` con `vino`, `cerrarTurnoSinPrestar`), así la
// plata, el libro de caja, la auditoría y la factura salen por el mismo camino de siempre. Si una
// línea falla (la caja de hoy cerrada, otra recepcionista la tocó, es de otro negocio), las demás
// pasan y esa vuelve con su motivo (CH-006, CH-060).
//
// Formato: `items` = JSON de `PedidoDeCierre[]` (armalo con `formDataDelLote`, cierre-lote.ts).
// Devuelve `{ resultados: { id, ok, error?, aviso? }[] }` en el orden del lote; `error` arriba sólo
// si el lote entero no se pudo leer (vacío, roto, más de 50).

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { isDemoSandbox } from "@/lib/demo-flag";
import { logger } from "@/lib/logger";
import { completeAppointment, cerrarTurnoSinPrestar } from "@/lib/actions";
import { puedeCobrarEsteTurno } from "./cobro-mostrador";
import {
  CAMPO_DEL_LOTE,
  camposDeLaDecision,
  leerLote,
  permisosDeRol,
  planCierreEnLote,
  turnoParaCerrar,
  type ResultadoDeLinea,
  type ResultadoDelLote,
  type Veredicto,
} from "./cierre-lote";
import { leerFilasDeTurnos } from "./sin-cerrar.server";

export type { ResultadoDelLote, ResultadoDeLinea } from "./cierre-lote";

export async function cerrarTurnosEnLote(fd: FormData): Promise<ResultadoDelLote> {
  const user = await requireCapability("agenda:complete");
  const lectura = leerLote(fd.get(CAMPO_DEL_LOTE));
  if (!lectura.ok) return { resultados: [], error: lectura.error };
  if (isDemoSandbox()) return { resultados: lectura.pedidos.map((p) => ({ id: p.id, ok: true })) }; // demo: no persiste

  const tenantId = await getCurrentTenantId();
  // Una sola lectura para todo el lote, con `tenantId` (además de RLS): un id de otro negocio no
  // vuelve y su línea contesta «ya no existe» sin que se lo toque.
  const filas = await leerFilasDeTurnos(tenantId, { ids: lectura.pedidos.map((p) => p.id) });
  const porId = new Map(filas.map((f) => [f.id, f]));
  const veredictos = new Map<string, Veredicto>();
  for (const f of filas) {
    veredictos.set(
      f.id,
      puedeCobrarEsteTurno({
        rol: user.role,
        professionalIdDelUsuario: user.professionalId,
        professionalIdDelTurno: f.professionalId,
        nombreProfesional: f.professional.name,
        cobraEnMostrador: f.professional.cobraEnMostrador,
      }),
    );
  }

  const plan = planCierreEnLote(
    lectura.pedidos.map((pedido) => {
      const fila = porId.get(pedido.id);
      return { pedido, turno: fila ? turnoParaCerrar(fila) : null };
    }),
    {
      ahora: new Date(),
      permisos: permisosDeRol(user.role),
      veredictos,
      profesionalPropio: user.role === "PROFESSIONAL" ? user.professionalId ?? "__no_professional__" : null,
    },
  );
  if (!plan.ok) return { resultados: [], error: plan.error };

  // De a una, en orden: cada línea es su propia transacción Serializable (dentro de la acción que
  // se reusa). En paralelo competirían por las mismas filas del libro de caja y por conexiones.
  const resultados: ResultadoDeLinea[] = [];
  for (const linea of plan.lineas) {
    const d = linea.decision;
    if (d.tipo === "rechazado") {
      resultados.push({ id: linea.id, ok: false, error: d.motivo });
      continue;
    }
    const { accion, campos } = camposDeLaDecision(linea.id, d);
    const form = new FormData();
    for (const [k, v] of Object.entries(campos)) form.set(k, v);
    try {
      const r = accion === "completar" ? await completeAppointment(form) : await cerrarTurnoSinPrestar(form);
      resultados.push(r.ok ? { id: linea.id, ok: true, ...(r.aviso ? { aviso: r.aviso } : {}) } : { id: linea.id, ok: false, error: r.error });
    } catch (e) {
      // Un corte de Next (redirect por sesión vencida) no es una falla de la línea: sube.
      unstable_rethrow(e);
      logger.error("agenda", "cierre en lote: una línea falló sin motivo de dominio", e, { tenantId, appointmentId: linea.id });
      resultados.push({ id: linea.id, ok: false, error: "No se pudo cerrar este turno. Probá de nuevo en un rato o cerralo desde la agenda." });
    }
  }

  revalidatePath("/admin/turnos/cerrar");
  return { resultados };
}
