"use client";

// LA BOLSA — cajón lateral en la computadora, hoja de abajo en el teléfono. Dos pasos: lo que llevás y
// tus datos. El envío es el del ERP (useVidriera → placeOnlineOrder): la misma clave anti-duplicado, el
// mismo cupón y la misma limpieza de la bolsa en la página de gracias (marcarEnvio + OlvidarBolsa).
//
// Lo que NO dice, porque la marca no lo publicó: tarifa de envío, zonas ni medios de pago. Dice lo que
// es cierto: el envío o el punto de encuentro en Ezeiza y el pago se coordinan por mensaje.

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { plata, textoDelEnvio } from "../vidriera/catalogo-core";
import type { EstadoVidriera } from "../vidriera/useVidriera";
import { MENSAJE_NO_SE_PUDO } from "../reglas-tienda";
import { mensajeDirecto, type Pieza } from "./vitrina";
import { IconoBolsa, IconoCerrar } from "./Iconos";

const NO_SE_PUDO_SIN_WHATSAPP =
  "No pudimos tomar el pedido. Tu bolsa sigue acá: probá de nuevo en un rato o escribinos por Instagram.";

export default function Bolsa({
  abierta,
  alCerrar,
  v,
  porId,
  instagram,
  ciudad,
  notasPlaceholder,
  hayWhatsApp = false,
}: {
  abierta: boolean;
  alCerrar: () => void;
  v: EstadoVidriera;
  porId: ReadonlyMap<string, Pieza>;
  instagram: string;
  ciudad: string;
  notasPlaceholder: string;
  hayWhatsApp?: boolean;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const [paso, setPaso] = useState<"bolsa" | "datos">("bolsa");
  const id = useId();
  const { pedido, cupon } = v;
  const hay = v.lineas.length > 0;

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (abierta && !d.open) {
      d.showModal();
      titulo.current?.focus();
    } else if (!abierta && d.open) d.close();
  }, [abierta]);

  // Si la bolsa se vacía estando en «tus datos», se vuelve al primer paso (no hay nada que pedir).
  const pasoVisible = hay ? paso : "bolsa";

  const error =
    pedido.error && pedido.error.campo !== "cupon"
      ? pedido.error.texto === MENSAJE_NO_SE_PUDO && !hayWhatsApp
        ? NO_SE_PUDO_SIN_WHATSAPP
        : pedido.error.texto
      : null;
  const errorDeCupon = pedido.error?.campo === "cupon" ? pedido.error.texto : cupon.error;
  const envio = textoDelEnvio({
    fulfillment: v.fulfillment,
    costo: v.costoEnvio,
    hayTarifa: false,
    sinTarifa: "a-coordinar",
    hayProductos: hay,
  });

  return (
    <dialog
      ref={dialogo}
      className="qb-bolsa"
      aria-labelledby="qb-bolsa-titulo"
      onCancel={(e) => {
        e.preventDefault();
        alCerrar();
      }}
      onClose={alCerrar}
      onClick={(e) => {
        if (e.target === e.currentTarget) alCerrar();
      }}
    >
      <form
        className="qb-bolsa-caja"
        onSubmit={(e) => {
          const via = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value ?? null;
          v.marcarEnvio(via);
          pedido.onSubmit(e);
        }}
      >
        <div className="qb-bolsa-cabeza">
          <h2 id="qb-bolsa-titulo" ref={titulo} tabIndex={-1}>
            {pasoVisible === "bolsa" ? "Tu bolsa" : "Tus datos"}
          </h2>
          <span className="qb-bolsa-cuantos">
            {hay ? `${v.piezas} ${v.piezas === 1 ? "perfume" : "perfumes"}` : "Vacía"}
          </span>
          <button type="button" className="qb-cerrar" onClick={alCerrar} aria-label="Cerrar la bolsa">
            <IconoCerrar />
          </button>
        </div>

        {/* Lo que viaja al servidor: siempre adentro del formulario, en los dos pasos. */}
        {v.lineas.map((l) => (
          <span key={l.p.id} hidden>
            <input type="hidden" name="productId" value={l.p.id} />
            <input type="hidden" name="quantity" value={l.q} />
          </span>
        ))}
        <input type="hidden" name="idempotencyKey" value={v.clave} />

        {!hay ? (
          <div className="qb-bolsa-vacia">
            <IconoBolsa className="qb-bolsa-vacia-icono" />
            <p>Tu bolsa está vacía.</p>
            <p className="qb-tenue">Sumá los que te gusten desde la vitrina.</p>
            <button
              type="button"
              className="qb-boton qb-boton-oro"
              onClick={() => {
                alCerrar();
                requestAnimationFrame(() => document.getElementById("vitrina")?.scrollIntoView({ behavior: "smooth" }));
              }}
            >
              Ir a la vitrina
            </button>
          </div>
        ) : pasoVisible === "bolsa" ? (
          <>
            <ul className="qb-lineas">
              {v.lineas.map((l) => {
                const p = porId.get(l.p.id);
                const aviso = pedido.avisoDe(l.p.id);
                return (
                  <li key={l.p.id} className="qb-linea">
                    <div className="qb-linea-foto" aria-hidden="true">
                      {p?.foto ? <Image src={p.foto} alt="" width={120} height={150} sizes="64px" /> : <span>{(p?.nombre ?? l.p.name).charAt(0)}</span>}
                    </div>
                    <div className="qb-linea-texto">
                      <p className="qb-linea-nombre">{p?.nombre ?? l.p.name}</p>
                      <p className="qb-tenue">{p?.casa ?? ""}</p>
                      <div className="qb-cantidad" role="group" aria-label={`Cantidad de ${p?.nombre ?? l.p.name}`}>
                        <button type="button" onClick={() => v.mover(l.p, -1)} aria-label={`Sacar uno de ${p?.nombre ?? l.p.name}`}>
                          −
                        </button>
                        <span>{l.q}</span>
                        <button
                          type="button"
                          onClick={() => v.mover(l.p, 1)}
                          disabled={l.p.disponibilidad === "sin-stock"}
                          aria-label={`Sumar otro ${p?.nombre ?? l.p.name}`}
                        >
                          +
                        </button>
                      </div>
                      {aviso && (
                        <p className="qb-error-linea" role="alert">
                          {aviso}
                        </p>
                      )}
                    </div>
                    <div className="qb-linea-fin">
                      <p className="qb-num">{plata(l.importe)}</p>
                      <button type="button" className="qb-sacar" onClick={() => v.fijar(l.p, 0)}>
                        Sacar
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="qb-bolsa-pie">
              <dl className="qb-totales">
                <div>
                  <dt>Productos</dt>
                  <dd className="qb-num">{plata(v.subtotal)}</dd>
                </div>
                <div>
                  <dt>Envío o punto de encuentro</dt>
                  <dd>{envio}</dd>
                </div>
              </dl>
              <p className="qb-tenue qb-bolsa-nota">La entrega y el medio de pago los coordinamos por mensaje.</p>
              <button type="button" className="qb-boton qb-boton-oro qb-boton-ancho" onClick={() => setPaso("datos")}>
                Seguir con el pedido
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="qb-datos">
              <button type="button" className="qb-volver" onClick={() => setPaso("bolsa")}>
                ← Volver a la bolsa
              </button>
              <div className="qb-campo">
                <label htmlFor={`${id}-nombre`}>Tu nombre</label>
                <input id={`${id}-nombre`} name="customerName" required autoComplete="name" maxLength={120} />
              </div>
              <div className="qb-campo">
                <label htmlFor={`${id}-tel`}>Teléfono</label>
                <input
                  id={`${id}-tel`}
                  name="customerPhone"
                  type="tel"
                  required
                  autoComplete="tel"
                  inputMode="tel"
                  maxLength={40}
                  placeholder="11 5555 5555"
                  aria-describedby={`${id}-tel-ayuda`}
                />
                <small id={`${id}-tel-ayuda`}>Te escribimos a este número para coordinar.</small>
              </div>
              <fieldset className="qb-entrega">
                <legend>¿Cómo te lo llevás?</legend>
                <label>
                  <input
                    type="radio"
                    name="fulfillment"
                    value="DELIVERY"
                    checked={v.fulfillment === "DELIVERY"}
                    onChange={() => v.setFulfillment("DELIVERY")}
                  />
                  <span>
                    <strong>Envío</strong>
                    <small>Te pasamos el costo por mensaje.</small>
                  </span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="fulfillment"
                    value="PICKUP"
                    checked={v.fulfillment === "PICKUP"}
                    onChange={() => v.setFulfillment("PICKUP")}
                  />
                  <span>
                    <strong>Punto de encuentro en {ciudad}</strong>
                    <small>Coordinamos lugar y horario por mensaje.</small>
                  </span>
                </label>
              </fieldset>
              {v.fulfillment === "DELIVERY" && (
                <div className="qb-campo">
                  <label htmlFor={`${id}-dir`}>Dirección</label>
                  <input id={`${id}-dir`} name="address" required autoComplete="street-address" maxLength={300} placeholder="Calle, número, localidad" />
                </div>
              )}
              <div className="qb-campo">
                <label htmlFor={`${id}-nota`}>
                  Nota <em>(opcional)</em>
                </label>
                <input id={`${id}-nota`} name="notes" maxLength={500} placeholder={notasPlaceholder} />
              </div>
              <details className="qb-cupon" open={Boolean(cupon.aplicado) || undefined}>
                <summary>Tengo un cupón</summary>
                <div className="qb-cupon-fila">
                  <div className="qb-campo">
                    <label htmlFor={`${id}-cupon`} className="qb-sr">
                      Código del cupón
                    </label>
                    <input
                      id={`${id}-cupon`}
                      name="cupon"
                      value={cupon.codigo}
                      onChange={(e) => cupon.cambiar(e.target.value)}
                      autoComplete="off"
                      placeholder="CÓDIGO"
                      aria-invalid={Boolean(errorDeCupon)}
                    />
                  </div>
                  <button type="button" className="qb-boton qb-boton-linea" onClick={() => void cupon.aplicar()} disabled={cupon.probando}>
                    {cupon.probando ? "Revisando…" : "Aplicar"}
                  </button>
                </div>
                {errorDeCupon && (
                  <p className="qb-error-linea" role="alert">
                    {errorDeCupon}
                  </p>
                )}
              </details>
            </div>
            <div className="qb-bolsa-pie">
              <dl className="qb-totales">
                <div>
                  <dt>Productos</dt>
                  <dd className="qb-num">{plata(v.subtotal)}</dd>
                </div>
                {cupon.descuento > 0 && (
                  <div>
                    <dt>Cupón {cupon.aplicado?.codigo}</dt>
                    <dd className="qb-num">−{plata(cupon.descuento)}</dd>
                  </div>
                )}
                <div>
                  <dt>{v.fulfillment === "DELIVERY" ? "Envío" : "Punto de encuentro"}</dt>
                  <dd>{envio}</dd>
                </div>
                <div className="qb-total">
                  <dt>Total de los productos</dt>
                  <dd className="qb-num">{plata(v.total)}</dd>
                </div>
              </dl>
              {error && (
                <p className="qb-error" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" name="via" value="tienda" className="qb-boton qb-boton-oro qb-boton-ancho" disabled={pedido.enviando}>
                {pedido.enviando ? "Tomando tu pedido…" : "Hacer pedido"}
              </button>
              {hayWhatsApp && (
                <button type="submit" name="via" value="whatsapp" className="qb-boton qb-boton-linea qb-boton-ancho" disabled={pedido.enviando}>
                  Pedir por WhatsApp
                </button>
              )}
              <p className="qb-tenue qb-bolsa-nota">
                No se cobra nada acá. Te escribimos para coordinar la entrega y el pago —o{" "}
                <a href={mensajeDirecto(instagram)} target="_blank" rel="noopener noreferrer">
                  escribinos vos por Instagram
                </a>
                .
              </p>
            </div>
          </>
        )}
      </form>
    </dialog>
  );
}
