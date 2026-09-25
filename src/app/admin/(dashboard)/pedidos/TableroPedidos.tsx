"use client";

// ============================================================================
// PEDIDOS — el tablero vivo (diseño nuevo «Renglón»).
// ============================================================================
//
// La carnicera con guantes y la balanza al lado no lee cinco botones del mismo peso por pedido:
// ve UN renglón por pedido con el riel de pasos (Recibido › En preparación › Listo › Entregado),
// si está cobrado, y UNA tecla del paso que sigue. Todo lo demás del pedido (lo que lleva con la
// cuenta, pesar y ajustar, link de pago, anular) está en el cajón que abre el renglón.
//
//   · Filtros en la URL (`?estado=listos&canal=pedido&q=478`): chips con conteo, que cuentan lo que
//     muestran. Se filtra acá, sobre los pedidos que ya llegaron (son los abiertos, todos: es el
//     trabajo pendiente), así que cambiar de filtro es instantáneo.
//   · En lote: seleccionar (casilla, Mayúsculas para un rango, ⇧A todo lo filtrado) y avanzar un
//     paso a todos («Preparar · 3», «Marcar listo · 2») o avisar por WhatsApp uno por uno.
//   · Teclado: ↑↓ o j/k mueven, x selecciona, Enter abre el pedido, p hace el paso que sigue,
//     / busca, Esc limpia. (La tabla densa hace lo suyo; acá, Enter, p y /.)
//   · `?pedido=<id>` abre el cajón de ese pedido (sirve de enlace desde el Inicio).
//
// Las acciones son las de la bandeja de siempre, con los mismos campos: no cambia ninguna regla.

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { advanceOrderStatus, registrarAvisoWhatsApp } from "@/lib/order-actions";
import { Tabla, type ColumnaTabla } from "@/components/ui/Tabla";
import { MenuMas } from "@/components/ui/MenuMas";
import { Dialogo } from "@/components/ui/Cajon";
import { teclaDeLaPantalla } from "@/components/ui/tecla-de-pantalla";
import { Button, Chip, Icono, Marca, Plata, Renglon, RielDeEstados, hrefConParametros, ordenDesdeUrl } from "@/components/ui";
import { useToast } from "../ToastProvider";
import PedidoCajon, { type SeccionDelCajon } from "./PedidoCajon";
import AnularDelPedido from "./AnularDelPedido";
import { rechazoDeAccion, sinRespuestaAlAvanzar } from "./avanzar-pedido";
import { esRedirectDeNext } from "./formularios-del-pedido";
import {
  ESTADOS_DEL_FILTRO,
  ETIQUETA_DEL_ESTADO,
  ORDENABLES,
  conteosDelTablero,
  filtrarPedidos,
  leerFiltrosDelTablero,
  loteDelTablero,
  ordenarPedidos,
  quedoElPedido,
  resumenDelLote,
  rielDelPedido,
  teclaDelPedido,
  textoDeLaTecla,
  type PedidoCerrado,
  type PedidoDelTablero,
} from "./pedidos-core";
import type { ExtraDelPedido } from "./tablero.server";

type Anulacion = { motivoObligatorio: boolean } | null;

// ── La tecla del renglón ─────────────────────────────────────────────────────

function TeclaDeFila({
  p,
  extra,
  puedeOperar,
  anulacion,
  onAbrir,
}: {
  p: PedidoDelTablero;
  extra: ExtraDelPedido | undefined;
  puedeOperar: boolean;
  anulacion: Anulacion;
  onAbrir: (id: string, seccion?: SeccionDelCajon) => void;
}) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [pending, startTransition] = useTransition();
  const t = teclaDelPedido(p);

  let tecla: React.ReactNode = null;
  if (t && puedeOperar) {
    const comun = { "data-tecla-de": p.id } as const;
    if (t.tipo === "avanzar") {
      tecla = (
        <Button
          {...comun}
          size="sm"
          variant="outline"
          disabled={pending}
          estado={pending ? "cargando" : undefined}
          aria-label={`${t.verbo}: ${p.cliente}, pedido #${p.code}`}
          onClick={() => {
            const fd = new FormData();
            fd.set("id", p.id);
            startTransition(async () => {
              let r: unknown;
              try {
                r = await advanceOrderStatus(fd);
              } catch (e) {
                if (esRedirectDeNext(e)) throw e;
                showError(sinRespuestaAlAvanzar(t.verbo, p.code, navigator.onLine));
                return;
              }
              const rechazo = rechazoDeAccion(r);
              if (rechazo) showError(rechazo);
              else showSuccess(quedoElPedido(t.verbo, p.code));
              router.refresh();
            });
          }}
        >
          {t.verbo}
        </Button>
      );
    } else if (t.tipo === "avisar" && p.avisoWa) {
      tecla = (
        <a
          {...comun}
          href={p.avisoWa}
          target="_blank"
          rel="noopener noreferrer"
          data-ui="button"
          data-variant="outline"
          data-size="sm"
          aria-label={`Avisar por WhatsApp: ${p.cliente}, pedido #${p.code}`}
          className="inline-flex h-11 items-center justify-center rounded-md border border-line-strong px-3 text-sm font-medium sm:h-9"
          onClick={() => {
            void registrarAvisoWhatsApp(p.id, "pedido-listo")
              .catch(() => undefined)
              .finally(() => router.refresh());
          }}
        >
          Avisar
        </a>
      );
    } else {
      tecla = (
        <Button
          {...comun}
          size="sm"
          variant={t.tipo === "cobrar" ? "solid" : "outline"}
          aria-label={`${textoDeLaTecla(t)}: ${p.cliente}, pedido #${p.code}`}
          onClick={() => onAbrir(p.id, "cobro")}
        >
          {textoDeLaTecla(t)}
        </Button>
      );
    }
  }

  return (
    <span className="inline-flex items-center justify-end gap-0.5">
      {tecla}
      <MenuMas etiqueta={`Más acciones del pedido #${p.code}`}>
        <button type="button" onClick={() => onAbrir(p.id)}>
          Ver el pedido
        </button>
        {extra?.whatsapp && (
          <a href={extra.whatsapp} target="_blank" rel="noopener noreferrer">
            Escribirle por WhatsApp
          </a>
        )}
        {puedeOperar && extra?.ajustar && (
          <button type="button" onClick={() => onAbrir(p.id, "ajustar")}>
            {extra.ajustar.items.some((i) => i.saleUnit === "WEIGHT") ? "Pesar y ajustar" : "Ajustar el pedido"}
          </button>
        )}
        {puedeOperar && extra?.link && (
          <button type="button" onClick={() => onAbrir(p.id, "link")}>
            Mandar link de pago
          </button>
        )}
        {puedeOperar && anulacion && (
          <button type="button" data-peligro onClick={() => onAbrir(p.id, "anular")}>
            Anular…
          </button>
        )}
      </MenuMas>
    </span>
  );
}

// ── En lote ──────────────────────────────────────────────────────────────────

function LoteDePedidos({
  seleccionados,
  limpiar,
  onAvisar,
}: {
  seleccionados: PedidoDelTablero[];
  limpiar: () => void;
  onAvisar: (ids: string[]) => void;
}) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [corriendo, setCorriendo] = useState<{ verbo: string; hechos: number; total: number } | null>(null);
  const lote = loteDelTablero(seleccionados);

  async function avanzarTodos(verbo: string, ids: string[]) {
    setCorriendo({ verbo, hechos: 0, total: ids.length });
    const resultados: { code: number; error: string | null }[] = [];
    // De a uno y en orden: cada paso es un compare-and-set en el servidor; si otra pantalla ya
    // movió uno, ése vuelve con su motivo y los demás siguen.
    for (const id of ids) {
      const p = seleccionados.find((x) => x.id === id);
      if (!p) continue;
      const fd = new FormData();
      fd.set("id", id);
      let error: string | null;
      try {
        error = rechazoDeAccion(await advanceOrderStatus(fd));
      } catch (e) {
        if (esRedirectDeNext(e)) throw e;
        error = sinRespuestaAlAvanzar(verbo, p.code, navigator.onLine);
      }
      resultados.push({ code: p.code, error });
      setCorriendo({ verbo, hechos: resultados.length, total: ids.length });
    }
    const r = resumenDelLote(verbo, resultados);
    if (r.conError) showError(r.texto);
    else showSuccess(r.texto);
    setCorriendo(null);
    limpiar();
    router.refresh();
  }

  if (lote.avanzar.length === 0 && lote.avisar.length === 0) {
    return <span className="text-sm text-muted">Estos no tienen un paso en común: abrilos de a uno.</span>;
  }
  return (
    <>
      {lote.avanzar.map((g, i) => (
        <Button
          key={g.verbo}
          size="sm"
          variant={i === 0 ? "solid" : "outline"}
          disabled={corriendo !== null}
          estado={corriendo?.verbo === g.verbo ? "cargando" : undefined}
          onClick={() => void avanzarTodos(g.verbo, g.ids)}
        >
          {corriendo?.verbo === g.verbo ? `${g.verbo}: ${corriendo.hechos} de ${corriendo.total}` : `${g.verbo} · ${g.ids.length}`}
        </Button>
      ))}
      {lote.avisar.length > 0 && (
        <Button size="sm" variant="outline" disabled={corriendo !== null} onClick={() => onAvisar(lote.avisar)}>
          Avisar por WhatsApp · {lote.avisar.length}
        </Button>
      )}
    </>
  );
}

/** Avisar a varios: el WhatsApp lo abre una persona, uno por uno (el sistema no manda nada solo). */
function AvisarUnoPorUno({ pedidos, onCerrar }: { pedidos: PedidoDelTablero[]; onCerrar: () => void }) {
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set());
  return (
    <Dialogo
      abierto={pedidos.length > 0}
      onCerrar={onCerrar}
      titulo="Avisar por WhatsApp"
      descripcion="Uno por uno, desde tu WhatsApp: tocá cada uno y mandá el mensaje que ya está escrito."
      pie={
        <Button onClick={onCerrar} variant={abiertos.size === pedidos.length ? "solid" : "outline"}>
          {abiertos.size === pedidos.length ? "Listo" : `Terminar (${abiertos.size} de ${pedidos.length})`}
        </Button>
      }
    >
      <div>
        {pedidos.map((p) => (
          <Renglon
            key={p.id}
            folio={`#${p.code}`}
            titulo={p.cliente}
            detalle={p.horario?.texto ?? (p.entrega === "DELIVERY" ? "Envío" : "Retira")}
            tecla={
              abiertos.has(p.id) ? (
                <Marca tipo="hecho">Abierto</Marca>
              ) : (
                <a
                  href={p.avisoWa ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-ui="button"
                  data-variant="outline"
                  data-size="sm"
                  className="inline-flex h-11 items-center rounded-md border border-line-strong px-3 text-sm font-medium sm:h-9"
                  onClick={() => {
                    setAbiertos((s) => new Set(s).add(p.id));
                    void registrarAvisoWhatsApp(p.id, "pedido-listo").catch(() => undefined);
                  }}
                >
                  Abrir WhatsApp
                </a>
              )
            }
          />
        ))}
      </div>
    </Dialogo>
  );
}

// ── Estado del pedido, en la fila ────────────────────────────────────────────

function EstadoDeFila({ p, comercio }: { p: PedidoDelTablero; comercio: boolean }) {
  const riel = rielDelPedido(p, comercio);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {/* En el celular no entra el riel: queda la palabra del paso, y la entrega y el cobro van en
          la misma línea (en la PC tienen su columna). */}
      <span className="max-sm:hidden">
        <RielDeEstados pasos={riel.pasos} hechos={riel.hechos} />
      </span>
      <Marca tipo={riel.tipo}>{riel.palabra}</Marca>
      <span className="text-muted sm:hidden">
        {[p.horario?.texto ?? (p.entrega === "DELIVERY" ? "Envío" : "Retira"), p.status !== "DELIVERED" ? (p.cobrado ? "cobrado" : "a cobrar") : null]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </span>
  );
}

function Entrega({ p }: { p: PedidoDelTablero }) {
  const texto = p.horario?.texto ?? (p.entrega === "DELIVERY" ? "Envío" : "Retira");
  return (
    <span className="block max-w-72 truncate">
      <span className={p.horario?.esHoy ? "font-semibold text-strong" : undefined}>{texto}</span>
      {p.entrega === "DELIVERY" && p.direccion && <span className="text-muted"> · {p.direccion}</span>}
    </span>
  );
}

// ── El tablero ───────────────────────────────────────────────────────────────

export default function TableroPedidos({
  abiertos,
  cerrados,
  extras,
  comercio,
  puedeOperar,
  anulacion,
  simulacion,
  tomarPedido,
}: {
  abiertos: PedidoDelTablero[];
  cerrados: PedidoCerrado[];
  extras: Record<string, ExtraDelPedido>;
  comercio: boolean;
  puedeOperar: boolean;
  anulacion: Anulacion;
  simulacion: boolean;
  /** «Tomar un pedido» (Vender en modo pedido), si esta persona puede. */
  tomarPedido: string | null;
}) {
  const params = useSearchParams();
  const ruta = usePathname();
  const filtros = leerFiltrosDelTablero(params);
  const [q, setQ] = useState(filtros.q);
  const buscador = useRef<HTMLInputElement>(null);
  const [seccion, setSeccion] = useState<SeccionDelCajon>(null);
  const [avisar, setAvisar] = useState<string[]>([]);
  const [anularCerrado, setAnularCerrado] = useState<PedidoCerrado | null>(null);
  const empujado = useRef(false);

  // La URL manda: se cambia sin ir al servidor (los pedidos ya están acá).
  const cambiarUrl = (cambios: Record<string, string | null>, modo: "reemplazar" | "empujar" = "reemplazar") => {
    const href = hrefConParametros(ruta, new URLSearchParams(window.location.search), cambios);
    if (modo === "empujar") window.history.pushState(null, "", href);
    else window.history.replaceState(null, "", href);
  };

  // Son los pedidos abiertos de un negocio (decenas): filtrar y ordenar en cada pintada no pesa.
  const orden = ordenDesdeUrl(params.get("orden"), ORDENABLES);
  const conteos = conteosDelTablero(abiertos, filtros.canal);
  const visibles = ordenarPedidos(filtrarPedidos(abiertos, { ...filtros, q }), orden);

  const idAbierto = params.get("pedido");
  const pedidoAbierto = idAbierto ? (abiertos.find((p) => p.id === idAbierto) ?? null) : null;

  const abrir = (id: string, sec: SeccionDelCajon = null) => {
    setSeccion(sec);
    empujado.current = true;
    cambiarUrl({ pedido: id }, "empujar");
  };
  const cerrar = () => {
    setSeccion(null);
    if (empujado.current) {
      empujado.current = false;
      window.history.back();
    } else cambiarUrl({ pedido: null });
  };

  // Enter abre el pedido con foco de fila (la tabla mueve el foco; el cajón lo abre el tablero),
  // «/» va al buscador. Enter con el foco de fila abre el pedido: lo hace la tabla (`onAbrir`).
  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => {
      if (!teclaDeLaPantalla(e)) return;
      if (e.key !== "/") return;
      e.preventDefault();
      buscador.current?.focus();
    };
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, []);

  const columnas: ColumnaTabla<PedidoDelTablero>[] = [
    {
      clave: "numero",
      titulo: "#",
      ordenable: true,
      movil: "folio",
      celda: (p) => (
        <span className="tabular-nums">
          #{p.code} · {p.cuando}
        </span>
      ),
    },
    {
      clave: "cliente",
      titulo: "Cliente",
      ordenable: true,
      movil: "asunto",
      celda: (p) => (
        <button type="button" onClick={() => abrir(p.id)} className="max-w-full truncate text-left font-semibold text-strong hover:underline">
          {p.cliente}
          {p.canal === "COUNTER" && <span className="font-normal text-muted"> · mostrador</span>}
        </button>
      ),
    },
    { clave: "estado", titulo: "Estado", movil: "detalle", celda: (p) => <EstadoDeFila p={p} comercio={comercio} /> },
    { clave: "entrega", titulo: "Retiro / envío", ordenable: true, movil: "oculta", celda: (p) => <Entrega p={p} /> },
    { clave: "lineas", titulo: "Líneas", alinear: "derecha", movil: "oculta", celda: (p) => p.lineas.length },
    { clave: "total", titulo: "Total", alinear: "derecha", ordenable: true, movil: "plata", celda: (p) => <Plata valor={p.total} /> },
    {
      clave: "cobro",
      titulo: "Cobro",
      movil: "oculta",
      celda: (p) =>
        p.cobrado ? (
          <Marca tipo="hecho">Cobrado</Marca>
        ) : (
          <Marca tipo={p.status === "DELIVERED" ? "atencion" : "pendiente"}>A cobrar</Marca>
        ),
    },
    {
      clave: "paso",
      titulo: "Paso que sigue",
      alinear: "derecha",
      movil: "tecla",
      celda: (p) => <TeclaDeFila p={p} extra={extras[p.id]} puedeOperar={puedeOperar} anulacion={anulacion} onAbrir={abrir} />,
    },
  ];

  const hayFiltro = filtros.estado !== "abiertos" || filtros.canal !== null || q !== "";
  const limpiarFiltros = () => {
    setQ("");
    cambiarUrl({ estado: null, canal: null, q: null });
  };

  const sinAbiertos = abiertos.length === 0 && filtros.estado !== "cerrados";
  const vacio = (
      <span className="flex flex-wrap items-center gap-3">
        Nada con estos filtros.
        <Button size="sm" variant="outline" onClick={limpiarFiltros}>
          Ver todos los abiertos
        </Button>
      </span>
    );

  const nadaAbierto = (
    <p data-ui="vacio" className="flex flex-wrap items-center gap-3 border-y border-line py-4 text-sm text-body">
      {comercio
        ? "No hay pedidos abiertos. Los de la tienda online y los que tomás en Vender aparecen acá."
        : "No hay pedidos abiertos. Lo que cobrás en el mostrador para retirar o enviar aparece acá."}
      {tomarPedido && (
        <a href={tomarPedido} data-ui="button" data-variant="outline" data-size="sm" className="inline-flex h-11 items-center rounded-md border border-line-strong px-3 text-sm font-medium sm:h-9">
          Tomar un pedido
        </a>
      )}
    </p>
  );

  const estados = ESTADOS_DEL_FILTRO.filter(
    (e) => e === "abiertos" || e === "cerrados" || e === filtros.estado || conteos[e] > 0,
  );

  // El buscador va en la barra de la lista (en el celular, en una fila con ⇅), sólo con los
  // abiertos: la búsqueda no filtra los cerrados.
  const buscadorEl = (
    <div className="relative min-w-0 flex-1 sm:ml-auto sm:w-80 sm:flex-none">
      <label htmlFor="buscar-pedido" className="sr-only">
        Buscar por cliente, teléfono o número
      </label>
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
        <Icono nombre="buscar" />
      </span>
      <input
        ref={buscador}
        id="buscar-pedido"
        data-ui="input"
        type="search"
        value={q}
        placeholder="Cliente, teléfono o número"
        autoComplete="off"
        aria-keyshortcuts="/"
        // La piel le pone su propio relleno al campo: el lugar de la lupa va en línea.
        style={{ paddingInlineStart: "2.5rem" }}
        className="h-11 w-full rounded-md border border-line-strong bg-surface-raised pr-3 text-sm text-strong placeholder:text-faint"
        onChange={(e) => {
          setQ(e.target.value);
          cambiarUrl({ q: e.target.value.trim() || null });
        }}
      />
    </div>
  );

  return (
    <section aria-label="Pedidos" data-tablero="pedidos">
      {/* En el celular, estado y canal van en UNA fila con scroll propio (antes, dos filas). */}
      <div data-ui="filtros" role="toolbar" aria-label="Filtrar los pedidos">
        <div role="group" aria-label="Estado" className="flex max-w-full gap-1.5 overflow-x-auto pb-0.5">
          {estados.map((e) => (
            <Chip
              key={e}
              prendido={filtros.estado === e}
              conteo={e === "cerrados" ? undefined : conteos[e]}
              onClick={() => cambiarUrl({ estado: e === "abiertos" ? null : e })}
              className="shrink-0"
            >
              {ETIQUETA_DEL_ESTADO[e]}
            </Chip>
          ))}
        </div>
        {filtros.estado !== "cerrados" && !sinAbiertos && (
          <div role="group" aria-label="Canal" className="flex gap-1.5 max-sm:shrink-0 max-sm:border-l max-sm:border-line max-sm:pl-2">
            {([
              [null, "Todos"],
              ["pedido", "Pedidos"],
              ["mostrador", "Mostrador"],
            ] as const).map(([c, etiqueta]) => (
              <Chip key={etiqueta} prendido={filtros.canal === c} onClick={() => cambiarUrl({ canal: c })}>
                {etiqueta}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {sinAbiertos ? (
        nadaAbierto
      ) : filtros.estado === "cerrados" ? (
        <Tabla<PedidoCerrado>
          titulo="Pedidos cerrados recientes"
          filas={cerrados}
          clave={(p) => p.id}
          teclado={false}
          vacio="Todavía no hay pedidos cerrados."
          cuenta={`Los últimos ${cerrados.length} cerrados`}
          columnas={[
            { clave: "numero", titulo: "#", movil: "folio", celda: (p) => <span className="tabular-nums">#{p.code} · {p.cuando}</span> },
            { clave: "cliente", titulo: "Cliente", movil: "asunto", celda: (p) => p.cliente },
            {
              clave: "estado",
              titulo: "Estado",
              movil: "detalle",
              celda: (p) =>
                p.status === "CANCELLED" ? (
                  <Marca tipo="anulado">Anulado</Marca>
                ) : (
                  <Marca tipo="hecho">{p.aCuenta ? "Entregado · a cuenta" : "Entregado y cobrado"}</Marca>
                ),
            },
            {
              clave: "total",
              titulo: "Total",
              alinear: "derecha",
              movil: "plata",
              celda: (p) => <Plata valor={p.total} className={p.status === "CANCELLED" ? "text-muted line-through" : undefined} />,
            },
            {
              clave: "tecla",
              titulo: "",
              alinear: "derecha",
              movil: "tecla",
              celda: (p) =>
                p.anulable && puedeOperar && anulacion ? (
                  <Button size="sm" variant="ghost" onClick={() => setAnularCerrado(p)}>
                    Anular…
                  </Button>
                ) : null,
            },
          ]}
        />
      ) : (
        <Tabla<PedidoDelTablero>
          titulo="Pedidos abiertos"
          filas={visibles}
          clave={(p) => p.id}
          columnas={columnas}
          // Tocar el renglón (fuera de su casilla y sus teclas) o Enter con el foco abre el pedido:
          // el renglón entero es el blanco del dedo, no sólo el nombre.
          onAbrir={(p) => abrir(p.id)}
          seleccion={puedeOperar}
          lote={(ids, limpiar) => (
            <LoteDePedidos seleccionados={visibles.filter((p) => ids.includes(p.id))} limpiar={limpiar} onAvisar={setAvisar} />
          )}
          teclas={
            puedeOperar
              ? [
                  {
                    letra: "p",
                    que: "paso que sigue",
                    aplica: (p) => teclaDelPedido(p) !== null,
                    hacer: (p) => document.querySelector<HTMLElement>(`[data-tecla-de="${p.id}"]`)?.click(),
                  },
                ]
              : []
          }
          vacio={vacio}
          barra={buscadorEl}
          cuenta={hayFiltro ? `${visibles.length} de ${abiertos.length} abiertos` : `${abiertos.length} abiertos`}
          pie={<span>{orden ? null : "Más nuevo primero"}</span>}
          className="[&_tbody_tr]:cursor-pointer"
        />
      )}

      <PedidoCajon
        pedido={pedidoAbierto}
        extra={pedidoAbierto ? (extras[pedidoAbierto.id] ?? null) : null}
        comercio={comercio}
        puedeOperar={puedeOperar}
        anulacion={anulacion}
        simulacion={simulacion}
        seccion={seccion}
        onCerrar={cerrar}
      />

      <AvisarUnoPorUno
        key={avisar.join(",")}
        pedidos={abiertos.filter((p) => avisar.includes(p.id))}
        onCerrar={() => setAvisar([])}
      />

      {anularCerrado && anulacion && (
        <Dialogo
          abierto
          onCerrar={() => setAnularCerrado(null)}
          titulo={`Anular el pedido #${anularCerrado.code}`}
          descripcion={`${anularCerrado.cliente} · ${anularCerrado.cuando}`}
        >
          <AnularDelPedido
            id={anularCerrado.id}
            code={anularCerrado.code}
            cobrado={anularCerrado.cobrado}
            aCuenta={anularCerrado.aCuenta}
            total={anularCerrado.total}
            motivoObligatorio={anulacion.motivoObligatorio}
            onHecho={() => setAnularCerrado(null)}
          />
        </Dialogo>
      )}
    </section>
  );
}
