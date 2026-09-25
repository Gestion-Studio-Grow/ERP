"use client";

// Detalle de un comprobante: la foto, lo que dijo el motor y de dónde salió cada dato.
// Lo usan los tres roles que miran comprobantes, con dos niveles de lectura:
// - "rinde": criollo puro. Nada de cuentas ni indicadores; la norma queda detrás de "¿Por qué?".
// - "control" (quien aprueba y Tesorería): suma cuenta de mayor, indicador de IVA, código de
//   la validación y su fuente, y la versión de la regla que se aplicó.

import { useId } from "react";
import { Badge, cn } from "@/components/ui";
import { formatearPesos, nombreJurisdiccion, type Comprobante, type Evaluacion } from "@/lib/rendiciones";
import { useDestacado } from "./contexto";
import {
  CONSTATACION,
  VEHICULO,
  destinoDe,
  etiquetaTrato,
  filasDeDatos,
  luzDe,
  medioTexto,
  nombreDePila,
  oracion,
  tipoGastoDe,
  type Destino,
} from "./derivados";
import { FilaDato, ListaValidaciones, Semaforo } from "./piezas";
import { Ticket } from "./Ticket";

export type ModoDetalle = "rinde" | "control";

export default function DetalleComprobante({
  comprobante: c,
  evaluacion,
  modo,
}: {
  comprobante: Comprobante;
  evaluacion: Evaluacion | undefined;
  modo: ModoDetalle;
}) {
  const id = useId();
  const destacado = useDestacado("validaciones");
  const tipo = tipoGastoDe(c.imputacion.tipoGastoId);
  const filas = filasDeDatos(c.datos, c.origenCampos, c.confianzaIa);
  const im = c.imputacion;

  return (
    <div className="space-y-6">
      <div className="mx-auto w-full max-w-[300px]">
        <Ticket
          datos={c.datos}
          semilla={c.id}
          concepto={tipo?.etiqueta}
          domicilio={im.jurisdiccionComprobante ? nombreJurisdiccion(im.jurisdiccionComprobante) : undefined}
        />
      </div>

      {evaluacion ? <ResultadoEvaluacion evaluacion={evaluacion} modo={modo} /> : null}

      <section
        aria-labelledby={`${id}-revision`}
        data-recorrido="validaciones"
        className={cn("space-y-2.5", destacado && "rendi-destacado")}
      >
        <h3 id={`${id}-revision`} className="text-sm font-semibold text-strong">
          Lo que revisó el sistema
        </h3>
        {evaluacion ? <ListaValidaciones validaciones={evaluacion.validaciones} conFuente={modo === "control"} /> : null}
      </section>

      <section aria-labelledby={`${id}-datos`} className="space-y-2">
        <h3 id={`${id}-datos`} className="text-sm font-semibold text-strong">
          Qué dice el comprobante
        </h3>
        <p className="text-xs text-muted">QR: dato exacto de ARCA · IA: leído de la foto, con su confianza · A mano: lo cargó la persona.</p>
        <dl className="divide-y divide-line rounded-xl border border-line bg-surface-raised px-3">
          {filas.map((f) => (
            <FilaDato key={f.clave} etiqueta={f.etiqueta} origen={f.origen} confianza={f.confianza}>
              {f.valor}
            </FilaDato>
          ))}
        </dl>
      </section>

      <section aria-labelledby={`${id}-imputacion`} className="space-y-2">
        <h3 id={`${id}-imputacion`} className="text-sm font-semibold text-strong">
          Lo que completó {nombreDePila(c.legajo)}
        </h3>
        <dl className="divide-y divide-line rounded-xl border border-line bg-surface-raised px-3">
          <FilaDato etiqueta="Tipo de gasto">{tipo?.etiqueta ?? "Sin clasificar"}</FilaDato>
          <FilaDato etiqueta="Centro de costo">{im.centroCosto}</FilaDato>
          <FilaDato etiqueta="Dónde fue el trabajo">{im.jurisdiccionActividad ? nombreJurisdiccion(im.jurisdiccionActividad) : "Sin cargar"}</FilaDato>
          <FilaDato etiqueta="Dónde está el comercio">{im.jurisdiccionComprobante ? nombreJurisdiccion(im.jurisdiccionComprobante) : "Sin cargar"}</FilaDato>
          {im.origen || im.destino ? (
            <FilaDato etiqueta="Recorrido">
              {im.origen ? nombreJurisdiccion(im.origen) : "?"} → {im.destino ? nombreJurisdiccion(im.destino) : "?"}
            </FilaDato>
          ) : null}
          {im.dominio || im.tipoVehiculo ? (
            <FilaDato etiqueta="Vehículo">
              {[im.dominio, im.tipoVehiculo ? VEHICULO[im.tipoVehiculo] : undefined].filter(Boolean).join(" · ")}
            </FilaDato>
          ) : null}
          {im.asistentes ? <FilaDato etiqueta="Con quién">{im.asistentes}</FilaDato> : null}
          <FilaDato etiqueta="Cómo lo pagó">{medioTexto(im.medioPago)}</FilaDato>
          {im.comentario ? <FilaDato etiqueta="Comentario">{im.comentario}</FilaDato> : null}
        </dl>
      </section>

      <section aria-labelledby={`${id}-arca`} className="space-y-2">
        <h3 id={`${id}-arca`} className="text-sm font-semibold text-strong">
          Controles con ARCA
        </h3>
        <ul className="flex flex-wrap gap-2">
          <li>
            <Badge tone={CONSTATACION[c.constatacion].tono}>{CONSTATACION[c.constatacion].texto}</Badge>
          </li>
          <li>
            {c.cuitApocrifa === true ? (
              <Badge tone="danger">CUIT marcada como apócrifa</Badge>
            ) : c.cuitApocrifa === false ? (
              <Badge tone="success">CUIT sin marca de apócrifa</Badge>
            ) : (
              <Badge tone="neutral">CUIT apócrifa: sin consultar</Badge>
            )}
          </li>
          {modo === "control" && c.originalRecibido !== undefined ? (
            <li>
              <Badge tone={c.originalRecibido ? "success" : "warning"}>
                {c.originalRecibido ? "Original en papel recibido" : "Falta el original en papel"}
              </Badge>
            </li>
          ) : null}
        </ul>
        <p className="text-xs text-muted">En la demo estos controles son datos del escenario: no se consulta a ARCA.</p>
      </section>
    </div>
  );
}

/**
 * Cómo lo trata el sistema: semáforo, a dónde va y, sólo si entra al lote, cuánto IVA recupera y
 * cuánto va a gasto. Frase, chips y cifras salen de `destinoEnLote` (vía `destinoDe`): un
 * comprobante bloqueado o derivado nunca se presenta como contabilizado.
 */
export function ResultadoEvaluacion({ evaluacion: ev, modo }: { evaluacion: Evaluacion; modo: ModoDetalle }) {
  const destino = destinoDe(ev);
  const trato = etiquetaTrato(ev);
  return (
    <div className="rounded-xl border border-line bg-surface-raised p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Semaforo luz={luzDe(ev)} />
        <Badge tone={trato.tono}>{trato.texto}</Badge>
      </div>
      <p className="mt-2.5 text-sm leading-relaxed text-body">{fraseDestino(ev, destino)}</p>
      {destino.entra || modo === "control" ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
          {destino.entra ? (
            <>
              <Cifra etiqueta="Recupera de IVA" valor={formatearPesos(ev.creditoFiscal)} />
              <Cifra etiqueta="Va a gasto" valor={formatearPesos(ev.costo)} />
              {ev.percepcionesComputables ? <Cifra etiqueta="Percepciones que se computan" valor={formatearPesos(ev.percepcionesComputables)} /> : null}
            </>
          ) : null}
          {modo === "control" ? <Cifra etiqueta="Destino" valor={destino.texto} /> : null}
          {modo === "control" && destino.entra ? (
            <>
              <Cifra etiqueta="Cuenta de mayor" valor={ev.cuentaMayor ?? "—"} mono />
              <Cifra etiqueta="Indicador de IVA" valor={ev.indicadorIva ?? "—"} mono />
            </>
          ) : null}
        </dl>
      ) : null}
      {modo === "control" ? (
        <p className="mt-3 text-xs text-muted">
          Regla aplicada: <span className="font-mono">{ev.reglaVersion}</span>
        </p>
      ) : null}
    </div>
  );
}

function Cifra({ etiqueta, valor, mono }: { etiqueta: string; valor: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{etiqueta}</dt>
      <dd className={cn("truncate font-semibold tabular-nums text-strong", mono && "font-mono text-[13px]")}>{valor}</dd>
    </div>
  );
}

function fraseDestino(ev: Evaluacion, destino: Destino): string {
  switch (destino.tipo) {
    case "cuentas_a_pagar":
      return "Va por Cuentas a Pagar: no se paga por rendición, y ahí se retiene si corresponde.";
    case "fuera":
      return `No se contabiliza en la rendición. ${oracion(destino.motivo ?? "Tiene algo que lo bloquea: mirá abajo qué es")}`;
    case "factura":
    case "asiento": {
      const donde =
        destino.tipo === "factura" ? "Entra a SAP como factura del proveedor." : "Entra a SAP en el asiento de gastos de la rendición.";
      if (ev.tratamiento === "computable") {
        const percepciones = ev.percepcionesComputables ? ` y ${formatearPesos(ev.percepcionesComputables)} de percepciones` : "";
        return `Recupera ${formatearPesos(ev.creditoFiscal)} de IVA${percepciones}. ${donde}`;
      }
      return `No recupera IVA: los ${formatearPesos(ev.costo)} van enteros a gasto. ${donde}`;
    }
  }
}
