"use client";

// ============================================================================
// VIDRIERA MAGRA — «La etiqueta y el despiece» (fronts/magra/DISENO.md, 29/10/2026)
// ============================================================================
//
// Lo que hace la gente con un corte envasado al vacío: lee la etiqueta y decide cuánto comprar según
// cuántos comen. Acá eso es la interacción: el despiece de marca (elegís por dónde sale), la carta de
// etiquetas, la ficha con «¿Para cuántos comen?» y la bolsa siempre a un toque.
//
// Esta es la parte del NAVEGADOR (estado de la bolsa, filtros, ficha y bolsa). El CSS y las letras
// los pone el servidor (MagraVidriera.tsx → MagraPiel.tsx), así viajan una sola vez.
//
// El motor es el de siempre y no se toca: `usePedidoOnline` → `placeOnlineOrder` (bandeja, POS,
// stock), `useEntregaDeLaTienda` (zona, franja, mínimo, pausa) y `useCuponDePedido`. El copy
// editorial es TEXTUAL de magra-content.ts (autorizado por el dueño); los datos del local salen de
// `BusinessSettings` (resolveMagraLocal).

import { useBolsaGuardada } from "@/components/vidriera/useBolsaGuardada";
import { useHoja } from "@/components/vidriera/useHoja";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { formatearCantidad } from "@/lib/pos-peso";
import type { ShippingConfig } from "@/lib/storefront-shipping";
import type { ConfigEnvios } from "@/lib/envios/modelo";
import { WhatsAppCtaProvider, useWhatsAppCta } from "@/components/whatsapp-cta";
import { usePedidoOnline, useCuponDePedido } from "../pedido-online";
import { nuevaClaveDePedido, propuestasConMediosDeLaMarca } from "../reglas-tienda";
import { useEntregaDeLaTienda } from "../EntregaDeLaTienda";
import { CONFIG, seccionMagra } from "../vidriera/marcas";
import {
  MAGRA,
  MAGRA_GOURMET_FOTOS,
  MAGRA_HERO,
  MAGRA_LOGO_PROVEEDOR,
  chatConElNumeroDelLocal,
  coccionesDe,
  esElLocalDelCopy,
  promesaDeReparto,
  propuestasSegunContacto,
  regionDeCorte,
  resolveMagraLocal,
  textoAbout,
  type MagraAnimal,
  type MagraBrandingRow,
  type MagraCoccion,
  type MagraContent,
  type MagraLocal,
} from "@/tenants/magra-content";
import { regionDe } from "./despiece-datos";
import { Despiece, MiniDespiece, SpriteDespiece } from "./Despiece";
import { Etiqueta, money, unitLabel, unitPrice, type MagraProducto } from "./Etiqueta";
import { FichaContenido } from "./Ficha";

export type MagraProps = {
  products: MagraProducto[];
  /** Fila de BusinessSettings del LOCAL (getStorefront → branding). Puede venir vacía. */
  branding: MagraBrandingRow | null;
  tenantKey: string;
  content?: MagraContent;
  /** Tarifa de envío de la marca (storefront.ts), la MISMA con la que el servidor suma el envío. */
  envio?: ShippingConfig | null;
  /** Los medios de pago de la MARCA (storefront.ts): reescriben la propuesta de pago del copy. */
  mediosDePago?: readonly string[] | null;
  /** La aclaración del rubro para lo que se vende por kilo (rubros.ts `wording.weightNote`). */
  notaDePeso?: string | null;
  /** La configuración de Envíos del negocio (src/lib/envios), leída en el servidor. */
  entrega?: ConfigEnvios | null;
  /** Hoy en la zona del negocio (YYYY-MM-DD), para los días que se ofrecen con las franjas. */
  hoy?: string | null;
};

const money2 = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
const PALABRAS = CONFIG.magra.palabras;
const SECCIONES = CONFIG.magra.secciones;
const NOMBRE_COCCION: Record<MagraCoccion, string> = {
  parrilla: "Parrilla",
  horno: "Horno",
  plancha: "Plancha",
  olla: "Olla",
  milanesas: "Milanesas",
};
const esAnimal = (s: string): s is MagraAnimal => s === "vaca" || s === "cerdo" || s === "pollo";
const cortes = (n: number) => `${n} ${n === 1 ? PALABRAS.uno : PALABRAS.varios}`;

export default function MagraTienda({
  products,
  branding,
  tenantKey,
  content = MAGRA,
  envio = null,
  mediosDePago = null,
  notaDePeso = null,
  entrega = null,
  hoy = null,
}: MagraProps) {
  // UN SOLO número, el del LOCAL (BusinessSettings.whatsapp), y sólo si es de verdad: el relleno
  // «0000 0000» queda afuera en `resolveMagraLocal`. Sin número no hay botón, ni línea en el pie,
  // ni vía «whatsapp» en el pedido.
  const local = resolveMagraLocal(branding);
  return (
    <WhatsAppCtaProvider tenantKey={tenantKey} configuredNumber={local.whatsapp}>
      <Vidriera tenantKey={tenantKey}
        products={products}
        content={content}
        local={local}
        envio={envio}
        mediosDePago={mediosDePago}
        notaDePeso={notaDePeso}
        entrega={entrega}
        hoy={hoy}
      />
    </WhatsAppCtaProvider>
  );
}

function Vidriera({
  tenantKey,
  products,
  content: c,
  local,
  envio,
  mediosDePago,
  notaDePeso,
  entrega,
  hoy,
}: {
  tenantKey: string;
  products: MagraProducto[];
  content: MagraContent;
  local: MagraLocal;
  envio: ShippingConfig | null;
  mediosDePago: readonly string[] | null;
  notaDePeso: string | null;
  entrega: ConfigEnvios | null;
  hoy: string | null;
}) {
  const { requestWhatsApp } = useWhatsAppCta();
  // La bolsa guardada en el navegador (ronda 2): recargar o volver de WhatsApp ya no la vacía.
  const { bolsa: cart, setBolsa: setCart, marcarEnvio } = useBolsaGuardada(tenantKey, products.map((p) => p.id));
  const [fulfillment, setFulfillment] = useState<"PICKUP" | "DELIVERY">("DELIVERY");
  // Clave anti-duplicado del pedido (la lee `placeOnlineOrder`): el doble toque manda la MISMA y
  // el servidor devuelve el mismo pedido. Se renueva cuando cambia la bolsa (reglas-tienda.ts).
  const [claveDePedido, setClaveDePedido] = useState(nuevaClaveDePedido);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // ── La carta: por animal (las secciones de la marca) y, dentro, por región y cocción ──
  const porSeccion = useMemo(() => {
    const m: Record<string, MagraProducto[]> = {};
    for (const s of SECCIONES) m[s.id] = [];
    for (const p of products) m[seccionMagra(p.name)].push(p);
    return m;
  }, [products]);
  const [seccion, setSeccion] = useState<string>(() => SECCIONES.find((s) => porSeccion[s.id]?.length)?.id ?? "vaca");
  const [region, setRegion] = useState<string | null>(null);
  const [coccion, setCoccion] = useState<MagraCoccion | null>(null);
  const animal = esAnimal(seccion) ? seccion : null;
  const enSeccion = useMemo(() => porSeccion[seccion] ?? [], [porSeccion, seccion]);
  const regionDeP = useCallback((p: MagraProducto) => (animal ? regionDeCorte(animal, p.name) : null), [animal]);
  const conteo = useMemo(() => {
    const n: Record<string, number> = {};
    for (const p of enSeccion) {
      const r = regionDeP(p);
      if (r) n[r] = (n[r] ?? 0) + 1;
    }
    return n;
  }, [enSeccion, regionDeP]);
  const coccionesDeLaSeccion = useMemo(() => {
    const s = new Set(enSeccion.flatMap((p) => coccionesDe(p.name)));
    return (Object.keys(NOMBRE_COCCION) as MagraCoccion[]).filter((m) => s.has(m));
  }, [enSeccion]);
  const visibles = enSeccion.filter(
    (p) => (!region || regionDeP(p) === region) && (!coccion || coccionesDe(p.name).includes(coccion)),
  );
  const regionElegida = animal ? regionDe(animal, region) : null;
  const tituloSeccion = SECCIONES.find((s) => s.id === seccion)?.titulo ?? "";

  function irASeccion(id: string, scroll = false) {
    setSeccion(id);
    setRegion(null);
    setCoccion(null);
    if (scroll) document.getElementById("cortes")?.scrollIntoView();
  }

  // ── La bolsa ──
  // `olvidarAviso` depende del último rechazo: se lee del render más reciente (ref al día después
  // de cada render), así `cambiar` y `bump` son estables y las etiquetas (memo) no se repintan.
  const olvidarAviso = useRef<(id: string) => void>(() => {});
  const cambiar = useCallback((p: MagraProducto, calcular: (actual: number) => number) => {
    olvidarAviso.current(p.id);
    setClaveDePedido(nuevaClaveDePedido());
    setCart((s) => {
      const q = Math.max(0, Math.round(calcular(s[p.id] ?? 0) * 100) / 100);
      const n = { ...s };
      if (q > 0) n[p.id] = q;
      else delete n[p.id];
      return n;
    });
  }, []);
  const bump = useCallback(
    (p: MagraProducto, dir: 1 | -1) => {
      // Sin stock no se suma: el servidor lo rechazaría igual, y es mejor no dejar armarlo.
      if (dir === 1 && p.disponibilidad === "sin-stock") return;
      const step = p.saleUnit === "WEIGHT" ? 0.25 : 1;
      cambiar(p, (q) => q + dir * step);
    },
    [cambiar],
  );

  const lines = Object.entries(cart)
    .map(([id, q]) => {
      const p = byId.get(id);
      return p ? { p, q, t: q * unitPrice(p) } : null;
    })
    .filter((l): l is { p: MagraProducto; q: number; t: number } => l !== null);
  const subtotal = lines.reduce((s, l) => s + l.t, 0);
  const hasItems = lines.length > 0;
  // Con algo por kilo en la bolsa, el total no es cerrado: cada pieza se pesa al envasar.
  const hayPeso = lines.some((l) => l.p.saleUnit === "WEIGHT");
  const count = lines.reduce((s, l) => s + (l.p.saleUnit === "WEIGHT" ? 1 : l.q), 0);

  // LA ENTREGA con la configuración de Envíos del negocio: la MISMA vista previa que las demás
  // vidrieras, sobre `cotizarEnvio`, la que usa el servidor. `placeOnlineOrder` vuelve a decidir.
  const {
    zonas,
    conZonas,
    hayRetiro,
    pausa,
    modo,
    zona,
    franjas,
    franjaElegida,
    dias,
    diaElegido,
    freno: frenoDeEntrega,
    faltaParaGratis,
    ofrecerRetiro,
    costoEnvio,
    setZonaId,
    setFranja,
    setDia,
  } = useEntregaDeLaTienda({ entrega, hoy, subtotal, hayProductos: hasItems, envio, fulfillment, setFulfillment });
  const cupon = useCuponDePedido(subtotal);
  const total = subtotal - cupon.descuento + costoEnvio;

  // El pedido: el envío, el rechazo con su motivo (sin perder la bolsa) y el de WhatsApp, que se
  // registra ANTES de abrir el chat (pedido-online.tsx).
  //
  // La pestaña del chat la abre ESTA vidriera y no el hook (`hayWhatsApp: false` sólo apaga ese
  // `window.open`): el servidor arma el `wa.me` con los dígitos crudos del panel, y con
  // «1166778890» eso es un chat en EE. UU. Acá se lleva al link con el número del local ya
  // normalizado (`chatConElNumeroDelLocal`). Se abre en blanco EN EL TOQUE, igual que el hook:
  // un `window.open` después de esperar la respuesta lo bloquea el celular.
  const pedido = usePedidoOnline({
    hayWhatsApp: false,
    alRegistrar: () => {
      setCart({});
      setClaveDePedido(nuevaClaveDePedido());
      cupon.limpiar();
    },
  });
  useEffect(() => {
    olvidarAviso.current = pedido.olvidarAviso;
  });
  const chatDelPedido = chatConElNumeroDelLocal(pedido.confirmado?.whatsapp, local.whatsapp);
  const ventanaDelChat = useRef<{ ventana: Window; enviando: boolean } | null>(null);
  const enviarPedido = (e: FormEvent<HTMLFormElement>) => {
    const boton = (e.nativeEvent as SubmitEvent).submitter;
    const porWhatsApp = boton instanceof HTMLButtonElement && boton.value === "whatsapp" && Boolean(local.whatsapp);
    // Por «Enviar pedido» el alta redirige a gracias: se anota qué bolsa salió para olvidarla allá (ronda 2).
    marcarEnvio(boton instanceof HTMLButtonElement ? boton.value : null);
    const ventana = porWhatsApp ? window.open("about:blank", "_blank") : null;
    ventanaDelChat.current = ventana ? { ventana, enviando: false } : null;
    pedido.onSubmit(e);
  };
  useEffect(() => {
    const v = ventanaDelChat.current;
    if (!v) return;
    if (pedido.enviando) {
      v.enviando = true;
      return;
    }
    if (!v.enviando) return; // todavía no salió
    ventanaDelChat.current = null;
    if (chatDelPedido && !v.ventana.closed) {
      v.ventana.opener = null;
      v.ventana.location.href = chatDelPedido;
    } else {
      v.ventana.close();
    }
  }, [pedido.enviando, chatDelPedido]);
  const errorDeCupon = pedido.error?.campo === "cupon" ? pedido.error.texto : cupon.error;

  // ── La ficha (un `<dialog>` nativo: Esc, clic afuera y «×» la cierran) ──
  const fichaRef = useRef<HTMLDialogElement>(null);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const enFicha = fichaId ? (byId.get(fichaId) ?? null) : null;
  const abrirFicha = useCallback((id: string) => setFichaId(id), []);
  const cerrarFicha = () => setFichaId(null);
  // La hoja compartida (ronda 2): abre con la ficha elegida y «atrás» del celular la cierra (antes sacaba de la tienda).
  useHoja(fichaRef, fichaId != null, cerrarFicha);

  // ── La bolsa en el celular: el mismo formulario, como hoja inferior modal ──
  const bolsaRef = useRef<HTMLDialogElement>(null);
  const [bolsaAbierta, setBolsaAbierta] = useState(false);
  const abrirBolsa = () => setBolsaAbierta(true);
  const cerrarBolsa = () => setBolsaAbierta(false);
  useHoja(bolsaRef, bolsaAbierta, cerrarBolsa);
  useEffect(() => {
    // Si la pantalla pasa a compu con la hoja abierta, se cierra: ahí la bolsa es el riel.
    const mq = window.matchMedia("(min-width: 1081px)");
    const alCambiar = () => {
      if (mq.matches) setBolsaAbierta(false);
    };
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, []);
  const cerrarAlTocarAfuera = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) e.currentTarget.close();
  };

  // El contador de la barra «late» al sumar (transform, no mueve nada).
  const [latido, setLatido] = useState(0);
  const contadorPrevio = useRef(count);
  useEffect(() => {
    if (count > contadorPrevio.current) setLatido((n) => n + 1);
    contadorPrevio.current = count;
  }, [count]);

  const propuestas = propuestasSegunContacto(propuestasConMediosDeLaMarca(c.valueProps, mediosDePago), local);
  const promesa = promesaDeReparto(local, c);
  const [h1a, h1b] = partirTitulo(c.heroTitle);

  return (
    <div className={`magra${hasItems ? " con-bolsa" : ""}`}>
      <SpriteDespiece />

      {/* ── CABECERA ── */}
      <header className="mg-top">
        <a href="#top" className="mg-marca" aria-label={`${c.brandLead}${c.brandAccent}${c.brandTail} ${c.brandSub}`}>
          <span className="mg-logo">
            {c.brandLead}
            <b>{c.brandAccent}</b>
            {c.brandTail}
          </span>
          {/* La localidad DEL LOCAL ("Meat Market · Canning"); no está en el copy. */}
          <small>{local.zoneLabel ? `${c.brandSub} · ${local.zoneLabel}` : c.brandSub}</small>
        </a>
        <nav className="mg-nav" aria-label="Secciones">
          <a href="#cortes">Cortes</a>
          <a href="#coccion">Cómo cocinarlos</a>
          <a href="#nosotros">La casa</a>
          <a href="#contacto">Cómo llegar</a>
        </nav>
        <a className="mg-btn mg-btn-ghost mg-top-cta" href="#cortes">
          Lista de precios
        </a>
      </header>

      <main className="mg-main" id="top">
        {/* ── HERO: la foto real de los packs y el título de la marca ── */}
        <section className="mg-hero" aria-labelledby="mg-h1">
          <div className="mg-hero-copy">
            <span className="mg-eyebrow">{c.heroEyebrow}</span>
            <h1 id="mg-h1" className="mg-h1">
              <span className="mg-h1-l">{h1a}</span>
              {h1b && <span className="mg-h1-l">{h1b}</span>}
            </h1>
            <p className="mg-lede">{c.heroLede}</p>
            {/* Tienda pausada desde Envíos: se dice antes de que armen la bolsa (MG-036). */}
            {pausa && (
              <p className="mg-pausa" role="status">
                {pausa}
              </p>
            )}
            <div className="mg-cta">
              <a className="mg-btn mg-btn-oro" href="#cortes">
                Armar mi pedido&nbsp;&nbsp;<span className="mg-sim" aria-hidden="true">→</span>
              </a>
              {local.whatsapp && (
                <button type="button" className="mg-btn mg-btn-ghost" onClick={() => requestWhatsApp("¡Hola MAGRA! Quería hacer una consulta.")}>
                  Pedir por WhatsApp
                </button>
              )}
            </div>
            {/* La promesa de reparto sale del LOCAL: sin localidad cargada no se promete nada. */}
            {promesa && <p className="mg-hero-zona">{promesa}</p>}
          </div>
          <figure className="mg-hero-foto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={MAGRA_HERO.src}
              srcSet={MAGRA_HERO.srcSet}
              sizes="(max-width: 820px) 100vw, 48vw"
              width={MAGRA_HERO.width}
              height={MAGRA_HERO.height}
              fetchPriority="high"
              alt="Packs de Estancia Don Ramón envasados al vacío: ojo de bife, asado del medio, medio lomo, lomo, milanesa de nalga y más"
            />
            <span className="mg-sello">
              <span className="mg-sim" aria-hidden="true">●</span> Envasado al vacío
            </span>
            <figcaption>Distribuidor oficial · Estancia Don Ramón</figcaption>
          </figure>
        </section>

        {/* ── MARQUEE ── */}
        <div className="mg-marquee" aria-hidden="true">
          <div className="mg-track">
            {[...c.marquee, ...c.marquee].map((m, i) => (
              <span key={i}>
                {m}
                <i>·</i>
              </span>
            ))}
          </div>
        </div>

        {/* ── PROPUESTAS DE VALOR (textuales, con los medios de pago de la marca) ── */}
        <ul className="mg-valores">
          {propuestas.map((v) => (
            <li key={v.title}>
              <span aria-hidden="true" className="mg-valor-g mg-sim">
                {v.glyph}
              </span>
              <b>{v.title}</b>
              <span>{v.text}</span>
            </li>
          ))}
        </ul>

        <div className="mg-shell">
          <div className="mg-col">
            {/* ── LA CARTA: despiece + etiquetas ── */}
            <section className="mg-sec mg-cortes" id="cortes" aria-labelledby="mg-carta-t">
              <div className="mg-sec-cab">
                {/* Copy nuevo del diseño (DISENO.md §9), provisional a confirmar con el dueño. */}
                <span className="mg-eyebrow">Elegí por dónde sale</span>
                <h2 id="mg-carta-t" className="mg-h2">
                  {PALABRAS.carta}
                </h2>
              </div>

              {products.length === 0 ? (
                <div className="mg-vacio-carta">
                  <p className="mg-vacio-t">Estamos preparando la vidriera</p>
                  <p>
                    En un rato vas a poder comprar online.
                    {local.whatsapp && " Mientras tanto, escribinos por WhatsApp y te tomamos el pedido."}
                  </p>
                  {local.whatsapp && (
                    <button type="button" className="mg-btn mg-btn-wa" onClick={() => requestWhatsApp("¡Hola MAGRA! Quiero hacer un pedido.")}>
                      <WaIcon /> Pedir por WhatsApp
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Botones con aria-pressed (no pestañas ARIA: esas piden flechas y foco itinerante). */}
                  <div className="mg-tabs" role="group" aria-label="Elegí el animal">
                    {SECCIONES.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        aria-pressed={seccion === s.id}
                        aria-controls="mg-carta"
                        className={seccion === s.id ? "on" : undefined}
                        onClick={() => irASeccion(s.id)}
                      >
                        {s.titulo}
                        <span className="mg-tab-n">
                          {porSeccion[s.id]?.length ?? 0}
                          <span className="mg-sr"> {PALABRAS.varios}</span>
                        </span>
                      </button>
                    ))}
                  </div>

                  <div id="mg-carta">
                    {animal && <Despiece animal={animal} region={region} conteo={conteo} onElegir={setRegion} />}

                    <div className="mg-carta-cab">
                      <h3 className="mg-h2 mg-carta-h">{tituloSeccion}</h3>
                      <span className="mg-carta-n">{cortes(enSeccion.length)}</span>
                    </div>

                    {animal && (
                      <div className="mg-filtros" id="coccion" role="group" aria-label="¿Cómo lo cocinás?">
                        <span className="mg-filtros-k">¿Cómo lo cocinás?</span>
                        {regionElegida && (
                          <button type="button" className="mg-chip on" onClick={() => setRegion(null)} aria-label={`Sacar el filtro ${regionElegida.nombre}`}>
                            {regionElegida.nombre} ×
                          </button>
                        )}
                        {coccionesDeLaSeccion.map((m) => (
                          <button
                            key={m}
                            type="button"
                            className={`mg-chip${coccion === m ? " on" : ""}`}
                            aria-pressed={coccion === m}
                            onClick={() => setCoccion(coccion === m ? null : m)}
                          >
                            {NOMBRE_COCCION[m]}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="mg-chip mg-chip-todos"
                          aria-pressed={!region && !coccion}
                          onClick={() => {
                            setRegion(null);
                            setCoccion(null);
                          }}
                        >
                          Ver todos
                        </button>
                      </div>
                    )}

                    {enSeccion.length === 0 ? (
                      <p className="mg-sin">Hoy no hay {tituloSeccion.toLowerCase()} en la carta.</p>
                    ) : visibles.length === 0 ? (
                      <p className="mg-sin">
                        {regionElegida
                          ? `En ${regionElegida.nombre.toLowerCase()} no hay cortes hoy. `
                          : "Con esa cocción no hay cortes hoy. "}
                        <button
                          type="button"
                          className="mg-link"
                          onClick={() => {
                            setRegion(null);
                            setCoccion(null);
                          }}
                        >
                          Mirá todos los de {tituloSeccion.toLowerCase()}.
                        </button>
                      </p>
                    ) : (
                      <div className={`mg-carta${animal ? "" : " lista"}`}>
                        {visibles.map((p) => (
                          <Etiqueta
                            key={p.id}
                            p={p}
                            q={cart[p.id] ?? 0}
                            animal={animal}
                            region={regionDeP(p)}
                            onAbrir={abrirFicha}
                            onBump={bump}
                            conImagen={animal !== null}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>

            {/* ── ENVASADOS AL VACÍO (textual) — el despiece de cada animal como ilustración ── */}
            <section className="mg-sec" id="envasados" aria-labelledby="mg-vac-t">
              <h2 id="mg-vac-t" className="mg-h2">
                {c.vacioTitle}
              </h2>
              <div className="mg-vac">
                {c.vacio.map((v, i) => {
                  const a = (["vaca", "cerdo", "pollo"] as const)[i];
                  return (
                    <article key={v.title} className="mg-vac-card">
                      {a && <MiniDespiece animal={a} region={null} recorte={false} />}
                      <h3>{v.title}</h3>
                      <p>{v.text}</p>
                      {a && (
                        <button type="button" className="mg-link" onClick={() => irASeccion(a, true)}>
                          Hacer pedido <span className="mg-sim" aria-hidden="true">→</span>
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>

            {/* ── GOURMET (textual, fotos reales) ── */}
            <section className="mg-sec" id="gourmet" aria-labelledby="mg-gou-t">
              <h2 id="mg-gou-t" className="mg-h2">
                {c.gourmetTitle}
              </h2>
              <ul className="mg-gou">
                {c.gourmet.map((g) => (
                  <li key={g.name}>
                    {MAGRA_GOURMET_FOTOS[g.name] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={MAGRA_GOURMET_FOTOS[g.name]} width={560} height={560} alt={g.name} loading="lazy" decoding="async" />
                    )}
                    <span>{g.name}</span>
                  </li>
                ))}
              </ul>
              {(porSeccion.gourmet?.length ?? 0) > 0 && (
                <button type="button" className="mg-link" onClick={() => irASeccion("gourmet", true)}>
                  Ver la línea gourmet de hoy <span className="mg-sim" aria-hidden="true">→</span>
                </button>
              )}
            </section>

            {/* ── PROVEEDORES: sus logos reales ── */}
            <section className="mg-sec mg-prov-sec" aria-labelledby="mg-prov-t">
              <h2 id="mg-prov-t" className="mg-eyebrow">
                {c.providersTitle}
              </h2>
              <ul className="mg-prov">
                {c.providers.map((p) => (
                  <li key={p}>
                    {MAGRA_LOGO_PROVEEDOR[p] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={MAGRA_LOGO_PROVEEDOR[p]} width={170} height={131} alt={p} loading="lazy" decoding="async" />
                    ) : (
                      <span>{p}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            {/* ── RESEÑAS (reales, textuales) ── */}
            <section className="mg-sec" id="nosotros" aria-labelledby="mg-rev-t">
              <h2 id="mg-rev-t" className="mg-h2">
                Reviews de nuestros clientes
              </h2>
              <div className="mg-revs">
                {c.reviews.map((r) => (
                  <figure key={r.name} className="mg-rev">
                    <div className="mg-estrellas">
                      <span aria-hidden="true" className="mg-sim">{"★".repeat(Math.max(0, Math.min(5, r.rating)))}</span>
                      <span className="mg-sr">{r.rating} de 5</span>
                    </div>
                    <blockquote>“{r.text}”</blockquote>
                    <figcaption>{r.name} · Cliente MAGRA</figcaption>
                  </figure>
                ))}
              </div>
            </section>

            {/* ── QUIÉNES SOMOS ── */}
            <section className="mg-sec mg-about" aria-labelledby="mg-about-t">
              <h2 id="mg-about-t" className="mg-h2">
                {c.aboutTitle}
              </h2>
              <p>{textoAbout(local, c)}</p>
            </section>
          </div>

          {/* ── LA BOLSA: riel en la compu, hoja inferior en el celular (mismo formulario) ── */}
          <dialog ref={bolsaRef} className="mg-bolsa" id="pedido" aria-labelledby="mg-bolsa-t" onClose={cerrarBolsa} onClick={cerrarAlTocarAfuera}>
            <div className="mg-bolsa-cab">
              <span className="mg-eyebrow">Tu pedido</span>
              <h2 id="mg-bolsa-t" className="mg-bolsa-t">
                Mi bolsa <span className="mg-cnt">{count}</span>
              </h2>
              <button type="button" className="mg-x mg-bolsa-x" onClick={cerrarBolsa} aria-label="Cerrar mi bolsa">
                ×
              </button>
            </div>

            <form onSubmit={enviarPedido} className="mg-bolsa-form">
              <div className="mg-renglones">
                {!hasItems && <p className="mg-bolsa-vacia">{PALABRAS.bolsaVacia}</p>}
                {lines.map((l) => (
                  <div key={l.p.id} className="mg-renglon">
                    <div className="mg-renglon-info">
                      <div className="mg-renglon-nom">{l.p.name}</div>
                      <div className="mg-renglon-pu">
                        {money.format(unitPrice(l.p))} {unitLabel(l.p)}
                      </div>
                      <div className="mg-step" role="group" aria-label={`Cantidad de ${l.p.name}`}>
                        <button type="button" onClick={() => bump(l.p, -1)} aria-label={`Quitar ${l.p.name}`}>
                          −
                        </button>
                        <span className="mg-step-q">
                          {formatearCantidad(l.q)}
                          {l.p.saleUnit === "WEIGHT" ? " kg" : ""}
                        </span>
                        <button type="button" onClick={() => bump(l.p, 1)} aria-label={`Agregar ${l.p.name}`}>
                          +
                        </button>
                      </div>
                    </div>
                    <div className="mg-renglon-t">{money.format(l.t)}</div>
                    <input type="hidden" name="productId" value={l.p.id} />
                    <input type="hidden" name="quantity" value={l.q} />
                    {/* El precio que vio: si cambió mientras armaba, el servidor avisa en esta línea (reglas-tienda.ts). */}
                    <input type="hidden" name="unitPrice" value={unitPrice(l.p)} />
                    {pedido.avisoDe(l.p.id) && (
                      <p role="alert" className="mg-aviso">
                        {pedido.avisoDe(l.p.id)}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <div className="mg-bolsa-pie">
                {pausa && <p className="mg-pausa">{pausa}</p>}
                {hasItems && (
                  // La ENTREGA va antes de los totales: elegir envío y zona cambia lo que se paga.
                  <div className="mg-campos">
                    <label className="mg-campo">
                      <span>Entrega</span>
                      <select
                        name="fulfillment"
                        value={modo === "envio" ? "DELIVERY" : "PICKUP"}
                        onChange={(e) => setFulfillment(e.target.value as "PICKUP" | "DELIVERY")}
                      >
                        <option value="DELIVERY">Envío a domicilio</option>
                        {hayRetiro && <option value="PICKUP">Retiro en el local</option>}
                      </select>
                    </label>
                    {modo === "envio" && conZonas && (
                      <label className="mg-campo">
                        <span>Zona *</span>
                        <select name="envioZona" required value={zona?.id ?? ""} onChange={(e) => setZonaId(e.target.value)}>
                          <option value="">Elegí tu zona</option>
                          {zonas.map((z) => (
                            <option key={z.id} value={z.id}>
                              {z.nombre} · {z.costo > 0 ? money.format(z.costo) : "sin cargo"}
                              {z.gratisDesde !== null && z.costo > 0 ? ` (gratis desde ${money.format(z.gratisDesde)})` : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {modo === "envio" && (
                      <label className="mg-campo">
                        <span>Dirección *</span>
                        <input name="address" required autoComplete="street-address" placeholder="Calle, número, barrio" />
                      </label>
                    )}
                    {modo === "retiro" && (local.addressLine || entrega?.horarioRetiro) && (
                      <p className="mg-retiro">
                        Retirás en {local.addressLine ?? "el local"}
                        {entrega?.horarioRetiro ? ` · ${entrega.horarioRetiro}` : ""}
                      </p>
                    )}
                    {franjas.length > 0 && (
                      <fieldset className="mg-franjas">
                        <legend>{modo === "envio" ? "¿Cuándo te lo llevamos? *" : "¿Cuándo lo retirás? *"}</legend>
                        <label className="mg-campo">
                          <span>Día</span>
                          <select name="dia" value={diaElegido} onChange={(e) => setDia(e.target.value)}>
                            {dias.map((d) => (
                              <option key={d.valor} value={d.valor}>
                                {d.texto}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="mg-franjas-op" role="radiogroup" aria-label="Franja horaria">
                          {franjas.map((f) => (
                            <label key={f} className={f === franjaElegida ? "mg-chip on" : "mg-chip"}>
                              <input type="radio" name="franja" value={f} checked={f === franjaElegida} onChange={() => setFranja(f)} />
                              {f}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    )}
                  </div>
                )}
                <div className="mg-tot">
                  <span>Subtotal</span>
                  <span className="mg-num">{money2.format(subtotal)}</span>
                </div>
                {cupon.descuento > 0 && (
                  <div className="mg-tot">
                    <span>Cupón {cupon.aplicado?.codigo}</span>
                    <span className="mg-num">−{money2.format(cupon.descuento)}</span>
                  </div>
                )}
                <div className="mg-tot">
                  <span>
                    {modo === "retiro"
                      ? "Retiro en el local"
                      : zona
                        ? `Envío · ${zona.nombre}`
                        : local.zoneLabel && !conZonas
                          ? `Envío · ${local.zoneLabel}`
                          : "Envío"}
                  </span>
                  {modo === "envio" && conZonas && !zona ? (
                    <span className="mg-pend">Elegí la zona</span>
                  ) : costoEnvio > 0 ? (
                    <span className="mg-num">{money2.format(costoEnvio)}</span>
                  ) : (
                    <span className="mg-gratis">{modo === "retiro" ? "Sin cargo" : "Gratis"}</span>
                  )}
                </div>
                {faltaParaGratis > 0 && (
                  <p className="mg-empujon" aria-live="polite">
                    Te faltan {money.format(faltaParaGratis)} para el envío gratis
                  </p>
                )}
                <div className="mg-tot mg-tot-grande">
                  <span>{hayPeso ? "Total estimado" : "Total"}</span>
                  <span className="mg-num" aria-live="polite">
                    {money2.format(total)}
                  </span>
                </div>
                {hayPeso && notaDePeso && <p className="mg-nota-peso">{notaDePeso}</p>}

                {hasItems && (
                  <div className="mg-campos">
                    <input type="hidden" name="idempotencyKey" value={claveDePedido} />
                    <label className="mg-campo">
                      <span>Nombre y apellido *</span>
                      <input name="customerName" required autoComplete="name" placeholder="Tu nombre" />
                    </label>
                    <label className="mg-campo">
                      <span>WhatsApp *</span>
                      <input name="customerPhone" required autoComplete="tel" inputMode="tel" placeholder="11 …" />
                    </label>
                    <label className="mg-campo">
                      <span>Nota (opcional)</span>
                      <input name="notes" placeholder={PALABRAS.notaPlaceholder} />
                    </label>
                    <div className="mg-campo">
                      <label htmlFor="mg-cupon">Cupón (opcional)</label>
                      <div className="mg-cupon">
                        <input
                          id="mg-cupon"
                          name="cupon"
                          value={cupon.codigo}
                          onChange={(e) => cupon.cambiar(e.target.value)}
                          autoComplete="off"
                          autoCapitalize="characters"
                          placeholder="Código"
                          aria-invalid={errorDeCupon ? true : undefined}
                          aria-describedby={errorDeCupon ? "mg-cupon-error" : undefined}
                        />
                        <button type="button" className="mg-btn mg-btn-ghost" onClick={() => void cupon.aplicar()} disabled={cupon.probando}>
                          {cupon.probando ? "…" : "Aplicar"}
                        </button>
                      </div>
                      {errorDeCupon && (
                        <p id="mg-cupon-error" role="alert" className="mg-aviso">
                          {errorDeCupon}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Sin débito ni crédito hasta que el local cobre con tarjeta. */}
                <p className="mg-pago">Pagás al recibir: efectivo, transferencia o Mercado Pago.</p>

                {hasItems && frenoDeEntrega && (
                  <div className="mg-freno" role="status">
                    <p>{frenoDeEntrega}</p>
                    {ofrecerRetiro && (
                      <button type="button" className="mg-btn mg-btn-ghost" onClick={() => setFulfillment("PICKUP")}>
                        Retiro en el local
                      </button>
                    )}
                  </div>
                )}
                {pedido.error && pedido.error.campo !== "cupon" && (
                  <p role="alert" className="mg-error">
                    {pedido.error.texto}
                  </p>
                )}
                {pedido.confirmado && (
                  <div role="status" className="mg-ok">
                    <p>
                      Tu pedido <b>#{pedido.confirmado.code}</b> quedó registrado.{" "}
                      {chatDelPedido ? "Seguimos por WhatsApp." : "Te vamos a escribir al WhatsApp que dejaste."}
                    </p>
                    {chatDelPedido && (
                      <a href={chatDelPedido} target="_blank" rel="noopener noreferrer">
                        Abrir el chat del pedido #{pedido.confirmado.code}
                      </a>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  name="via"
                  value="tienda"
                  className="mg-btn mg-btn-oro mg-enviar"
                  disabled={!hasItems || pedido.enviando || Boolean(frenoDeEntrega)}
                  aria-busy={pedido.enviando || undefined}
                >
                  {pedido.enviando ? "Enviando…" : "Enviar pedido"}
                </button>
                {hasItems && local.whatsapp ? (
                  // Registra el pedido y DESPUÉS abre el chat con su número.
                  <button
                    type="submit"
                    name="via"
                    value="whatsapp"
                    className="mg-btn mg-btn-wa mg-bolsa-wa"
                    disabled={pedido.enviando || Boolean(frenoDeEntrega)}
                  >
                    <WaIcon /> Pedir por WhatsApp
                  </button>
                ) : local.whatsapp ? (
                  <button type="button" className="mg-btn mg-btn-wa mg-bolsa-wa" onClick={() => requestWhatsApp("¡Hola MAGRA! Quiero hacer un pedido.")}>
                    <WaIcon /> Pedir por WhatsApp
                  </button>
                ) : null}
              </div>
            </form>
          </dialog>
        </div>

        {/* ── PIE: datos del LOCAL (BusinessSettings), nunca los de otro local ── */}
        <footer className="mg-pie" id="contacto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mg-pie-logo" src="/tenants/magra/logo-footer.webp" width={150} height={54} alt="MAGRA Meat Market" loading="lazy" decoding="async" />
          <div className="mg-pie-cols">
            {(local.addressLine || local.city) && (
              <div>
                <h3>Dónde estamos</h3>
                {local.addressLine && <p>{local.addressLine}</p>}
                {local.city && <p>{local.city}</p>}
              </div>
            )}
            {local.hours && (
              <div>
                <h3>Horarios</h3>
                <p>{local.hours}</p>
              </div>
            )}
            {/* Las zonas de reparto son de Canning: se muestran SÓLO en el local que las tiene. */}
            {esElLocalDelCopy(local) && (
              <div>
                <h3>Llegamos a</h3>
                <p>{c.deliveryZones.join(" · ")}</p>
              </div>
            )}
            {(local.whatsapp || local.instagramUrl || local.email) && (
              <div>
                <h3>Contacto</h3>
                {local.whatsapp && (
                  // Texto y href salen de los MISMOS dígitos: no se pueden volver a separar.
                  <a href={`https://wa.me/${local.whatsapp}`} target="_blank" rel="noopener noreferrer">
                    WhatsApp {local.whatsappLabel}
                  </a>
                )}
                {local.instagramUrl && (
                  <a href={local.instagramUrl} target="_blank" rel="noopener noreferrer">
                    Instagram {local.instagram}
                  </a>
                )}
                {local.email && <a href={`mailto:${local.email}`}>{local.email}</a>}
              </div>
            )}
          </div>
          <div className="mg-pie-legal">
            <span>{c.copyright}</span>
            <Link href="/admin" className="mg-admin">
              Acceso administrador
            </Link>
          </div>
        </footer>
      </main>

      {/* ── LA FICHA ── */}
      <dialog ref={fichaRef} className="mg-ficha" aria-labelledby="mg-ficha-t" onClose={() => setFichaId(null)} onClick={cerrarAlTocarAfuera}>
        {enFicha && (
          <FichaContenido
            key={enFicha.id}
            p={enFicha}
            animal={(() => {
              const s = seccionMagra(enFicha.name);
              return esAnimal(s) ? s : null;
            })()}
            enLaBolsa={cart[enFicha.id] ?? 0}
            notaDePeso={notaDePeso}
            onCerrar={cerrarFicha}
            onAgregar={(p, cantidad) => {
              cambiar(p, () => cantidad);
              cerrarFicha();
            }}
          />
        )}
      </dialog>

      {/* ── BARRA DE LA BOLSA (celular): siempre visible, a un toque desde cualquier lugar ── */}
      <div className="mg-barra">
        {hasItems ? (
          <button type="button" className="mg-barra-in" onClick={abrirBolsa} aria-haspopup="dialog">
            <span>
              <b key={latido} className="mg-barra-n">
                {cortes(count)}
              </b>{" "}
              · {money.format(total)}
              {hayPeso && <small> aprox.</small>}
            </span>
            <span className="mg-barra-ir">Ver mi pedido <span className="mg-sim" aria-hidden="true">→</span></span>
          </button>
        ) : pedido.confirmado ? (
          <button type="button" className="mg-barra-in" onClick={abrirBolsa} aria-haspopup="dialog">
            <span>
              <b>Pedido #{pedido.confirmado.code} enviado</b>
            </span>
            <span className="mg-barra-ir">Ver <span className="mg-sim" aria-hidden="true">→</span></span>
          </button>
        ) : (
          <a className="mg-barra-in" href="#cortes">
            <span>
              <b>Mi bolsa · 0</b>
            </span>
            <span className="mg-barra-ir">Ver cortes <span className="mg-sim" aria-hidden="true">↓</span></span>
          </a>
        )}
      </div>
    </div>
  );
}

/** «¡Esto no es una carnicería!» en dos renglones para la entrada por línea (el texto no cambia). */
function partirTitulo(t: string): [string, string | null] {
  const i = t.indexOf(" una ");
  return i > 0 ? [t.slice(0, i), t.slice(i + 1)] : [t, null];
}

function WaIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-4-4.7-4.2-.1-.2-1-1.4-1-2.6s.6-1.8.9-2.1c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.5c-.2.2-.3.4-.1.7.2.3.9 1.4 1.9 2 1.3.8 1.6.7 1.9.6.2-.1.6-.6.8-.9.2-.2.4-.2.6-.1l1.9.9c.2.1.4.2.5.3.1.2.1.9-.1 1.5Z" />
    </svg>
  );
}
