"use client";

// Las acciones de un toque sobre una clase y las masivas de Hoy y Semana (Tanda 3A · §2.3).
// Pensadas para usarse entre clase y clase con el celular en una mano: botones de 48 px, lo
// importante a la izquierda, y lo que necesita más de un dato (cancelar, mover, cobrar, no vino,
// editar) en una HOJA que sube desde abajo. El WhatsApp para avisarle al alumno queda en la cola
// del layout (ColaAvisos), que sobrevive al refresco de la lista.
//
// M-065: la tarjeta de una clase tiene los MISMOS botones, en el MISMO orden, en Hoy, Semana y la
// Bandeja (todas usan <AccionesClase>):
//   1. lo de su estado: Confirmar · No puedo (pedido) | Dada · No vino (confirmada)
//   2. el comprobante por revisar: Ver · Está bien · No es válido
//   3. Cobré · Mover · Cancelar
//   4. Editar · Agendar la próxima

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Chip, buttonClasses, cn } from "@/components/ui";
import {
  agendarProxima,
  cerrarPasada,
  confirmarTodos,
  devolverComprobante,
  devolverSaldo,
  mandarLinkAlAlumno,
  moverClase,
  moverPago,
  recordarVarios,
  recordatorio,
  regenerarLink,
} from "@/lib/padel/acciones";
import { MOTIVOS_COMPROBANTE, esPagable, type MotivoComprobante } from "@/lib/padel/core";
import { plataTexto } from "./_plata";
import { clases as nClases } from "./_agenda-core";
import { ErrorAccion, aCola, chip48, grande, useAccion } from "./_hojas/comun";
import { HojaCancelar } from "./_hojas/HojaCancelar";
import { HojaCobrar } from "./_hojas/HojaCobrar";
import { HojaEditar } from "./_hojas/HojaEditar";
import { HojaMover } from "./_hojas/HojaMover";
import { HojaNoVino } from "./_hojas/HojaNoVino";
import { HojaSuspender } from "./_hojas/HojaSuspender";
import type { ClaseDelDia } from "./_hojas/proponer";
import { yaTermino, type ClaseAcciones } from "./_hojas/tipos";

export type { ClaseAcciones } from "./_hojas/tipos";

type CualHoja = "cancelar" | "mover" | "cobrar" | "noVino" | "editar" | null;

const MOTIVO_CORTO: Record<MotivoComprobante, string> = {
  MONTO: "Monto distinto",
  NO_SE_VE: "No se ve",
  OTRA_CUENTA: "Otra cuenta",
  OTRO: "Otro",
};

const ligero = "min-h-12 text-sm font-semibold text-muted underline underline-offset-2 hover:text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export function AccionesClase({
  c,
  conProxima = true,
  otras = [],
  seCobraPorDefecto = false,
}: {
  c: ClaseAcciones;
  conProxima?: boolean;
  /** Las otras clases del día: «Editar» avisa si la duración nueva pisa una (M-064). */
  otras?: readonly ClaseDelDia[];
  /** La regla «No vino: se cobra» de Ajustes (M-068). Hasta T4, no se cobra. */
  seCobraPorDefecto?: boolean;
}) {
  const { pendiente, error, correr } = useAccion(c.nombre);
  const [hoja, setHoja] = useState<CualHoja>(null);
  const [verComprobante, setVerComprobante] = useState(false);
  const [motivosComprobante, setMotivosComprobante] = useState(false);
  const cerrar = () => setHoja(null);
  const termino = yaTermino(c);
  const viva = ["PEDIDA", "CONFIRMADA"].includes(c.estado) && !termino;
  // La misma regla que el link del alumno (core.ts): se cobra lo dado sin pagar, lo confirmado y el
  // «no vino» que se cobra igual.
  const cobrable = esPagable(c) && c.pagoEstado === "PENDIENTE";
  const fila3 = [cobrable && "cobrar", viva && "mover", c.estado === "CONFIRMADA" && !termino && "cancelar"].filter(Boolean) as ("cobrar" | "mover" | "cancelar")[];
  const editable = ["PEDIDA", "CONFIRMADA", "DADA", "AUSENTE"].includes(c.estado);
  const proxima = conProxima && ["CONFIRMADA", "DADA"].includes(c.estado);

  return (
    <div className="grid gap-2" aria-busy={pendiente}>
      {c.estado === "PEDIDA" && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={pendiente} className={grande()} onClick={() => correr(() => moverClase(c.id, "confirmar"), "Confirmada")} data-qa="confirmar">
            Confirmar
          </button>
          <button type="button" disabled={pendiente} className={grande("outline")} onClick={() => setHoja("cancelar")} data-qa="rechazar">
            No puedo
          </button>
        </div>
      )}

      {c.estado === "CONFIRMADA" && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={pendiente}
            className={grande()}
            onClick={() => correr(() => (termino ? cerrarPasada(c.id, "dar") : moverClase(c.id, "dar")), "Clase dada")}
            data-qa="dada"
          >
            Dada
          </button>
          <button type="button" disabled={pendiente} className={grande("outline")} onClick={() => setHoja("noVino")} data-qa="ausente">
            No vino
          </button>
        </div>
      )}

      {c.estado === "SIN_RESPUESTA" && (
        // O-3: el pedido venció sin que lo confirmaras, pero el alumno vino igual: se da y se cobra.
        <div className="grid gap-2">
          <p className="text-sm text-muted">No llegaste a confirmarla. Si vino igual, marcala dada y cobrala.</p>
          <button type="button" disabled={pendiente} className={grande()} onClick={() => correr(() => moverClase(c.id, "dar"), "Clase dada")} data-qa="dada-sin-respuesta">
            Vino igual · Dada
          </button>
        </div>
      )}

      {c.pagoEstado === "EN_REVISION" && (
        <div className="grid gap-2 rounded-xl border border-line bg-warning-soft p-2">
          {c.comprobante && (
            <button type="button" className="min-h-12 text-left text-sm font-semibold text-strong underline" onClick={() => setVerComprobante((v) => !v)} aria-expanded={verComprobante} data-qa="ver-comprobante">
              {verComprobante ? "Ocultar comprobante" : "Ver comprobante"}
            </button>
          )}
          {c.comprobante && verComprobante && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.comprobante} alt={`Comprobante de ${c.nombre}`} className="max-h-96 w-full rounded-lg bg-surface-raised object-contain" />
          )}
          {motivosComprobante ? (
            <div className="grid gap-2">
              <p className="text-sm font-semibold text-strong">¿Por qué no es válido?</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Por qué no es válido">
                {MOTIVOS_COMPROBANTE.map((m) => (
                  <Chip key={m} disabled={pendiente} onClick={() => correr(() => devolverComprobante(c.id, m), "Le pediste otro comprobante")} className={chip48} data-qa={`no-valido-${m}`}>
                    {MOTIVO_CORTO[m]}
                  </Chip>
                ))}
              </div>
              <button type="button" className={ligero} onClick={() => setMotivosComprobante(false)}>
                Volver
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={pendiente} className={grande()} onClick={() => correr(() => moverPago(c.id, "validar"), "Pago validado")} data-qa="validar">
                Está bien
              </button>
              <button type="button" disabled={pendiente} className={grande("outline")} onClick={() => setMotivosComprobante(true)} data-qa="no-valido">
                No es válido
              </button>
            </div>
          )}
        </div>
      )}

      {fila3.length > 0 && (
        <div className={cn("grid gap-2", fila3.length === 3 ? "grid-cols-3" : fila3.length === 2 ? "grid-cols-2" : "grid-cols-1")}>
          {fila3.includes("cobrar") && (
            <button type="button" disabled={pendiente} className={grande("outline")} onClick={() => setHoja("cobrar")} data-qa="cobre">
              Cobré <span aria-hidden>▾</span>
            </button>
          )}
          {fila3.includes("mover") && (
            <button type="button" disabled={pendiente} className={grande("outline")} onClick={() => setHoja("mover")} data-qa="mover">
              Mover
            </button>
          )}
          {fila3.includes("cancelar") && (
            <button type="button" disabled={pendiente} className={grande("outline")} onClick={() => setHoja("cancelar")} data-qa="cancelar">
              Cancelar
            </button>
          )}
        </div>
      )}

      {(editable || proxima) && (
        <div className="flex flex-wrap items-center justify-between gap-x-4">
          {editable && (
            <button type="button" className={ligero} onClick={() => setHoja("editar")} data-qa="editar">
              Editar
            </button>
          )}
          {proxima && (
            <button type="button" disabled={pendiente} className={ligero} onClick={() => correr(() => agendarProxima(c.id), "Próxima agendada")} data-qa="agendar-proxima">
              + Agendar la próxima (misma hora)
            </button>
          )}
        </div>
      )}

      <ErrorAccion texto={error} />

      {hoja === "cancelar" && <HojaCancelar c={c} onCerrar={cerrar} />}
      {hoja === "mover" && <HojaMover c={c} onCerrar={cerrar} />}
      {hoja === "cobrar" && <HojaCobrar c={c} onCerrar={cerrar} />}
      {hoja === "noVino" && <HojaNoVino c={c} onCerrar={cerrar} seCobraPorDefecto={seCobraPorDefecto} />}
      {hoja === "editar" && <HojaEditar c={c} onCerrar={cerrar} otras={otras} />}
    </div>
  );
}

/** «Ayer quedaron sin cerrar» (F10 · M-044): Dada y No vino, un toque cada uno. */
export function AccionesSinCerrar({ c, seCobraPorDefecto = false }: { c: ClaseAcciones; seCobraPorDefecto?: boolean }) {
  const { pendiente, error, correr } = useAccion(c.nombre);
  const [noVino, setNoVino] = useState(false);
  return (
    <div className="grid gap-2" aria-busy={pendiente}>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={pendiente} className={grande()} onClick={() => correr(() => cerrarPasada(c.id, "dar"), "Clase dada")} data-qa="cerrar-dada">
          Dada
        </button>
        <button type="button" disabled={pendiente} className={grande("outline")} onClick={() => setNoVino(true)} data-qa="cerrar-no-vino">
          No vino
        </button>
      </div>
      <ErrorAccion texto={error} />
      {noVino && <HojaNoVino c={c} onCerrar={() => setNoVino(false)} seCobraPorDefecto={seCobraPorDefecto} />}
    </div>
  );
}

/** «Confirmar todos» (F6 · M-034): confirma los pedidos y arma la cola «Avisar a Juan (1 de 3)». */
export function ConfirmarTodos({ pedidos }: { pedidos: readonly { id: string; cuando: string }[] }) {
  const { pendiente, error, ejecutar, encolar } = useAccion("");
  const cuando = new Map(pedidos.map((p) => [p.id, p.cuando]));
  const confirmar = () =>
    ejecutar(async () => {
      const r = await confirmarTodos(pedidos.map((p) => p.id));
      if (!r.ok) return r.error;
      encolar(aCola(r.avisos, (id) => `Confirmada: ${(id && cuando.get(id)) || ""}`.replace(/: $/, "")));
      return r.fallidas.length ? `No pudimos confirmar ${nClases(r.fallidas.length)}: ${r.fallidas[0].error}` : null;
    });
  return (
    <div className="grid gap-1">
      <button type="button" disabled={pendiente} onClick={confirmar} className={cn(buttonClasses("solid", "md"), "min-h-12 px-4")} data-qa="confirmar-todos">
        {pendiente ? "Confirmando…" : "Confirmar todos"}
      </button>
      <ErrorAccion texto={error} />
    </div>
  );
}

/** «Recordar a los 8» (F5 · M-041): un recordatorio con su link por cada clase, en la cola. */
export function RecordarTodos({ clases }: { clases: readonly { id: string; cuando: string }[] }) {
  const { pendiente, error, ejecutar, encolar, mostrar } = useAccion("");
  const cuando = new Map(clases.map((c) => [c.id, c.cuando]));
  const recordar = () =>
    ejecutar(async () => {
      const r = await recordarVarios(clases.map((c) => c.id));
      if (!r.ok) return r.error;
      if (!r.avisos.length) mostrar({ texto: "Ya les recordaste a todos", nombre: "" });
      else encolar(aCola(r.avisos, (id) => `Recordatorio: ${(id && cuando.get(id)) || ""}`.replace(/: $/, "")));
      return null;
    });
  if (!clases.length) return null;
  return (
    <div className="grid gap-1">
      <button type="button" disabled={pendiente} onClick={recordar} className={cn(buttonClasses("outline", "md"), "min-h-12 px-4")} data-qa="recordar-todos">
        {pendiente ? "Armando…" : clases.length === 1 ? "Recordarle" : `Recordar a los ${clases.length}`}
      </button>
      <ErrorAccion texto={error} />
    </div>
  );
}

/** «🌧 Se suspende» de un día (F3 · M-036/M-037). */
export function BotonSuspender({ fecha, etiquetaDia, clases }: { fecha: string; etiquetaDia: string; clases: readonly ClaseDelDia[] }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAbierta(true)} className={cn(buttonClasses("ghost", "md"), "min-h-12 px-3")} data-qa="se-suspende">
        <span aria-hidden>🌧</span> Se suspende
      </button>
      {abierta && <HojaSuspender modo="dia" fecha={fecha} etiquetaDia={etiquetaDia} clases={clases} onCerrar={() => setAbierta(false)} />}
    </>
  );
}

/** «Bloquear días» (viaje, torneo · E18 · M-038). */
export function BotonBloquearDias({ desde }: { desde: string }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAbierta(true)} className={cn(buttonClasses("outline", "md"), "min-h-12 w-full")} data-qa="bloquear-dias">
        Bloquear días (viaje, torneo)
      </button>
      {abierta && <HojaSuspender modo="rango" desde={desde} onCerrar={() => setAbierta(false)} />}
    </>
  );
}

/**
 * «Compartir mi turnero» (M-062): la hoja nativa de compartir del celular con el link; si el
 * navegador no la tiene, lo copia.
 */
export function CompartirTurnero({ negocio }: { negocio: string }) {
  const { mostrar } = useAccion("");
  const [error, setError] = useState<string | null>(null);
  const compartir = async () => {
    setError(null);
    const url = `${window.location.origin}/clases`;
    const texto = `Pedí tu clase con ${negocio}: elegís el horario y te confirmo por WhatsApp.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: negocio, text: texto, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      mostrar({ texto: `Link copiado: ${url}`, nombre: "" });
    } catch (e) {
      // Cerrar la hoja de compartir sin elegir no es un error.
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(`No pudimos compartirlo. Tu link es ${url}`);
    }
  };
  return (
    <div className="grid gap-1">
      <button type="button" onClick={compartir} className={grande()} data-qa="compartir-turnero">
        Compartir mi turnero
      </button>
      <ErrorAccion texto={error} />
    </div>
  );
}

/** Para una clase de mañana: el recordatorio con un toque. */
export function BotonRecordatorio({ id, nombre }: { id: string; nombre: string }) {
  const { pendiente, error, correr } = useAccion(nombre);
  return (
    <div>
      <button type="button" disabled={pendiente} className={cn(buttonClasses("outline", "sm"), "w-full")} onClick={() => correr(() => recordatorio(id), "Recordatorio listo")}>
        Recordarle
      </button>
      <ErrorAccion texto={error} />
    </div>
  );
}

/** «Le devolví»: el saldo a favor de esa clase se le devolvió en mano (ACREDITADO → DEVUELTO). */
export function BotonDevolver({ claseId, nombre, monto }: { claseId: string; nombre: string; monto: number }) {
  const { pendiente, error, correr } = useAccion(nombre);
  return (
    <div>
      <button type="button" disabled={pendiente} className={cn(buttonClasses("outline", "sm"), "w-full")} onClick={() => correr(() => devolverSaldo(claseId), `Le devolviste ${plataTexto(monto)}`)} data-qa="devolver-saldo">
        Le devolví
      </button>
      <ErrorAccion texto={error} />
    </div>
  );
}

/** Mandarle su link al alumno (la primera vez, o si lo perdió). */
export function BotonLink({ alumnoId, nombre }: { alumnoId: string; nombre: string }) {
  const { pendiente, error, correr } = useAccion(nombre);
  return (
    <div>
      <button type="button" disabled={pendiente} className={cn(buttonClasses("outline", "sm"), "w-full")} onClick={() => correr(() => mandarLinkAlAlumno(alumnoId), "Link listo")} data-qa="mandar-link">
        Mandarle su link
      </button>
      <ErrorAccion texto={error} />
    </div>
  );
}

/**
 * «Regenerar link» (O-1): el link viejo deja de andar en el acto. Pide confirmación (dos toques) y
 * deja listo el WhatsApp con el link nuevo para mandárselo al número registrado.
 */
export function BotonRegenerarLink({ alumnoId, nombre }: { alumnoId: string; nombre: string }) {
  const { pendiente, error, correr } = useAccion(nombre);
  const [seguro, setSeguro] = useState(false);
  return (
    <div>
      {seguro ? (
        <div className="grid gap-2">
          <p className="text-sm text-muted">El link que tiene hoy deja de andar. Le mandás el nuevo por WhatsApp.</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={cn(buttonClasses("outline", "sm"), "w-full")} onClick={() => setSeguro(false)}>
              No
            </button>
            <button
              type="button"
              disabled={pendiente}
              className={cn(buttonClasses("danger", "sm"), "w-full")}
              onClick={() => correr(() => regenerarLink(alumnoId), "Link nuevo listo")}
              data-qa="regenerar-link-si"
            >
              Sí, link nuevo
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="h-12 w-full text-sm text-muted underline" onClick={() => setSeguro(true)} data-qa="regenerar-link">
          Regenerar link
        </button>
      )}
      <ErrorAccion texto={error} />
    </div>
  );
}

/** «Reintentar» (M-066): vuelve a pedir la pantalla sin perder la navegación. */
export function BotonReintentar() {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  return (
    <button type="button" disabled={pendiente} onClick={() => start(() => router.refresh())} className={cn(buttonClasses("solid", "md"), "min-h-12 px-4")} data-qa="reintentar">
      {pendiente ? "Reintentando…" : "Reintentar"}
    </button>
  );
}
