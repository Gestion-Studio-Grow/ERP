// Bandeja del estudio con el diseño nuevo: en qué orden se muestran los clientes que piden algo
// y qué palabra va en la columna del folio. PURO (sin React, sin base): lo prueba bandeja-core.test.ts.
//
// No cambia la evaluación del monitor (src/lib/monitor-core.ts decide QUÉ señal tiene cada
// cliente y cuán grave es): sólo ordena lo que ya viene evaluado, para que la contadora con
// veinte carteras lea de arriba hacia abajo en este orden:
//   1. lo más grave (la urgencia del monitor: un cliente que no puede facturar va primero);
//   2. a igual gravedad, lo que vence (certificado vencido o por vencer, límite del plan);
//   3. a igual gravedad y vencimiento, el cliente que más plata mueve este mes;
//   4. el nombre y el id, para que la lista no salte de orden entre recargas.

import { peorSenal, type FilaMonitor, type SenalId } from "@/lib/monitor-core";

/** Señales con fecha o tope: si se dejan pasar, el cliente se queda sin facturar. */
const SENALES_QUE_VENCEN: ReadonlySet<SenalId> = new Set<SenalId>([
  "cert_vencido",
  "cert_por_vencer",
  "cupo_del_plan",
  "cerca_del_cupo",
]);

/** La palabra corta del folio, según la peor señal. Lo que dice sale del tipo de señal, no se inventa una fecha. */
const FOLIO_POR_SENAL: Partial<Record<SenalId, string>> = {
  cert_vencido: "Venció",
  cert_por_vencer: "Por vencer",
  cupo_del_plan: "Sin cupo",
  cerca_del_cupo: "Cerca del tope",
  facturas_rechazadas: "Rechazos",
  perfil_fiscal_incompleto: "Faltan datos",
  sin_credencial: "Sin ARCA",
  caja_sin_cerrar: "Caja abierta",
};

export function venceAlgo(f: FilaMonitor): boolean {
  return f.senales.some((s) => SENALES_QUE_VENCEN.has(s.id));
}

export function folioDeBandeja(f: FilaMonitor): string {
  const s = peorSenal(f);
  if (!s) return "";
  return (
    FOLIO_POR_SENAL[s.id] ??
    (s.severidad === "critico" ? "Frenado" : "Para ver")
  );
}

/**
 * Ordena los clientes que piden algo. `plataDe` devuelve lo facturado este mes por ese cliente
 * (0 si no se conoce). Devuelve una copia: no toca el arreglo recibido.
 */
export function ordenarBandeja(
  filas: readonly FilaMonitor[],
  plataDe: (clienteTenantId: string) => number,
): FilaMonitor[] {
  return [...filas].sort(
    (a, b) =>
      b.urgencia - a.urgencia ||
      Number(venceAlgo(b)) - Number(venceAlgo(a)) ||
      plataDe(b.clienteTenantId) - plataDe(a.clienteTenantId) ||
      a.alias.localeCompare(b.alias, "es") ||
      a.clienteTenantId.localeCompare(b.clienteTenantId),
  );
}
