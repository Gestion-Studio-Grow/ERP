"use client";

// ============================================================================
// VIDRIERA QUÉ BIEN OLÉS — la vitrina de noche.
// ============================================================================
//
// Front propio de la perfumería (Ezeiza, @quebienoles). Toma su idioma visual real —negro laca, oro,
// didona blanca, la Q con corona de su caja, el mármol de vetas doradas de su portada— y lo lleva a lo
// que una placa de Instagram no puede hacer:
//
//   · el FRASCO DE LA CASA en 3D (frasco-escena.ts): vidrio real que refracta la Q de la marca, cambia
//     de color con la familia y se ROCÍA manteniendo apretado (el único momento protagonista);
//   · la TIRITA (rediseño 29/10): en una perfumería no comprás mirando una placa, el vendedor rocía una
//     tira de papel y te la da. Cada perfume de la vitrina es una tirita apoyada sobre el mármol, con el
//     nombre escrito a mano y una línea de «a qué huele»; en la ficha se huele en el tiempo y se compara;
//   · la ESTELA (Estela.tsx): el rastro dorado que deja el puntero, como la estela de un perfume;
//   · las CUATRO PUERTAS de su portada (dulces, frescos, versátiles, femeninos) como entrada al catálogo;
//   · el «¿NO SABÉS CUÁL ELEGIR?» (recomendador.ts): su frase, convertida en tres preguntas.
//
// Detrás, el pedido es el del ERP: `useVidriera` (la misma bolsa, clave anti-duplicado y alta que la
// vidriera nueva) → `placeOnlineOrder` → bandeja del backoffice. Nada de cobro acá: la marca coordina
// entrega y medio de pago por mensaje, y la vidriera lo dice así.
//
// Voz: la de la marca, textual donde se pudo (storefront.ts). Criollo, de vos, sin jerga.

import Image from "next/image";
import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { flushSync, preload } from "react-dom";
import type { StorefrontCopy } from "@/tenants/storefront";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";
import { useVidriera } from "../vidriera/useVidriera";
import { plata, responde, type ProductoVidriera } from "../vidriera/catalogo-core";
import { etiquetaDeDisponibilidad } from "../reglas-tienda";
import { FAMILIAS, FAMILIA_POR_ID, PERFUMES, aQueHuele, type FamiliaId } from "./perfumes";
import { aPiezas, estantes, mensajeDirecto, usuarioDeInstagram, type Pieza } from "./vitrina";
import { recomendar, type Respuestas } from "./recomendador";
import { IconoBolsa, IconoFamilia, IconoInstagram, Corona, FotoDeFrasco, Tirita } from "./Iconos";
import Estela from "./Estela";
import Ficha from "./Ficha";
import Bolsa from "./Bolsa";
import Guia from "./Guia";
import type { ConfigEnvios } from "@/lib/envios/modelo";
import { CARPETA_FUENTES, FONDO, LETRA_DIDONA, ORO } from "./tokens";

// three.js sólo se pide en el navegador y después de pintar: el titular nunca espera al 3D.
const Frasco = dynamic(() => import("./Frasco"), { ssr: false, loading: () => <div className="qb-frasco" data-estado="cargando" /> });

/** El ancho a partir del cual manda la cabecera; por debajo, la barra fija de abajo (estilos: 899px). */
const CELULAR = "(max-width: 899px)";

/**
 * La caja con la Q de su portada, debajo del lienzo 3D: lo que se ve mientras three.js baja y compila
 * (y lo único que se ve sin WebGL). Va en el HTML del servidor con prioridad, así el navegador la pide
 * desde el primer byte; cuando la escena está lista, el lienzo se funde encima (estilos: .qb-escenario).
 */
function Respaldo() {
  return (
    <div className="qb-frasco-respaldo">
      <Image
        src="/tenants/quebienoles/perfumes/marca-caja-q.jpg"
        alt="Caja de Qué Bien Olés con la Q y la corona"
        width={560}
        height={700}
        priority
        sizes="(max-width: 899px) 66vw, 440px"
      />
    </div>
  );
}

type Branding = {
  instagram?: string | null;
  whatsapp?: string | null;
  city?: string | null;
} | null;

export type PropsFront = {
  products: ProductoVidriera[];
  branding: Branding;
  copy: StorefrontCopy;
  tenantKey: string;
  /** Envíos del negocio (src/lib/envios) y hoy en su zona horaria; null = lo de siempre (Magra 1I). */
  entrega?: ConfigEnvios | null;
  hoy?: string | null;
};

// Las cuatro letras del portal, incluida la itálica (la bajada «oler muy bien.» está arriba de todo):
// sin su preload llegaba última y el titular cambiaba de letra dos veces.
const FUENTES = [`${CARPETA_FUENTES}/bodoni-moda.woff2`, `${CARPETA_FUENTES}/bodoni-moda-italic.woff2`, `${CARPETA_FUENTES}/jost.woff2`, `${CARPETA_FUENTES}/pinyon-script.woff2`];

// La piel (estilos.ts) NO se importa acá: la escribe QuebienolesVidriera.tsx (servidor) en el HTML.
export default function QuebienolesFront({ products, branding, copy, tenantKey, entrega = null, hoy = null }: PropsFront) {
  for (const f of FUENTES) preload(f, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });

  const reduce = usePrefersReducedMotion();
  const piezas = useMemo(() => aPiezas(products), [products]);
  const porId = useMemo(() => new Map(piezas.map((p) => [p.id, p])), [piezas]);
  const v = useVidriera({
    tenantKey,
    productos: piezas,
    envio: copy.shipping ?? null,
    entregaPorDefecto: "DELIVERY",
    hayWhatsApp: Boolean(branding?.whatsapp),
    entrega,
    hoy,
  });
  const instagram = usuarioDeInstagram(branding?.instagram);

  const [familia, setFamilia] = useState<FamiliaId | null>(null);
  const [q, setQ] = useState("");
  const [vista, setVista] = useState<"vitrina" | "indice">("vitrina");
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [origen, setOrigen] = useState<string | null>(null);
  const [bolsaAbierta, setBolsaAbierta] = useState(false);
  const [latido, setLatido] = useState(0);

  const raiz = useRef<HTMLDivElement>(null);
  const portal = useRef<HTMLElement>(null);
  const botonBolsa = useRef<HTMLButtonElement>(null);
  // En el teléfono la bolsa vive en la barra de abajo: el frasco que se suma vuela hasta ahí.
  const iconoBarra = useRef<HTMLSpanElement>(null);
  // La bolsa de este render, para que los manejadores estables (tarjetas memorizadas) usen siempre la última.
  const vRef = useRef(v);
  useEffect(() => {
    vRef.current = v;
  });

  const colorFamilia = familia ? FAMILIA_POR_ID[familia].color : ORO;

  // El brillo del oro sigue al puntero (el foil de su caja); en pantallas táctiles lo mueve el CSS.
  // Cambiar una variable en la raíz invalida el estilo de todo el árbol: se escribe en pasos de 2 % (el
  // degradé tarda .8 s en seguirla, la diferencia no se ve) y sólo cuando el paso cambia.
  useEffect(() => {
    const r = raiz.current;
    if (!r || reduce || !window.matchMedia("(pointer: fine)").matches) return;
    let pendiente = 0;
    let ultimo = -1;
    const alMover = (e: PointerEvent) => {
      if (pendiente) return;
      pendiente = requestAnimationFrame(() => {
        pendiente = 0;
        const paso = Math.round((e.clientX / window.innerWidth) * 50);
        if (paso === ultimo) return;
        ultimo = paso;
        r.style.setProperty("--brillo", String(paso / 50));
      });
    };
    window.addEventListener("pointermove", alMover, { passive: true });
    return () => {
      cancelAnimationFrame(pendiente);
      window.removeEventListener("pointermove", alMover);
    };
  }, [reduce]);

  // ── abrir la ficha con transición de vista: el frasco de la tarjeta "vuela" a la ficha ─────────
  const transicion = useCallback(
    (cambio: () => void) => {
      type Transicion = { ready: Promise<void>; finished: Promise<void>; updateCallbackDone: Promise<void> };
      const doc = document as Document & { startViewTransition?: (cb: () => void) => Transicion };
      if (reduce || !doc.startViewTransition) return cambio();
      const t = doc.startViewTransition(() => flushSync(cambio));
      // Si el navegador la aborta (pestaña en segundo plano, otra transición encima), el cambio igual se
      // aplica; sólo se pierde la animación. Sin esto, la promesa rechazada ensucia la consola.
      const nada = () => undefined;
      t.ready.catch(nada);
      t.finished.catch(nada);
      t.updateCallbackDone.catch(nada);
    },
    [reduce],
  );
  const abrirFicha = useCallback(
    (id: string) => {
      flushSync(() => setOrigen(id));
      transicion(() => setFichaId(id));
    },
    [transicion],
  );
  const cerrarFicha = useCallback(() => transicion(() => setFichaId(null)), [transicion]);

  // ── sumar a la bolsa: el frasco vuela hasta la bolsa (cabecera en compu, barra de abajo en el teléfono) ──
  // Estables (leen la bolsa por vRef): así las tarjetas memorizadas no se vuelven a dibujar todas
  // cada vez que cambia una cantidad, se abre una ficha o late la bolsa.
  const sacar = useCallback((p: Pieza) => vRef.current.mover(p, -1), []);
  const sumar = useCallback(
    (p: Pieza, desde?: HTMLElement | null) => {
      vRef.current.mover(p, 1);
      setLatido((n) => n + 1);
      const destino = window.matchMedia(CELULAR).matches ? iconoBarra.current : botonBolsa.current;
      const img = desde?.querySelector("img") ?? null;
      if (reduce || !img || !destino) return;
      const a = img.getBoundingClientRect();
      const b = destino.getBoundingClientRect();
      const vuelo = img.cloneNode(true) as HTMLImageElement;
      vuelo.className = "qb-vuelo";
      vuelo.removeAttribute("style");
      Object.assign(vuelo.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
      raiz.current?.appendChild(vuelo);
      const dx = b.left + b.width / 2 - (a.left + a.width / 2);
      const dy = b.top + b.height / 2 - (a.top + a.height / 2);
      vuelo
        .animate(
          [
            { transform: "translate(0,0) scale(1)", opacity: 1 },
            { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 90}px) scale(.55) rotate(-8deg)`, opacity: 1, offset: 0.55 },
            { transform: `translate(${dx}px, ${dy}px) scale(.12) rotate(-14deg)`, opacity: 0.2 },
          ],
          { duration: 720, easing: "cubic-bezier(.45,.05,.35,1)" },
        )
        .finished.catch(() => undefined)
        .finally(() => vuelo.remove());
    },
    [reduce],
  );

  const visibles = useMemo(() => {
    const titulo = (p: Pieza) => (p.familia ? FAMILIA_POR_ID[p.familia].nombre : "");
    return piezas.filter((p) => (!familia || p.familia === familia) && responde(q, p.name, titulo(p), p.casa, p.perfume?.acordes.join(" ")));
  }, [piezas, familia, q]);
  const grupos = useMemo(() => estantes(visibles, PERFUMES), [visibles]);
  const conteo = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of piezas) if (p.familia) c[p.familia] = (c[p.familia] ?? 0) + 1;
    return c;
  }, [piezas]);

  const regalos = useMemo(() => {
    const candidatos = piezas.map((p) => ({ id: p.id, name: p.name, price: p.price, disponibilidad: p.disponibilidad, perfume: p.perfume }));
    const pedidos: Respuestas[] = [
      { ocasion: "regalo", estilo: "floral", para: "ella" },
      { ocasion: "regalo", estilo: "versatil", para: "el" },
      { ocasion: "regalo", estilo: "dulce", para: "para-mi" },
    ];
    const vistos = new Set<string>();
    const out: { pieza: Pieza; para: string; porque: string }[] = [];
    const para = ["Para ella", "Para él", "Sin etiquetas"];
    pedidos.forEach((r, i) => {
      const x = recomendar(candidatos, r, 5).find((c) => !vistos.has(c.id));
      const pieza = x ? porId.get(x.id) : undefined;
      if (x && pieza) {
        vistos.add(x.id);
        out.push({ pieza, para: para[i], porque: x.porque });
      }
    });
    return out;
  }, [piezas, porId]);

  const irA = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };
  const elegirFamilia = (id: FamiliaId | null, bajar = true) => {
    setFamilia(id);
    if (bajar) requestAnimationFrame(() => irA("vitrina"));
  };

  const ficha = fichaId ? porId.get(fichaId) ?? null : null;
  const ciudad = branding?.city || "Ezeiza";
  const resumenBolsa = v.piezas
    ? `Tu bolsa: ${v.piezas} ${v.piezas === 1 ? "perfume" : "perfumes"}, ${plata(v.subtotal)}`
    : "Tu bolsa está vacía";

  return (
    <div
      ref={raiz}
      className="qb"
      data-familia={familia ?? "todas"}
      style={{ "--familia": colorFamilia } as CSSProperties}
    >
      <a className="qb-saltar" href="#vitrina">
        Saltar a los perfumes
      </a>
      <Estela color={colorFamilia} activa={!reduce} />

      {/* ── CABECERA ──────────────────────────────────────────────────────────── */}
      <header className="qb-cabecera">
        <a href="#arriba" className="qb-marca" aria-label="Qué Bien Olés, volver arriba">
          <span className="qb-marca-que">Qué</span>
          <span className="qb-marca-bien">Bien</span>
          <span className="qb-marca-oles">Olés</span>
        </a>
        <nav className="qb-nav" aria-label="Secciones">
          <a href="#familias">Encontrá el tuyo</a>
          <a href="#vitrina">La vitrina</a>
          <a href="#regalo">Para regalar</a>
          <a href="#como">Cómo comprar</a>
        </nav>
        {/* En el teléfono no se ve: la reemplaza la barra fija de abajo. */}
        <button
          ref={botonBolsa}
          type="button"
          className="qb-boton-bolsa"
          data-latido={latido ? latido % 2 : undefined}
          onClick={() => setBolsaAbierta(true)}
          aria-label={resumenBolsa}
        >
          <IconoBolsa className="qb-icono-bolsa" />
          <span className="qb-bolsa-texto">Bolsa</span>
          {v.piezas > 0 && <span className="qb-bolsa-cuenta">{v.piezas}</span>}
        </button>
      </header>

      <main id="arriba">
        {/* ── EL PORTAL ─────────────────────────────────────────────────────────── */}
        {/* Compu: texto a la izquierda (7/12) y el frasco a la derecha. Teléfono: tres filas — titular,
            frasco entero, bajada y botones (el texto se parte en dos bloques y el escenario va en medio). */}
        <section ref={portal} className="qb-portal" aria-labelledby="qb-titular">
          <div className="qb-portal-texto">
            <div className="qb-portal-cabeza">
              <p className="qb-antetitulo">
                <Corona className="qb-corona" /> Perfumería · {ciudad}
              </p>
              <h1 id="qb-titular" className="qb-titular">
                <span className="qb-t-que">Qué</span>
                <span className="qb-t-bien qb-oro">Bien</span>
                <span className="qb-t-oles">Olés</span>
              </h1>
            </div>
            <div className="qb-portal-pie">
              <p className="qb-bajada">
                <strong>Volvimos.</strong> Y esta vez, vinimos a hacerte <em className="qb-oro">oler muy bien.</em>
              </p>
              <p className="qb-sub">{copy.pitch} Envío o punto de encuentro en {ciudad}.</p>
              <div className="qb-acciones">
                <a className="qb-boton qb-boton-oro" href="#familias">
                  Encontrá el tuyo
                </a>
                <a className="qb-boton qb-boton-linea qb-acciones-ver" href="#vitrina">
                  Ver los {piezas.length} perfumes
                </a>
              </div>
            </div>
          </div>
          <div className="qb-escenario">
            <Respaldo />
            <Frasco color={colorFamilia} fondo={FONDO} letra={LETRA_DIDONA} movimiento={!reduce} portal={portal} />
          </div>
          {/* El cuarto hecho, «Mantené apretado el frasco», es el botón de rociar (Frasco.tsx): en compu
              se ubica al final de esta barra; en el teléfono, como pastilla dentro del escenario. */}
          <ul className="qb-hechos" aria-label="Cómo trabajamos">
            <li>Stock disponible</li>
            <li>Envío o punto de encuentro</li>
            <li>Pedidos y consultas por mensaje</li>
          </ul>
        </section>

        {/* ── LAS CUATRO PUERTAS (su portada) ───────────────────────────────────── */}
        <section id="familias" className="qb-familias" aria-labelledby="qb-familias-titulo">
          <div className="qb-encabezado qb-revela">
            <p className="qb-antetitulo">Encontrá tu perfume ideal</p>
            <h2 id="qb-familias-titulo" className="qb-h2">
              El perfume que <em className="qb-oro">va con vos.</em>
            </h2>
            <p className="qb-lead">Dulces, frescos, versátiles y femeninos. Tenemos opciones para cada estilo y cada ocasión.</p>
          </div>
          <div className="qb-puertas">
            {FAMILIAS.map((f, i) => {
              const muestra = piezas.filter((p) => p.familia === f.id && p.foto).slice(0, 3);
              return (
                <button
                  key={f.id}
                  type="button"
                  className="qb-puerta"
                  style={{ "--color-puerta": f.color } as CSSProperties}
                  aria-pressed={familia === f.id}
                  onClick={() => elegirFamilia(familia === f.id ? null : f.id)}
                  onPointerEnter={() => !familia && raiz.current?.style.setProperty("--familia", f.color)}
                  onPointerLeave={() => !familia && raiz.current?.style.setProperty("--familia", ORO)}
                >
                  <span className="qb-puerta-num">{String(i + 1).padStart(2, "0")}</span>
                  <IconoFamilia icono={f.icono} className="qb-icono" />
                  <span className="qb-puerta-nombre">{f.nombre}</span>
                  <span className="qb-puerta-cuando">{f.cuando}</span>
                  <span className="qb-puerta-bajada">{f.bajada}</span>
                  <span className="qb-puerta-cuenta">
                    {conteo[f.id] ?? 0} perfumes <span aria-hidden="true">→</span>
                  </span>
                  <span className="qb-puerta-abanico" aria-hidden="true">
                    {muestra.map((p, k) => (
                      <FotoDeFrasco key={p.id} src={p.foto!} nombre={p.nombre} casa={p.casa} sizes="(max-width: 899px) 96px, 128px" style={{ "--k": k } as CSSProperties} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── ¿NO SABÉS CUÁL ELEGIR? ───────────────────────────────────────────── */}
        <Guia piezas={piezas} instagram={instagram} alVer={abrirFicha} alSumar={sumar} cantidadDe={v.cantidadDe} />

        {/* ── LA VITRINA ────────────────────────────────────────────────────────── */}
        <section id="vitrina" className="qb-vitrina" aria-labelledby="qb-vitrina-titulo">
          <div className="qb-vitrina-cabeza">
            <div>
              <p className="qb-antetitulo">Stock disponible</p>
              <h2 id="qb-vitrina-titulo" className="qb-h2">
                La <em className="qb-oro">vitrina</em>
              </h2>
            </div>
            <div className="qb-herramientas">
              <label className="qb-buscar">
                <span className="qb-sr">Buscar un perfume</span>
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscá: Khamrah, Lattafa, vainilla…"
                  autoComplete="off"
                  enterKeyHint="search"
                />
              </label>
              <div className="qb-vistas" role="group" aria-label="Cómo ver los perfumes">
                <button type="button" aria-pressed={vista === "vitrina"} onClick={() => setVista("vitrina")}>
                  Vitrina
                </button>
                <button type="button" aria-pressed={vista === "indice"} onClick={() => setVista("indice")}>
                  Índice
                </button>
              </div>
            </div>
          </div>
          <div className="qb-chips" role="group" aria-label="Familias">
            <button type="button" aria-pressed={familia === null} onClick={() => elegirFamilia(null, false)}>
              Todas <span>{piezas.length}</span>
            </button>
            {FAMILIAS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={familia === f.id}
                style={{ "--color-puerta": f.color } as CSSProperties}
                onClick={() => elegirFamilia(familia === f.id ? null : f.id, false)}
              >
                <i aria-hidden="true" /> {f.nombre} <span>{conteo[f.id] ?? 0}</span>
              </button>
            ))}
          </div>

          <p className="qb-sr" aria-live="polite">
            {visibles.length === piezas.length ? "" : `${visibles.length} perfumes con este filtro.`}
          </p>

          {visibles.length === 0 ? (
            <div className="qb-vacio">
              <p>No encontramos «{q}» en la vitrina.</p>
              <p>
                Puede que lo tengamos igual:{" "}
                <a href={mensajeDirecto(instagram)} target="_blank" rel="noopener noreferrer">
                  preguntanos por Instagram
                </a>
                .
              </p>
              <button type="button" className="qb-boton qb-boton-linea" onClick={() => { setQ(""); setFamilia(null); }}>
                Ver todos
              </button>
            </div>
          ) : vista === "vitrina" ? (
            grupos.map((g) => (
              <section key={g.familia?.id ?? "otras"} className="qb-estante" aria-labelledby={`qb-est-${g.familia?.id ?? "otras"}`}>
                <header className="qb-estante-cabeza qb-revela">
                  {g.familia && <IconoFamilia icono={g.familia.icono} className="qb-icono qb-icono-chico" />}
                  <h3 id={`qb-est-${g.familia?.id ?? "otras"}`} className="qb-h3">
                    {g.familia ? g.familia.titulo : "Más fragancias"}
                  </h3>
                  <p>{g.familia ? g.familia.bajada : "Lo último que llegó."}</p>
                </header>
                <ul className="qb-piezas qb-carrusel">
                  {g.items.map((p, i) => (
                    <li key={p.id}>
                      <Tarjeta
                        p={p}
                        par={i % 2 === 1}
                        cantidad={v.cantidadDe(p.id)}
                        transicion={origen === p.id && fichaId === null}
                        alVer={abrirFicha}
                        alSumar={sumar}
                        alSacar={sacar}
                      />
                    </li>
                  ))}
                </ul>
                <div className="qb-repisa" aria-hidden="true" />
              </section>
            ))
          ) : (
            <Indice piezas={grupos.flatMap((g) => g.items)} cantidadDe={v.cantidadDe} alVer={abrirFicha} alSumar={(p) => sumar(p)} />
          )}
        </section>

        {/* ── PARA REGALAR (su reel del 17/09) ──────────────────────────────────── */}
        {regalos.length > 0 && <Regalo regalos={regalos} alVer={abrirFicha} />}

        {/* ── CÓMO COMPRAR ──────────────────────────────────────────────────────── */}
        <section id="como" className="qb-como" aria-labelledby="qb-como-titulo">
          <h2 id="qb-como-titulo" className="qb-h2 qb-revela">
            Cómo <em className="qb-oro">comprar</em>
          </h2>
          <ol className="qb-pasos">
            <li className="qb-revela">
              <span className="qb-paso-num">I</span>
              <h3>Elegí</h3>
              <p>Sumá a la bolsa los que te gusten. Si dudás, abrí la ficha: ahí ves a qué huele cada uno.</p>
            </li>
            <li className="qb-revela">
              <span className="qb-paso-num">II</span>
              <h3>Pedí</h3>
              <p>Dejanos tu nombre y un teléfono. El pedido nos llega al toque, con su número.</p>
            </li>
            <li className="qb-revela">
              <span className="qb-paso-num">III</span>
              <h3>Coordinamos</h3>
              <p>Te escribimos para el envío o el punto de encuentro en {ciudad}, y te pasamos los medios de pago.</p>
            </li>
          </ol>
          <p className="qb-como-pie">
            ¿Dudas antes de pedir?{" "}
            <a href={mensajeDirecto(instagram)} target="_blank" rel="noopener noreferrer">
              Escribinos por Instagram
            </a>{" "}
            y te ayudamos a encontrar el indicado.
          </p>
        </section>
      </main>

      {/* ── PIE ───────────────────────────────────────────────────────────────── */}
      <footer className="qb-pie">
        <p className="qb-pie-marca" aria-hidden="true">
          <span>Qué</span>
          <span className="qb-oro">Bien</span>
          <span>Olés</span>
        </p>
        <p className="qb-pie-lema">
          Perfumes que dejan huella <span aria-hidden="true">·</span> Fragancias que enamoran
        </p>
        <ul className="qb-pie-datos">
          <li>{ciudad}, Buenos Aires</li>
          <li>Envío o punto de encuentro</li>
          <li>
            <a href={`https://www.instagram.com/${instagram}/`} target="_blank" rel="noopener noreferrer" className="qb-pie-ig">
              <IconoInstagram className="qb-icono-ig" /> @{instagram}
            </a>
          </li>
        </ul>
        <p className="qb-pie-casas">{copy.providers.join(" · ")}</p>
      </footer>

      {/* ── LA BARRA DE ABAJO (sólo teléfono): la bolsa siempre a un toque ─────── */}
      <div className="qb-barra" role="region" aria-label="Tu bolsa">
        <button type="button" className="qb-barra-resumen" data-latido={latido ? latido % 2 : undefined} onClick={() => setBolsaAbierta(true)} aria-label={resumenBolsa}>
          <span ref={iconoBarra} className="qb-barra-icono">
            <IconoBolsa className="qb-icono-bolsa" />
            {v.piezas > 0 && <span className="qb-bolsa-cuenta">{v.piezas}</span>}
          </span>
          {v.piezas > 0 ? (
            <span className="qb-barra-texto">
              <strong>Bolsa</strong> · {v.piezas} {v.piezas === 1 ? "perfume" : "perfumes"} · <span className="qb-num">{plata(v.subtotal)}</span>
            </span>
          ) : (
            <span className="qb-barra-texto">Tu bolsa está vacía</span>
          )}
        </button>
        {v.piezas > 0 ? (
          <button type="button" className="qb-boton qb-boton-oro qb-barra-accion" onClick={() => setBolsaAbierta(true)}>
            Pedir
          </button>
        ) : (
          <a className="qb-boton qb-boton-oro qb-barra-accion" href="#vitrina">
            Ver la vitrina
          </a>
        )}
      </div>

      {ficha && (
        <Ficha
          p={ficha}
          piezas={piezas}
          cantidad={v.cantidadDe(ficha.id)}
          instagram={instagram}
          alCerrar={cerrarFicha}
          alSumar={(el) => sumar(ficha, el)}
          alSumarOtra={(otra) => sumar(otra)}
          alSacar={() => sacar(ficha)}
          alVer={(id) =>
            transicion(() => {
              setOrigen(id);
              setFichaId(id);
            })
          }
        />
      )}
      <Bolsa
        abierta={bolsaAbierta}
        alCerrar={() => setBolsaAbierta(false)}
        v={v}
        porId={porId}
        instagram={instagram}
        ciudad={ciudad}
        notasPlaceholder="ej: es para regalo, horario para coordinar la entrega, aclaraciones"
        hayWhatsApp={Boolean(branding?.whatsapp)}
      />
      <p className="qb-sr" aria-live="polite">
        {v.aviso}
      </p>
    </div>
  );
}

// ── LA TARJETA-TIRITA DE UN PERFUME ───────────────────────────────────────────
// Sobre la mesa de mármol, el frasco apoyado y la tirita de papel que sale por detrás con el nombre
// escrito a mano. Abajo, a qué huele en una línea, el precio y el botón.
// Memorizada: con 25 en pantalla, cada cambio de la vidriera (una cantidad, la ficha, la bolsa) volvía a
// dibujar las 25. Los manejadores llegan estables del padre y reciben la pieza, no un cierre por tarjeta.

const Tarjeta = memo(function Tarjeta({
  p,
  par,
  cantidad,
  transicion,
  alVer,
  alSumar,
  alSacar,
}: {
  p: Pieza;
  par: boolean;
  cantidad: number;
  transicion: boolean;
  alVer: (id: string) => void;
  alSumar: (p: Pieza, el: HTMLElement | null) => void;
  alSacar: (p: Pieza) => void;
}) {
  const foto = useRef<HTMLButtonElement>(null);
  const sinStock = p.disponibilidad === "sin-stock";
  const etiqueta = etiquetaDeDisponibilidad(p.disponibilidad ?? null);
  const huele = p.perfume ? aQueHuele(p.perfume) : null;
  return (
    <article
      className="qb-pieza"
      data-familia={p.familia ?? "otras"}
      style={{ "--color-puerta": p.familia ? FAMILIA_POR_ID[p.familia].color : ORO } as CSSProperties}
    >
      <div className="qb-mesa qb-pieza-mesa">
        <Tirita como="div" sinFoto={!p.foto} apagada={sinStock} giro={par ? 1 : -1.5}>
          <div className="qb-tirita-rotulo">
            <h4 className="qb-tirita-nombre">{p.nombre}</h4>
            {p.casa && <p className="qb-tirita-casa">{p.casa}</p>}
          </div>
        </Tirita>
        {/* La capa que se toca: cubre la mesa entera y se funde con ella (lighten), así el fondo oscuro de
            la foto desaparece y el frasco queda apoyado sobre el mármol, delante de la tirita. */}
        <button ref={foto} type="button" className="qb-mesa-capa qb-pieza-foto" onClick={() => alVer(p.id)} aria-label={`Ver la ficha de ${p.nombre}`}>
          {p.foto && (
            <FotoDeFrasco
              src={p.foto}
              nombre={p.nombre}
              casa={p.casa}
              className="qb-mesa-frasco"
              style={transicion ? ({ viewTransitionName: "qb-frasco-activo" } as CSSProperties) : undefined}
            />
          )}
        </button>
      </div>
      <p className="qb-pieza-huele">{huele ? `Huele a ${huele}` : "Pedinos la ficha"}</p>
      <div className="qb-pieza-pie">
        <p className="qb-pieza-precio">{p.price ? plata(p.price) : "Consultanos"}</p>
        {etiqueta && (
          <p className="qb-pieza-dispo" data-dispo={p.disponibilidad}>
            {etiqueta}
          </p>
        )}
      </div>
      {cantidad > 0 ? (
        <div className="qb-cantidad" role="group" aria-label={`${p.nombre} en tu bolsa`}>
          <button type="button" onClick={() => alSacar(p)} aria-label={`Sacar uno de ${p.nombre}`}>
            −
          </button>
          <span aria-live="polite">{cantidad}</span>
          <button type="button" onClick={() => alSumar(p, foto.current)} disabled={sinStock} aria-label={`Sumar otro ${p.nombre}`}>
            +
          </button>
        </div>
      ) : (
        <button type="button" className="qb-sumar" onClick={() => alSumar(p, foto.current)} disabled={sinStock || !p.price}>
          {sinStock ? "Sin stock" : p.price ? "Sumar a la bolsa" : "Consultanos"}
        </button>
      )}
    </article>
  );
});

// ── EL ÍNDICE (vista de lista) ────────────────────────────────────────────────

function Indice({
  piezas,
  cantidadDe,
  alVer,
  alSumar,
}: {
  piezas: Pieza[];
  cantidadDe: (id: string) => number;
  alVer: (id: string) => void;
  alSumar: (p: Pieza) => void;
}) {
  return (
    <table className="qb-indice">
      <caption className="qb-sr">Índice de perfumes con casa, familia y precio</caption>
      <thead>
        <tr>
          <th scope="col">N.º</th>
          <th scope="col">Perfume</th>
          <th scope="col">Casa</th>
          <th scope="col">Familia</th>
          <th scope="col" className="qb-num">
            Precio
          </th>
          <th scope="col">
            <span className="qb-sr">Bolsa</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {piezas.map((p, i) => (
          <tr key={p.id} style={{ "--color-puerta": p.familia ? FAMILIA_POR_ID[p.familia].color : ORO } as CSSProperties}>
            <td className="qb-indice-n">{String(i + 1).padStart(2, "0")}</td>
            <th scope="row">
              <button type="button" onClick={() => alVer(p.id)}>
                {p.nombre}
              </button>
            </th>
            <td>{p.casa ?? "—"}</td>
            <td>
              <i aria-hidden="true" /> {p.familia ? FAMILIA_POR_ID[p.familia].nombre : "—"}
            </td>
            <td className="qb-num">{p.price ? plata(p.price) : "—"}</td>
            <td>
              <button
                type="button"
                className="qb-indice-sumar"
                onClick={() => alSumar(p)}
                disabled={p.disponibilidad === "sin-stock" || !p.price}
                aria-label={`Sumar ${p.nombre} a la bolsa`}
              >
                {cantidadDe(p.id) > 0 ? `En la bolsa (${cantidadDe(p.id)})` : "Sumar"}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── PARA REGALAR ─────────────────────────────────────────────────────────────

function Regalo({ regalos, alVer }: { regalos: { pieza: Pieza; para: string; porque: string }[]; alVer: (id: string) => void }) {
  const [copiado, setCopiado] = useState(false);
  const compartir = async () => {
    const url = `${window.location.origin}/tienda#regalo`;
    const texto = "Te dejo una indirecta 😬 Qué Bien Olés tiene algunas ideas:";
    try {
      if (navigator.share) {
        await navigator.share({ title: "Qué Bien Olés · Para regalar", text: texto, url });
        return;
      }
      await navigator.clipboard.writeText(`${texto} ${url}`);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2400);
    } catch {
      /* compartir cancelado: nada que hacer */
    }
  };
  return (
    <section id="regalo" className="qb-regalo" aria-labelledby="qb-regalo-titulo">
      <div className="qb-regalo-texto qb-revela">
        <p className="qb-antetitulo">Para regalar</p>
        <h2 id="qb-regalo-titulo" className="qb-h2">
          «No sé qué <em className="qb-oro">regalarte</em>…»
        </h2>
        <p className="qb-lead">Nosotros tenemos algunas ideas.</p>
        <button type="button" className="qb-boton qb-boton-linea" onClick={compartir}>
          {copiado ? "¡Link copiado!" : "Mandale la indirecta"}
        </button>
        <p className="qb-regalo-nota">Mandale esta página al que necesite entender la indirecta 😬</p>
      </div>
      <ul className="qb-regalo-lista qb-carrusel">
        {regalos.map(({ pieza, para, porque }, i) => (
          <li key={pieza.id} className="qb-revela" style={{ "--color-puerta": pieza.familia ? FAMILIA_POR_ID[pieza.familia].color : ORO } as CSSProperties}>
            <button type="button" className="qb-regalo-item" onClick={() => alVer(pieza.id)}>
              <span className="qb-regalo-para">{para}</span>
              <span className="qb-mesa qb-mesa-chica">
                <Tirita sinFoto={!pieza.foto} giro={i % 2 ? 1 : -1.5}>
                  <span className="qb-tirita-rotulo">
                    <span className="qb-tirita-nombre">{pieza.nombre}</span>
                    {pieza.casa && <span className="qb-tirita-casa">{pieza.casa}</span>}
                  </span>
                </Tirita>
                {pieza.foto && (
                  <span className="qb-mesa-capa">
                    <FotoDeFrasco src={pieza.foto} nombre={pieza.nombre} casa={pieza.casa} className="qb-mesa-frasco" />
                  </span>
                )}
              </span>
              <span className="qb-regalo-porque">{porque}</span>
              <span className="qb-regalo-precio">{pieza.price ? plata(pieza.price) : "Consultanos"}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
