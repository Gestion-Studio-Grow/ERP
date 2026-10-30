"use client";

// ── VIDRIERA SHINE — «Elegí tu aroma» (diseño 29/10/2026, fronts/shine/DISENO.md).
// En Shine toda vela se compra eligiendo su fragancia (catálogo oficial p2): la carta de aromas abre la
// página, «Tu aroma» queda prendido en toda la visita (chip de la barra, cera de la vela 3D, nota del
// pedido) y el catálogo son las fotos reales del PDF de la dueña. Detrás, el motor de siempre:
// usePedidoOnline → placeOnlineOrder (bandeja, POS, stock), la entrega del negocio y el cupón.
// La piel (estilos.ts) la escribe el servidor (ShineVidriera.tsx): no viaja en este JS.

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { WhatsAppCtaProvider, useWhatsAppCta } from "@/components/whatsapp-cta";
import type { ConfigEnvios } from "@/lib/envios/modelo";
import { useEntregaDeLaTienda } from "../EntregaDeLaTienda";
import { usePedidoOnline, useCuponDePedido } from "../pedido-online";
import { nuevaClaveDePedido, etiquetaDeDisponibilidad, type Disponibilidad } from "../reglas-tienda";
import type { StorefrontCopy } from "@/tenants/storefront";
import type { TenantImagery } from "@/lib/tenant-layout";
import VelaDiferida from "./VelaDiferida";
import Sello from "./Sello";
import Pie from "./Pie";
import { CLASES_DE_FUENTES } from "./fuentes";
import { CartaDeAromas, HojaDeAroma, elegirAroma, useAromaElegido } from "./Aromas";
import Ficha, { type ProductoFicha } from "./Ficha";
import Bolsa, { ESCRITORIO, type Renglon } from "./Bolsa";
import { CARPETA, FAMILIAS, MANIFIESTO, REGALOS, notaConAromas, rutaFoto, vistaDe, type FamiliaId } from "./catalogo";

type Product = {
  id: string;
  name: string;
  saleUnit: "UNIT" | "WEIGHT";
  price: number | null;
  pricePerKg: number | null;
  unit: string;
  /** "Sin stock" / "Últimas unidades", ya decidido en el servidor (nunca el número). */
  disponibilidad?: Disponibilidad;
};

export type PropsShine = {
  products: Product[];
  branding: { whatsapp: string | null } | null;
  copy: StorefrontCopy;
  /** Ya no se usa: las fotos de ambiente (hero.jpg, mundo-*.jpg) no son producto Shine [A VALIDAR con la dueña]. */
  imagery?: TenantImagery | null;
  tenantKey: string;
  /** Envíos del negocio (src/lib/envios) y hoy en su zona horaria; null = la tarifa del copy, como siempre. */
  entrega?: ConfigEnvios | null;
  hoy?: string | null;
};

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const precioDe = (p: Product) => (p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price) ?? 0;
const ICONOS = ["candle", "hand", "sparkle", "star", "sun"];
const nada = () => () => {};
const ORDEN_FAMILIA: Record<string, number> = Object.fromEntries(FAMILIAS.map((f, i) => [f.id, i]));
const ESTADO_FICHA = { shineFicha: true } as const;
const esFichaDelHistorial = (estado: unknown) => Boolean(estado && typeof estado === "object" && "shineFicha" in estado);

export default function ShineFront({ branding, tenantKey, ...resto }: PropsShine) {
  const numero = branding?.whatsapp ?? null;
  return (
    <WhatsAppCtaProvider tenantKey={tenantKey} configuredNumber={numero}>
      <Vidriera {...resto} hayWhatsApp={Boolean(numero?.replace(/\D/g, ""))} />
    </WhatsAppCtaProvider>
  );
}

function Vidriera({ products, copy, entrega: configEnvios = null, hoy = null, hayWhatsApp }: Omit<PropsShine, "branding" | "tenantKey"> & { hayWhatsApp: boolean }) {
  const { requestWhatsApp } = useWhatsAppCta();
  const raiz = useRef<HTMLDivElement>(null);
  const aroma = useAromaElegido();
  const hidratado = useSyncExternalStore(nada, () => true, () => false);
  const [bolsa, setBolsa] = useState<Record<string, number>>({});
  const [fulfillment, setFulfillment] = useState<"PICKUP" | "DELIVERY">("DELIVERY");
  const [claveDePedido, setClaveDePedido] = useState(nuevaClaveDePedido);
  const [notaLibre, setNotaLibre] = useState("");
  const [ficha, setFicha] = useState<{ id: string; foco: boolean } | null>(null);
  const [bolsaAbierta, setBolsaAbierta] = useState(false);
  const [hojaAroma, setHojaAroma] = useState(false);
  const [familia, setFamilia] = useState<FamiliaId | "todo" | "otros">("todo");
  const [aviso, setAviso] = useState("");

  const items = useMemo(() => {
    const conVista = products.map((p, i) => ({ ...p, precio: precioDe(p), vista: vistaDe(p), i }));
    return conVista.sort((a, b) => {
      const fa = a.vista.familia ? ORDEN_FAMILIA[a.vista.familia] : 99;
      const fb = b.vista.familia ? ORDEN_FAMILIA[b.vista.familia] : 99;
      return fa - fb || Number(b.vista.enCatalogo) - Number(a.vista.enCatalogo) || a.i - b.i;
    });
  }, [products]);
  const porId = useMemo(() => new Map(items.map((p) => [p.id, p])), [items]);
  const porClave = useMemo(() => new Map(items.map((p) => [p.vista.clave, p])), [items]);
  const familiasConProductos = FAMILIAS.filter((f) => items.some((p) => p.vista.familia === f.id));
  const hayOtros = items.some((p) => !p.vista.familia);
  const visibles = items.filter((p) => familia === "todo" || (familia === "otros" ? !p.vista.familia : p.vista.familia === familia));

  // ── La bolsa: un renglón por producto y aroma ("id|aroma").
  const renglones: Renglon[] = Object.entries(bolsa)
    .map(([clave, q]) => {
      const [id, a] = clave.split("|");
      const p = porId.get(id);
      return p ? { clave, id, nombre: p.name, aroma: a || null, q, precio: p.precio, t: q * p.precio, vista: p.vista } : null;
    })
    .filter((r): r is Renglon => r !== null);
  const subtotal = renglones.reduce((s, r) => s + r.t, 0);
  const cantidad = renglones.reduce((s, r) => s + r.q, 0);
  const enBolsaDe = (id: string) => renglones.filter((r) => r.id === id).reduce((s, r) => s + r.q, 0);
  const nota = notaConAromas(renglones.map((r) => ({ nombre: r.nombre, cantidad: r.q, aroma: r.aroma })), notaLibre);

  const entrega = useEntregaDeLaTienda({ entrega: configEnvios, hoy, subtotal, hayProductos: renglones.length > 0, envio: copy.shipping ?? null, fulfillment, setFulfillment });
  // Envío gratis desde $25.000 y tarifa $3.500: del copy, provisional a confirmar con la dueña (storefront.ts);
  // con zonas cargadas en Envíos manda la zona y el umbral no se muestra.
  const umbral = entrega.conZonas ? 0 : (copy.shipping?.freeThreshold ?? 0);
  // Con «Retiro» no hay envío: ni «te faltan $X para el envío gratis» (QA 29/10, MEDIA-1).
  const faltaParaGratis = entrega.modo === "envio" && umbral > 0 && subtotal > 0 && subtotal < umbral ? umbral - subtotal : 0;
  const cupon = useCuponDePedido(subtotal);
  const total = subtotal - cupon.descuento + entrega.costoEnvio;
  const pedido = usePedidoOnline({
    hayWhatsApp,
    alRegistrar: () => {
      setBolsa({});
      setNotaLibre("");
      setClaveDePedido(nuevaClaveDePedido());
      cupon.limpiar();
    },
  });

  function cambiar(clave: string, delta: number, nueva?: string) {
    const id = clave.split("|")[0];
    const p = porId.get(id);
    if (!p || (delta > 0 && p.disponibilidad === "sin-stock")) return;
    pedido.olvidarAviso(id);
    setClaveDePedido(nuevaClaveDePedido());
    setBolsa((b) => {
      const n = { ...b };
      const q = Math.max(0, (n[clave] ?? 0) + delta);
      if (nueva !== undefined) {
        delete n[clave];
        const destino = `${id}|${nueva}`;
        n[destino] = (n[destino] ?? 0) + (b[clave] ?? 0);
      } else if (q > 0) n[clave] = q;
      else delete n[clave];
      return n;
    });
  }

  function agregar(p: ProductoFicha, a: string | null, q: number) {
    cambiar(`${p.id}|${a ?? ""}`, q);
    if (a && !aroma) elegirAroma(a);
    setAviso(`Sumaste ${p.name}${a ? ` · ${a}` : ""}.`);
  }

  // La ficha se comparte con ?p=<clave> y es una entrada del historial: el «atrás» del celular la cierra en vez
  // de sacar a la clienta de la tienda (QA 29/10, MEDIA-3). Cerrarla con el botón vuelve esa misma entrada.
  function abrirFicha(id: string, foco: boolean) {
    setFicha({ id, foco });
    const p = porId.get(id);
    if (!p) return;
    const url = `?p=${encodeURIComponent(p.vista.clave)}`;
    if (esFichaDelHistorial(window.history.state)) window.history.replaceState(ESTADO_FICHA, "", url);
    else window.history.pushState(ESTADO_FICHA, "", url);
  }
  function cerrarFicha() {
    setFicha(null);
    if (esFichaDelHistorial(window.history.state)) window.history.back();
    else window.history.replaceState(null, "", window.location.pathname);
  }
  function mas(p: (typeof items)[number]) {
    const sirve = p.vista.aromas.length === 0 ? null : aroma && p.vista.aromas.includes(aroma) ? aroma : undefined;
    if (sirve === undefined) abrirFicha(p.id, true);
    else agregar(p, sirve, 1);
  }
  function verBolsa() {
    if (window.matchMedia(ESCRITORIO).matches) document.getElementById("shb-titulo")?.focus();
    else setBolsaAbierta(true);
  }

  useEffect(() => {
    // ?p= al llegar: abre esa ficha (después de hidratar, en un cuadro aparte). La entrada de la tienda queda
    // debajo, así el «atrás» cierra la ficha también cuando se llegó por un enlace compartido.
    const clave = new URLSearchParams(window.location.search).get("p");
    const p = clave ? (porClave.get(clave) ?? null) : null;
    if (p && !esFichaDelHistorial(window.history.state)) {
      window.history.replaceState(null, "", window.location.pathname);
      window.history.pushState(ESTADO_FICHA, "", `?p=${encodeURIComponent(p.vista.clave)}`);
    }
    const id = p ? window.setTimeout(() => setFicha({ id: p.id, foco: false }), 0) : 0;
    // Aparición al scroll: sólo transform (nunca opacidad), y sólo lo que está debajo del pliegue.
    const r = raiz.current;
    if (!r || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => window.clearTimeout(id);
    // Sin getBoundingClientRect: medir forzaría a dibujar lo que `content-visibility` deja para después
    // (tarjetas, manifiesto) y bajaría su letra y su trama de entrada. El primer aviso del observador
    // marca lo que ya está a la vista; recién ahí se activa el corrimiento para lo de abajo.
    let primero = true;
    const io = new IntersectionObserver((es) => {
      for (const e of es)
        if (e.isIntersecting) {
          e.target.classList.add("sh-visto");
          io.unobserve(e.target);
        }
      if (primero) {
        primero = false;
        r.classList.add("sh-revela");
      }
    });
    for (const el of r.querySelectorAll<HTMLElement>("[data-revelar]")) io.observe(el);
    return () => {
      window.clearTimeout(id);
      io.disconnect();
    };
  }, [porClave]);

  // «Atrás» / «adelante» del navegador: la ficha sigue a la dirección (?p=).
  useEffect(() => {
    const alVolver = () => {
      const clave = new URLSearchParams(window.location.search).get("p");
      const p = clave ? (porClave.get(clave) ?? null) : null;
      setFicha(p ? { id: p.id, foco: false } : null);
    };
    window.addEventListener("popstate", alVolver);
    return () => window.removeEventListener("popstate", alVolver);
  }, [porClave]);

  // Si la pantalla pasa a compu con la bolsa abierta como hoja, queda como riel.
  useEffect(() => {
    const mq = window.matchMedia(ESCRITORIO);
    const alCambiar = () => mq.matches && setBolsaAbierta(false);
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, []);

  const pFicha = ficha ? (porId.get(ficha.id) ?? null) : null;
  // «Para regalar»: la pieza que está en la tienda se suma; la que no, se consulta por WhatsApp. Sin WhatsApp, la
  // que no se puede sumar no se muestra (era un callejón: foto sin precio ni botón). Sin ninguna, no hay sección.
  const regalos = REGALOS.map((g) => ({ g, p: g.clave ? porClave.get(g.clave) : undefined })).filter(({ p }) => p || hayWhatsApp);
  const wa = (m: string) => requestWhatsApp(m);

  return (
    <div className={`shine ${CLASES_DE_FUENTES}`} ref={raiz}>
      <a className="sh-saltar" href="#coleccion">
        Ir a la colección
      </a>
      <header className="sh-barra">
        <a href="#top" className="sh-marca" aria-label="Shine · inicio">
          <Image src={`${CARPETA}/brand/logo.webp`} alt="Shine" width={130} height={40} priority className="sh-logo" />
        </a>
        <nav className="sh-nav" aria-label="Secciones">
          <a href="#aromas">Aromas</a>
          <a href="#coleccion">Colección</a>
          {regalos.length > 0 && <a href="#regalar">Regalar</a>}
          {/* Sin WhatsApp cargado no hay a quién consultar: el enlace no se muestra (QA 29/10, MEDIA-4). */}
          {hayWhatsApp && <a href="#contacto">Consultanos</a>}
        </nav>
        <div className="sh-barra-der">
          <a href="#aromas" className="sh-chip-aroma">
            Tu aroma: <b>{aroma ?? "—"}</b>
          </a>
          <button type="button" className="sh-btn sh-btn-vino sh-barra-bolsa" onClick={verBolsa}>
            Bolsa · <span className="sh-num">{cantidad}</span>
          </button>
        </div>
      </header>

      <main className="sh-main" id="top">
        <section className="sh-hero">
          <div className="sh-hero-texto">
            <p className="sh-eyebrow">{copy.eyebrow}</p>
            <h1 className="sh-h1">{copy.tagline}</h1>
            {copy.pitch && <p className="sh-pitch">{copy.pitch}</p>}
            <p className="sh-lede">{copy.intro}</p>
            <div className="sh-ctas">
              <a className="sh-btn sh-btn-vino" href="#aromas">
                Elegí tu aroma
              </a>
              <a className="sh-btn sh-btn-ghost" href="#coleccion">
                Ver la colección
              </a>
            </div>
          </div>
          <div className="sh-hero-vela">
            <Image
              src={`${CARPETA}/brand/poster-vela.webp`}
              alt="Vela de soja encendida de Shine (imagen de la escena 3D)"
              width={1000}
              height={1000}
              priority
              fetchPriority="high"
              sizes="(max-width: 900px) 100vw, 46vw"
              className="sh-poster"
            />
            <VelaDiferida aromas={copy.gourmetItems} encuadre="columna" aroma={aroma} alElegirAroma={elegirAroma} />
            <Sello />
          </div>
        </section>

        <ul className="sh-valores" aria-label="Por qué Shine">
          {copy.valueProps.map((v, i) => (
            <li key={v.title} data-revelar>
              <Image src={`${CARPETA}/brand/icon-${ICONOS[i] ?? "sparkle"}-128.webp`} alt="" aria-hidden="true" width={40} height={40} className="sh-valor-icono" />
              <b>{v.title}</b>
              <span>{v.text}</span>
            </li>
          ))}
        </ul>

        <CartaDeAromas elegido={aroma} />

        <section className="sh-sec" id="coleccion" aria-labelledby="shc-titulo">
          <div className="sh-cab">
            <p className="sh-eyebrow">Paso dos</p>
            <h2 className="sh-h2" id="shc-titulo">
              La colección
            </h2>
            <p className="sh-lede">
              Todas aromáticas. {aroma ? <>Con el + suman con <b>{aroma}</b>; en la ficha la cambiás.</> : <>Al tocar el + elegís su aroma.</>}
            </p>
          </div>
          {items.length === 0 ? (
            <div className="sh-vacio">
              <span className="sh-llama" aria-hidden="true" />
              <p className="sh-h3">Estamos encendiendo la vidriera</p>
              {hayWhatsApp && (
                <button type="button" className="sh-btn sh-btn-vino" onClick={() => wa("¡Hola Shine! Quiero hacer un pedido.")}>
                  Consultanos
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="sh-pestanas" role="group" aria-label="Familias">
                {[{ id: "todo", nombre: "Todo" }, ...familiasConProductos, ...(hayOtros ? [{ id: "otros", nombre: "Otros" }] : [])].map((f) => (
                  <button key={f.id} type="button" aria-pressed={familia === f.id} onClick={() => setFamilia(f.id as typeof familia)}>
                    {f.nombre}
                  </button>
                ))}
              </div>
              <ul className="sh-grilla">
                {visibles.map((p) => {
                  const v = p.vista;
                  const sinStock = p.disponibilidad === "sin-stock";
                  const etiqueta = etiquetaDeDisponibilidad(p.disponibilidad ?? null);
                  const n = enBolsaDe(p.id);
                  const avisoServidor = pedido.avisoDe(p.id);
                  return (
                    <li key={p.id} className={`shc${sinStock ? " agotado" : ""}`} data-revelar>
                      <div className="shc-foto">
                        <button type="button" className="shc-abrir" onClick={() => abrirFicha(p.id, false)} aria-label={`Ver ${p.name}`}>
                          {v.fotos[0] ? (
                            <Image src={v.fotos[0]} alt={v.alt} fill sizes="(max-width: 680px) 50vw, (max-width: 1120px) 33vw, 300px" className="shc-img" />
                          ) : (
                            <span className="sh-sinfoto" aria-hidden="true" />
                          )}
                          {v.fotos[1] && <Image src={v.fotos[1]} alt="" aria-hidden="true" fill sizes="(max-width: 680px) 50vw, (max-width: 1120px) 33vw, 300px" className="shc-img shc-img-2" />}
                        </button>
                        <span className="shc-etiquetas">
                          {etiqueta && <span className={`sh-dispo${sinStock ? " off" : ""}`}>{etiqueta}</span>}
                          {v.conAnticipacion && <span className="sh-dispo suave">Con anticipación</span>}
                          {v.ilustrativa && <span className="sh-dispo suave">Foto ilustrativa · a confirmar</span>}
                        </span>
                        <button
                          type="button"
                          className="shc-mas"
                          onClick={() => mas(p)}
                          disabled={!hidratado || sinStock}
                          aria-busy={!hidratado || undefined}
                          aria-label={`Agregar ${p.name}`}
                        >
                          <span aria-hidden="true">+</span>
                          <span className="shc-mas-t">Agregar</span>
                        </button>
                      </div>
                      <h3 className="shc-nombre">{p.name}</h3>
                      {v.detalle && <p className="shc-detalle">{v.detalle}</p>}
                      <p className="shc-precio sh-num">
                        {v.desde ? "Desde " : ""}
                        {money.format(p.precio)}
                        {n > 0 && <span className="shc-en"> · {n} en la bolsa</span>}
                      </p>
                      {sinStock && hayWhatsApp && (
                        <button type="button" className="sh-link" onClick={() => wa(`¡Hola Shine! Avisame cuando vuelva «${p.name}».`)}>
                          Avisame por WhatsApp
                        </button>
                      )}
                      {avisoServidor && (
                        <p role="alert" className="sh-error">
                          {avisoServidor}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        {regalos.length > 0 && (
        <section className="sh-sec sh-regalar" id="regalar" aria-labelledby="shr-titulo">
          <div className="sh-cab">
            <p className="sh-eyebrow">Para regalar</p>
            <h2 className="sh-h2" id="shr-titulo">
              Regalá una pausa
            </h2>
          </div>
          <ul className="shr-grilla">
            {regalos.map(({ g, p }) => {
              return (
                <li key={g.titulo} className="shr" data-revelar>
                  <div className="shr-foto">
                    <Image src={rutaFoto(g.foto, 900)} alt={`Foto del catálogo de Shine: ${g.enFoto}.`} fill sizes="(max-width: 900px) 100vw, 30vw" className="shc-img" />
                  </div>
                  <h3 className="shc-nombre">{g.titulo}</h3>
                  <p className="shc-detalle">{g.texto}</p>
                  {p && <p className="shc-precio sh-num">{money.format(p.precio)}</p>}
                  {p ? (
                    <button type="button" className="sh-btn sh-btn-ghost" onClick={() => abrirFicha(p.id, true)} disabled={!hidratado}>
                      Elegir aroma y sumar
                    </button>
                  ) : (
                    hayWhatsApp && (
                      <button type="button" className="sh-btn sh-btn-ghost" onClick={() => wa(`¡Hola Shine! Quería consultar por ${g.titulo.toLowerCase()}.`)}>
                        Consultanos
                      </button>
                    )
                  )}
                </li>
              );
            })}
          </ul>
        </section>
        )}

        <section className="sh-manifiesto" aria-label="Manifiesto">
          <blockquote>
            <p>{MANIFIESTO}</p>
            <footer>Catálogo Shine · Velas y Aromas</footer>
          </blockquote>
        </section>

        <Pie copy={copy} hayWhatsApp={hayWhatsApp} alEscribir={() => wa("¡Hola Shine!")} />
      </main>

      <Bolsa
        abierta={bolsaAbierta}
        alCerrar={() => setBolsaAbierta(false)}
        renglones={renglones}
        cantidad={cantidad}
        subtotal={subtotal}
        total={total}
        costoEnvio={entrega.costoEnvio}
        faltaParaGratis={faltaParaGratis}
        conTarifa={Boolean(copy.shipping) || entrega.conZonas}
        pedido={pedido}
        cupon={cupon}
        entrega={entrega}
        setFulfillment={setFulfillment}
        claveDePedido={claveDePedido}
        hayWhatsApp={hayWhatsApp}
        nota={nota}
        notaLibre={notaLibre}
        setNotaLibre={setNotaLibre}
        alMover={(k, d) => cambiar(k, d)}
        alCambiarAroma={(k, a) => cambiar(k, 0, a)}
        alVerColeccion={() => {
          setBolsaAbierta(false);
          document.getElementById("coleccion")?.scrollIntoView();
        }}
      />

      {pFicha && (
        <Ficha
          key={`${pFicha.id}-${ficha?.foco}`}
          p={pFicha}
          aromaInicial={aroma}
          focoEnAromas={Boolean(ficha?.foco)}
          enBolsa={enBolsaDe(pFicha.id)}
          hayWhatsApp={hayWhatsApp}
          alCerrar={cerrarFicha}
          alAgregar={(a, q) => {
            agregar(pFicha, a, q);
            cerrarFicha();
          }}
          alConsultar={wa}
        />
      )}
      <HojaDeAroma abierta={hojaAroma} elegido={aroma} alCerrar={() => setHojaAroma(false)} />

      <div className="sh-abajo" role="region" aria-label="Tu aroma y tu bolsa">
        <button type="button" className="sh-abajo-aroma" onClick={() => setHojaAroma(true)}>
          Tu aroma: <b>{aroma ?? "elegir"}</b>
        </button>
        <button type="button" className="sh-abajo-bolsa" onClick={() => setBolsaAbierta(true)}>
          Bolsa · <span className="sh-num">{cantidad}</span>
          {subtotal > 0 && (
            <span key={subtotal} className="sh-abajo-total sh-num">
              {" · "}{money.format(subtotal)}
            </span>
          )}{" "}
          {/* Flecha en SVG: el carácter «→» no está en el subconjunto latino y bajaba otro archivo de letra. */}
          <svg aria-hidden="true" width="16" height="12" viewBox="0 0 16 12" className="sh-flecha">
            <path d="M1 6h13M9 1l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <p className="sh-sr" role="status" aria-live="polite">
        {aviso}
      </p>
    </div>
  );
}
