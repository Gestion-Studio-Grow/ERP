"use client";

// Elegir qué etiquetas imprimir, en qué plantilla, verlas antes y mandarlas a la impresora.
//
// Arranca con los que cambiaron de precio desde su última etiqueta ya tildados. La vista de
// impresión es el MISMO documento que se imprime (`htmlDeEtiquetas`), achicado para que entre
// en la pantalla del teléfono sin scroll de costado.
//
// Al imprimir, primero el servidor anota la impresión y devuelve los precios de AHORA (si
// alguien cambió uno mientras tanto, sale el nuevo): lo que va al papel es lo que queda
// anotado. Recién ahí se abre el cuadro de impresión, con el documento en un iframe aparte
// (el mismo camino que el ticket de Vender) para que no salgan la barra ni los botones.

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AvisoError, Badge, Button, cn, fmtNumberAR } from "@/components/ui";
import { CORTE_CATEGORIAS, type CorteCategoria } from "@/lib/carniceria/cortes";
import { normalizarNombre } from "@/lib/catalogo/planilla-core";
import {
  PLANTILLAS,
  enHojas,
  htmlDeEtiquetas,
  precioDeEtiqueta,
  tamanioDeHojaPx,
  type DatosEtiqueta,
  type PlantillaId,
} from "@/lib/catalogo/etiquetas-core";
import { registrarImpresion } from "@/lib/catalogo/precios-actions";

export type ProductoEtiqueta = DatosEtiqueta & {
  gondola: CorteCategoria;
  pausado: boolean;
  /** Fecha (ISO) del cambio de precio que todavía no se imprimió, o null si está al día. */
  cambioPendiente: string | null;
};

type Vista = "cambiaron" | "todos";

/** Cuántas etiquetas muestra la vista previa del rollo: el resto sale igual, una por página. */
const MUESTRA_ROLLO = 3;

/** "23/09/2026" a partir de "2026-09-23". */
function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function pieDe(negocio: string, hoy: string): string {
  return [negocio.trim(), `precio al ${fechaCorta(hoy)}`].filter(Boolean).join(" · ");
}

export default function Etiquetas({
  productos,
  negocio,
  hoy,
  sustantivo,
}: {
  productos: ProductoEtiqueta[];
  negocio: string;
  /** Hoy en la zona del negocio (AAAA-MM-DD), para el pie de la vista previa. */
  hoy: string;
  sustantivo: { uno: string; varios: string };
}) {
  const router = useRouter();
  const ids = useId();
  const cambiaron = useMemo(() => productos.filter((p) => p.cambioPendiente !== null), [productos]);
  const [vista, setVista] = useState<Vista>(cambiaron.length > 0 ? "cambiaron" : "todos");
  const [gondola, setGondola] = useState<CorteCategoria | "">("");
  const [buscar, setBuscar] = useState("");
  const [elegidos, setElegidos] = useState<ReadonlySet<string>>(() => new Set(cambiaron.map((p) => p.id)));
  const [plantilla, setPlantilla] = useState<PlantillaId>("a4");
  const [error, setError] = useState<string | null>(null);
  const [impreso, setImpreso] = useState<{ n: number; html: string } | null>(null);
  const [pendiente, startTransition] = useTransition();
  const marco = useRef<HTMLIFrameElement | null>(null);

  const gondolas = useMemo(() => {
    const hay = new Set(productos.map((p) => p.gondola));
    return CORTE_CATEGORIAS.filter((c) => hay.has(c.id));
  }, [productos]);

  const lista = useMemo(() => {
    const base = vista === "cambiaron" ? cambiaron : productos;
    const q = normalizarNombre(buscar);
    return base.filter((p) => (!gondola || p.gondola === gondola) && (!q || normalizarNombre(p.nombre).includes(q)));
  }, [vista, cambiaron, productos, gondola, buscar]);

  const seleccion = useMemo(() => productos.filter((p) => elegidos.has(p.id)), [productos, elegidos]);

  function tildar(id: string) {
    setElegidos((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
    setImpreso(null);
  }

  function tildarLista(todos: boolean) {
    setElegidos((prev) => {
      const nuevo = new Set(prev);
      for (const p of lista) {
        if (todos) nuevo.add(p.id);
        else nuevo.delete(p.id);
      }
      return nuevo;
    });
    setImpreso(null);
  }

  /** Manda el documento a imprimir desde un iframe aparte, reusado. */
  function mandarAImprimir(html: string) {
    let f = marco.current;
    if (!f) {
      f = document.createElement("iframe");
      f.setAttribute("aria-hidden", "true");
      f.setAttribute("title", "Etiquetas para imprimir");
      f.tabIndex = -1;
      Object.assign(f.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
      document.body.appendChild(f);
      marco.current = f;
    }
    const iframe = f;
    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    };
    iframe.srcdoc = html;
  }

  function imprimir() {
    if (seleccion.length === 0) return;
    setError(null);
    startTransition(async () => {
      const r = await registrarImpresion(
        seleccion.map((p) => p.id),
        plantilla,
      );
      if (!r.ok) {
        setError(r.mensaje);
        return;
      }
      const html = htmlDeEtiquetas(r.etiquetas, plantilla, pieDe(negocio, r.hoy));
      setImpreso({ n: r.etiquetas.length, html });
      mandarAImprimir(html);
      // Los impresos dejan de figurar como "cambiaron": la lista se trae de nuevo y la
      // selección arranca vacía (lo impreso se reimprime con "Imprimir de nuevo").
      setElegidos(new Set());
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {impreso && (
        <div role="status" className="rounded-lg border border-success/30 bg-success-soft px-4 py-3 text-sm">
          <p className="font-semibold text-strong">
            Se mandaron {fmtNumberAR(impreso.n)} {impreso.n === 1 ? "etiqueta" : "etiquetas"} a la impresora y quedaron anotadas como impresas.
          </p>
          <p className="mt-0.5 text-body">Si el papel salió mal o cancelaste, volvé a imprimirlas desde acá.</p>
          <Button variant="outline" className="mt-3" onClick={() => mandarAImprimir(impreso.html)}>
            Imprimir de nuevo
          </Button>
        </div>
      )}

      <section aria-labelledby={`${ids}-que`} className="rounded-lg border border-line bg-surface-raised p-4 sm:p-5">
        <h2 id={`${ids}-que`} className="text-base font-semibold text-strong">
          Qué etiquetas
        </h2>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Qué mostrar">
          <Button
            aria-pressed={vista === "cambiaron"}
            variant={vista === "cambiaron" ? "solid" : "outline"}
            onClick={() => setVista("cambiaron")}
          >
            Cambiaron de precio ({fmtNumberAR(cambiaron.length)})
          </Button>
          <Button aria-pressed={vista === "todos"} variant={vista === "todos" ? "solid" : "outline"} onClick={() => setVista("todos")}>
            Todos ({fmtNumberAR(productos.length)})
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${ids}-buscar`} className="text-xs font-medium text-muted">
              Buscar
            </label>
            <input
              id={`${ids}-buscar`}
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder={`Nombre del ${sustantivo.uno}`}
              autoComplete="off"
              className="h-11 w-full rounded-md border border-line-strong bg-surface-raised px-3 text-sm text-strong"
            />
          </div>
          {gondolas.length > 1 && (
            <div className="flex flex-col gap-1">
              <label htmlFor={`${ids}-gondola`} className="text-xs font-medium text-muted">
                Góndola
              </label>
              <select
                id={`${ids}-gondola`}
                value={gondola}
                onChange={(e) => setGondola(e.target.value as CorteCategoria | "")}
                className="h-11 w-full rounded-md border border-line-strong bg-surface-raised px-3 text-sm text-strong"
              >
                <option value="">Todas</option>
                {gondolas.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {lista.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            {vista === "cambiaron" && cambiaron.length === 0
              ? `No hay precios cambiados sin reimprimir. Si querés reimprimir alguna, buscala en "Todos".`
              : `Ningún ${sustantivo.uno} con ese filtro.`}
          </p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <Button variant="ghost" size="sm" className="min-h-11" onClick={() => tildarLista(true)}>
                Tildar los {fmtNumberAR(lista.length)}
              </Button>
              <Button variant="ghost" size="sm" className="min-h-11" onClick={() => tildarLista(false)}>
                Destildar
              </Button>
            </div>
            <ul className="mt-1 max-h-96 divide-y divide-line overflow-y-auto rounded-md border border-line">
              {lista.map((p) => (
                <li key={p.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                    <input type="checkbox" checked={elegidos.has(p.id)} onChange={() => tildar(p.id)} className="size-5 shrink-0" />
                    <span className="min-w-0 flex-1 break-words text-strong">
                      {p.nombre}
                      {p.pausado && <Badge className="ml-2">pausado</Badge>}
                    </span>
                    <span className="shrink-0 tabular-nums text-body">
                      {precioDeEtiqueta(p.precio)}
                      {p.saleUnit === "WEIGHT" ? "/kg" : ""}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby={`${ids}-plantilla`} className="rounded-lg border border-line bg-surface-raised p-4 sm:p-5">
        <h2 id={`${ids}-plantilla`} className="text-base font-semibold text-strong">
          Papel
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-labelledby={`${ids}-plantilla`}>
          {(Object.keys(PLANTILLAS) as PlantillaId[]).map((id) => (
            <label
              key={id}
              className={cn(
                "flex min-h-11 cursor-pointer flex-col justify-center rounded-md border px-3 py-2 text-sm",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                plantilla === id ? "border-accent bg-accent-soft" : "border-line-strong bg-surface-raised",
              )}
            >
              <input
                type="radio"
                name={`${ids}-plantilla-opcion`}
                value={id}
                checked={plantilla === id}
                onChange={() => {
                  setPlantilla(id);
                  setImpreso(null);
                }}
                className="sr-only"
              />
              <span className="font-medium text-strong">{PLANTILLAS[id].nombre}</span>
              <span className="text-xs text-muted">{PLANTILLAS[id].detalle}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          En el cuadro de impresión elegí tamaño real (100 %) y sin márgenes, para que cada etiqueta caiga en su lugar.
        </p>
      </section>

      <VistaDeImpresion seleccion={seleccion} plantilla={plantilla} pie={pieDe(negocio, hoy)} />

      {error && <AvisoError titulo="No se imprimió" comoSeguir={error} />}

      <Button onClick={imprimir} disabled={seleccion.length === 0 || pendiente} className="w-full sm:w-auto">
        {pendiente
          ? "Preparando…"
          : seleccion.length === 0
            ? "Tildá al menos una etiqueta"
            : `Imprimir ${fmtNumberAR(seleccion.length)} ${seleccion.length === 1 ? "etiqueta" : "etiquetas"}`}
      </Button>
    </div>
  );
}

/**
 * La vista de impresión: el documento real en un iframe, achicado al ancho disponible. En A4
 * muestra la primera hoja; en rollo, las primeras etiquetas. Lo que no entra se cuenta abajo.
 */
function VistaDeImpresion({ seleccion, plantilla, pie }: { seleccion: DatosEtiqueta[]; plantilla: PlantillaId; pie: string }) {
  const caja = useRef<HTMLDivElement | null>(null);
  const [ancho, setAncho] = useState(0);

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const medir = () => setAncho(el.clientWidth);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const vacia = seleccion.length === 0;
  const muestra = plantilla === "a4" ? (enHojas(seleccion, "a4")[0] ?? []) : seleccion.slice(0, MUESTRA_ROLLO);
  const hoja = tamanioDeHojaPx(plantilla);
  const separacion = Math.round((6 * 96) / 25.4); // el margen de 6 mm entre hojas del documento
  const hojasEnMuestra = plantilla === "a4" ? 1 : muestra.length;
  const altoDoc = hojasEnMuestra * (hoja.alto + separacion);
  const escala = ancho > 0 ? Math.min(1, ancho / hoja.ancho) : 0;
  const hojas = plantilla === "a4" ? Math.ceil(seleccion.length / PLANTILLAS.a4.porHoja) : seleccion.length;
  const resto = seleccion.length - muestra.length;

  return (
    <section aria-label="Vista de impresión" className="space-y-2">
      <h2 className="text-base font-semibold text-strong">Vista de impresión</h2>
      {/* La caja es siempre la misma (la mide el ResizeObserver); adentro, el aviso o el documento. */}
      <div
        ref={caja}
        className={cn("overflow-hidden rounded-md border", vacia ? "border-dashed border-line" : "border-line")}
        style={vacia ? undefined : { height: escala ? altoDoc * escala : 200 }}
      >
        {vacia ? (
          <p className="p-4 text-sm text-muted">La vista de impresión aparece cuando tildás al menos una etiqueta.</p>
        ) : (
          escala > 0 && (
            <iframe
              title="Vista de impresión de las etiquetas"
              srcDoc={htmlDeEtiquetas(muestra, plantilla, pie)}
              sandbox=""
              tabIndex={-1}
              style={{
                width: hoja.ancho,
                height: altoDoc,
                border: 0,
                transform: `scale(${escala})`,
                transformOrigin: "0 0",
                display: "block",
                marginInline: plantilla === "rollo" && ancho > hoja.ancho ? (ancho - hoja.ancho) / 2 : undefined,
              }}
            />
          )
        )}
      </div>
      {!vacia && (
        <p className="text-xs text-muted">
          {plantilla === "a4"
            ? `${fmtNumberAR(seleccion.length)} ${seleccion.length === 1 ? "etiqueta" : "etiquetas"} en ${fmtNumberAR(hojas)} ${hojas === 1 ? "hoja" : "hojas"}` +
              (resto > 0 ? ": se ve la primera hoja." : ".")
            : `${fmtNumberAR(seleccion.length)} ${seleccion.length === 1 ? "etiqueta" : "etiquetas"}, una por vez` +
              (resto > 0 ? `: se ven las primeras ${MUESTRA_ROLLO}.` : ".")}
        </p>
      )}
    </section>
  );
}
