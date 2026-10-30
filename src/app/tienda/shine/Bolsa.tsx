"use client";

// LA BOLSA — un solo `<dialog>` que en la compu (≥ 1120 px) queda abierto como riel fijo de 400 px y en el
// celular se abre como hoja modal de abajo hacia arriba. Así hay un solo formulario (sin campos repetidos)
// y el foco atrapado + Escape del modal los pone el navegador.
//
// El motor no se toca: lo que se manda es lo de siempre (productId/quantity, entrega, cupón, clave) por
// `usePedidoOnline` → `placeOnlineOrder`. Lo único nuevo viaja en `notes`: el aroma de cada renglón
// (catalogo.ts → notaConAromas), con la nota libre de la clienta después.

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { CamposDeEntrega, FrenoDeEntrega, useEntregaDeLaTienda, type AparienciaDeEntrega } from "../EntregaDeLaTienda";
import type { PedidoOnline, useCuponDePedido } from "../pedido-online";
import { ChipsDeAroma } from "./Aromas";
import type { Vista } from "./catalogo";

export type Renglon = { clave: string; id: string; nombre: string; aroma: string | null; q: number; precio: number; t: number; vista: Vista };

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
export const ESCRITORIO = "(min-width: 1120px)";

const APARIENCIA_ENTREGA: AparienciaDeEntrega = {
  bloque: { className: "shb-entrega" },
  campo: { className: "sh-campo" },
  grupo: { className: "shb-franjas" },
  opcion: { className: "shb-franja" },
  nota: { className: "shb-tenue" },
  empujon: { className: "shb-tenue" },
  freno: { className: "sh-error" },
  boton: { className: "sh-btn sh-btn-ghost" },
};

export default function Bolsa({
  abierta,
  alCerrar,
  renglones,
  cantidad,
  subtotal,
  total,
  costoEnvio,
  faltaParaGratis,
  conTarifa,
  pedido,
  cupon,
  entrega,
  setFulfillment,
  claveDePedido,
  hayWhatsApp,
  nota,
  notaLibre,
  setNotaLibre,
  alMover,
  alCambiarAroma,
  alVerColeccion,
}: {
  abierta: boolean;
  alCerrar: () => void;
  renglones: readonly Renglon[];
  cantidad: number;
  subtotal: number;
  total: number;
  costoEnvio: number;
  faltaParaGratis: number;
  conTarifa: boolean;
  pedido: PedidoOnline;
  cupon: ReturnType<typeof useCuponDePedido>;
  entrega: ReturnType<typeof useEntregaDeLaTienda>;
  setFulfillment: (f: "PICKUP" | "DELIVERY") => void;
  claveDePedido: string;
  hayWhatsApp: boolean;
  nota: string;
  notaLibre: string;
  setNotaLibre: (s: string) => void;
  alMover: (clave: string, dir: 1 | -1) => void;
  alCambiarAroma: (clave: string, aroma: string) => void;
  alVerColeccion: () => void;
}) {
  const d = useRef<HTMLDialogElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const hay = renglones.length > 0;
  const errorDeCupon = pedido.error?.campo === "cupon" ? pedido.error.texto : cupon.error;
  // Una línea por producto para el servidor (dos aromas del mismo producto suman su cantidad).
  const porProducto = new Map<string, number>();
  for (const r of renglones) porProducto.set(r.id, (porProducto.get(r.id) ?? 0) + r.q);

  // En la compu el diálogo queda abierto como riel (no modal); en el celular, modal sólo cuando se pide.
  useEffect(() => {
    const el = d.current;
    if (!el) return;
    const escritorio = window.matchMedia(ESCRITORIO).matches;
    const modal = el.matches(":modal");
    if (abierta && !escritorio) {
      if (!modal) {
        if (el.open) el.close();
        el.showModal();
        titulo.current?.focus();
      }
    } else {
      if (modal) el.close();
      if (!el.open) el.show();
    }
  }, [abierta]);

  return (
    <dialog
      ref={d}
      open
      className="shb"
      id="bolsa"
      aria-labelledby="shb-titulo"
      onCancel={(e) => {
        e.preventDefault();
        alCerrar();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) alCerrar();
      }}
    >
      <form className="shb-caja" onSubmit={pedido.onSubmit} aria-busy={pedido.enviando || undefined}>
        <div className="shb-cab">
          <h2 id="shb-titulo" ref={titulo} tabIndex={-1} className="sh-h3">
            Tu bolsa · <span className="sh-num">{cantidad}</span>
          </h2>
          <button type="button" className="sh-cerrar shb-cerrar" onClick={alCerrar}>
            Cerrar
          </button>
        </div>

        <div className="shb-cuerpo">
          {!hay && (
            <div className="shb-vacia">
              <p>Sumá una velita con el + y elegí su aroma.</p>
              <button type="button" className="sh-btn sh-btn-ghost" onClick={alVerColeccion}>
                Ver la colección
              </button>
            </div>
          )}
          {hay && (
            <ul className="shb-renglones">
              {renglones.map((r) => (
                <li key={r.clave} className="shb-r">
                  <span className="shb-mini">
                    {r.vista.miniatura ? <Image src={r.vista.miniatura} alt="" width={56} height={70} sizes="56px" /> : <span className="sh-sinfoto" aria-hidden="true" />}
                  </span>
                  <div className="shb-r-info">
                    <p className="shb-r-nombre">{r.nombre}</p>
                    {r.vista.aromas.length > 0 && (
                      <button
                        type="button"
                        className="shb-r-aroma"
                        aria-expanded={editando === r.clave}
                        onClick={() => setEditando((e) => (e === r.clave ? null : r.clave))}
                      >
                        {r.aroma ?? "Elegí el aroma"} <span className="shb-r-cambiar">· cambiar</span>
                      </button>
                    )}
                    <div className="sh-stepper sh-stepper-chico" role="group" aria-label={`Cantidad de ${r.nombre}`}>
                      <button type="button" onClick={() => alMover(r.clave, -1)} aria-label={`Quitar uno de ${r.nombre}`}>
                        −
                      </button>
                      <span className="sh-num">{r.q}</span>
                      <button type="button" onClick={() => alMover(r.clave, 1)} aria-label={`Sumar otro ${r.nombre}`}>
                        +
                      </button>
                    </div>
                  </div>
                  <span className="shb-r-importe sh-num">{money.format(r.t)}</span>
                  {editando === r.clave && (
                    <div className="shb-r-editor">
                      <ChipsDeAroma
                        chico
                        aromas={r.vista.aromas}
                        elegido={r.aroma}
                        rotulo={`Aroma de ${r.nombre}`}
                        alElegir={(a) => {
                          alCambiarAroma(r.clave, a);
                          setEditando(null);
                        }}
                      />
                    </div>
                  )}
                  {pedido.avisoDe(r.id) && (
                    <p role="alert" className="sh-error shb-r-aviso">
                      {pedido.avisoDe(r.id)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {[...porProducto].map(([id, q]) => (
            <span key={id} hidden>
              <input type="hidden" name="productId" value={id} />
              <input type="hidden" name="quantity" value={q} />
            </span>
          ))}

          {hay && (
            <div className="shb-datos">
              <input type="hidden" name="idempotencyKey" value={claveDePedido} />
              <input type="hidden" name="notes" value={nota} />
              <label className="sh-campo">
                <span>Nombre y apellido *</span>
                <input name="customerName" required autoComplete="name" />
              </label>
              <label className="sh-campo">
                <span>WhatsApp *</span>
                <input name="customerPhone" required autoComplete="tel" inputMode="tel" placeholder="11 …" />
              </label>
              <label className="sh-campo">
                <span>Entrega</span>
                <select name="fulfillment" value={entrega.fulfillment} onChange={(e) => setFulfillment(e.target.value as "PICKUP" | "DELIVERY")}>
                  <option value="DELIVERY">Envío a domicilio</option>
                  {entrega.hayRetiro && <option value="PICKUP">Retiro</option>}
                </select>
              </label>
              {entrega.fulfillment === "DELIVERY" && (
                <label className="sh-campo">
                  <span>Dirección *</span>
                  <input name="address" required autoComplete="street-address" placeholder="Calle, número, barrio" />
                </label>
              )}
              <CamposDeEntrega e={entrega} idBase="shb-entrega" apariencia={APARIENCIA_ENTREGA} />
              <label className="sh-campo">
                <span>Nota (opcional)</span>
                <textarea rows={2} value={notaLibre} onChange={(e) => setNotaLibre(e.target.value)} placeholder="Para regalo, una frase para el sticker…" />
              </label>
              <div className="sh-campo">
                <label htmlFor="shb-cupon">Cupón (opcional)</label>
                <div className="shb-cupon">
                  <input
                    id="shb-cupon"
                    name="cupon"
                    value={cupon.codigo}
                    onChange={(e) => cupon.cambiar(e.target.value)}
                    autoComplete="off"
                    placeholder="Código"
                    aria-invalid={errorDeCupon ? true : undefined}
                    aria-describedby={errorDeCupon ? "shb-cupon-error" : undefined}
                  />
                  <button type="button" className="sh-btn sh-btn-ghost" onClick={() => void cupon.aplicar()} disabled={cupon.probando}>
                    {cupon.probando ? "…" : "Aplicar"}
                  </button>
                </div>
                {errorDeCupon && (
                  <p id="shb-cupon-error" role="alert" className="sh-error">
                    {errorDeCupon}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="shb-pie">
          {faltaParaGratis > 0 && (
            <p className="shb-tenue">
              Te faltan <b className="sh-num">{money.format(faltaParaGratis)}</b> para el envío gratis.
            </p>
          )}
          <dl className="shb-cuentas">
            <div>
              <dt>Subtotal</dt>
              <dd className="sh-num">{money.format(subtotal)}</dd>
            </div>
            {cupon.descuento > 0 && (
              <div>
                <dt>Cupón {cupon.aplicado?.codigo}</dt>
                <dd className="sh-num">−{money.format(cupon.descuento)}</dd>
              </div>
            )}
            {conTarifa && (
              <div>
                <dt>{entrega.zona ? `Envío · ${entrega.zona.nombre}` : "Envío"}</dt>
                <dd className="sh-num">
                  {!hay ? "—" : entrega.modo === "envio" && entrega.conZonas && !entrega.zona ? "Elegí la zona" : costoEnvio === 0 ? "Gratis" : money.format(costoEnvio)}
                </dd>
              </div>
            )}
            <div className="shb-total">
              <dt>Total</dt>
              <dd className="sh-num" aria-live="polite">
                {money.format(total)}
              </dd>
            </div>
          </dl>
          {hay && <FrenoDeEntrega e={entrega} apariencia={APARIENCIA_ENTREGA} />}
          {pedido.error && pedido.error.campo !== "cupon" && (
            <p role="alert" className="sh-error">
              {pedido.error.texto}
            </p>
          )}
          {pedido.confirmado && (
            <div role="status" className="shb-ok">
              <p>
                Tu pedido <b>#{pedido.confirmado.code}</b> quedó registrado.{" "}
                {pedido.confirmado.whatsapp ? "Seguimos por WhatsApp." : "Te vamos a escribir al WhatsApp que dejaste."}
              </p>
              {pedido.confirmado.whatsapp && (
                <a href={pedido.confirmado.whatsapp} target="_blank" rel="noopener noreferrer">
                  Abrir el chat del pedido #{pedido.confirmado.code}
                </a>
              )}
            </div>
          )}
          <p className="shb-tenue">El pago se coordina al confirmar el pedido.</p>
          <button
            type="submit"
            name="via"
            value="tienda"
            className="sh-btn sh-btn-vino sh-btn-ancho"
            disabled={!hay || pedido.enviando || Boolean(entrega.freno)}
            aria-busy={pedido.enviando || undefined}
          >
            {pedido.enviando ? "Enviando…" : "Enviar pedido"}
          </button>
          {hay && hayWhatsApp && (
            <button type="submit" name="via" value="whatsapp" className="sh-btn sh-btn-ghost sh-btn-ancho" disabled={pedido.enviando || Boolean(entrega.freno)}>
              Pedir por WhatsApp
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
