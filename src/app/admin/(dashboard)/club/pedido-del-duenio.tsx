"use client";

// ============================================================================
// EL PEDIDO QUE ESPERA AL DUEÑO — avisarle por WhatsApp, tipear su código (6 letras, 5 intentos) y listo.
// ============================================================================
//
// El mismo panel en las dos puertas por donde se fía: la tarjeta de la cuenta en Buffet y la fila del jugador en la
// cuenta del turno (vanilla `panelAprobacion`, uat-torneo.e2e.mjs:230-232). Lo que muestra lo lee solo del almacén
// (`useSeleccion`): los intentos que quedan y la traba de 30 min se actualizan sin que quien lo usa tenga que pasarlos,
// y la traba se compara con el reloj del club. Las reglas son del motor (credito-core.ts → `aprobarPorCodigo`).
// «Ver el código que le llega al dueño» existe SÓLO en la demo: en la jornada real el código le llega a él y a nadie más.

import { useCallback, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { pesos } from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import { avisosAlDuenio } from "./aprobar-core";
import { useNegocioDelClub } from "./negocio-del-club";
import { aprobarConCodigo, codigoDeLaDemo, mensajeParaElDuenio, pedidosPendientes } from "./credito-core";
import { useSeleccion } from "./usar-almacen";
import { BotonWhatsApp } from "./WhatsAppDelClub";

interface VistaDelPedido {
  id: string;
  tipo: "cc" | "fiado";
  monto: number;
  quedan: number;
  trabado: string | null;
}

/** El pedido pendiente con ese id, o null si ya se resolvió. Puro. */
export function vistaDelPedido(estado: EstadoClub, ahora: Ahora, novedadId: string): VistaDelPedido | null {
  const p = pedidosPendientes(estado, ahora).find((x) => x.id === novedadId);
  const n = estado.novedades.find((x) => x.id === novedadId);
  return p && n ? { id: p.id, tipo: n.tipo, monto: p.monto, quedan: p.quedan, trabado: p.trabado } : null;
}

const igual = (a: VistaDelPedido | null | undefined, b: VistaDelPedido | null) => (a !== undefined && JSON.stringify(a) === JSON.stringify(b) ? a : b);

export default function PedidoDelDuenio({ almacen, novedadId }: { almacen: Almacen; novedadId: string }) {
  const seleccionar = useCallback((e: EstadoClub, a: Ahora) => vistaDelPedido(e, a, novedadId), [novedadId]);
  const pedido = useSeleccion(almacen, seleccionar, igual);
  const negocio = useNegocioDelClub();
  const [codigo, setCodigo] = useState("");
  const [verDemo, setVerDemo] = useState(false);
  const id = useId();
  if (!pedido) return null;
  const demo = verDemo && almacen.modo() === "demo" ? codigoDeLaDemo(almacen.estado(), pedido.id) : null;
  // Un aviso por dueño, a SU celular (Configuración → Avisos) con el link al aprobador del ERP; en la demo, sin número.
  // Con el negocio: si aprueba en otro sitio (aprobador-externo.ts: Break Point en el trial, G4), el link va ahí.
  const avisos = avisosAlDuenio(almacen.estado(), pedido.id, typeof window !== "undefined" ? window.location.origin : "", almacen.modo(), negocio);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning-soft p-3">
      <p className="text-sm text-strong">
        Esperando el OK del dueño para {pedido.tipo === "fiado" ? `fiar ${pesos(pedido.monto)}` : `habilitarle la cuenta corriente hasta ${pesos(pedido.monto)}`}. Avisale
        por WhatsApp: le llega el pedido con el link para aprobarlo, y el código que te pase lo tipeás acá.
      </p>
      {avisos.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {avisos.map((a) => (
            <BotonWhatsApp key={a.duenioId} enlace={a.enlace}>
              Avisar a {a.nombre}
            </BotonWhatsApp>
          ))}
        </div>
      ) : (
        <p className="text-sm text-body">«{mensajeParaElDuenio(almacen.estado(), pedido.id)}»</p>
      )}
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          const d = almacen.ejecutar((est, ahora, auth) => aprobarConCodigo(est, pedido.id, codigo, auth, ahora));
          if (d.ok) setCodigo("");
        }}
      >
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={id} className="text-xs font-medium text-muted">
            Código del dueño (6 letras, ej. ABC-DEF)
          </label>
          <Input id={id} value={codigo} autoComplete="off" autoCapitalize="characters" maxLength={7} onChange={(e) => setCodigo(e.target.value)} />
        </div>
        <Button type="submit" variant="solid" size="md" disabled={pedido.trabado !== null}>
          Aprobar
        </Button>
      </form>
      <p className="text-xs text-muted">{pedido.trabado ?? `Quedan ${pedido.quedan} intentos.`}</p>
      {/* El código del dueño se muestra SÓLO en la demo: en la jornada real le llega a él y a nadie más. */}
      {almacen.modo() === "demo" && (
        <Button variant="ghost" size="md" onClick={() => setVerDemo((v) => !v)} aria-expanded={verDemo}>
          {verDemo ? "Ocultar" : "Ver"} el código que le llega al dueño (sólo en la demo)
        </Button>
      )}
      {demo && (
        <p className="text-sm text-strong">
          En el celular de {demo.duenio} sale: <strong className="tabular-nums">{demo.codigo}</strong>
        </p>
      )}
    </div>
  );
}
