"use client";

// ============================================================================
// VIDRIERA A DOS MANOS PÁDEL — «La pared de palas» y jugar de a dos (DISENO.md, 29/10/2026).
// ============================================================================
//
// En un local de pádel las palas cuelgan de una pared: uno las descuelga, las compara en la mano y
// pregunta «¿cuál me conviene?». De ahí sale todo:
//   · LA PARED (Pared.tsx): el riel de la portada con las palas del catálogo colgadas por su forma real;
//   · EL CUADRO: el catálogo por secciones, con marca, forma y precio, en tarjetas o en tabla;
//   · ENFRENTADAS (Enfrentadas.tsx): dos palas lado a lado, fila por fila;
//   · ¿CUÁL TE CONVIENE? (Consejo.tsx): tres preguntas y la PAREJA, pala + zapatilla.
//
// Detrás, el motor de siempre, sin tocar: usePedidoOnline → placeOnlineOrder (bandeja, POS, stock), la
// entrega del negocio (EntregaDeLaTienda) y el cupón. Lo único nuevo viaja en `notes`: el TALLE de cada
// zapatilla (catalogo.ts → notaConTalles), porque el motor no tiene variantes.
// La piel (estilos.ts) la escribe el servidor (AdosmanosVidriera.tsx): no viaja en este JS.

import { useAnclasSinHistorial } from "@/components/vidriera/useAnclasSinHistorial";
import { estadoPropio } from "@/components/vidriera/historial";
import { useBolsaGuardada } from "@/components/vidriera/useBolsaGuardada";
import { useHoja } from "@/components/vidriera/useHoja";
import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { WhatsAppCtaProvider, useWhatsAppCta } from "@/components/whatsapp-cta";
import type { ConfigEnvios } from "@/lib/envios/modelo";
import type { StorefrontCopy } from "@/tenants/storefront";
import { useEntregaDeLaTienda } from "../EntregaDeLaTienda";
import { usePedidoOnline, useCuponDePedido } from "../pedido-online";
import { ORDENES, carta, escribirFiltros, leerFiltros, parecidosPorPrecio, plata, type Filtros, type Orden, type ProductoVidriera } from "../vidriera/catalogo-core";
import { CLASES_DE_FUENTES } from "./fuentes";
import { SECCIONES, itemsDe, notaConTalles, type Item, type SeccionId } from "./catalogo";
import { NOMBRE_FORMA, NOMBRE_NIVEL, ORDEN_NIVEL } from "./palas";
import { MARCA_PROVISIONAL, PROMESAS } from "./tokens";
import { BloqueDePrecio } from "./Precio";
import { DefsSiluetas, Logotipo, Silueta } from "./Siluetas";
import Pared from "./Pared";
import Ficha from "./Ficha";
import Bolsa, { type Renglon } from "./Bolsa";
import Enfrentadas from "./Enfrentadas";
import Consejo from "./Consejo";

type Branding = {
  whatsapp: string | null;
  instagram?: string | null;
  addressLine?: string | null;
} | null;

export type PropsAdosmanos = {
  products: ProductoVidriera[];
  branding: Branding;
  copy: StorefrontCopy;
  tenantKey: string;
  /** Envíos del negocio (src/lib/envios) y hoy en su zona horaria; null = sin zonas, como siempre. */
  entrega?: ConfigEnvios | null;
  hoy?: string | null;
};

const nada = () => () => {};
const SECCION_IDS = SECCIONES.map((s) => s.id);

/** Cambia un parámetro de la URL sin sumar entradas al historial. */
function ponerParam(clave: string, valor: string | null) {
  const u = new URL(window.location.href);
  if (valor) u.searchParams.set(clave, valor);
  else u.searchParams.delete(clave);
  window.history.replaceState(estadoPropio(), "", `${u.pathname}${u.search}${u.hash}`);
}


export default function AdosmanosFront({ branding, tenantKey, ...resto }: PropsAdosmanos) {
  const numero = branding?.whatsapp ?? null;
  return (
    <WhatsAppCtaProvider tenantKey={tenantKey} configuredNumber={numero}>
      <Vidriera tenantKey={tenantKey} {...resto} branding={branding} hayWhatsApp={Boolean(numero?.replace(/\D/g, ""))} />
    </WhatsAppCtaProvider>
  );
}

function Vidriera({
  tenantKey,
  products,
  copy,
  branding,
  entrega: configEnvios = null,
  hoy = null,
  hayWhatsApp,
}: PropsAdosmanos & { hayWhatsApp: boolean }) {
  const { requestWhatsApp } = useWhatsAppCta();
  const raiz = useRef<HTMLDivElement>(null);
  const hidratado = useSyncExternalStore(nada, () => true, () => false);
  const marcas = copy.providers;

  const items = useMemo(() => itemsDe(products, marcas), [products, marcas]);
  const porId = useMemo(() => new Map(items.map((p) => [p.id, p])), [items]);
  const porSlug = useMemo(() => new Map(items.map((p) => [p.vista.slug, p])), [items]);
  const seccionDe = useMemo(() => Object.fromEntries(items.map((p) => [p.id, p.vista.seccion])), [items]);
  const marcaDe = useMemo(() => Object.fromEntries(items.filter((p) => p.vista.marca).map((p) => [p.id, p.vista.marca as string])), [items]);
  const palas = useMemo(() => items.filter((p) => p.vista.seccion === "palas"), [items]);
  const marcasConProductos = useMemo(() => marcas.filter((m) => items.some((p) => p.vista.marca === m)), [marcas, items]);

  // La bolsa guardada en el navegador (ronda 2): recargar o volver de WhatsApp ya no la vacía.
  const { bolsa, setBolsa, marcarEnvio, clave: claveDePedido, renovarClave } = useBolsaGuardada(tenantKey, products.map((p) => p.id));
  // Las anclas (#cortes, #contacto…) reemplazan la dirección en vez de empujar un «atrás» sin estado (ronda 2).
  useAnclasSinHistorial();
  const [fulfillment, setFulfillment] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [notaLibre, setNotaLibre] = useState("");
  const [ficha, setFicha] = useState<{ id: string; talles: boolean } | null>(null);
  const [bolsaAbierta, setBolsaAbierta] = useState(false);
  const [filtros, setFiltros] = useState<Filtros>({ q: "", seccion: null, marca: null, orden: "carta" });
  const [hojaFiltros, setHojaFiltros] = useState(false);
  const [modoPalas, setModoPalas] = useState<"cuadro" | "tabla">("cuadro");
  const [vs, setVs] = useState<[string | null, string | null]>([palas[0]?.id ?? null, palas[1]?.id ?? null]);
  const [enConsejo, setEnConsejo] = useState(false);
  const [pegada, setPegada] = useState(false);
  const [aviso, setAviso] = useState("");

  // ── La bolsa: un renglón por producto y talle ("id|talle").
  const renglones: Renglon[] = Object.entries(bolsa)
    .map(([clave, q]) => {
      const [id, talle] = clave.split("|");
      const p = porId.get(id);
      return p ? { clave, id, nombre: p.name, talle: talle || null, q, precio: p.precio, t: q * p.precio, item: p } : null;
    })
    .filter((r): r is Renglon => r !== null);
  const subtotal = renglones.reduce((s, r) => s + r.t, 0);
  const cantidad = renglones.reduce((s, r) => s + r.q, 0);
  const enBolsaDe = useCallback((id: string) => Object.entries(bolsa).reduce((s, [k, q]) => (k.split("|")[0] === id ? s + q : s), 0), [bolsa]);
  const nota = notaConTalles(renglones.map((r) => ({ nombre: r.nombre, cantidad: r.q, talle: r.talle })), notaLibre);

  const entrega = useEntregaDeLaTienda({ entrega: configEnvios, hoy, subtotal, hayProductos: renglones.length > 0, envio: copy.shipping ?? null, fulfillment, setFulfillment });
  const cupon = useCuponDePedido(subtotal);
  const total = subtotal - cupon.descuento + entrega.costoEnvio;
  const pedido = usePedidoOnline({
    hayWhatsApp,
    alRegistrar: () => {
      setBolsa({});
      setNotaLibre("");
      renovarClave();
      cupon.limpiar();
    },
  });

  const cambiar = useCallback(
    (clave: string, delta: number) => {
      const id = clave.split("|")[0];
      const p = porId.get(id);
      if (!p || (delta > 0 && p.disponibilidad === "sin-stock")) return;
      pedido.olvidarAviso(id);
      renovarClave();
      setBolsa((b) => {
        const n = { ...b };
        const q = Math.max(0, (n[clave] ?? 0) + delta);
        if (q > 0) n[clave] = q;
        else delete n[clave];
        return n;
      });
    },
    // `pedido` cambia en cada render; lo que se usa de él (olvidarAviso) es estable en su efecto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [porId],
  );

  const agregar = useCallback(
    (p: Item, talle: string | null, q: number) => {
      cambiar(`${p.id}|${talle ?? ""}`, q);
      setAviso(`Sumaste ${p.name}${talle ? `, talle ${talle}` : ""}. Bolsa: ${enBolsaDe(p.id) + q}.`);
    },
    [cambiar, enBolsaDe],
  );

  // La ficha se comparte con ?p=<slug> (replaceState: sin entradas nuevas en el historial).
  const abrirFicha = useCallback(
    (id: string, talles = false) => {
      setFicha({ id, talles });
      const p = porId.get(id);
      if (p) ponerParam("p", p.vista.slug);
    },
    [porId],
  );
  function cerrarFicha() {
    setFicha(null);
    ponerParam("p", null);
  }

  /** El «+» de una tarjeta: la zapatilla pide el talle en la ficha; lo demás suma uno. */
  const mas = useCallback(
    (p: Item) => {
      if (p.vista.seccion === "calzado") abrirFicha(p.id, true);
      else agregar(p, null, 1);
    },
    [abrirFicha, agregar],
  );
  const menos = useCallback(
    (p: Item) => {
      const clave = Object.keys(bolsa).find((k) => k.split("|")[0] === p.id);
      if (clave) cambiar(clave, -1);
    },
    [bolsa, cambiar],
  );

  // Enfrentar: la pala va al hueco libre (o reemplaza a la segunda) y la URL lo dice (?vs=a,b).
  const enfrentar = useCallback(
    (id: string) => {
      setVs(([a, b]) => {
        const nuevo: [string | null, string | null] = a === id || b === id ? [a, b] : !a ? [id, b] : !b ? [a, id] : [a, id];
        const slugs = nuevo.map((x) => (x ? porId.get(x)?.vista.slug : null)).filter(Boolean);
        ponerParam("vs", slugs.length ? slugs.join(",") : null);
        return nuevo;
      });
      setFicha(null);
      ponerParam("p", null);
      requestAnimationFrame(() => document.getElementById("enfrentadas")?.scrollIntoView({ block: "start" }));
    },
    [porId],
  );
  function cambiarVs(lado: 0 | 1, id: string | null) {
    setVs((actual) => {
      const nuevo: [string | null, string | null] = lado === 0 ? [id, actual[1]] : [actual[0], id];
      const slugs = nuevo.map((x) => (x ? porId.get(x)?.vista.slug : null)).filter(Boolean);
      ponerParam("vs", slugs.length ? slugs.join(",") : null);
      return nuevo;
    });
  }

  function cambiarFiltros(f: Filtros) {
    setFiltros(f);
    const u = new URL(window.location.href);
    window.history.replaceState(estadoPropio(), "", `${u.pathname}${escribirFiltros(f, u.search)}${u.hash}`);
  }

  // Al llegar: ?p= abre esa ficha, ?vs= arma el enfrentamiento y los filtros salen de la URL. Después
  // de hidratar y en un cuadro aparte (el HTML del servidor ya es útil sin esto).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = window.setTimeout(() => {
      const f = leerFiltros(params, { secciones: SECCION_IDS, marcas: marcasConProductos });
      if (f.marca || f.seccion || f.orden !== "carta") setFiltros(f);
      const enVs = (params.get("vs") ?? "").split(",").map((s) => porSlug.get(s)).filter((p): p is Item => Boolean(p && p.vista.seccion === "palas"));
      if (enVs.length) setVs([enVs[0]?.id ?? null, enVs[1]?.id ?? null]);
      const p = porSlug.get(params.get("p") ?? "");
      if (p) setFicha({ id: p.id, talles: false });
    }, 0);
    return () => window.clearTimeout(t);
  }, [porSlug, marcasConProductos]);

  // La cabecera toma borde al pasar la portada; la barra del celular cambia su botón izquierdo dentro del
  // consejo. Un solo IntersectionObserver, sin escuchar el scroll.
  useEffect(() => {
    const centinela = document.getElementById("am-centinela");
    const consejo = document.getElementById("consejo");
    const io = new IntersectionObserver((es) => {
      for (const e of es) {
        if (e.target === centinela) setPegada(!e.isIntersecting);
        if (e.target === consejo) setEnConsejo(e.isIntersecting);
      }
    });
    if (centinela) io.observe(centinela);
    if (consejo) io.observe(consejo);
    return () => io.disconnect();
  }, []);

  const pFicha = ficha ? (porId.get(ficha.id) ?? null) : null;
  const wa = (m: string) => requestWhatsApp(m);
  const verPalas = () => document.getElementById("palas")?.scrollIntoView({ block: "start" });

  // ── El catálogo con los filtros de ahora (marca y orden para todo; la sección, desde el celular).
  const cartaFiltrada = useMemo(
    () => carta(items, SECCIONES.map((s) => ({ id: s.id, titulo: s.titulo })), seccionDe, { ...filtros, seccion: null }, marcaDe),
    [items, seccionDe, marcaDe, filtros],
  );
  const grupo = (id: SeccionId) => cartaFiltrada.grupos.find((g) => g.seccion === id)?.items ?? [];
  const seccionesVisibles = SECCIONES.filter((s) => !filtros.seccion || filtros.seccion === s.id);

  const hechos = [
    PROMESAS.transferencia && "28 % menos por transferencia",
    PROMESAS.cuotas && "3 y 12 cuotas sin interés",
    PROMESAS.envios && "Envíos a todo el país",
    PROMESAS.cambios && "Cambios en 30 días",
  ].filter(Boolean) as string[];

  return (
    <div className={`adm ${CLASES_DE_FUENTES}`} ref={raiz}>
      <DefsSiluetas />
      <a className="am-saltar" href="#palas">
        Ir a las palas
      </a>
      <header className={`am-cab${pegada ? " pegada" : ""}`}>
        <a href="#top" className="am-cab-marca" aria-label="A Dos Manos Pádel · inicio">
          <Logotipo />
        </a>
        <nav className="am-nav" aria-label="Secciones">
          <a href="#palas">Palas</a>
          <a href="#zapatillas">Zapatillas</a>
          <a href="#accesorios">Accesorios</a>
          <a href="#enfrentadas">Enfrentadas</a>
          <a href="#consejo">¿Cuál te conviene?</a>
        </nav>
        <button type="button" className="am-btn am-btn-p am-cab-bolsa" onClick={() => setBolsaAbierta(true)}>
          Bolsa <span className="am-num am-cab-n">{cantidad}</span>
        </button>
      </header>

      <main id="top" className="am-main">
        <section className="am-portada" aria-labelledby="am-h1">
          <div className="am-portada-texto">
            <p className="am-kicker">A DOS MANOS · PÁDEL · ENVÍOS A TODO EL PAÍS</p>
            <h1 id="am-h1" className="am-h1">
              <span>Palas y zapatillas,</span> <span>elegidas a mano.</span>
            </h1>
            <p className="am-lead">{copy.valueProps[0]?.text ?? copy.pitch}</p>
            <div className="am-ctas">
              <a className="am-btn am-btn-p" href="#palas">
                Ver las palas
              </a>
              <a className="am-btn am-btn-b" href="#consejo">
                ¿Cuál te conviene?
              </a>
            </div>
          </div>
          <Pared palas={palas} hidratado={hidratado} alAbrir={(id) => abrirFicha(id)} alSumar={(p) => agregar(p, null, 1)} />
          <span id="am-centinela" aria-hidden="true" />
          {hechos.length > 0 && (
            <ul className="am-hechos" aria-label="Cómo comprás">
              {hechos.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          )}
        </section>

        {seccionesVisibles.map((s) => {
          const todos = items.filter((p) => p.vista.seccion === s.id);
          const lista = grupo(s.id);
          if (todos.length === 0 && s.id !== "palas") return null;
          return (
            <section key={s.id} className={`am-sec am-sec-${s.id}`} id={s.ancla} aria-labelledby={`am-t-${s.id}`}>
              <div className="am-sec-cab">
                <p className="am-kicker">
                  {s.id === "palas" ? "La pared, en cuadro" : s.id === "calzado" ? "Para la cancha" : "Lo que va en el paletero"}
                </p>
                <h2 className="am-h2" id={`am-t-${s.id}`}>
                  {s.titulo}
                </h2>
                <p className="am-conteo am-num">
                  {lista.length} {lista.length === 1 ? "producto" : "productos"}
                  {filtros.marca ? ` de ${filtros.marca}` : ""}
                </p>
              </div>
              {s.id === "palas" && (
                <Controles
                  marcas={marcasConProductos}
                  filtros={filtros}
                  alCambiar={cambiarFiltros}
                  modo={modoPalas}
                  alModo={setModoPalas}
                  alAbrirFiltros={() => setHojaFiltros(true)}
                />
              )}
              {lista.length === 0 ? (
                <p className="am-vacio">
                  {todos.length === 0 ? "Estamos cargando las palas." : `No hay ${s.id === "calzado" ? "zapatillas" : "productos"} de ${filtros.marca} en esta sección.`}
                </p>
              ) : s.id === "accesorios" ? (
                <ul className="am-lista">
                  {lista.map((p) => (
                    <FilaAccesorio key={p.id} p={p} n={enBolsaDe(p.id)} hidratado={hidratado} alMas={mas} alMenos={menos} alAbrir={abrirFicha} aviso={pedido.avisoDe(p.id)} />
                  ))}
                </ul>
              ) : s.id === "palas" && modoPalas === "tabla" ? (
                <TablaDePalas palas={lista} hidratado={hidratado} alAbrir={abrirFicha} alMas={mas} />
              ) : (
                <ul className="am-grilla">
                  {lista.map((p) => (
                    <Tarjeta
                      key={p.id}
                      p={p}
                      n={enBolsaDe(p.id)}
                      hidratado={hidratado}
                      alMas={mas}
                      alMenos={menos}
                      alAbrir={abrirFicha}
                      alEnfrentar={s.id === "palas" && palas.length > 1 ? enfrentar : undefined}
                      aviso={pedido.avisoDe(p.id)}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}

        {palas.length > 1 && (
          <Enfrentadas palas={palas} vs={vs} hidratado={hidratado} alCambiar={cambiarVs} alSumar={(p) => agregar(p, null, 1)} alAbrir={abrirFicha} />
        )}

        <Consejo items={items} hidratado={hidratado} hayWhatsApp={hayWhatsApp} alSumar={(p) => agregar(p, null, 1)} alAbrir={abrirFicha} alConsultar={wa} />

        <section className="am-sec am-nosotros" aria-labelledby="am-t-nos">
          <div className="am-nosotros-texto">
            <p className="am-kicker">A Dos Manos</p>
            <h2 className="am-h2" id="am-t-nos">
              {copy.about.title}
            </h2>
            <p className="am-cuerpo">{copy.about.body}</p>
            {hayWhatsApp && (
              <button type="button" className="am-btn am-btn-b" onClick={() => wa("¡Hola A Dos Manos! Quería hacerles una consulta.")}>
                Escribinos
              </button>
            )}
          </div>
          <div className="am-nosotros-sil">
            <Silueta tipo="zapatilla" />
            <span className="am-ilus">Ilustración</span>
          </div>
        </section>
      </main>

      <footer className="am-pie">
        <div className="am-pie-grilla">
          <div>
            <Logotipo className="am-logo-pie" />
            {(PROMESAS.envios || PROMESAS.cambios) && (
              <p className="am-pie-linea">{[PROMESAS.envios && "Envíos a todo el país", PROMESAS.cambios && "Cambios en 30 días"].filter(Boolean).join(" · ")}</p>
            )}
            {branding?.addressLine && <p className="am-pie-linea">{branding.addressLine}</p>}
          </div>
          <div>
            <p className="am-pie-t">Medios de pago</p>
            <ul className="am-pie-lista">
              {copy.paymentMethods
                .filter((m) => (PROMESAS.transferencia || !/transferencia/i.test(m) || !/%/.test(m)) && (PROMESAS.cuotas || !/cuotas/i.test(m)))
                .map((m) => (
                  <li key={m}>{m}</li>
                ))}
            </ul>
          </div>
          <div>
            <p className="am-pie-t">La tienda</p>
            <ul className="am-pie-lista">
              <li>
                <a href="#palas">Palas</a>
              </li>
              <li>
                <a href="#zapatillas">Zapatillas</a>
              </li>
              <li>
                <a href="#accesorios">Pelotas y accesorios</a>
              </li>
              <li>
                <a href="#enfrentadas">Enfrentadas</a>
              </li>
              <li>
                <a href="#consejo">¿Cuál te conviene?</a>
              </li>
              {branding?.instagram && (
                <li>
                  <a href={`https://www.instagram.com/${branding.instagram.replace(/^@/, "")}/`} target="_blank" rel="noopener noreferrer">
                    Instagram
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>
        {MARCA_PROVISIONAL && (
          <p className="am-pie-provisional">
            Identidad provisional, a confirmar por el dueño. Precios y condiciones provisionales a confirmar. Las imágenes de producto son ilustraciones.
          </p>
        )}
      </footer>

      <Bolsa
        alEnviar={marcarEnvio}
        abierta={bolsaAbierta}
        alCerrar={() => setBolsaAbierta(false)}
        renglones={renglones}
        cantidad={cantidad}
        subtotal={subtotal}
        total={total}
        pedido={pedido}
        cupon={cupon}
        entrega={entrega}
        setFulfillment={setFulfillment}
        conTarifa={Boolean(copy.shipping) || entrega.conZonas}
        claveDePedido={claveDePedido}
        hayWhatsApp={hayWhatsApp}
        nota={nota}
        notaLibre={notaLibre}
        setNotaLibre={setNotaLibre}
        alMover={cambiar}
        alVerPalas={() => {
          setBolsaAbierta(false);
          requestAnimationFrame(verPalas);
        }}
      />

      {pFicha && (
        <Ficha
          key={pFicha.id}
          p={pFicha}
          enBolsa={enBolsaDe(pFicha.id)}
          focoEnTalles={Boolean(ficha?.talles)}
          parecidas={parecidosPorPrecio(pFicha, items, seccionDe)}
          hayWhatsApp={hayWhatsApp}
          puedeEnfrentar={pFicha.vista.seccion === "palas" && palas.length > 1}
          alCerrar={cerrarFicha}
          alAgregar={(talle, q) => {
            agregar(pFicha, talle, q);
            cerrarFicha();
          }}
          alEnfrentar={() => enfrentar(pFicha.id)}
          alAbrir={(id) => abrirFicha(id)}
          alConsultar={wa}
        />
      )}

      {hojaFiltros && (
        <HojaFiltros
          marcas={marcasConProductos}
          filtros={filtros}
          alCambiar={cambiarFiltros}
          alCerrar={() => setHojaFiltros(false)}
        />
      )}

      <div className="am-abajo" role="region" aria-label="Consejo y bolsa">
        {enConsejo ? (
          <a className="am-btn am-btn-b am-abajo-izq" href="#palas">
            Ver las palas
          </a>
        ) : (
          <a className="am-btn am-btn-b am-abajo-izq" href="#consejo">
            ¿Cuál te conviene?
          </a>
        )}
        <button type="button" className={`am-btn am-abajo-bolsa ${cantidad > 0 ? "am-btn-p" : "am-btn-b"}`} onClick={() => setBolsaAbierta(true)}>
          Bolsa
          {cantidad > 0 && (
            <span className="am-num">
              {" · "}
              {cantidad} · {plata(subtotal)}
            </span>
          )}
        </button>
      </div>
      <p className="am-sr" role="status" aria-live="polite">
        {aviso}
      </p>
    </div>
  );
}

// ── LOS CONTROLES DEL CUADRO ─────────────────────────────────────────────────

function Controles({
  marcas,
  filtros,
  alCambiar,
  modo,
  alModo,
  alAbrirFiltros,
}: {
  marcas: readonly string[];
  filtros: Filtros;
  alCambiar: (f: Filtros) => void;
  modo: "cuadro" | "tabla";
  alModo: (m: "cuadro" | "tabla") => void;
  alAbrirFiltros: () => void;
}) {
  return (
    <div className="am-controles">
      <div className="am-chips" role="group" aria-label="Filtrar por marca">
        <button type="button" className="am-chip" aria-pressed={!filtros.marca} onClick={() => alCambiar({ ...filtros, marca: null })}>
          Todas
        </button>
        {marcas.map((m) => (
          <button key={m} type="button" className="am-chip" aria-pressed={filtros.marca === m} onClick={() => alCambiar({ ...filtros, marca: filtros.marca === m ? null : m })}>
            {m}
          </button>
        ))}
      </div>
      <div className="am-controles-der">
        <label className="am-orden">
          <span>Orden</span>
          <select value={filtros.orden} onChange={(e) => alCambiar({ ...filtros, orden: e.target.value as Orden })}>
            {ORDENES.map((o) => (
              <option key={o.id} value={o.id}>
                {o.texto}
              </option>
            ))}
          </select>
        </label>
        <div className="am-modo" role="group" aria-label="Cómo ver las palas">
          <button type="button" aria-pressed={modo === "cuadro"} onClick={() => alModo("cuadro")}>
            Cuadro
          </button>
          <button type="button" aria-pressed={modo === "tabla"} onClick={() => alModo("tabla")}>
            Tabla
          </button>
        </div>
        <button type="button" className="am-btn am-btn-b am-filtrar" onClick={alAbrirFiltros}>
          Filtrar{filtros.marca || filtros.seccion ? " · 1+" : ""}
        </button>
      </div>
    </div>
  );
}

function HojaFiltros({ marcas, filtros, alCambiar, alCerrar }: { marcas: readonly string[]; filtros: Filtros; alCambiar: (f: Filtros) => void; alCerrar: () => void }) {
  const d = useRef<HTMLDialogElement>(null);
  // La hoja compartida (ronda 2): «atrás» del celular cierra los filtros.
  useHoja(d, true, alCerrar);
  return (
    <dialog
      ref={d}
      className="am-hoja-filtros"
      aria-labelledby="am-filtros-t"
      onCancel={(e) => {
        e.preventDefault();
        alCerrar();
      }}
      onClick={(e) => e.target === e.currentTarget && alCerrar()}
    >
      <div className="am-hf-caja">
        <div className="am-hf-cab">
          <h2 id="am-filtros-t" className="am-h3">
            Filtrar
          </h2>
          <button type="button" className="am-cerrar" onClick={alCerrar}>
            Cerrar
          </button>
        </div>
        <fieldset className="am-hf-grupo">
          <legend>Sección</legend>
          <div className="am-chips am-chips-wrap">
            <button type="button" className="am-chip" aria-pressed={!filtros.seccion} onClick={() => alCambiar({ ...filtros, seccion: null })}>
              Todo
            </button>
            {SECCIONES.map((s) => (
              <button key={s.id} type="button" className="am-chip" aria-pressed={filtros.seccion === s.id} onClick={() => alCambiar({ ...filtros, seccion: s.id })}>
                {s.id === "palas" ? "Palas" : s.titulo}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="am-hf-grupo">
          <legend>Marca</legend>
          <div className="am-chips am-chips-wrap">
            <button type="button" className="am-chip" aria-pressed={!filtros.marca} onClick={() => alCambiar({ ...filtros, marca: null })}>
              Todas
            </button>
            {marcas.map((m) => (
              <button key={m} type="button" className="am-chip" aria-pressed={filtros.marca === m} onClick={() => alCambiar({ ...filtros, marca: m })}>
                {m}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="am-hf-grupo">
          <legend>Orden</legend>
          <div className="am-chips am-chips-wrap">
            {ORDENES.map((o) => (
              <button key={o.id} type="button" className="am-chip" aria-pressed={filtros.orden === o.id} onClick={() => alCambiar({ ...filtros, orden: o.id })}>
                {o.texto}
              </button>
            ))}
          </div>
        </fieldset>
        <button type="button" className="am-btn am-btn-p am-btn-ancho" onClick={alCerrar}>
          Ver resultados
        </button>
      </div>
    </dialog>
  );
}

// ── LA TARJETA, LA FILA Y LA TABLA ──────────────────────────────────────────

type PropsFila = {
  p: Item;
  n: number;
  hidratado: boolean;
  alMas: (p: Item) => void;
  alMenos: (p: Item) => void;
  alAbrir: (id: string, talles?: boolean) => void;
  aviso: string | null;
};

function Mas({ p, n, hidratado, alMas, alMenos }: Pick<PropsFila, "p" | "n" | "hidratado" | "alMas" | "alMenos">) {
  const sinStock = p.disponibilidad === "sin-stock";
  if (sinStock) return null;
  if (n > 0 && p.vista.seccion !== "calzado")
    return (
      <div className="am-paso" role="group" aria-label={`Cantidad de ${p.name}`}>
        <button type="button" onClick={() => alMenos(p)} aria-label={`Quitar uno de ${p.name}`}>
          −
        </button>
        <span className="am-num" aria-live="polite">
          {n}
        </span>
        <button type="button" onClick={() => alMas(p)} aria-label={`Sumar otro ${p.name}`}>
          +
        </button>
      </div>
    );
  return (
    <button
      type="button"
      className="am-mas"
      onClick={() => alMas(p)}
      disabled={!hidratado}
      aria-busy={!hidratado || undefined}
      aria-label={p.vista.seccion === "calzado" ? `Elegir talle de ${p.name}` : `Sumar ${p.name} a la bolsa`}
    >
      <span aria-hidden="true">+</span>
    </button>
  );
}

const Tarjeta = memo(function Tarjeta({ p, n, hidratado, alMas, alMenos, alAbrir, alEnfrentar, aviso }: PropsFila & { alEnfrentar?: (id: string) => void }) {
  const v = p.vista;
  const sinStock = p.disponibilidad === "sin-stock";
  return (
    <li className={`am-t${sinStock ? " agotado" : ""}`}>
      <div className="am-t-foto">
        <button type="button" className="am-t-abrir" onClick={() => alAbrir(p.id)} aria-label={`Ver ${p.name}`}>
          <Silueta tipo={v.silueta} marca={v.marca} />
        </button>
        <span className="am-ilus">Ilustración</span>
        {sinStock && <span className="am-dispo">Sin stock</span>}
        <span className="am-t-accion">
          <Mas p={p} n={n} hidratado={hidratado} alMas={alMas} alMenos={alMenos} />
        </span>
      </div>
      {v.marca && <p className="am-t-marca">{v.marca}</p>}
      <h3 className="am-t-nombre">
        <button type="button" onClick={() => alAbrir(p.id)}>
          {v.marca ? v.modelo : p.name}
        </button>
      </h3>
      <p className="am-t-chips">
        {v.seccion === "palas" && v.forma && (
          <span className="am-tag">
            {NOMBRE_FORMA[v.forma]}
            {!v.formaConFuente && " · a confirmar"}
          </span>
        )}
        {v.seccion === "palas" && v.ficha && <span className="am-tag">{NOMBRE_NIVEL[v.ficha.nivel]}</span>}
        {v.seccion === "calzado" && <span className="am-tag">Talles a consultar</span>}
        {v.seccion === "calzado" && n > 0 && <span className="am-tag am-tag-en">{n} en la bolsa</span>}
      </p>
      <BloqueDePrecio precio={p.precio} />
      {alEnfrentar && (
        <button type="button" className="am-link" onClick={() => alEnfrentar(p.id)} disabled={!hidratado}>
          Enfrentar
        </button>
      )}
      {aviso && (
        <p role="alert" className="am-error">
          {aviso}
        </p>
      )}
    </li>
  );
});

const FilaAccesorio = memo(function FilaAccesorio({ p, n, hidratado, alMas, alMenos, alAbrir, aviso }: PropsFila) {
  const sinStock = p.disponibilidad === "sin-stock";
  return (
    <li className={`am-fila${sinStock ? " agotado" : ""}`}>
      <span className="am-fila-sil">
        <Silueta tipo={p.vista.silueta} />
      </span>
      <button type="button" className="am-fila-nombre" onClick={() => alAbrir(p.id)}>
        {p.name}
        {sinStock && <span className="am-dispo">Sin stock</span>}
      </button>
      <span className="am-fila-precio am-num">{plata(p.precio)}</span>
      <span className="am-fila-mas">
        <Mas p={p} n={n} hidratado={hidratado} alMas={alMas} alMenos={alMenos} />
      </span>
      {aviso && (
        <p role="alert" className="am-error am-fila-aviso">
          {aviso}
        </p>
      )}
    </li>
  );
});

type Col = "modelo" | "marca" | "forma" | "nivel" | "peso" | "precio";
const COLS: { id: Col; texto: string }[] = [
  { id: "modelo", texto: "Modelo" },
  { id: "marca", texto: "Marca" },
  { id: "forma", texto: "Forma" },
  { id: "nivel", texto: "Nivel" },
  { id: "peso", texto: "Peso" },
  { id: "precio", texto: "Precio" },
];
const pesoNum = (s: string | undefined) => (s ? Number(s.match(/\d+/)?.[0] ?? NaN) : NaN);

function TablaDePalas({ palas, hidratado, alAbrir, alMas }: { palas: readonly Item[]; hidratado: boolean; alAbrir: (id: string) => void; alMas: (p: Item) => void }) {
  const [orden, setOrden] = useState<{ col: Col; dir: 1 | -1 } | null>(null);
  const valor = (p: Item, c: Col): string | number => {
    const f = p.vista.ficha;
    if (c === "modelo") return p.vista.modelo;
    if (c === "marca") return p.vista.marca ?? "";
    if (c === "forma") return p.vista.forma ?? "";
    if (c === "nivel") return f ? ORDEN_NIVEL[f.nivel] : 99;
    if (c === "peso") return Number.isNaN(pesoNum(f?.peso)) ? 9999 : pesoNum(f?.peso);
    return p.precio;
  };
  const filas = orden
    ? palas
        .map((p, i) => ({ p, i }))
        .sort((a, b) => {
          const x = valor(a.p, orden.col);
          const y = valor(b.p, orden.col);
          const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "es");
          return orden.dir * c || a.i - b.i;
        })
        .map((x) => x.p)
    : palas;
  return (
    <div className="am-tabla-caja">
      <table className="am-tabla">
        <caption className="am-sr">Palas en tabla. Tocá un encabezado para ordenar.</caption>
        <thead>
          <tr>
            {COLS.map((c) => (
              <th key={c.id} scope="col" aria-sort={orden?.col === c.id ? (orden.dir === 1 ? "ascending" : "descending") : "none"}>
                <button type="button" onClick={() => setOrden((o) => ({ col: c.id, dir: o?.col === c.id && o.dir === 1 ? -1 : 1 }))}>
                  {c.texto}
                  <span aria-hidden="true" className="am-flecha-orden">
                    {orden?.col === c.id ? (orden.dir === 1 ? "▲" : "▼") : ""}
                  </span>
                </button>
              </th>
            ))}
            <th scope="col">
              <span className="am-sr">Sumar</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {filas.map((p) => {
            const f = p.vista.ficha;
            return (
              <tr key={p.id}>
                <th scope="row">
                  <button type="button" className="am-link-fila" onClick={() => alAbrir(p.id)}>
                    {p.vista.modelo}
                  </button>
                </th>
                <td>{p.vista.marca ?? "—"}</td>
                <td>{p.vista.forma ? `${NOMBRE_FORMA[p.vista.forma]}${p.vista.formaConFuente ? "" : " (a confirmar)"}` : "—"}</td>
                <td>{f ? NOMBRE_NIVEL[f.nivel] : "A confirmar"}</td>
                <td className="am-num">{f?.peso ?? "A confirmar"}</td>
                <td className="am-num am-tabla-precio">{plata(p.precio)}</td>
                <td>
                  {p.disponibilidad === "sin-stock" ? (
                    <span className="am-dispo">Sin stock</span>
                  ) : (
                    <button type="button" className="am-mas am-mas-chico" onClick={() => alMas(p)} disabled={!hidratado} aria-label={`Sumar ${p.name} a la bolsa`}>
                      <span aria-hidden="true">+</span>
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
