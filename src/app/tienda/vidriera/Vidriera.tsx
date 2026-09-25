"use client";

// ============================================================================
// LA VIDRIERA NUEVA — la parte que se toca: buscar, filtrar, la carta, la ficha y la bolsa.
// ============================================================================
//
// Una estructura para las cuatro marcas (MAGRA, Shine, A Dos Manos y la genérica del rubro); lo que
// cambia entre ellas es la piel (`data-marca` + vidriera.module.css) y cómo se dibuja cada sección
// (`disposicion`: pizarra, mundo, cuadro, lista). La portada, lo editorial y el pie llegan ya
// dibujados por el servidor (`portada`, `editorial`, `pie`): su código no viaja al navegador.
//
// El momento que se diseña: alguien con el teléfono en una mano, a la noche o entre dos cosas, que
// quiere saber qué hay, cuánto sale y pedirlo sin llamar. Por eso: el producto y su precio antes de
// la primera pantalla, la búsqueda que filtra mientras escribe, la bolsa siempre a la vista (riel en
// la PC, barra abajo en el celular) y el pedido que no se pierde si la señal se corta.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import s from "./vidriera.module.css";
import {
  carta,
  conteoPorSeccion,
  escribirFiltros,
  hayFiltros,
  parecidosPorPrecio,
  plata,
  puestoDePrecio,
  precioDe,
  ORDENES,
  type Filtros,
  type Orden,
  type ProductoVidriera,
} from "./catalogo-core";
import type { Disposicion, MarcaId, Palabras } from "./marcas";
import type { ShippingConfig } from "@/lib/storefront-shipping";
import { etiquetaDeDisponibilidad } from "../reglas-tienda";
import { useVidriera, type EstadoVidriera } from "./useVidriera";
import { Paso } from "./Paso";
import { Ficha } from "./Ficha";
import { BolsaPanel } from "./BolsaPanel";
import { IconoBolsa, IconoCerrar, IconoLupa } from "./Iconos";

export type SeccionVista = {
  id: string;
  titulo: string;
  bajada: string | null;
  /** Foto del mundo (Shine) o de la línea; null si no hay: no se inventa. */
  imagen: string | null;
  disposicion: Disposicion;
  /** Lo que es cierto de todo lo de esta sección ("Envasado al vacío"), para la ficha. */
  hechos: string[];
};

export type DatosVidriera = {
  marca: MarcaId;
  tenantKey: string;
  productos: ProductoVidriera[];
  secciones: SeccionVista[];
  seccionDe: Record<string, string>;
  /** Pádel: la marca y el modelo que salen del nombre (null si no se sabe). */
  marcaDe: Record<string, string>;
  modeloDe: Record<string, string>;
  marcas: string[];
  /** Foto de producto cuando existe (MAGRA). */
  imagenDe: Record<string, string>;
  /** Sólo dígitos; "" si el local todavía no publicó su WhatsApp. */
  whatsapp: string;
  envio: ShippingConfig | null;
  envioSinTarifa: "sin-cargo" | "a-coordinar";
  entregaPorDefecto: "PICKUP" | "DELIVERY";
  /** "Canning": la localidad para el renglón del envío. */
  zona: string | null;
  textoPago: string;
  palabras: Palabras;
  filtrosIniciales: Filtros;
  productoInicial: string | null;
  /** Rótulo y título de la carta (kicker + h2) y su bajada, del copy de la marca. */
  cartaKicker: string;
  cartaTitulo: string;
  cartaIntro: string | null;
};

type Slots = {
  cabecera: ReactNode;
  portada: ReactNode;
  editorial: ReactNode;
  pie: ReactNode;
};

export default function Vidriera(props: DatosVidriera & Slots) {
  const { marca, productos, secciones, seccionDe, marcaDe, palabras } = props;
  const hayWhatsApp = props.whatsapp.length > 0;
  const v = useVidriera({
    tenantKey: props.tenantKey,
    productos,
    envio: props.envio,
    entregaPorDefecto: props.entregaPorDefecto,
    hayWhatsApp,
  });

  const [filtros, setFiltros] = useState<Filtros>(props.filtrosIniciales);
  const [abierto, setAbierto] = useState<string | null>(
    props.productoInicial && productos.some((p) => p.id === props.productoInicial) ? props.productoInicial : null,
  );
  const [bolsaAbierta, setBolsaAbierta] = useState(false);
  const empujado = useRef(false);
  const buscador = useRef<HTMLInputElement>(null);

  // ── Filtros ↔ URL: se reemplaza la entrada (no se apila una por tecla). ──
  useEffect(() => {
    const url = `${window.location.pathname}${escribirFiltros(filtros, window.location.search)}${window.location.hash}`;
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, "", url);
    }
  }, [filtros]);

  // ── La ficha en la URL (`?producto=`): se comparte y «atrás» la cierra. ──
  const abrirFicha = useCallback((id: string) => {
    const p = new URLSearchParams(window.location.search);
    const yaAbierta = p.has("producto");
    p.set("producto", id);
    // De una ficha a otra (comparar) se reemplaza: «atrás» sigue cerrando la ficha, no recorre todas.
    if (yaAbierta) window.history.replaceState(window.history.state, "", `${window.location.pathname}?${p}`);
    else {
      window.history.pushState(window.history.state, "", `${window.location.pathname}?${p}`);
      empujado.current = true;
    }
    setAbierto(id);
  }, []);
  const cerrarFicha = useCallback(() => {
    if (empujado.current) {
      empujado.current = false;
      window.history.back();
    } else {
      const p = new URLSearchParams(window.location.search);
      p.delete("producto");
      const q = p.toString();
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
    }
    setAbierto(null);
  }, []);
  useEffect(() => {
    const alVolver = () => {
      const id = new URLSearchParams(window.location.search).get("producto");
      empujado.current = false;
      setAbierto(id && productos.some((p) => p.id === id) ? id : null);
    };
    window.addEventListener("popstate", alVolver);
    return () => window.removeEventListener("popstate", alVolver);
  }, [productos]);

  // ── «/» lleva al buscador (PC). Esc lo limpia si tiene algo. ──
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      buscador.current?.focus();
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, []);

  const seccionesCarta = useMemo(() => secciones.map((x) => ({ id: x.id, titulo: x.titulo })), [secciones]);
  const vista = carta(productos, seccionesCarta, seccionDe, filtros, marcaDe);
  const conteo = conteoPorSeccion(productos, seccionesCarta, seccionDe, filtros, marcaDe);
  const conSeccion = secciones.filter((x) => (conteo[x.id] ?? 0) > 0 || filtros.seccion === x.id);
  const secPorId = new Map(secciones.map((x) => [x.id, x]));
  const productoAbierto = abierto ? (productos.find((p) => p.id === abierto) ?? null) : null;

  const cambiar = (parcial: Partial<Filtros>) => setFiltros((f) => ({ ...f, ...parcial }));
  const limpiar = () => setFiltros((f) => ({ ...f, q: "", seccion: null, marca: null }));

  return (
    <div className={s.v} data-marca={marca}>
      <a href="#carta" className={s.saltar}>
        Ir a la carta
      </a>
      <header className={s.cab}>
        <div className={s.cabIn}>
          {props.cabecera}
          {/* La bolsa en la cabecera: en la PC salta al riel; en el celular abre la hoja. */}
          <a
            href="#pedido"
            className={s.cabBolsa}
            onClick={(e) => {
              if (window.matchMedia("(max-width: 1079px)").matches) {
                e.preventDefault();
                setBolsaAbierta(true);
              }
            }}
            aria-label={
              v.piezas > 0
                ? `Tu pedido: ${v.piezas} ${v.piezas === 1 ? palabras.uno : palabras.varios}, ${plata(v.total)}`
                : "Tu pedido, vacío"
            }
          >
            <IconoBolsa />
            <span className={s.cabBolsaN}>{v.piezas > 0 ? plata(v.total) : "Tu pedido"}</span>
          </a>
        </div>
      </header>

      {props.portada}

      <div className={s.cuerpo}>
        <main id="carta" className={s.carta} tabIndex={-1}>
          <div className={s.cartaCab}>
            <p className={s.kicker}>{props.cartaKicker}</p>
            <h2 className={s.cartaTit}>{props.cartaTitulo}</h2>
            {props.cartaIntro && <p className={s.cartaIntro}>{props.cartaIntro}</p>}
          </div>

          {/* ── Buscar, filtrar, ordenar: una línea pegada arriba mientras se baja. ── */}
          <div className={s.herr} role="search">
            <div className={s.herrFila}>
              <label className={s.buscar}>
                <IconoLupa className={s.buscarIco} />
                <span className={s.srOnly}>{palabras.buscar}</span>
                <input
                  ref={buscador}
                  type="search"
                  value={filtros.q}
                  onChange={(e) => cambiar({ q: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Escape" && filtros.q) {
                      e.preventDefault();
                      cambiar({ q: "" });
                    }
                  }}
                  placeholder={palabras.buscar}
                  enterKeyHint="search"
                  autoComplete="off"
                  maxLength={60}
                />
                <kbd className={s.atajo} aria-hidden>
                  /
                </kbd>
              </label>
              <label className={s.orden}>
                <span className={s.srOnly}>Ordenar</span>
                <select value={filtros.orden} onChange={(e) => cambiar({ orden: e.target.value as Orden })}>
                  {ORDENES.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.texto}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className={s.chips} role="group" aria-label="Secciones">
              <button type="button" className={s.chip} aria-pressed={!filtros.seccion} onClick={() => cambiar({ seccion: null })}>
                Todo <span className={s.chipN}>{Object.values(conteo).reduce((a, b) => a + b, 0)}</span>
              </button>
              {conSeccion.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  className={s.chip}
                  aria-pressed={filtros.seccion === x.id}
                  onClick={() => cambiar({ seccion: filtros.seccion === x.id ? null : x.id })}
                >
                  {x.titulo} <span className={s.chipN}>{conteo[x.id] ?? 0}</span>
                </button>
              ))}
            </div>
            {props.marcas.length > 0 && (
              <div className={s.chips} role="group" aria-label="Marcas">
                {props.marcas.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`${s.chip} ${s.chipMarca}`}
                    aria-pressed={filtros.marca === m}
                    onClick={() => cambiar({ marca: filtros.marca === m ? null : m })}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
            <p className={s.conteo} aria-live="polite">
              {hayFiltros(filtros) ? (
                <>
                  {vista.visibles} de {vista.total} {vista.total === 1 ? palabras.uno : palabras.varios}
                  {filtros.q.trim() && <> con «{filtros.q.trim()}»</>}
                  <button type="button" className={s.limpiar} onClick={limpiar}>
                    <IconoCerrar size={14} /> Ver todo
                  </button>
                </>
              ) : (
                <>
                  {vista.total} {vista.total === 1 ? palabras.uno : palabras.varios}
                </>
              )}
            </p>
          </div>

          {productos.length === 0 ? (
            <div className={s.vacio}>
              <p className={s.vacioT}>Estamos armando la carta.</p>
              <p>
                Todavía no hay {palabras.varios} publicados para comprar online.
                {hayWhatsApp ? " Mientras tanto, escribinos por WhatsApp y te tomamos el pedido." : ""}
              </p>
            </div>
          ) : vista.visibles === 0 ? (
            <div className={s.vacio}>
              <p className={s.vacioT}>
                No encontramos {filtros.q.trim() ? `«${filtros.q.trim()}»` : `${palabras.varios} con ese filtro`}.
              </p>
              <p>Probá con otra palabra o mirá toda la carta.</p>
              <button type="button" className={`${s.btn} ${s.btnSec}`} onClick={limpiar}>
                Ver toda la carta
              </button>
            </div>
          ) : (
            <div className={s.grupos}>
              {vista.grupos.map((g) => {
                const sec = secPorId.get(g.seccion)!;
                return (
                  <Grupo
                    key={g.seccion}
                    sec={sec}
                    items={g.items}
                    v={v}
                    props={props}
                    orden={filtros.orden}
                    onOrden={(o) => cambiar({ orden: o })}
                    onAbrir={abrirFicha}
                  />
                );
              })}
            </div>
          )}
        </main>

        <aside
          id="pedido"
          className={s.bolsa}
          data-abierta={bolsaAbierta || undefined}
          aria-label="Tu pedido"
          {...(bolsaAbierta ? { role: "dialog", "aria-modal": true } : {})}
        >
          <BolsaPanel
            v={v}
            palabras={palabras}
            hayWhatsApp={hayWhatsApp}
            zona={props.zona}
            textoPago={props.textoPago}
            envio={props.envio}
            envioSinTarifa={props.envioSinTarifa}
            abierta={bolsaAbierta}
            onCerrar={() => setBolsaAbierta(false)}
            onAbrirFicha={abrirFicha}
          />
        </aside>
        {bolsaAbierta && <div className={s.velo} onClick={() => setBolsaAbierta(false)} aria-hidden />}
      </div>

      {props.editorial}
      {props.pie}

      {v.piezas > 0 && !bolsaAbierta && (
        <div className={s.barraMov}>
          <div>
            <div className={s.barraMovT}>{plata(v.total)}</div>
            <div className={s.barraMovS}>
              {v.piezas} {v.piezas === 1 ? palabras.uno : palabras.varios}
              {v.hayPeso ? " · se pesa al envasar" : ""}
            </div>
          </div>
          <button type="button" className={`${s.btn} ${s.btnPri}`} onClick={() => setBolsaAbierta(true)}>
            Ver mi pedido
          </button>
        </div>
      )}

      {productoAbierto && (
        <Ficha
          key={productoAbierto.id}
          p={productoAbierto}
          parecidos={parecidosPorPrecio(productoAbierto, productos, seccionDe)}
          puesto={puestoDePrecio(productoAbierto, productos, seccionDe)}
          onAbrir={abrirFicha}
          sec={secPorId.get(seccionDe[productoAbierto.id] ?? "") ?? null}
          marca={props.marcaDe[productoAbierto.id] ?? null}
          imagen={props.imagenDe[productoAbierto.id] ?? null}
          enBolsa={v.cantidadDe(productoAbierto.id)}
          whatsapp={props.whatsapp}
          onFijar={(q) => v.fijar(productoAbierto, q)}
          onCerrar={cerrarFicha}
        />
      )}

      <p className={s.srOnly} aria-live="polite">
        {v.aviso}
      </p>
    </div>
  );
}

// ── Un grupo de la carta, dibujado según su disposición ──────────────────────

function Grupo({
  sec,
  items,
  v,
  props,
  orden,
  onOrden,
  onAbrir,
}: {
  sec: SeccionVista;
  items: ProductoVidriera[];
  v: EstadoVidriera;
  props: DatosVidriera;
  orden: Orden;
  onOrden: (o: Orden) => void;
  onAbrir: (id: string) => void;
}) {
  const cab = (
    <div className={s.grupoCab}>
      <h3 className={s.grupoTit} id={`sec-${sec.id}`}>
        {sec.titulo}
      </h3>
      {sec.bajada && <span className={s.grupoBaj}>{sec.bajada}</span>}
    </div>
  );

  if (sec.disposicion === "cuadro") {
    const max = Math.max(...items.map(precioDe), 1);
    const siguiente: Orden = orden === "precio-asc" ? "precio-desc" : orden === "precio-desc" ? "carta" : "precio-asc";
    return (
      <section className={s.grupo} data-disposicion="cuadro" aria-labelledby={`sec-${sec.id}`}>
        {cab}
        <table className={s.cuadro}>
          <thead>
            <tr>
              <th scope="col">Modelo</th>
              <th scope="col">Marca</th>
              <th
                scope="col"
                className={s.der}
                aria-sort={orden === "precio-asc" ? "ascending" : orden === "precio-desc" ? "descending" : "none"}
              >
                <button type="button" className={s.thBtn} onClick={() => onOrden(siguiente)}>
                  Precio {orden === "precio-asc" ? "↑" : orden === "precio-desc" ? "↓" : ""}
                </button>
              </th>
              <th scope="col">
                <span className={s.srOnly}>Sumar al pedido</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => {
              const q = v.cantidadDe(p.id);
              const disp = etiquetaDeDisponibilidad(p.disponibilidad ?? null);
              return (
                <tr key={p.id} data-en-bolsa={q > 0 || undefined} data-sin-stock={p.disponibilidad === "sin-stock" || undefined}>
                  <td className={s.cMod}>
                    <button type="button" className={s.renNom} onClick={() => onAbrir(p.id)}>
                      {props.modeloDe[p.id] ?? p.name}
                    </button>
                    {disp && (
                      <span className={s.estado} data-estado={p.disponibilidad}>
                        {disp}
                      </span>
                    )}
                  </td>
                  <td className={s.cMarca}>{props.marcaDe[p.id] ?? "—"}</td>
                  <td className={`${s.cPrecio} ${s.der}`}>
                    <span className={s.renPrecio}>{plata(precioDe(p))}</span>
                    <span className={s.barra} aria-hidden>
                      <span
                        style={{
                          width: `${Math.round((precioDe(p) / max) * 100)}%`,
                        }}
                      />
                    </span>
                  </td>
                  <td className={s.cPaso}>
                    <Paso p={p} q={q} onMover={(d) => v.mover(p, d)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    );
  }

  const renglones = (
    <div className={s.renglones} data-disposicion={sec.disposicion}>
      {items.map((p) => (
        <Renglon key={p.id} p={p} v={v} props={props} onAbrir={onAbrir} />
      ))}
    </div>
  );

  if (sec.disposicion === "mundo") {
    return (
      <section className={s.grupo} data-disposicion="mundo" aria-labelledby={`sec-${sec.id}`}>
        <div className={s.mundo}>
          <div className={s.mundoLado}>
            {sec.imagen && (
              // Foto del mundo (no del producto): decorativa, el título de al lado la nombra.
              <Image
                src={sec.imagen}
                alt=""
                width={886}
                height={665}
                sizes="(max-width: 1079px) 100vw, 300px"
                className={s.mundoFoto}
              />
            )}
            {cab}
          </div>
          {renglones}
        </div>
      </section>
    );
  }

  return (
    <section className={s.grupo} data-disposicion={sec.disposicion} aria-labelledby={`sec-${sec.id}`}>
      {cab}
      {renglones}
    </section>
  );
}

function Renglon({
  p,
  v,
  props,
  onAbrir,
}: {
  p: ProductoVidriera;
  v: EstadoVidriera;
  props: DatosVidriera;
  onAbrir: (id: string) => void;
}) {
  const q = v.cantidadDe(p.id);
  const img = props.imagenDe[p.id] ?? null;
  const disp = etiquetaDeDisponibilidad(p.disponibilidad ?? null);
  const pizarra = props.marca === "magra";
  const meta = pizarra ? (p.saleUnit === "WEIGHT" ? "Por kilo · se pesa al envasar" : "Por unidad") : null;
  return (
    <div className={s.ren} data-en-bolsa={q > 0 || undefined} data-sin-stock={p.disponibilidad === "sin-stock" || undefined}>
      {pizarra &&
        (img ? (
          // Miniatura: el archivo es de 686×858 (≈ 80 KB); el optimizador la sirve a 64/128 px.
          <Image src={img} alt="" width={64} height={64} sizes="64px" className={s.renFoto} />
        ) : (
          <span className={s.renIni} aria-hidden>
            {iniciales(p.name)}
          </span>
        ))}
      <div className={s.renTxt}>
        <button type="button" className={s.renNom} onClick={() => onAbrir(p.id)}>
          {p.name}
        </button>
        {(meta || disp) && (
          <span className={s.renMeta}>
            {meta}
            {disp && (
              <span className={s.estado} data-estado={p.disponibilidad}>
                {disp}
              </span>
            )}
          </span>
        )}
      </div>
      <span className={s.renPrecio}>
        {plata(precioDe(p))}
        <small>{p.saleUnit === "WEIGHT" ? "/kg" : pizarra ? "/u" : ""}</small>
      </span>
      <Paso p={p} q={q} onMover={(d) => v.mover(p, d)} />
    </div>
  );
}

function iniciales(nombre: string): string {
  const w = nombre
    .replace(/\(.*?\)/g, "")
    .trim()
    .split(/\s+/)
    .filter((x) => x.length > 2 || /^[A-ZÁÉÍÓÚ]/.test(x));
  return (w.length > 1 ? w[0][0] + w[w.length - 1][0] : (w[0] ?? nombre).slice(0, 2)).toUpperCase();
}
