"use client";

// ============================================================================
// LA BOLSA — `<dialog>` modal: panel lateral en la compu, pantalla completa en el celular.
// ============================================================================
//
// El motor no se toca: lo que se manda es lo de siempre (productId/quantity, entrega, cupón, clave) por
// `usePedidoOnline` → `placeOnlineOrder`, que con «Hacer el pedido» lleva a /tienda/gracias?pedido=N.
// Lo único nuevo viaja en `notes`: el talle de cada zapatilla (catalogo.ts → notaConTalles), con la nota
// libre después. Sin tarifa de envío cargada, el envío «se cotiza al confirmar» (nunca «gratis»).

import CamposDelPedido from "@/components/vidriera/CamposDelPedido";
import { useHoja } from "@/components/vidriera/useHoja";
import { useEffect, useLayoutEffect, useRef } from "react";
import { CamposDeEntrega, FrenoDeEntrega, type AparienciaDeEntrega, type EstadoDeEntrega } from "../EntregaDeLaTienda";
import type { CuponDePedido, PedidoOnline } from "../pedido-online";
import { plata, textoDelEnvio } from "../vidriera/catalogo-core";
import type { Item } from "./catalogo";
import { PROMESAS, precioTransferencia } from "./tokens";
import { Silueta } from "./Siluetas";

export type Renglon = { clave: string; id: string; nombre: string; talle: string | null; q: number; precio: number; t: number; item: Item };

const APARIENCIA_ENTREGA: AparienciaDeEntrega = {
  bloque: { className: "am-b-entrega" },
  campo: { className: "am-campo" },
  grupo: { className: "am-chips am-chips-wrap" },
  opcion: { className: "am-chip am-chip-radio" },
  nota: { className: "am-nota" },
  empujon: { className: "am-nota" },
  freno: { className: "am-error" },
  boton: { className: "am-btn am-btn-b" },
};

export default function Bolsa({
  abierta,
  alCerrar,
  renglones,
  cantidad,
  subtotal,
  total,
  pedido,
  cupon,
  entrega,
  setFulfillment,
  conTarifa,
  claveDePedido,
  alEnviar,
  hayWhatsApp,
  nota,
  notaLibre,
  setNotaLibre,
  alMover,
  alVerPalas,
}: {
  abierta: boolean;
  alCerrar: () => void;
  renglones: readonly Renglon[];
  cantidad: number;
  subtotal: number;
  total: number;
  pedido: PedidoOnline;
  cupon: CuponDePedido;
  entrega: EstadoDeEntrega;
  setFulfillment: (f: "PICKUP" | "DELIVERY") => void;
  conTarifa: boolean;
  claveDePedido: string;
  alEnviar?: (via: string | null) => void;
  hayWhatsApp: boolean;
  nota: string;
  notaLibre: string;
  setNotaLibre: (s: string) => void;
  alMover: (clave: string, delta: number) => void;
  alVerPalas: () => void;
}) {
  const d = useRef<HTMLDialogElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const origen = useRef<Element | null>(null);
  const hay = renglones.length > 0;
  const errorDeCupon = pedido.error?.campo === "cupon" ? pedido.error.texto : cupon.error;
  // Una línea por producto para el servidor (dos talles de la misma zapatilla suman su cantidad).
  const porProducto = new Map<string, number>();
  const precioVisto = new Map<string, number>();
  for (const r of renglones) {
    porProducto.set(r.id, (porProducto.get(r.id) ?? 0) + r.q);
    precioVisto.set(r.id, r.precio);
  }
  const envio = textoDelEnvio({ fulfillment: entrega.fulfillment, costo: entrega.costoEnvio, hayTarifa: conTarifa, sinTarifa: "a-coordinar", hayProductos: hay });
  const totalTransferencia = precioTransferencia(subtotal - cupon.descuento);

  // Lo que tenía el foco antes de abrir: se captura ANTES de que la hoja lo lleve al título (efecto de layout declarado
  // primero) y se le devuelve al cerrar.
  useLayoutEffect(() => {
    if (abierta) origen.current = document.activeElement;
    else if (origen.current) {
      const o = origen.current;
      window.setTimeout(() => {
        if (o instanceof HTMLElement && o.isConnected) o.focus({ preventScroll: true });
      }, 0);
    }
  }, [abierta]);
  // La hoja compartida (ronda 2): showModal, foco al título y «atrás» del celular que cierra la bolsa.
  useHoja(d, abierta, alCerrar, { foco: titulo });

  return (
    <dialog
      ref={d}
      className="am-bolsa"
      id="bolsa"
      aria-labelledby="am-bolsa-t"
      onCancel={(e) => {
        e.preventDefault();
        alCerrar();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) alCerrar();
      }}
    >
      <form
        className="am-b-caja"
        onSubmit={(e) => {
          // Por «Enviar pedido» el alta redirige a gracias: se anota qué bolsa salió para olvidarla allá (ronda 2).
          alEnviar?.(((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value ?? null);
          pedido.onSubmit(e);
        }}
        aria-busy={pedido.enviando || undefined}
      >
        <div className="am-b-cab">
          <h2 id="am-bolsa-t" ref={titulo} tabIndex={-1} className="am-h3">
            Tu bolsa · <span className="am-num">{cantidad}</span>
          </h2>
          <button type="button" className="am-cerrar" onClick={alCerrar}>
            Cerrar
          </button>
        </div>

        <div className="am-b-cuerpo">
          {!hay && !pedido.confirmado && (
            <div className="am-b-vacia">
              <p>Sumá lo que quieras con el «+». Te confirmamos stock y talle antes de cobrar.</p>
              <button type="button" className="am-btn am-btn-p" onClick={alVerPalas}>
                Ver las palas
              </button>
            </div>
          )}
          {hay && (
            <ul className="am-b-renglones">
              {renglones.map((r) => (
                <li key={r.clave} className="am-b-r">
                  <span className="am-b-mini">
                    <Silueta tipo={r.item.vista.silueta} />
                  </span>
                  <div className="am-b-info">
                    <p className="am-b-nombre">{r.nombre}</p>
                    {r.talle && <p className="am-b-talle">Talle {r.talle}</p>}
                    <div className="am-paso am-paso-chico" role="group" aria-label={`Cantidad de ${r.nombre}`}>
                      <button type="button" onClick={() => alMover(r.clave, -1)} aria-label={`Quitar uno de ${r.nombre}`}>
                        −
                      </button>
                      <span className="am-num">{r.q}</span>
                      <button type="button" onClick={() => alMover(r.clave, 1)} aria-label={`Sumar otro ${r.nombre}`}>
                        +
                      </button>
                    </div>
                  </div>
                  <span className="am-b-importe am-num">{plata(r.t)}</span>
                  {pedido.avisoDe(r.id) && (
                    <p role="alert" className="am-error am-b-aviso">
                      {pedido.avisoDe(r.id)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {/* Con el precio que la vidriera MOSTRÓ (ronda 2): si cambió, el servidor avisa en vez de cobrar distinto. */}
          <CamposDelPedido renglones={[...porProducto].map(([id, q]) => ({ productId: id, quantity: q, unitPrice: precioVisto.get(id) ?? null }))} clave={claveDePedido} />

          {hay && (
            <div className="am-b-datos">
              <input type="hidden" name="notes" value={nota} />
              <p className="am-sub">Tus datos</p>
              <label className="am-campo">
                <span>Nombre y apellido *</span>
                <input name="customerName" required autoComplete="name" />
              </label>
              <label className="am-campo">
                <span>Teléfono (WhatsApp) *</span>
                <input name="customerPhone" required autoComplete="tel" inputMode="tel" placeholder="11 …" />
              </label>
              <fieldset className="am-campo am-b-entrega-elegir">
                <legend>Entrega</legend>
                <div className="am-chips am-chips-wrap">
                  {entrega.hayRetiro && (
                    <label className="am-chip am-chip-radio" data-elegida={entrega.fulfillment === "PICKUP" || undefined}>
                      <input type="radio" name="fulfillment" value="PICKUP" checked={entrega.fulfillment === "PICKUP"} onChange={() => setFulfillment("PICKUP")} />
                      <span>Retiro</span>
                    </label>
                  )}
                  <label className="am-chip am-chip-radio" data-elegida={entrega.fulfillment === "DELIVERY" || undefined}>
                    <input type="radio" name="fulfillment" value="DELIVERY" checked={entrega.fulfillment === "DELIVERY"} onChange={() => setFulfillment("DELIVERY")} />
                    <span>Envío</span>
                  </label>
                </div>
              </fieldset>
              {entrega.fulfillment === "DELIVERY" && (
                <>
                  <label className="am-campo">
                    <span>Dirección *</span>
                    <input name="address" required autoComplete="street-address" placeholder="Calle, número, ciudad" />
                  </label>
                  {!conTarifa && <p className="am-nota">El envío se cotiza al confirmar el pedido.</p>}
                </>
              )}
              <CamposDeEntrega e={entrega} idBase="am-entrega" apariencia={APARIENCIA_ENTREGA} />
              <label className="am-campo">
                <span>Nota (opcional)</span>
                <textarea rows={2} value={notaLibre} onChange={(e) => setNotaLibre(e.target.value)} placeholder="Talle, nivel de juego, dudas…" maxLength={400} />
              </label>
              <details className="am-b-cupon" open={Boolean(cupon.codigo || errorDeCupon)}>
                <summary>¿Tenés un cupón?</summary>
                <div className="am-b-cupon-fila">
                  <label className="am-sr" htmlFor="am-cupon">
                    Código del cupón
                  </label>
                  <input
                    id="am-cupon"
                    name="cupon"
                    value={cupon.codigo}
                    onChange={(e) => cupon.cambiar(e.target.value)}
                    autoComplete="off"
                    placeholder="Código"
                    aria-invalid={errorDeCupon ? true : undefined}
                    aria-describedby={errorDeCupon ? "am-cupon-error" : undefined}
                  />
                  <button type="button" className="am-btn am-btn-b" onClick={() => void cupon.aplicar()} disabled={cupon.probando}>
                    {cupon.probando ? "…" : "Aplicar"}
                  </button>
                </div>
                {errorDeCupon && (
                  <p id="am-cupon-error" role="alert" className="am-error">
                    {errorDeCupon}
                  </p>
                )}
              </details>
            </div>
          )}
        </div>

        <div className="am-b-pie">
          {hay && (
            <dl className="am-b-cuentas">
              <div>
                <dt>Subtotal</dt>
                <dd className="am-num">{plata(subtotal)}</dd>
              </div>
              {cupon.descuento > 0 && (
                <div>
                  <dt>Cupón {cupon.aplicado?.codigo}</dt>
                  <dd className="am-num">−{plata(cupon.descuento)}</dd>
                </div>
              )}
              <div>
                <dt>{entrega.zona ? `Envío · ${entrega.zona.nombre}` : "Envío"}</dt>
                <dd className="am-num">{entrega.modo === "envio" && entrega.conZonas && !entrega.zona ? "Elegí la zona" : envio}</dd>
              </div>
              <div className="am-b-total">
                <dt>Total</dt>
                <dd className="am-num" aria-live="polite">
                  {plata(total)}
                </dd>
              </div>
              {totalTransferencia !== null && (
                <div className="am-b-transf">
                  <dt>Si pagás por transferencia</dt>
                  <dd className="am-num">{plata(totalTransferencia + entrega.costoEnvio)}</dd>
                </div>
              )}
            </dl>
          )}
          {hay && PROMESAS.cuotas && <p className="am-nota">O en 3 y 12 cuotas sin interés. El medio de pago lo confirmamos antes de cobrar.</p>}
          {hay && <FrenoDeEntrega e={entrega} apariencia={APARIENCIA_ENTREGA} />}
          {pedido.error && pedido.error.campo !== "cupon" && (
            <p role="alert" className="am-error">
              {pedido.error.texto}
            </p>
          )}
          {pedido.confirmado && (
            <div role="status" className="am-b-ok">
              <p>
                Tu pedido <b>#{pedido.confirmado.code}</b> quedó registrado.{" "}
                {pedido.confirmado.whatsapp ? "Seguimos por WhatsApp." : "Te escribimos al teléfono que dejaste."}
              </p>
              {pedido.confirmado.whatsapp && (
                <a href={pedido.confirmado.whatsapp} target="_blank" rel="noopener noreferrer">
                  Abrir el chat del pedido #{pedido.confirmado.code}
                </a>
              )}
            </div>
          )}
          {hay && (
            <button
              type="submit"
              name="via"
              value="tienda"
              className="am-btn am-btn-p am-btn-ancho"
              disabled={pedido.enviando || Boolean(entrega.freno)}
              aria-busy={pedido.enviando || undefined}
            >
              {pedido.enviando ? "Enviando…" : "Hacer el pedido"}
            </button>
          )}
          {hay && hayWhatsApp && (
            <button type="submit" name="via" value="whatsapp" className="am-btn am-btn-b am-btn-ancho" disabled={pedido.enviando || Boolean(entrega.freno)}>
              Pedir por WhatsApp
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
