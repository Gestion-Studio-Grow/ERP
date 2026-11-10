"use client";

// La carta y el pedido de «Pedí Local», que comparten la bolsa.
//   · Carta: por categoría (carta.ts), con «+ / −» de 44 px y «Sin stock» sin poder sumarse.
//   · Pedido: el MISMO contrato de formulario que todas las vidrieras (Storefront.tsx): `productId` y
//     `quantity` por línea, `idempotencyKey`, `fulfillment`, `customerName`, `customerPhone`,
//     `address`, `notes`, los campos de Envíos (CamposDeEntrega) y `via`; se manda con
//     `usePedidoOnline` (placeOnlineOrder). Suma `medioPreferido`, `pagaCon`, la ubicación
//     (`ubicacionLat/Lng/Precision`) y `aceptaTerminos`, que lee src/lib/delivery-local/alta.ts.
//   · En el celular, una barra fija abajo lleva al pedido con la cantidad y el total.
//   · Vidriera de autor: navegación fija por secciones (IndiceDeLaCarta), tarjetas con el dibujo de
//     su categoría (no hay fotos de producto en `getStorefront`), un «pop» al sumar y la barra que
//     late con el contador. Todo con transform; con reduced-motion, quieto.
//   · «Mi cuenta» del dispositivo (src/lib/delivery-local/mi-cuenta.ts): al mandar, el pedido y la
//     dirección quedan en ESTE navegador; las direcciones guardadas prellenan el checkout y
//     `/tienda?repetir=<clave>` recarga la bolsa con la carta de hoy (precio del servidor).
// Antes de mandar, `revisarPedidoLocal` frena lo que falta con el mensaje al lado del campo; el
// servidor vuelve a decidir todo y su rechazo se ve arriba del botón (role="alert").

import { transferenciaPublicable } from "@/lib/delivery-local/pago";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { ConfigEnvios } from "@/lib/envios/modelo";
import type { ConfigDeliveryLocal } from "@/lib/delivery-local/config";
import { formatearCantidad } from "@/lib/pos-peso";
import { asociarCodigo, descartarSinConfirmar, guardarPedido, recordarDireccion, repetirBolsa } from "@/lib/delivery-local/mi-cuenta";
import { usePedidoOnline } from "../pedido-online";
import { nuevaClaveDePedido, etiquetaDeDisponibilidad } from "../reglas-tienda";
import { CamposDeEntrega, FrenoDeEntrega, useEntregaDeLaTienda, type AparienciaDeEntrega } from "../EntregaDeLaTienda";
import {
  cantidadTrasToque,
  cartaPorCategoria,
  lineasDeLaBolsa,
  precioUnitario,
  revisarPedidoLocal,
  totalesDeLaBolsa,
  type CampoDelPedido,
  type ProductoDeLaCarta,
} from "./carta";
import { cambiarCuenta, leerCuentaGuardada, useCuentaDelDispositivo } from "./cuenta-del-dispositivo";
import IndiceDeLaCarta from "./IndiceDeLaCarta";
import { IlustracionDeCategoria } from "./Ilustracion";
import PagoDelPedido from "./PagoDelPedido";
import UbicacionDelCliente from "./UbicacionDelCliente";
import s from "./local.module.css";

const plata = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const plata2 = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
const fechaCorta = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "numeric" });

export default function CartaYPedido({
  cfg,
  slug,
  productos,
  hayWhatsApp,
  direccionDelLocal,
  entrega: configEnvios,
  hoy,
}: {
  cfg: ConfigDeliveryLocal;
  slug: string;
  productos: ProductoDeLaCarta[];
  hayWhatsApp: boolean;
  direccionDelLocal: string | null;
  entrega: ConfigEnvios | null;
  hoy: string | null;
}) {
  const [bolsa, setBolsa] = useState<Record<string, number>>({});
  const [claveDePedido, setClaveDePedido] = useState(nuevaClaveDePedido);
  const [fulfillment, setFulfillment] = useState<"PICKUP" | "DELIVERY">("DELIVERY");
  const [medio, setMedio] = useState<string>(cfg.medios.length === 1 ? cfg.medios[0] : "");
  const [pagaCon, setPagaCon] = useState("");
  const [revision, setRevision] = useState<{ campo: CampoDelPedido; error: string } | null>(null);
  const cuenta = useCuentaDelDispositivo(slug || null);
  // La dirección: la que escribe la persona o, mientras no escriba, la última que usó acá.
  const [direccion, setDireccion] = useState<string | null>(null);
  const valorDireccion = direccion ?? cuenta.direcciones[0]?.texto ?? "";
  const [repetido, setRepetido] = useState<{ fecha: string; faltan: string[] } | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const claveEnviada = useRef<string | null>(null);

  const lineas = lineasDeLaBolsa(productos, bolsa);
  const hayProductos = lineas.length > 0;
  const subtotal = totalesDeLaBolsa(lineas, 0).subtotal;
  const entrega = useEntregaDeLaTienda({
    entrega: configEnvios,
    hoy,
    subtotal,
    hayProductos,
    envio: null,
    fulfillment,
    setFulfillment,
  });
  const totales = totalesDeLaBolsa(lineas, entrega.modo === "envio" ? entrega.costoEnvio : 0);

  const pedido = usePedidoOnline({
    hayWhatsApp,
    alRegistrar: () => {
      setBolsa({});
      setClaveDePedido(nuevaClaveDePedido());
      setPagaCon("");
      setRepetido(null);
    },
  });

  // El servidor contestó con el número (pedido por WhatsApp): se completa el guardado.
  const codigo = pedido.confirmado ? String(pedido.confirmado.code) : null;
  useEffect(() => {
    const clave = claveEnviada.current;
    if (codigo && clave && slug) cambiarCuenta(slug, (c) => asociarCodigo(c, clave, codigo));
  }, [codigo, slug]);
  // El servidor lo rechazó: sin número, no es un pedido; no queda en el historial.
  const rechazado = Boolean(pedido.error);
  useEffect(() => {
    const clave = claveEnviada.current;
    if (rechazado && clave && slug) cambiarCuenta(slug, (c) => descartarSinConfirmar(c, clave));
  }, [rechazado, slug]);

  // «Repetir pedido» (desde /tienda/mi-cuenta): ?repetir=<clave>. Una vez, al llegar.
  useEffect(() => {
    if (!slug) return;
    const url = new URL(window.location.href);
    const clave = url.searchParams.get("repetir");
    if (!clave) return;
    const anterior = leerCuentaGuardada(slug).pedidos.find((x) => x.clave === clave);
    const r = anterior ? repetirBolsa(anterior.items, productos) : null;
    // La bolsa sale de algo externo (el navegador): se carga en el cuadro siguiente, no en el efecto.
    // El parámetro se saca recién ahí (en desarrollo, StrictMode corre el efecto dos veces).
    const cuadro = requestAnimationFrame(() => {
      url.searchParams.delete("repetir");
      url.hash = "tu-pedido";
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      if (!anterior || !r) return;
      setBolsa(r.bolsa);
      setClaveDePedido(nuevaClaveDePedido());
      setRepetido({ fecha: anterior.fecha, faltan: r.faltan });
      requestAnimationFrame(() => document.getElementById("tu-pedido")?.scrollIntoView({ block: "start" }));
    });
    return () => cancelAnimationFrame(cuadro);
    // Sólo al montar: la carta del servidor ya vino con la página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function tocar(p: ProductoDeLaCarta, dir: 1 | -1) {
    const nueva = cantidadTrasToque(p, bolsa[p.id] ?? 0, dir);
    if (nueva === (bolsa[p.id] ?? 0)) return;
    pedido.olvidarAviso(p.id);
    setAnuncio(`${dir === 1 ? "Sumaste" : "Sacaste"} ${p.name}. En tu pedido: ${formatearCantidad(nueva)}${p.saleUnit === "WEIGHT" ? " kg" : ""}.`);
    // Cambió la bolsa: es OTRO pedido, con otra clave anti-duplicado (ver Storefront.tsx).
    setClaveDePedido(nuevaClaveDePedido());
    setBolsa((b) => {
      const n = { ...b };
      if (nueva > 0) n[p.id] = nueva;
      else delete n[p.id];
      return n;
    });
  }

  function enviar(e: FormEvent<HTMLFormElement>) {
    const form = e.currentTarget;
    const fd = new FormData(form);
    const r = revisarPedidoLocal({
      nombre: String(fd.get("customerName") ?? ""),
      telefono: String(fd.get("customerPhone") ?? ""),
      fulfillment: entrega.fulfillment,
      direccion: valorDireccion,
      medio,
      pagaCon,
      acepta: fd.get("aceptaTerminos") === "on",
      total: totales.total,
      medios: cfg.medios,
    });
    if (!r.ok) {
      e.preventDefault();
      setRevision({ campo: r.campo, error: r.error });
      const destino = r.campo === "medioPreferido" ? form.querySelector<HTMLInputElement>('input[name="medioPreferido"]') : form.elements.namedItem(r.campo);
      if (destino instanceof HTMLElement) destino.focus();
      return;
    }
    setRevision(null);
    // «Mi cuenta» del dispositivo: el pedido (sin confirmar hasta que el servidor conteste) y la
    // dirección usada. Si el navegador no deja guardar, el pedido sale igual.
    const clave = claveDePedido;
    claveEnviada.current = clave;
    if (slug) {
      const ahora = new Date();
      const items = lineas.map((l) => ({ productId: l.producto.id, nombre: l.producto.name, cantidad: l.cantidad, saleUnit: l.producto.saleUnit }));
      cambiarCuenta(slug, (c) => {
        const n = guardarPedido(c, { clave, items, total: totales.total, fulfillment: entrega.fulfillment }, ahora);
        return entrega.fulfillment === "DELIVERY" ? recordarDireccion(n, valorDireccion, ahora) : n;
      });
    }
    pedido.onSubmit(e);
  }

  const errorDe = (campo: CampoDelPedido) => (revision?.campo === campo ? revision.error : null);
  const invalido = (campo: CampoDelPedido) => (revision?.campo === campo ? true : undefined);
  const bloqueado = pedido.enviando || Boolean(entrega.freno);
  const carta = useMemo(() => cartaPorCategoria(productos), [productos]);
  const secciones = useMemo(() => carta.map((g) => g.categoria), [carta]);

  return (
    <>
      {secciones.length > 1 && <IndiceDeLaCarta secciones={secciones} />}
      <p className={s.soloLector} aria-live="polite">
        {anuncio}
      </p>
      <div className={`${s.ancho} ${s.cuerpo}`}>
        <section aria-labelledby="pl-carta-titulo" id="carta" className={s.cartaSeccion}>
          <div className={s.cartaCabeza}>
            <h2 id="pl-carta-titulo" className={s.cartaTitulo}>
              La carta
            </h2>
            <p className={s.cartaBajada}>Elegí, sumá a tu pedido y lo recibís en casa o lo pasás a buscar.</p>
          </div>
          {carta.length === 0 && <p className={s.vacio}>El local todavía no cargó su carta. Escribile por WhatsApp y te cuenta qué hay hoy.</p>}
          {carta.map((g, i) => (
            <section key={g.categoria.id} id={`cat-${g.categoria.id}`} tabIndex={-1} className={s.categoria} aria-labelledby={`cat-${g.categoria.id}-t`}>
              <div className={s.categoriaCabeza}>
                <span className={s.categoriaNumero} aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 id={`cat-${g.categoria.id}-t`} className={s.categoriaTitulo}>
                  {g.categoria.titulo}
                </h3>
                <span className={s.categoriaCuenta}>
                  {g.productos.length} {g.productos.length === 1 ? "opción" : "opciones"}
                </span>
              </div>
              <ul className={s.grilla}>
                {g.productos.map((p) => (
                  <TarjetaDeProducto key={p.id} p={p} categoria={g.categoria.id} cant={bolsa[p.id] ?? 0} tocar={tocar} />
                ))}
              </ul>
            </section>
          ))}
        </section>

        <aside className={s.riel} aria-labelledby="pl-pedido-titulo">
          <section id="tu-pedido" className={s.pedido}>
            <h2 id="pl-pedido-titulo" className={s.pedidoTitulo}>
              Tu pedido
            </h2>
            {pedido.confirmado && (
              <div role="status" className={`${s.caja} ${s.cajaOk}`}>
                <p>
                  Tu pedido <strong>#{pedido.confirmado.code}</strong> quedó registrado.{" "}
                  {pedido.confirmado.whatsapp ? "Seguimos por WhatsApp." : "El local te escribe al WhatsApp que dejaste."}
                </p>
                {pedido.confirmado.whatsapp && (
                  <a className={s.enlace} href={pedido.confirmado.whatsapp} target="_blank" rel="noopener noreferrer">
                    Abrir el chat del pedido #{pedido.confirmado.code}
                  </a>
                )}
                <Link className={s.enlace} href="/tienda/mi-cuenta">
                  Lo guardamos en Mi cuenta, en este teléfono
                </Link>
                <Link className={s.enlace} href={`/tienda/arrepentimiento?pedido=${encodeURIComponent(pedido.confirmado.code)}`}>
                  ¿Te arrepentiste? Cancelalo acá
                </Link>
              </div>
            )}
            {repetido && (
              <div role="status" className={`${s.caja} ${repetido.faltan.length > 0 ? s.cajaAviso : ""}`}>
                <p>
                  Cargamos tu pedido del {fechaCorta.format(new Date(repetido.fecha))} con los precios de hoy. Revisalo antes de confirmar.
                </p>
                {repetido.faltan.length > 0 && <p>Hoy no hay: {repetido.faltan.join(", ")}.</p>}
              </div>
            )}
            {!hayProductos && !pedido.confirmado && <p className={s.vacio}>Tocá «Agregar» en lo que quieras de la carta y armá tu pedido acá.</p>}
            {hayProductos && (
              <form onSubmit={enviar} onChange={() => revision && setRevision(null)} className={s.form} noValidate>
                <input type="hidden" name="idempotencyKey" value={claveDePedido} />
                <input type="hidden" name="fulfillment" value={entrega.fulfillment} />

                <div className={s.lineas}>
                  {lineas.map((l) => (
                    <div key={l.producto.id}>
                      <div className={s.linea}>
                        <span>
                          {formatearCantidad(l.cantidad)} {l.producto.saleUnit === "WEIGHT" ? "kg" : "×"} {l.producto.name}
                        </span>
                        <span>{plata2.format(l.importe)}</span>
                      </div>
                      <input type="hidden" name="productId" value={l.producto.id} />
                      <input type="hidden" name="quantity" value={l.cantidad} />
                      {pedido.avisoDe(l.producto.id) && (
                        <p role="alert" className={s.itemAviso}>
                          {pedido.avisoDe(l.producto.id)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                <fieldset className={s.grupo}>
                  <legend className={s.leyenda}>¿Cómo lo recibís?</legend>
                  <div className={s.opciones}>
                    <label className={s.opcion}>
                      <input type="radio" name="pl-modo" checked={entrega.fulfillment === "DELIVERY"} onChange={() => setFulfillment("DELIVERY")} />
                      Envío a domicilio
                    </label>
                    {entrega.hayRetiro && (
                      <label className={s.opcion}>
                        <input type="radio" name="pl-modo" checked={entrega.fulfillment === "PICKUP"} onChange={() => setFulfillment("PICKUP")} />
                        Retiro en el local
                      </label>
                    )}
                  </div>
                </fieldset>

                <label className={s.campo}>
                  <span className={s.rotulo}>Nombre *</span>
                  <input name="customerName" className={s.control} autoComplete="name" placeholder="Nombre y apellido" required aria-invalid={invalido("customerName")} aria-describedby={errorDe("customerName") ? "pl-err-customerName" : undefined} />
                  {errorDe("customerName") && <span id="pl-err-customerName" role="alert" className={s.ayuda}>{errorDe("customerName")}</span>}
                </label>
                <label className={s.campo}>
                  <span className={s.rotulo}>WhatsApp *</span>
                  <input name="customerPhone" type="tel" inputMode="tel" className={s.control} autoComplete="tel" placeholder="11 2345 6789" required aria-invalid={invalido("customerPhone")} aria-describedby={errorDe("customerPhone") ? "pl-err-customerPhone" : undefined} />
                  {errorDe("customerPhone") && <span id="pl-err-customerPhone" role="alert" className={s.ayuda}>{errorDe("customerPhone")}</span>}
                </label>

                {entrega.fulfillment === "DELIVERY" && (
                  <>
                    <label className={s.campo}>
                      <span className={s.rotulo}>Dirección de entrega *</span>
                      <input
                        name="address"
                        className={s.control}
                        autoComplete="street-address"
                        placeholder="Calle, número, piso o depto, barrio"
                        required
                        value={valorDireccion}
                        onChange={(ev) => setDireccion(ev.target.value)}
                        aria-invalid={invalido("address")}
                        aria-describedby={errorDe("address") ? "pl-err-address" : undefined}
                      />
                      {errorDe("address") && <span id="pl-err-address" role="alert" className={s.ayuda}>{errorDe("address")}</span>}
                    </label>
                    {cuenta.direcciones.length > 0 && (
                      <div className={s.guardadas}>
                        <p className={s.ayuda}>Guardadas en este teléfono:</p>
                        <div className={s.opciones}>
                          {cuenta.direcciones.map((d) => (
                            <button
                              key={d.texto}
                              type="button"
                              className={s.opcion}
                              aria-pressed={valorDireccion === d.texto}
                              onClick={() => {
                                setDireccion(d.texto);
                                setRevision(null);
                              }}
                            >
                              {d.texto}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <UbicacionDelCliente local={cfg.ubicacionDelLocal} radioKm={cfg.radioKm} />
                  </>
                )}

                <CamposDeEntrega e={entrega} idBase="pl-entrega" apariencia={APARIENCIA_ENTREGA} direccionDelLocal={direccionDelLocal} />

                <label className={s.campo}>
                  <span className={s.rotulo}>Nota para el local</span>
                  <input name="notes" className={s.control} placeholder="Timbre, entre calles, sin azúcar…" />
                </label>

                {cfg.medios.length > 0 && (
                  <PagoDelPedido
                    medios={cfg.medios}
                    transferencia={transferenciaPublicable(cfg.transferencia)}
                    total={totales.total}
                    medio={medio}
                    setMedio={(m) => {
                      setMedio(m);
                      setRevision(null);
                    }}
                    pagaCon={pagaCon}
                    setPagaCon={setPagaCon}
                    errorDe={errorDe}
                  />
                )}

                <div className={s.lineas} aria-live="polite">
                  <div className={`${s.linea} ${s.lineaSuave}`}>
                    <span>Subtotal</span>
                    <span>{plata2.format(totales.subtotal)}</span>
                  </div>
                  <div className={`${s.linea} ${s.lineaSuave}`}>
                    <span>{entrega.modo === "envio" ? `Envío${entrega.zona ? ` · ${entrega.zona.nombre}` : ""}` : "Retiro en el local"}</span>
                    <span>
                      {entrega.modo === "envio" && entrega.conZonas && !entrega.zona
                        ? "Elegí la zona"
                        : totales.envio === 0
                          ? "Sin cargo"
                          : plata2.format(totales.envio)}
                    </span>
                  </div>
                  <div className={`${s.linea} ${s.lineaTotal}`}>
                    <span>Total</span>
                    <span>{plata2.format(totales.total)}</span>
                  </div>
                </div>

                <label className={s.casilla}>
                  <input type="checkbox" name="aceptaTerminos" required aria-invalid={invalido("aceptaTerminos")} aria-describedby={errorDe("aceptaTerminos") ? "pl-err-terminos" : undefined} />
                  <span>
                    Acepto los{" "}
                    <Link href="/tienda/terminos" className={s.enlace} target="_blank">
                      términos
                    </Link>{" "}
                    y la{" "}
                    <Link href="/tienda/privacidad" className={s.enlace} target="_blank">
                      privacidad
                    </Link>
                    . *
                  </span>
                </label>
                {errorDe("aceptaTerminos") && (
                  <p id="pl-err-terminos" role="alert" className={s.ayuda}>
                    {errorDe("aceptaTerminos")}
                  </p>
                )}

                <FrenoDeEntrega e={entrega} apariencia={APARIENCIA_ENTREGA} />
                <div aria-live="assertive">
                  {pedido.error && (
                    <p role="alert" className={`${s.caja} ${s.cajaError}`}>
                      {pedido.error.texto}
                    </p>
                  )}
                </div>

                <button type="submit" name="via" value="tienda" className={`${s.boton} ${s.botonPrincipal}`} disabled={bloqueado} aria-busy={pedido.enviando || undefined}>
                  {pedido.enviando ? "Mandando…" : `Confirmar pedido · ${plata.format(totales.total)}`}
                </button>
                {hayWhatsApp && (
                  <button type="submit" name="via" value="whatsapp" className={`${s.boton} ${s.botonWa}`} disabled={bloqueado}>
                    Pedir y seguir por WhatsApp
                  </button>
                )}
                <p className={s.letraChica}>
                  Le pagás directo a {cfg.nombre}. El local confirma tu pedido por WhatsApp.
                </p>
              </form>
            )}
          </section>
        </aside>
      </div>

      {hayProductos && (
        <div className={s.barra}>
          <a href="#tu-pedido" className={s.barraBoton}>
            <span className={s.barraCuenta}>
              <span key={totales.unidades} className={s.contador} aria-hidden="true">
                {formatearCantidad(totales.unidades)}
              </span>
              <span>
                Ver mi pedido<span className={s.soloLector}> · {formatearCantidad(totales.unidades)} {totales.unidades === 1 ? "cosa" : "cosas"}</span>
              </span>
            </span>
            <span>{plata.format(totales.total)}</span>
          </a>
        </div>
      )}
    </>
  );
}

/**
 * Una tarjeta de la carta: el dibujo de su categoría (no hay fotos de producto), nombre, precio y
 * el control. Sin nada en la bolsa, «Agregar»; con algo, «− n +» y la insignia sobre el dibujo.
 * El número entra con un «pop» (key = cantidad): sólo transform, quieto con reduced-motion.
 */
function TarjetaDeProducto({
  p,
  categoria,
  cant,
  tocar,
}: {
  p: ProductoDeLaCarta;
  categoria: string;
  cant: number;
  tocar: (p: ProductoDeLaCarta, dir: 1 | -1) => void;
}) {
  const aviso = etiquetaDeDisponibilidad(p.disponibilidad ?? null);
  const sinStock = p.disponibilidad === "sin-stock";
  const kg = p.saleUnit === "WEIGHT";
  return (
    <li className={`${s.tarjeta} ${cant > 0 ? s.tarjetaEnBolsa : ""} ${sinStock ? s.tarjetaSinStock : ""}`}>
      <div className={s.tarjetaArte} data-categoria={categoria}>
        <IlustracionDeCategoria categoria={categoria} className={s.tarjetaDibujo} />
        {cant > 0 && (
          <span key={cant} className={`${s.insignia} ${s.pop}`} aria-hidden="true">
            {formatearCantidad(cant)}
          </span>
        )}
      </div>
      <div className={s.tarjetaTexto}>
        <h4 className={s.itemNombre}>{p.name}</h4>
        <p className={s.itemPrecio}>
          {plata.format(precioUnitario(p))}
          {kg ? " el kg" : ""}
        </p>
        {aviso && <p className={s.itemAviso}>{aviso}</p>}
      </div>
      <div className={s.cantidad}>
        {cant > 0 && (
          <>
            <button type="button" className={s.toque} onClick={() => tocar(p, -1)} aria-label={`Sacar ${kg ? "un cuarto kilo" : "uno"} de ${p.name}`}>
              −
            </button>
            <span key={cant} className={`${s.cantidadValor} ${s.pop}`}>
              {formatearCantidad(cant)}
            </span>
          </>
        )}
        {/* El MISMO botón pasa de «Agregar» a «+»: el foco del teclado no se pierde al sumar el primero. */}
        <button
          type="button"
          className={cant > 0 ? `${s.toque} ${s.toqueSumar}` : s.agregar}
          onClick={() => tocar(p, 1)}
          disabled={sinStock}
          aria-label={sinStock ? `${p.name}: sin stock` : cant > 0 ? `Sumar ${kg ? "un cuarto kilo" : "otro"} de ${p.name}` : `Agregar ${p.name} a tu pedido`}
        >
          {sinStock && cant === 0 ? "Sin stock" : cant > 0 ? "+" : "Agregar"}
        </button>
      </div>
    </li>
  );
}

// Zona, día, franja y freno (EntregaDeLaTienda.tsx) con la piel de «Pedí Local». Sin Envíos
// cargados no se dibuja nada.
const APARIENCIA_ENTREGA: AparienciaDeEntrega = {
  bloque: { className: s.grupo },
  campo: { className: s.campo },
  rotulo: { className: s.rotulo },
  control: { className: s.control },
  grupo: { className: s.opciones },
  opcion: { className: s.opcion },
  nota: { className: s.ayuda },
  empujon: { className: s.ayuda },
  freno: { className: `${s.caja} ${s.cajaAviso}` },
  boton: { className: s.boton },
};
