"use client";

// LA LISTA DE CLIENTES DEL DISEÑO NUEVO («Renglón»): la libreta de clientas, no una grilla de
// tarjetas. Una tabla densa en la PC y renglones de dos líneas en el celular; la fila entera abre
// la ficha. Arriba, buscar (nombre o teléfono) y la situación como vistas de la lista, con su
// número. Todo vive en la URL y lo resuelve el servidor (lista-core.ts): al navegador llega la
// página que se mira. Sólo con «Diseño nuevo» prendido; apagado, la lista de siempre.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Marca, buttonClasses, chipLinkAtributos, type TipoMarca } from "@/components/ui";
import { MenuMas } from "@/components/ui/MenuMas";
import { Tabla, type ColumnaTabla } from "@/components/ui/Tabla";
import { hrefConParametros } from "@/components/ui/tabla-core";
import { fmtShortDate, fmtTime } from "@/lib/datetime";
import { SEGMENTOS, SEGMENTO_ETIQUETA, type Segmento } from "@/lib/crm/segmentos";
import type { FilaCliente } from "./ClientesLista";
import { TAMANIO_PAGINA, ultimaVez } from "./lista-core";
import { EVENTO_FICHA, type PedidoFicha } from "./NuevaFicha";

// La forma dice en qué punto del ciclo está: vacía (todavía no vino), llena (viene), a medias (se
// está yendo), alerta (no volvió). Forma + palabra: se lee igual en claro, en oscuro y sin color.
const MARCA: Record<Segmento, TipoMarca> = {
  "sin-visitas": "pendiente",
  nueva: "info",
  frecuente: "hecho",
  "en-riesgo": "medias",
  perdida: "atencion",
};

export type ListaClientesProps = {
  filas: FilaCliente[];
  coinciden: number;
  total: number;
  pagina: number;
  paginas: number;
  porSituacion: Record<Segmento, number>;
  q: string;
  situacion: Segmento | null;
  visitaSingular: string;
  /** ¿El negocio da turnos (app Agenda)? Sin ella, la columna «Próximo turno» sería de otro rubro. */
  conTurnos: boolean;
  /** Las otras apps de Clientes que puede abrir (en el celular van al «⋯», no arriba de la lista). */
  atajos?: { etiqueta: string; href: string }[];
  puedeCrear?: boolean;
  /** Cuántos compraron dejando el teléfono y no tienen ficha. */
  sinFicha?: number;
};

const pedirFicha = (que: PedidoFicha) => window.dispatchEvent(new CustomEvent<PedidoFicha>(EVENTO_FICHA, { detail: que }));

export default function ClientesRenglon({
  filas,
  coinciden,
  total,
  pagina,
  paginas,
  porSituacion,
  q,
  situacion,
  visitaSingular,
  conTurnos,
  atajos = [],
  puedeCrear = false,
  sinFicha = 0,
}: ListaClientesProps) {
  const ruta = usePathname();
  const sp = useSearchParams();
  const con = (cambios: Record<string, string | null>) => hrefConParametros(ruta, sp, cambios);
  const orden = sp.get("orden");
  const buscando = q !== "" || situacion !== null;

  const todas: ColumnaTabla<FilaCliente>[] = [
    {
      clave: "ultima",
      titulo: "Última vez",
      ordenable: true,
      movil: "folio",
      celda: (f) => <span className="whitespace-nowrap tabular-nums">{ultimaVez(f.diasSinVenir, visitaSingular)}</span>,
    },
    {
      clave: "nombre",
      titulo: "Cliente",
      ordenable: true,
      movil: "asunto",
      celda: (f) => (
        <Link href={`/admin/clientes/${f.id}`} className="max-w-full truncate font-semibold text-strong hover:underline">
          {f.nombre}
        </Link>
      ),
    },
    {
      clave: "telefono",
      titulo: "Teléfono",
      movil: "oculta",
      celda: (f) => <span className="whitespace-nowrap tabular-nums text-muted">{f.telefono || "Sin teléfono"}</span>,
    },
    {
      clave: "situacion",
      titulo: "Situación",
      movil: "detalle",
      // En el celular la tabla muestra UNA línea de detalle: ahí van juntos la situación, el
      // teléfono y el próximo turno (en la PC son columnas propias; el `@max-[40rem]` es el
      // mismo corte de contenedor que usa la tabla densa en renglon.css).
      celda: (f) => (
        <span className="inline-flex flex-wrap items-baseline gap-x-2">
          <Marca tipo={MARCA[f.segmento]}>{SEGMENTO_ETIQUETA[f.segmento]}</Marca>
          <span className="hidden tabular-nums @max-[40rem]:inline">{f.telefono || "Sin teléfono"}</span>
          {f.proximoTurno && (
            <span className="hidden tabular-nums @max-[40rem]:inline">
              Turno {fmtShortDate(f.proximoTurno)} · {fmtTime(f.proximoTurno)}
            </span>
          )}
        </span>
      ),
    },
    {
      clave: "proximo",
      titulo: "Próximo turno",
      ordenable: true,
      movil: "oculta",
      celda: (f) =>
        f.proximoTurno ? (
          <span className="whitespace-nowrap tabular-nums">
            {fmtShortDate(f.proximoTurno)} · {fmtTime(f.proximoTurno)}
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      clave: "visitas",
      titulo: visitaSingular === "compra" ? "Compras" : "Visitas",
      ordenable: true,
      alinear: "derecha",
      movil: "plata",
      celda: (f) => (
        <span className="tabular-nums">
          {f.visitas}
          <span className="sr-only"> {visitaSingular === "compra" ? "compras" : "visitas"}</span>
        </span>
      ),
    },
  ];
  // En una carnicería no hay turnos: la columna quedaba llena de «—» y delataba otro rubro.
  const columnas = conTurnos ? todas : todas.filter((c) => c.clave !== "proximo");

  const desde = coinciden === 0 ? 0 : (pagina - 1) * TAMANIO_PAGINA + 1;
  const hasta = Math.min(pagina * TAMANIO_PAGINA, coinciden);
  const cuenta =
    coinciden === 0
      ? null
      : paginas > 1
        ? `${desde}–${hasta} de ${coinciden}`
        : `${coinciden} ${coinciden === 1 ? "cliente" : "clientes"}${buscando ? ` de ${total}` : ""}`;

  const vacio = buscando ? (
    <p>
      Nadie coincide{q ? ` con «${q}»` : ""}
      {situacion ? ` en «${SEGMENTO_ETIQUETA[situacion]}»` : ""}.{" "}
      <Link href={ruta} className="font-medium text-accent underline-offset-2 hover:underline">
        Ver todos
      </Link>
    </p>
  ) : (
    <p>Todavía no hay fichas. Se crean solas con el primer turno o la primera compra con teléfono.</p>
  );

  // La barra de la lista: buscar y, en el celular, ⇅ (lo pone la tabla) y ⋯ con lo que antes
  // ocupaba media pantalla arriba de la lista (atajos, «Nueva ficha», «Compraron sin ficha»).
  const hayMas = atajos.length > 0 || puedeCrear;
  const barra = (
    <>
      {/* Buscar: un formulario GET de verdad (anda sin JavaScript y el resultado queda en la URL). */}
      <form method="get" action={ruta} role="search" className="flex min-w-0 flex-1 gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Buscar por nombre o teléfono</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Nombre o teléfono…"
            autoComplete="off"
            enterKeyHint="search"
            className="h-11 w-full rounded-md border border-line-strong bg-surface-raised px-3 text-base text-strong placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
        </label>
        {situacion && <input type="hidden" name="situacion" value={situacion} />}
        {orden && <input type="hidden" name="orden" value={orden} />}
        {/* En el celular busca la tecla «Buscar» del teclado; el botón queda para la PC. */}
        <button type="submit" className={buttonClasses("outline", "md") + " max-sm:hidden"}>
          Buscar
        </button>
      </form>
      {hayMas && (
        <span className="order-last shrink-0 sm:hidden">
          <MenuMas etiqueta="Más de clientes">
            {puedeCrear && (
              <button type="button" role="menuitem" onClick={() => pedirFicha("nueva")}>
                Nueva ficha
              </button>
            )}
            {puedeCrear && sinFicha > 0 && (
              <button type="button" role="menuitem" onClick={() => pedirFicha("sin")}>
                Compraron sin ficha ({sinFicha})
              </button>
            )}
            {atajos.map((a) => (
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
    <nav aria-label="Situación de los clientes" className="-mx-1 mb-2 flex items-center gap-2 overflow-x-auto px-1 pb-1">
      <span className="shrink-0 text-sm text-muted max-sm:sr-only">Situación</span>
      <Link href={con({ situacion: null })} {...chipLinkAtributos(situacion === null, "shrink-0")}>
        Todas
        <span data-parte="conteo">{SEGMENTOS.reduce((n, s) => n + porSituacion[s], 0)}</span>
      </Link>
      {SEGMENTOS.map((s) =>
        porSituacion[s] === 0 && situacion !== s ? null : (
          <Link key={s} href={con({ situacion: s })} {...chipLinkAtributos(situacion === s, "shrink-0")}>
            {SEGMENTO_ETIQUETA[s]}
            <span data-parte="conteo">{porSituacion[s]}</span>
          </Link>
        ),
      )}
    </nav>
  );

  return (
    <>
      <Tabla<FilaCliente>
        titulo="Clientes"
        filas={filas}
        clave={(f) => f.id}
        columnas={columnas}
        enlace={(f) => `/admin/clientes/${f.id}`}
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
                  Siguientes {Math.min(TAMANIO_PAGINA, coinciden - pagina * TAMANIO_PAGINA)}
                </Link>
              )}
            </span>
          ) : null
        }
      />
      <details className="mt-3 text-sm text-muted">
        <summary className="inline-flex min-h-11 cursor-pointer select-none items-center font-medium text-body">
          ¿Cómo se calcula la situación?
        </summary>
        <p className="mt-1">
          La situación sale de cada cuánto viene cada uno: «En riesgo» pasó entre 1,5 y 3 veces su ciclo sin volver; «No
          volvió», más de 3. Se mira el último año y medio.
        </p>
      </details>
    </>
  );
}
