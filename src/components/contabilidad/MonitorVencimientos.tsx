// Lista del monitor de obligaciones (FC-11 · T7): la misma para el negocio y para el estudio.
// Presentacional (server component): las acciones de cada fila las pone quien la usa.

import { Franja, Marca, Renglon, Seccion, type TipoMarca } from "@/components/ui";
import {
  ETIQUETA_ESTADO,
  ETIQUETA_RESPONSABLE,
  ETIQUETA_SITUACION,
  SITUACIONES,
  cuandoVence,
  fechaConDia,
  periodoLegible,
  type FilaMonitor,
  type Monitor,
  type Situacion,
} from "@/lib/contabilidad/monitor";

const MARCA: Record<Situacion, TipoMarca> = {
  VENCIDO: "atencion",
  VENCE_HOY: "atencion",
  POR_VENCER: "medias",
  PROXIMO: "pendiente",
  CUMPLIDO: "hecho",
  NO_APLICA: "anulado",
};

const ACCION_TEXTO = { PRESENTACION: "se presenta", PAGO: "se paga", AMBAS: "se presenta y se paga" } as const;

function Fila({ f, acciones }: { f: FilaMonitor; acciones?: (f: FilaMonitor) => React.ReactNode }) {
  const estado = f.faltaPago ? `${ETIQUETA_ESTADO[f.estadoMostrado]} · falta el pago` : ETIQUETA_ESTADO[f.estadoMostrado];
  return (
    <Renglon
      as="li"
      folio={<span className="tabular-nums">{fechaConDia(f.fechaVencimiento)}</span>}
      titulo={
        <>
          {f.nombre} <span className="text-muted">· {periodoLegible(f.periodo, f.cuota)}</span>
        </>
      }
      detalle={
        <>
          <Marca tipo={MARCA[f.situacion]}>{estado}</Marca>
          {" · "}
          {f.situacion === "CUMPLIDO" || f.situacion === "NO_APLICA" ? ACCION_TEXTO[f.accion] : cuandoVence(f.diasRestantes)}
          {" · "}
          {f.organismo}
          {f.jurisdiccion ? ` (${f.jurisdiccion})` : ""}
          {" · a cargo de "}
          {ETIQUETA_RESPONSABLE[f.responsable].toLowerCase()}
        </>
      }
      tecla={acciones?.(f)}
    />
  );
}

export function MonitorVencimientos({
  monitor,
  acciones,
  vacio,
}: {
  monitor: Monitor;
  acciones?: (f: FilaMonitor) => React.ReactNode;
  vacio: React.ReactNode;
}) {
  if (monitor.filas.length === 0) return <Franja>{vacio}</Franja>;
  return (
    <>
      {SITUACIONES.filter((s) => monitor.cuenta[s] > 0).map((s) => (
        <Seccion key={s} titulo={ETIQUETA_SITUACION[s]} nota={String(monitor.cuenta[s])} className="mb-6">
          <ul>
            {monitor.filas
              .filter((f) => f.situacion === s)
              .map((f) => (
                <Fila key={f.id} f={f} acciones={acciones} />
              ))}
          </ul>
        </Seccion>
      ))}
    </>
  );
}
