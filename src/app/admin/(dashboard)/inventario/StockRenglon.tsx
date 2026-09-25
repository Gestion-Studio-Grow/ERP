"use client";

// STOCK DEL DISEÑO NUEVO («Renglón»): la planilla de la cámara pasada en limpio. Una tabla densa en
// la PC (stock, producto, estado, mínimo, costo, valor) y renglones de dos líneas en el celular,
// con el stock arriba a la izquierda como el peso en el ticket de la balanza. Lo que está mal va
// primero; cada fila tiene «Contar» a mano (y la letra «c» con el teclado), porque el que mira esta
// pantalla suele estar parado frente a la heladera. La fila abre sus movimientos. Al pie, el total
// de la planilla como el total de un ticket, sólo para quien ve costos. Filtros, orden y página en la
// URL; los resuelve el servidor (stock-core.ts). Sólo con «Diseño nuevo» prendido.

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Marca, Plata, Rotulo, buttonClasses, chipLinkAtributos, fmtMoneyARS, type TipoMarca } from "@/components/ui";
import { Tabla, type ColumnaTabla, type TeclaDeFila } from "@/components/ui/Tabla";
import { MenuMas } from "@/components/ui/MenuMas";
import { hrefConParametros } from "@/components/ui/tabla-core";
import { formatearCantidad } from "@/lib/pos-peso";
import { CORTE_CATEGORIAS } from "@/lib/carniceria/cortes";
import {
  TAMANIO_PAGINA_STOCK,
  VISTAS_STOCK,
  VISTA_STOCK_ETIQUETA,
  estadoDeStock,
  unidadCorta,
  type EstadoDeStock,
  type FilaDeStock,
  type VistaStock,
} from "./stock-core";

/** La fila con sus dos destinos ya armados en el servidor (según las apps que la persona abre). */
export type FilaDeStockConEnlaces = FilaDeStock & {
  contar: string | null;
  movimientos: string | null;
};

// Forma + palabra: se lee igual en claro, en oscuro y sin color. «En orden» no lleva marca: callado.
const ESTADO: Record<Exclude<EstadoDeStock, "en-orden">, { marca: TipoMarca; texto: string }> = {
  negativo: { marca: "atencion", texto: "En negativo" },
  "stock-bajo": { marca: "medias", texto: "Stock bajo" },
  "sin-costo": { marca: "pendiente", texto: "Sin costo" },
};

const GONDOLA = new Map(CORTE_CATEGORIAS.map((g) => [g.id, g.label]));

export type StockRenglonProps = {
  filas: FilaDeStockConEnlaces[];
  coinciden: number;
  conBusqueda: number;
  total: number;
  pagina: number;
  paginas: number;
  porVista: Record<VistaStock, number>;
  q: string;
  vista: VistaStock | null;
  conCostos: boolean;
  carniceria: boolean;
  /** La valuación de TODO el stock (no de la página): la del resumen de siempre. */
  valuacionTotal: number;
  /** Productos con stock y sin costo (la valuación queda corta). */
  sinCosto: number;
  /** Lo que en la PC está arriba («Cargar merma», «Movimientos») y en el celular va al «⋯» de la lista. */
  masAcciones?: { etiqueta: string; href: string }[];
};

const cantidad = (f: FilaDeStock, n: number) => `${formatearCantidad(n)} ${unidadCorta(f.unit)}`;

export default function StockRenglon({
  filas,
  coinciden,
  conBusqueda,
  total,
  pagina,
  paginas,
  porVista,
  q,
  vista,
  conCostos,
  carniceria,
  valuacionTotal,
  sinCosto,
  masAcciones = [],
}: StockRenglonProps) {
  const ruta = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  const con = (cambios: Record<string, string | null>) => hrefConParametros(ruta, sp, cambios);
  const orden = sp.get("orden");
  const buscando = q !== "" || vista !== null;
  const hayMinimo = filas.some((f) => f.minimo != null);
  const uno = carniceria ? "corte" : "producto";
  const varios = carniceria ? "cortes" : "productos";

  const columnas: ColumnaTabla<FilaDeStockConEnlaces>[] = [
    {
      clave: "stock",
      titulo: "Stock",
      ordenable: true,
      alinear: "derecha",
      movil: "folio",
      className: "@max-[40rem]:text-left!",
      celda: (f) => (
        <span className={`whitespace-nowrap tabular-nums ${f.negative ? "font-semibold text-danger" : "text-strong"}`}>
          {cantidad(f, f.stock)}
        </span>
      ),
    },
    {
      clave: "nombre",
      titulo: carniceria ? "Corte" : "Producto",
      ordenable: true,
      movil: "asunto",
      celda: (f) => (
        <span className="block min-w-0 truncate">
          <span className="font-semibold text-strong">{f.name}</span>
          {f.gondola && <span className="ml-2 text-xs text-muted @max-[40rem]:hidden">{GONDOLA.get(f.gondola)}</span>}
        </span>
      ),
    },
    {
      clave: "estado",
      titulo: "Estado",
      movil: "detalle",
      celda: (f) => {
        const e = estadoDeStock(f, conCostos);
        const minimo = f.minimo != null ? `mín. ${cantidad(f, f.minimo)}` : null;
        if (e === "en-orden") return minimo ? <span className="hidden text-muted @max-[40rem]:inline">{minimo}</span> : null;
        return (
          <span className="inline-flex flex-wrap items-baseline gap-x-2">
            <Marca tipo={ESTADO[e].marca}>{ESTADO[e].texto}</Marca>
            {minimo && <span className="hidden text-muted @max-[40rem]:inline">{minimo}</span>}
          </span>
        );
      },
    },
    ...(hayMinimo
      ? [
          {
            clave: "minimo",
            titulo: "Mínimo",
            alinear: "derecha" as const,
            movil: "oculta" as const,
            celda: (f: FilaDeStockConEnlaces) =>
              f.minimo != null ? <span className="whitespace-nowrap tabular-nums text-muted">{cantidad(f, f.minimo)}</span> : null,
          },
        ]
      : []),
    ...(conCostos
      ? [
          {
            clave: "costo",
            titulo: "Costo",
            alinear: "derecha" as const,
            movil: "oculta" as const,
            celda: (f: FilaDeStockConEnlaces) =>
              f.sinCosto ? (
                <span className="text-muted">Sin costo</span>
              ) : (
                <span className="whitespace-nowrap tabular-nums text-muted">
                  {fmtMoneyARS(f.unitCost)}/{unidadCorta(f.unit)}
                </span>
              ),
          },
          {
            clave: "valor",
            titulo: "Valor",
            ordenable: true,
            alinear: "derecha" as const,
            movil: "plata" as const,
            celda: (f: FilaDeStockConEnlaces) => (f.sinCosto ? <span className="text-muted">—</span> : <Plata valor={f.valuation} />),
          },
        ]
      : []),
    {
      clave: "contar",
      titulo: "",
      movil: "tecla",
      celda: (f) =>
        f.contar ? (
          <Link
            href={f.contar}
            // La tecla habla en voz baja salvo donde hace falta: llena si está en negativo, con borde
            // si está bajo el mínimo, sin borde en el resto (19 teclas iguales eran ruido).
            className={buttonClasses(f.negative ? "solid" : f.belowLowStock ? "outline" : "ghost", "md")}
            aria-label={`Contar ${f.name}`}
          >
            Contar
          </Link>
        ) : null,
    },
  ];

  const teclas: TeclaDeFila<FilaDeStockConEnlaces>[] = filas.some((f) => f.contar)
    ? [{ letra: "c", que: "contar", hacer: (f) => f.contar && router.push(f.contar), aplica: (f) => f.contar != null }]
    : [];

  const desde = coinciden === 0 ? 0 : (pagina - 1) * TAMANIO_PAGINA_STOCK + 1;
  const hasta = Math.min(pagina * TAMANIO_PAGINA_STOCK, coinciden);
  const cuenta =
    coinciden === 0
      ? null
      : paginas > 1
        ? `${desde}–${hasta} de ${coinciden}`
        : `${coinciden} ${coinciden === 1 ? uno : varios}${buscando ? ` de ${total}` : ""}`;

  const vacio = (
    <p>
      Ningún {uno} coincide{q ? ` con «${q}»` : ""}
      {vista ? ` en «${VISTA_STOCK_ETIQUETA[vista]}»` : ""}.{" "}
      <Link href={ruta} className="font-medium text-accent underline-offset-2 hover:underline">
        Ver todos
      </Link>
    </p>
  );

  const vistas = VISTAS_STOCK.filter((v) => (v !== "sin-costo" || conCostos) && (porVista[v] > 0 || vista === v));

  // Arriba de la lista, en el celular: buscar + ⇅ + ⋯ en una fila y las vistas en otra.
  const barra = (
    <>
      <form method="get" action={ruta} role="search" className="flex min-w-0 flex-1 gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Buscar {uno} por nombre</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={carniceria ? "Buscar corte… (ej. entraña)" : "Buscar producto…"}
            autoComplete="off"
            enterKeyHint="search"
            className="h-11 w-full rounded-md border border-line-strong bg-surface-raised px-3 text-base text-strong placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
        </label>
        {vista && <input type="hidden" name="vista" value={vista} />}
        {orden && <input type="hidden" name="orden" value={orden} />}
        {/* En el celular busca la tecla «Buscar» del teclado; el botón queda para la PC. */}
        <button type="submit" className={buttonClasses("outline", "md") + " max-sm:hidden"}>
          Buscar
        </button>
      </form>
      {masAcciones.length > 0 && (
        <span className="order-last shrink-0 sm:hidden">
          <MenuMas etiqueta="Más de stock">
            {masAcciones.map((a) => (
              <Link key={a.href} href={a.href} role="menuitem">
                {a.etiqueta}
              </Link>
            ))}
          </MenuMas>
        </span>
      )}
    </>
  );
  const filtros = (
    <nav aria-label={`Vistas de ${varios}`} className="-mx-1 mb-2 flex items-center gap-2 overflow-x-auto px-1 pb-1">
      <Link href={con({ vista: null })} {...chipLinkAtributos(vista === null, "shrink-0")}>
        Todos
        <span data-parte="conteo">{conBusqueda}</span>
      </Link>
      {vistas.map((v) => (
        <Link key={v} href={con({ vista: v })} {...chipLinkAtributos(vista === v, "shrink-0")}>
          {VISTA_STOCK_ETIQUETA[v]}
          <span data-parte="conteo">{porVista[v]}</span>
        </Link>
      ))}
    </nav>
  );

  return (
    <>
      <Tabla<FilaDeStockConEnlaces>
        titulo={`Stock de ${varios}`}
        filas={filas}
        clave={(f) => f.productId}
        columnas={columnas}
        enlace={(f) => f.movimientos}
        teclas={teclas}
        vacio={vacio}
        cuenta={cuenta}
        teclado
        barra={barra}
        filtros={filtros}
        pie={
          paginas > 1 ? (
            <span className="flex gap-2">
              {pagina > 1 && (
                <Link href={con({ cursor: pagina - 1 === 1 ? null : String(pagina - 1) })} className={buttonClasses("ghost", "md")}>
                  Anteriores
                </Link>
              )}
              {pagina < paginas && (
                <Link href={con({ cursor: String(pagina + 1) })} className={buttonClasses("outline", "md")}>
                  Siguientes {Math.min(TAMANIO_PAGINA_STOCK, coinciden - pagina * TAMANIO_PAGINA_STOCK)}
                </Link>
              )}
            </span>
          ) : null
        }
      />

      {/* El total de la planilla, como el de un ticket: doble raya y la cifra a la derecha. Es de
          TODO el stock (no de lo filtrado) y sólo para quien ve costos. */}
      {conCostos && total > 0 && (
        <div className="mt-4 border-t-[3px] border-double border-line-strong pt-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <Rotulo as="p">Todo el stock vale, al costo de hoy</Rotulo>
            <Plata valor={valuacionTotal} />
          </div>
          {sinCosto > 0 && (
            <p className="mt-1 text-[13px] text-muted">
              Queda corto: {sinCosto === 1 ? "1 producto con stock no tiene" : `${sinCosto} productos con stock no tienen`} costo cargado.{" "}
              {vista !== "sin-costo" && (
                <Link href={con({ vista: "sin-costo" })} className="inline-flex min-h-11 items-center font-medium text-accent underline-offset-2 hover:underline">
                  Ver cuáles
                </Link>
              )}
            </p>
          )}
        </div>
      )}
    </>
  );
}
