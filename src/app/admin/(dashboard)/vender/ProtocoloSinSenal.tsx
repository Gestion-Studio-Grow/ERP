"use client";

// ============================================================================
// LA TARJETA DEL PROTOCOLO SIN SEÑAL (Magra, tanda 2 · 2E; E19/E20 del mostrador, MG-059).
// ============================================================================
//
// El sábado a las 11 se corta internet. Lo que hay que hacer está escrito acá, en palabras del
// mostrador: anotar en el cuaderno, cobrar en efectivo o con el posnet, no prometer Mercado Pago ni
// transferencia sin poder verlos, y cargar el cuaderno el mismo día cuando vuelva la señal.
//
// Dos maneras de montarla:
//   · En Vender (`siempre` apagado): aparece SOLA cuando el navegador se queda sin conexión, y se
//     queda chica («Volvió la señal: cargá el cuaderno») cuando vuelve, hasta que se descarta. Si en
//     la pestaña quedó un cobro sin confirmar, lo dice: ése no se anota, se reintenta.
//   · En «Cargar ventas del cuaderno» (`siempre`): el protocolo entero, de referencia.
//
// Mira el estado que expone `cobro-sin-conexion.ts` (conexión + cobro sin confirmar) sin tocar el
// formulario de Vender: no cambia ninguna regla del cobro. Sin animación (se ve en un momento de
// apuro; `prefers-reduced-motion` no tiene nada que apagar). Colores por tokens.

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { almacenDeSesion, hayCobroSinConfirmar, hayConexion, suscribirseALaSenal } from "./cobro-sin-conexion";
import { textoDelPosnet } from "@/lib/caja/medio-cobro";

/** Dónde se cargan las ventas anotadas. */
export const RUTA_DEL_CUADERNO = "/admin/vender/cuaderno";

export type ProtocoloSinSenalProps = {
  /** El negocio (para leer el cobro sin confirmar de ESTE negocio en la pestaña). */
  negocioId: string;
  /** Mostrar el protocolo siempre (la pantalla del cuaderno). En Vender, apagado. */
  siempre?: boolean;
  /**
   * ¿Se puede cargar la venta con Tarjeta? (N2 · M1-C1, `tarjetaHabilitada`). Sin el valor en el enum
   * (o sin decirlo), la venta con posnet se anota igual en el cuaderno como TARJETA: no se rompe nada.
   */
  conTarjeta?: boolean;
  className?: string;
};

export default function ProtocoloSinSenal({ negocioId, siempre = false, conTarjeta = false, className }: ProtocoloSinSenalProps) {
  const enLinea = useSyncExternalStore(suscribirseALaSenal, hayConexion, () => true);
  const [cobroEnDuda, setCobroEnDuda] = useState(false);
  // ¿Hubo un corte mientras esta pantalla estaba abierta? (para el aviso de «volvió la señal»). Se
  // ajusta al render cuando cambia la conexión (sin efecto): un corte nuevo vuelve a mostrar el aviso.
  const [corte, setCorte] = useState({ enLinea: true, huboCorte: false, descartado: false });
  if (corte.enLinea !== enLinea) {
    setCorte((c) => ({ enLinea, huboCorte: c.huboCorte || !enLinea, descartado: enLinea ? c.descartado : false }));
  }
  const { huboCorte, descartado } = corte;

  useEffect(() => {
    const leer = () => setCobroEnDuda(hayCobroSinConfirmar(almacenDeSesion(), negocioId));
    leer();
    return suscribirseALaSenal(leer);
  }, [negocioId]);

  if (!siempre && enLinea) {
    if (!huboCorte || descartado) return null;
    return (
      <section
        aria-labelledby="volvio-la-senal"
        data-ui="protocolo-sin-senal"
        data-estado="volvio"
        className={`flex flex-wrap items-center gap-3 rounded-lg border border-success/40 bg-success-soft/40 p-3 text-sm ${className ?? ""}`}
      >
        <p id="volvio-la-senal" className="min-w-0 flex-1 text-body">
          <strong className="text-strong">Volvió la señal.</strong> Si anotaste ventas en el cuaderno, cargalas ahora con su hora.
        </p>
        <Link
          href={RUTA_DEL_CUADERNO}
          className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 font-semibold text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Cargar ventas del cuaderno
        </Link>
        <button
          type="button"
          onClick={() => setCorte((c) => ({ ...c, descartado: true }))}
          className="inline-flex min-h-11 items-center rounded-md px-3 text-muted underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          No anoté nada
        </button>
      </section>
    );
  }

  const sinSenal = !enLinea;
  return (
    <section
      aria-labelledby="protocolo-sin-senal"
      data-ui="protocolo-sin-senal"
      data-estado={sinSenal ? "sin-senal" : "referencia"}
      className={`rounded-lg border p-4 text-sm ${sinSenal ? "border-warning bg-warning-soft/40" : "border-line bg-surface-raised"} ${className ?? ""}`}
    >
      <h2 id="protocolo-sin-senal" className="text-base font-semibold text-strong">
        {sinSenal ? "Se cortó internet: seguí vendiendo con el cuaderno" : "Si se corta internet"}
      </h2>
      {sinSenal && (
        // Sólo esta frase se anuncia (role=alert): el protocolo entero se lee con calma.
        <p role="alert" className="mt-1 text-body">Lo que cobres ahora no se manda al sistema. No pasa nada: anotalo y cargalo cuando vuelva la señal.</p>
      )}
      {cobroEnDuda && (
        <p className="mt-2 rounded-md border border-danger/40 bg-danger-soft/40 p-2 text-strong">
          Quedó un cobro sin confirmar en esta pantalla: <strong>ése no lo anotes en el cuaderno</strong>. Cuando vuelva la señal, tocá
          «Reintentar cobro»: si ya había entrado, no se cobra dos veces.
        </p>
      )}
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-body">
        <li>
          <strong className="text-strong">Anotá cada venta en el cuaderno</strong>: la hora, el corte, el peso o la cantidad y cómo pagó
          (y el nombre, si es clienta).
        </li>
        <li>
          <strong className="text-strong">Cobrá en efectivo o con el posnet</strong> (si anda con su propio chip) y guardá el comprobante.
          Los precios, de la lista impresa. Con el <span data-protocolo="posnet">{textoDelPosnet(conTarjeta)}</span>
        </li>
        <li>
          <strong className="text-strong">No prometas Mercado Pago ni transferencia</strong>: sin señal no podés ver si la plata entró. Si
          te dicen «ya te transferí», anotá nombre y teléfono y fijate cuando vuelva la señal antes de darla por cobrada.
        </li>
        <li>
          <strong className="text-strong">Cuando vuelva la señal, cargá el cuaderno el mismo día</strong>, con la hora en que vendiste: así
          entra en la caja del día. Un día ya cerrado no acepta ventas nuevas.
        </li>
      </ol>
      {!siempre && (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 text-body">
          Cuando vuelva la señal:
          <Link
            href={RUTA_DEL_CUADERNO}
            className="inline-flex min-h-11 items-center font-semibold text-accent-ink underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Cargar ventas del cuaderno
          </Link>
        </p>
      )}
    </section>
  );
}
