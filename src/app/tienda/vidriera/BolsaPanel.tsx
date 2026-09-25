"use client";

// ============================================================================
// EL PEDIDO — el riel de la derecha en la PC, la hoja de abajo en el celular.
// ============================================================================
//
// Se lee como un ticket: cada línea con su cantidad y su plata en la columna de la derecha, el envío
// dicho como es (tarifa, «Sin cargo» o «A coordinar»), el total grande. Con algo en la bolsa aparecen
// los datos para tomar el pedido: nombre, WhatsApp, entrega (dos opciones, no un desplegable),
// dirección si es envío, una nota. El cupón queda plegado: casi nadie lo tiene.
//
// El envío va por `usePedidoOnline` (../pedido-online.tsx), el mismo de las vidrieras de hoy: si el
// servidor rechaza, la bolsa queda y el motivo se ve al lado de la línea o arriba del botón. «Enviar
// pedido» lleva a la página de seguimiento; «Pedir por WhatsApp» registra el pedido y abre el chat
// con su número. Sin WhatsApp publicado, ese botón no aparece: nada de un botón que no lleva a nadie.

import { useEffect, useRef, useState } from "react";
import s from "./vidriera.module.css";
import { plata, precioDe, textoCantidad, textoDelEnvio } from "./catalogo-core";
import type { ShippingConfig } from "@/lib/storefront-shipping";
import type { Palabras } from "./marcas";
import type { EstadoVidriera } from "./useVidriera";
import { Paso } from "./Paso";
import { IconoCerrar, IconoWhatsApp } from "./Iconos";

export function BolsaPanel({
  v,
  palabras,
  hayWhatsApp,
  zona,
  textoPago,
  envio,
  envioSinTarifa,
  abierta,
  onCerrar,
  onAbrirFicha,
}: {
  v: EstadoVidriera;
  palabras: Palabras;
  hayWhatsApp: boolean;
  zona: string | null;
  textoPago: string;
  envio: ShippingConfig | null;
  envioSinTarifa: "sin-cargo" | "a-coordinar";
  abierta: boolean;
  onCerrar: () => void;
  onAbrirFicha: (id: string) => void;
}) {
  const titulo = useRef<HTMLHeadingElement>(null);
  const [conCupon, setConCupon] = useState(false);
  const hay = v.lineas.length > 0;
  const { pedido, cupon } = v;
  const errorDeCupon = pedido.error?.campo === "cupon" ? pedido.error.texto : cupon.error;

  // Hoja abierta (celular): el foco entra, Esc cierra, la página de atrás no se mueve.
  useEffect(() => {
    if (!abierta) return;
    titulo.current?.focus();
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    document.addEventListener("keydown", alTeclear);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = antes;
    };
  }, [abierta, onCerrar]);

  const envioTexto = textoDelEnvio({
    fulfillment: v.fulfillment,
    costo: v.costoEnvio,
    hayTarifa: Boolean(envio),
    sinTarifa: envioSinTarifa,
    hayProductos: hay,
  });

  return (
    <form
      className={s.bolsaIn}
      onSubmit={(e) => {
        const via = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value ?? null;
        v.marcarEnvio(via);
        pedido.onSubmit(e);
      }}
      noValidate={false}
    >
      <div className={s.bolsaCab}>
        <h2 className={s.bolsaTit} ref={titulo} tabIndex={-1}>
          Tu pedido
        </h2>
        <span className={s.bolsaSub}>
          {hay
            ? `${v.piezas} ${v.piezas === 1 ? palabras.uno : palabras.varios}${v.hayPeso ? " · se pesa al envasar" : ""}`
            : "Vacío"}
        </span>
        <button type="button" className={`${s.cerrar} ${s.soloMovil}`} onClick={onCerrar} aria-label="Cerrar el pedido">
          <IconoCerrar />
        </button>
      </div>

      {pedido.confirmado && (
        <div role="status" className={s.avisoOk}>
          <p>
            Tu pedido <b>#{pedido.confirmado.code}</b> quedó registrado.{" "}
            {pedido.confirmado.whatsapp ? "Seguimos por WhatsApp." : "Te escribimos al WhatsApp que dejaste."}
          </p>
          {pedido.confirmado.whatsapp && (
            <a href={pedido.confirmado.whatsapp} target="_blank" rel="noopener noreferrer" className={s.enlace}>
              Abrir el chat del pedido #{pedido.confirmado.code}
            </a>
          )}
          <a href={`/tienda/gracias?pedido=${pedido.confirmado.code}`} className={s.enlace}>
            Ver cómo sigue
          </a>
        </div>
      )}

      {!hay && !pedido.confirmado && <p className={s.bolsaVacia}>{palabras.bolsaVacia}</p>}

      {hay && (
        <ul className={s.lineas}>
          {v.lineas.map((l) => {
            const aviso = pedido.avisoDe(l.p.id);
            return (
              <li key={l.p.id} className={s.lin} data-con-aviso={aviso ? true : undefined}>
                <div className={s.linTxt}>
                  <button type="button" className={s.linNom} onClick={() => onAbrirFicha(l.p.id)}>
                    {l.p.name}
                  </button>
                  <span className={s.linMeta}>
                    {textoCantidad(l.p, l.q)}
                    {l.p.saleUnit === "WEIGHT" ? " aprox." : ""} × {plata(precioDe(l.p))}
                    {l.p.saleUnit === "WEIGHT" ? "/kg" : ""}
                  </span>
                </div>
                <span className={s.linImp}>{plata(l.importe)}</span>
                <Paso p={l.p} q={l.q} onMover={(d) => v.mover(l.p, d)} compacto />
                <input type="hidden" name="productId" value={l.p.id} />
                <input type="hidden" name="quantity" value={l.q} />
                {aviso && (
                  <p role="alert" className={s.avisoLinea}>
                    {aviso}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {hay && (
        <div className={s.cuentas}>
          {v.faltaParaSinCargo > 0 && hay && (
            <p className={s.empujon}>
              Te faltan <b>{plata(v.faltaParaSinCargo)}</b> para el envío sin cargo.
            </p>
          )}
          {cupon.descuento > 0 && (
            <div className={s.fila}>
              <span>Cupón {cupon.aplicado?.codigo}</span>
              <span className={s.num}>−{plata(cupon.descuento)}</span>
            </div>
          )}
          <div className={s.fila}>
            <span>{v.fulfillment === "PICKUP" ? "Retiro en el local" : zona ? `Envío · ${zona}` : "Envío"}</span>
            <span className={s.num}>{envioTexto}</span>
          </div>
          <div className={`${s.fila} ${s.total}`}>
            <span>{v.hayPeso ? "Total estimado" : "Total"}</span>
            <span className={s.num}>{plata(v.total)}</span>
          </div>
        </div>
      )}

      {hay && (
        <fieldset className={s.datos}>
          <legend className={s.kicker}>Tus datos</legend>
          <input type="hidden" name="idempotencyKey" value={v.clave} />
          <label className={s.campo}>
            <span>Nombre y apellido</span>
            <input name="customerName" required autoComplete="name" />
          </label>
          <label className={s.campo}>
            <span>Tu WhatsApp</span>
            <input name="customerPhone" required autoComplete="tel" inputMode="tel" placeholder="11 2345 6789" />
          </label>
          <div className={s.campo} role="radiogroup" aria-label="Entrega">
            <span aria-hidden>Entrega</span>
            <div className={s.segm}>
              <label>
                <input
                  type="radio"
                  name="fulfillment"
                  value="DELIVERY"
                  checked={v.fulfillment === "DELIVERY"}
                  onChange={() => v.setFulfillment("DELIVERY")}
                />
                <span>Envío a domicilio</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="fulfillment"
                  value="PICKUP"
                  checked={v.fulfillment === "PICKUP"}
                  onChange={() => v.setFulfillment("PICKUP")}
                />
                <span>Retiro en el local</span>
              </label>
            </div>
          </div>
          {v.fulfillment === "DELIVERY" && (
            <label className={s.campo}>
              <span>Dirección</span>
              <input name="address" required autoComplete="street-address" placeholder="Calle, número, barrio" />
            </label>
          )}
          <label className={s.campo}>
            <span>
              Nota <small>(opcional)</small>
            </span>
            <input name="notes" placeholder={palabras.notaPlaceholder} />
          </label>
          {!conCupon && !cupon.aplicado ? (
            <button type="button" className={s.enlace} onClick={() => setConCupon(true)}>
              ¿Tenés un cupón?
            </button>
          ) : (
            <div className={s.campo}>
              <label htmlFor="v-cupon">
                Cupón <small>(opcional)</small>
              </label>
              <div className={s.cupon}>
                <input
                  id="v-cupon"
                  name="cupon"
                  value={cupon.codigo}
                  onChange={(e) => cupon.cambiar(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                  aria-invalid={errorDeCupon ? true : undefined}
                  aria-describedby={errorDeCupon ? "v-cupon-error" : undefined}
                />
                <button
                  type="button"
                  className={`${s.btn} ${s.btnSec}`}
                  onClick={() => void cupon.aplicar()}
                  disabled={cupon.probando}
                >
                  {cupon.probando ? "Revisando…" : "Aplicar"}
                </button>
              </div>
              {errorDeCupon && (
                <p id="v-cupon-error" role="alert" className={s.avisoLinea}>
                  {errorDeCupon}
                </p>
              )}
            </div>
          )}
        </fieldset>
      )}

      {pedido.error && pedido.error.campo !== "cupon" && (
        <p role="alert" className={s.avisoErr}>
          {pedido.error.texto}
        </p>
      )}

      {hay && (
        <div className={s.bolsaAcc}>
          <button
            type="submit"
            name="via"
            value="tienda"
            className={`${s.btn} ${s.btnPri}`}
            disabled={pedido.enviando}
            aria-busy={pedido.enviando || undefined}
          >
            {pedido.enviando ? "Enviando…" : `Enviar pedido · ${plata(v.total)}`}
          </button>
          {hayWhatsApp && hay && (
            <button type="submit" name="via" value="whatsapp" className={`${s.btn} ${s.btnWa}`} disabled={pedido.enviando}>
              <IconoWhatsApp /> Pedir por WhatsApp
            </button>
          )}
        </div>
      )}
      <p className={s.nota}>
        {v.hayPeso ? "El total final sale del peso real. " : ""}
        {textoPago}
      </p>
    </form>
  );
}
