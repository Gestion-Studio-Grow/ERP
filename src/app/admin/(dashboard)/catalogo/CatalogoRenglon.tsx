"use client";

// EL CATÁLOGO DEL DISEÑO NUEVO («Renglón»), para los mostradores (MAGRA, Shine, A Dos Manos): el
// pizarrón de precios pasado en limpio. Una tabla densa en la PC (producto, forma de venta, precio,
// stock, margen, estado) y renglones de dos líneas en el celular. La fila abre el cajón para
// corregir ese producto sin salir de la lista; tildar varios deja «Aumentar precios a los N», que
// lleva a «Actualizar precios» con esos ya tildados (la vista previa y el control de siempre).
// «Pausar» y «Eliminar» viven en «Más». Filtros, orden y página en la URL; los resuelve el
// servidor (lista-core.ts). Sólo con «Diseño nuevo» prendido; apagado, el catálogo de siempre.

import { useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Cajon, Marca, MenuMas, Plata, buttonClasses, chipLinkAtributos, type TipoMarca } from "@/components/ui";
import { Tabla, type ColumnaTabla } from "@/components/ui/Tabla";
import { hrefConParametros } from "@/components/ui/tabla-core";
import { deleteProduct, toggleProductActive } from "@/lib/catalog-actions";
import { formatearCantidad } from "@/lib/pos-peso";
import { CORTE_CATEGORIAS, effectiveCategoria } from "@/lib/carniceria/cortes";
import { FormularioAltaCorte, FormularioEditarCorte, type Corte } from "./CortesSection";
import type { VocabularioDelCatalogo } from "./vocabulario";
import { mayuscula } from "@/lib/texto";
import {
  TAMANIO_PAGINA,
  VISTAS,
  VISTA_ETIQUETA,
  estadoDe,
  hrefAumentarSeleccion,
  margenDe,
  precioDeVenta,
  type EstadoProducto,
  type Vista,
} from "./lista-core";

// Forma + palabra: se lee igual en claro, en oscuro y sin color.
const ESTADO: Record<EstadoProducto, { marca: TipoMarca; texto: string }> = {
  "a-la-venta": { marca: "hecho", texto: "A la venta" },
  "stock-bajo": { marca: "medias", texto: "Stock bajo" },
  "sin-precio": { marca: "atencion", texto: "Sin precio" },
  pausado: { marca: "anulado", texto: "Pausado" },
};

const GONDOLA = new Map(CORTE_CATEGORIAS.map((g) => [g.id, g.label]));

export type CatalogoRenglonProps = {
  filas: Corte[];
  coinciden: number;
  conBusqueda: number;
  total: number;
  pagina: number;
  paginas: number;
  porVista: Record<Vista, number>;
  q: string;
  vista: Vista | null;
  conCostos: boolean;
  vocabulario: VocabularioDelCatalogo;
  /** ¿Puede abrir «Actualizar precios»? Sin eso, no hay casillas ni lote. */
  puedeAumentar: boolean;
  /** El producto del cajón (`?editar=`), o null. */
  editando: Corte | null;
  /** El cajón de alta (`?agregar=1`). */
  agregando: boolean;
  /** Lo que en la PC está arriba («Actualizar precios», «Etiquetas») y en el celular va al «⋯» de la lista. */
  masAcciones?: { etiqueta: string; href: string }[];
};

/** Precio de venta como se lee en el pizarrón: «$28.600/kg» o «$10.900». */
function PrecioCelda({ c }: { c: Corte }) {
  const precio = precioDeVenta(c);
  if (precio == null || precio <= 0) return <span className="font-medium text-danger">Sin precio</span>;
  return (
    <span className="whitespace-nowrap">
      <Plata valor={precio} sinCentavos />
      {c.saleUnit === "WEIGHT" && <span className="text-muted">/kg</span>}
    </span>
  );
}

function StockCelda({ c }: { c: Corte }) {
  if (!c.trackStock) return <span className="text-muted">No se cuenta</span>;
  return (
    <span className="whitespace-nowrap tabular-nums">
      {formatearCantidad(c.stock)} {c.unit}
    </span>
  );
}

function MargenCelda({ c }: { c: Corte }) {
  const m = margenDe(c);
  if (c.cost == null) return <span className="text-muted">Sin costo</span>;
  if (m == null) return <span className="text-muted">—</span>;
  const pct = Math.round(m * 100);
  // Bajo 20 % se marca: es el mismo corte que usa el catálogo de siempre (`margenCorte`).
  return <span className={m < 0.2 ? "font-semibold text-danger tabular-nums" : "tabular-nums"}>{pct} %</span>;
}

export default function CatalogoRenglon({
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
  vocabulario,
  puedeAumentar,
  editando,
  agregando,
  masAcciones = [],
}: CatalogoRenglonProps) {
  const ruta = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const con = (cambios: Record<string, string | null>) => hrefConParametros(ruta, sp, cambios);
  // Abrir o cerrar un cajón NO es un filtro: no pierde la página (hrefConParametros la reinicia).
  const conCajon = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    const s = p.toString();
    return s ? `${ruta}?${s}` : ruta;
  };
  const cerrarCajon = () => router.replace(conCajon({ editar: null, agregar: null }), { scroll: false });
  const orden = sp.get("orden");
  const buscando = q !== "" || vista !== null;
  const { uno, varios } = vocabulario;
  const Uno = mayuscula(uno);

  const pausar = (c: Corte) => {
    const fd = new FormData();
    fd.set("id", c.id);
    fd.set("active", String(c.active));
    startTransition(() => toggleProductActive(fd));
  };
  const eliminar = (c: Corte) => {
    if (!confirm(`¿Eliminar «${c.name}»? Deja de verse en el mostrador y en la tienda.`)) return;
    const fd = new FormData();
    fd.set("id", c.id);
    startTransition(() => deleteProduct(fd));
  };

  const columnas: ColumnaTabla<Corte>[] = [
    {
      clave: "stock",
      titulo: "Stock",
      ordenable: true,
      alinear: "derecha",
      movil: "folio",
      // En la PC, a la derecha como toda cifra; en el celular es el folio de arriba a la izquierda
      // (la piel lo alinea a la derecha por `data-alinear`, de ahí el `!`).
      className: "@max-[40rem]:text-left!",
      celda: (c) => <StockCelda c={c} />,
    },
    {
      clave: "nombre",
      titulo: Uno,
      ordenable: true,
      movil: "asunto",
      celda: (c) => (
        // `block truncate`: en el celular un nombre largo («Aromatizante Textil Flores Blancas») se
        // corta con «…» y no se mete debajo de la tecla «Más».
        <span className="block min-w-0 truncate">
          <span className={c.active ? "font-semibold text-strong" : "font-semibold text-muted"}>{c.name}</span>
          {vocabulario.carniceria && (
            <span className="ml-2 text-xs text-muted @max-[40rem]:hidden">
              {GONDOLA.get(effectiveCategoria(c.name, c.category))}
            </span>
          )}
        </span>
      ),
    },
    {
      clave: "forma",
      titulo: "Venta",
      movil: "oculta",
      celda: (c) => <span className="whitespace-nowrap text-muted">{c.saleUnit === "WEIGHT" ? "Por kilo" : "Por unidad"}</span>,
    },
    {
      clave: "estado",
      titulo: "Estado",
      movil: "detalle",
      // En el celular va UNA línea de detalle: el estado y, para quien ve costos, el margen (en la
      // PC es columna propia; `@max-[40rem]` es el corte de contenedor de la tabla densa).
      celda: (c) => {
        const e = ESTADO[estadoDe(c)];
        return (
          <span className="inline-flex flex-wrap items-baseline gap-x-2">
            <Marca tipo={e.marca}>{e.texto}</Marca>
            {conCostos && (
              <span className="hidden @max-[40rem]:inline">
                {c.cost == null ? "Sin costo" : <>Margen <MargenCelda c={c} /></>}
              </span>
            )}
          </span>
        );
      },
    },
    ...(conCostos
      ? [
          {
            clave: "margen",
            titulo: "Margen",
            ordenable: true,
            alinear: "derecha" as const,
            movil: "oculta" as const,
            celda: (c: Corte) => <MargenCelda c={c} />,
          },
        ]
      : []),
    {
      clave: "precio",
      titulo: "Precio",
      ordenable: true,
      alinear: "derecha",
      movil: "plata",
      celda: (c) => <PrecioCelda c={c} />,
    },
    {
      clave: "mas",
      titulo: "",
      movil: "tecla",
      celda: (c) => (
        <MenuMas etiqueta={`Más acciones de ${c.name}`}>
          <Link href={conCajon({ editar: c.id, agregar: null })} scroll={false}>
            Corregir precio y datos
          </Link>
          {c.movimientos && <Link href={c.movimientos}>Ver movimientos de stock</Link>}
          <button type="button" onClick={() => pausar(c)}>
            {c.active ? "Pausar (no se vende)" : "Volver a vender"}
          </button>
          <button type="button" data-peligro onClick={() => eliminar(c)}>
            Eliminar
          </button>
        </MenuMas>
      ),
    },
  ];

  const desde = coinciden === 0 ? 0 : (pagina - 1) * TAMANIO_PAGINA + 1;
  const hasta = Math.min(pagina * TAMANIO_PAGINA, coinciden);
  const cuenta =
    coinciden === 0
      ? null
      : paginas > 1
        ? `${desde}–${hasta} de ${coinciden}`
        : `${coinciden} ${coinciden === 1 ? uno : varios}${buscando ? ` de ${total}` : ""}`;

  const vacio = buscando ? (
    <p>
      Ningún {uno} coincide{q ? ` con «${q}»` : ""}
      {vista ? ` en «${VISTA_ETIQUETA[vista]}»` : ""}.{" "}
      <Link href={ruta} className="font-medium text-accent underline-offset-2 hover:underline">
        Ver todos
      </Link>
    </p>
  ) : (
    <p>
      Todavía no hay {varios}. Cargá el primero con «Agregar {uno}» o todos juntos con la planilla de abajo; lo que cargues
      aparece en el mostrador y en la tienda.
    </p>
  );

  // «Sin costo» sólo para quien ve costos; las vistas vacías no se ofrecen (salvo la elegida).
  const vistas = VISTAS.filter((v) => (v !== "sin-costo" || conCostos) && (porVista[v] > 0 || vista === v));

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
            placeholder={vocabulario.carniceria ? "Buscar corte… (ej. entraña)" : `Buscar ${uno}…`}
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
          <MenuMas etiqueta="Más del catálogo">
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
          {VISTA_ETIQUETA[v]}
          <span data-parte="conteo">{porVista[v]}</span>
        </Link>
      ))}
    </nav>
  );

  return (
    <>
      <Tabla<Corte>
        titulo={mayuscula(varios)}
        filas={filas}
        clave={(c) => c.id}
        columnas={columnas}
        enlace={(c) => conCajon({ editar: c.id, agregar: null })}
        seleccion={puedeAumentar}
        lote={
          puedeAumentar
            ? (ids) => (
                <Link href={hrefAumentarSeleccion(ids)} className={buttonClasses("solid", "md")}>
                  Aumentar precios a {ids.length === 1 ? `este ${uno}` : `los ${ids.length}`}
                </Link>
              )
            : undefined
        }
        barra={barra}
        filtros={filtros}
        vacio={vacio}
        cuenta={cuenta}
        teclado
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
                  Siguientes {Math.min(TAMANIO_PAGINA, coinciden - pagina * TAMANIO_PAGINA)}
                </Link>
              )}
            </span>
          ) : null
        }
      />

      <Cajon
        abierto={editando !== null}
        onCerrar={cerrarCajon}
        titulo={editando?.name ?? ""}
        descripcion={
          editando ? (
            <span>
              {editando.saleUnit === "WEIGHT" ? "Por kilo" : "Por unidad"} · {ESTADO[estadoDe(editando)].texto}
            </span>
          ) : null
        }
      >
        {editando && (
          <FormularioEditarCorte
            key={editando.id}
            corte={editando}
            conCostos={conCostos}
            nombre={Uno}
            className="flex flex-col gap-3"
            alTerminar={cerrarCajon}
            enCajon={{ conGondola: vocabulario.carniceria }}
          />
        )}
      </Cajon>

      <Cajon abierto={agregando} onCerrar={cerrarCajon} titulo={`Agregar ${vocabulario.carniceria ? "un corte" : uno}`}>
        {agregando && (
          <FormularioAltaCorte vocabulario={vocabulario} conCostos={conCostos} className="flex flex-col gap-3" alTerminar={cerrarCajon} />
        )}
      </Cajon>
    </>
  );
}
