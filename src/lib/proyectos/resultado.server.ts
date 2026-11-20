// ============================================================================
// RESULTADO PARA DIRECCIÓN (MIA-50 T09 · O49): las lecturas. La cuenta es `resultado-core.ts` (pura). La venta y el
// costo real de cada proyecto salen de `proyectosConNumeros`, los mismos de la ficha y Rentabilidad; los gastos de
// administración, de las líneas de comprobante con destino ADMINISTRACION (sin M1, ninguna); lo previsto, de los gastos
// fijos de «Monedas y gastos fijos», en pesos de hoy.
// ============================================================================

import "server-only";
import { prisma } from "@/lib/prisma";
import { aPesos } from "./gestion-core";
import { estaConfirmado } from "./empresa-core";
import { proyectosConNumeros } from "./empresa.server";
import { siHayM1 } from "./comprobantes.server";
import { tiposDeCambio } from "./gestion.server";
import { valorDelNegocio } from "./parametros/leer.server";
import { resultadoDelMes, type ProyectoConResultado } from "./resultado-core";

export async function resultadoDeLaEmpresa(tenantId: string, mes: string) {
  const [proyectos, lineas, fijos, tc, periodo] = await Promise.all([
    proyectosConNumeros(tenantId),
    siHayM1(() =>
      prisma.proyectoComprobanteLinea.findMany({
        where: { tenantId, destino: "ADMINISTRACION", comprobante: { anuladoEl: null } },
        select: { categoria: true, costoCentavos: true, comprobante: { select: { fecha: true } } },
      }),
    ),
    prisma.proyectoGastoFijo.findMany({ where: { tenantId, activo: true }, select: { nombre: true, tipo: true, frecuencia: true, fecha: true, activo: true, monto: true, moneda: true } }),
    tiposDeCambio(tenantId),
    // Hoy hay un solo criterio (por fecha del movimiento); el parámetro queda para cuando el negocio pida otro.
    valorDelNegocio(tenantId, "cierre.periodoDelResultado"),
  ]);
  const conResultado: ProyectoConResultado[] = proyectos.map((p) => ({
    id: p.id,
    codigo: p.codigo,
    nombre: p.nombre,
    venta: p.venta,
    costoReal: p.costoReal,
    conGastos: p.conDatos,
    fecha: p.fechaEvento ?? p.createdAt,
    vivo: estaConfirmado(p),
  }));
  const r = resultadoDelMes(
    mes,
    conResultado,
    (lineas ?? []).map((l) => ({ categoria: l.categoria, costoCentavos: l.costoCentavos, fecha: l.comprobante.fecha })),
    fijos.map((g) => ({ ...g, montoPesos: aPesos(g.monto, g.moneda, tc) })),
  );
  return { ...r, periodo, sinComprobantes: lineas === null };
}
