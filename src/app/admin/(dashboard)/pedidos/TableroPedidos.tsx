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

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { advanceOrderStatus, anularVenta, registrarAvisoWhatsApp } from "@/lib/order-actions";
import { Tabla, type ColumnaTabla } from "@/components/ui/Tabla";
import { MenuMas } from "@/components/ui/MenuMas";
import { Dialogo } from "@/components/ui/Cajon";
import { teclaDeLaPantalla } from "@/components/ui/tecla-de-pantalla";
import { Button, Chip, Field, Icono, Input, Marca, Plata, Renglon, RielDeEstados, hrefConParametros, ordenDesdeUrl } from "@/components/ui";
import { useToast } from "../ToastProvider";
import PedidoCajon, { type SeccionDelCajon } from "./PedidoCajon";
import AnularDelPedido from "./AnularDelPedido";
import { rechazoDeAccion, sinRespuestaAlAvanzar } from "./avanzar-pedido";
import { esRedirectDeNext } from "./formularios-del-pedido";
import { useCobroDelNegocio } from "./CobroDelPedido";
import { MOTIVO_MAX } from "@/lib/turnos/anulacion";
import { registrarRecordatorioDeCobro } from "./reparto/acciones";
import { textoPlata } from "@/lib/cobro/pie-de-cobro-core";
import { dateStrInBusinessTz } from "@/lib/datetime";
import {
  COLUMNAS_DE_LA_BANDEJA,
  HREF_ARMAR_REPARTO,
  HREF_RENDICION,
  MOTIVO_NO_RETIRO,
  TITULO_DE_LA_COLUMNA,
  VACIO_DE_LA_COLUMNA,
  bandejaEnColumnas,
  conteosDeLasColumnas,
  leerColumnaDeLaUrl,
  listoDesdeAyer,
  puedeMarcarNoRetiro,
  resumenDeLineas,
  teclaDeLaTarjeta,
  type ColumnaDeLaBandeja,
} from "./pedidos-core";
import {
  ESTADOS_DEL_FILTRO,
  ETIQUETA_DEL_ESTADO,
  ORDENABLES,
  conteosDelTablero,
  filtrarPedidos,
  leerFiltrosDelTablero,
  loteDelTablero,
  ordenarPedidos,
  otrosPedidosDeLaClienta,
  quedoElPedido,
  resumenDelLote,
  rielDelPedido,
  teclaDelPedido,
  textoDeLaTecla,
  textoDeOtrosPedidos,
  type PedidoCerrado,
  type PedidoDelTablero,
} from "./pedidos-core";
import type { ExtraDelPedido } from "./tablero.server";
import { useVocabulario } from "../VocabularioDelNegocio";
import { tituloDeEntrega } from "@/lib/vocabulario-negocio";

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
  const vocab = useVocabulario();
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
            detalle={p.horario?.texto ?? (p.entrega === "DELIVERY" ? "Envío" : vocab.corto)}
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

function EstadoDeFila({ p, comercio, otros }: { p: PedidoDelTablero; comercio: boolean; otros: readonly number[] }) {
  const vocab = useVocabulario();
  const riel = rielDelPedido(p, comercio);
  const doble = textoDeOtrosPedidos(otros);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {/* La misma clienta con otro pedido abierto (caso 8): antes de preparar los dos, juntalos o preguntale. */}
      {doble && <Marca tipo="atencion">{doble}</Marca>}
      {/* En el celular no entra el riel: queda la palabra del paso, y la entrega y el cobro van en
          la misma línea (en la PC tienen su columna). */}
      <span className="max-sm:hidden">
        <RielDeEstados pasos={riel.pasos} hechos={riel.hechos} />
      </span>
      <Marca tipo={riel.tipo}>{riel.palabra}</Marca>
      <span className="text-muted sm:hidden">
        {[p.horario?.texto ?? (p.entrega === "DELIVERY" ? "Envío" : vocab.corto), p.status !== "DELIVERED" ? (p.cobrado ? "cobrado" : "a cobrar") : null]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </span>
  );
}

function Entrega({ p }: { p: PedidoDelTablero }) {
  const vocab = useVocabulario();
  const texto = p.horario?.texto ?? (p.entrega === "DELIVERY" ? "Envío" : vocab.corto);
  return (
    <span className="block max-w-72 truncate">
      <span className={p.horario?.esHoy ? "font-semibold text-strong" : undefined}>{texto}</span>
      {p.entrega === "DELIVERY" && p.direccion && <span className="text-muted"> · {p.direccion}</span>}
    </span>
  );
}

// ── LA BANDEJA EN COLUMNAS (mostrador boutique, Magra tanda 2 · 2C) ─────────────────────────────
//
// Nuevos · Preparando · Listos · En reparto · A cobrar, de izquierda a derecha el camino del pedido.
// Cada tarjeta tiene UNA tecla grande para el paso que sigue (`teclaDeLaTarjeta`); lo demás va en
// «Más». En el celular y la tablet vertical, una columna por vez con pestañas y su contador
// (`?columna=` en la URL); desde 1024 px, las cinco a la vista. Las acciones son las de siempre
// (`advanceOrderStatus`, el cajón con el pie de cobro, `anularVenta`): no cambia ninguna regla.

const TECLA_SECUNDARIA =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-line-strong px-3 text-sm font-medium text-strong " +
  "hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

const TECLA_PRIMARIA =
  "inline-flex min-h-12 flex-1 items-center justify-center rounded-lg bg-accent px-4 text-base font-semibold text-on-accent " +
  "hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus " +
  "disabled:cursor-not-allowed disabled:opacity-60";

function TeclaGrande({ p, onAbrir }: { p: PedidoDelTablero; onAbrir: (id: string, seccion?: SeccionDelCajon) => void }) {
  const router = useRouter();
  const { showError } = useToast();
  const [pending, startTransition] = useTransition();
  const t = teclaDeLaTarjeta(p);
  if (!t) return null;
  const etiqueta = `${t.texto}: ${p.cliente}, pedido #${p.code}`;
  if (t.tipo === "armar") {
    // Armar = empezar a prepararlo (la guarda de siempre: Nuevo → Preparando) y abrir la pantalla
    // Armar y pesar. Si otra pantalla ya lo movió, igual se abre: Armar muestra el estado real.
    return (
      <button
        type="button"
        data-tecla-de={p.id}
        className={TECLA_PRIMARIA}
        aria-label={etiqueta}
        disabled={pending}
        onClick={() => {
          const fd = new FormData();
          fd.set("id", p.id);
          startTransition(async () => {
            try {
              const rechazo = rechazoDeAccion(await advanceOrderStatus(fd));
              if (rechazo) showError(rechazo);
            } catch (e) {
              if (esRedirectDeNext(e)) throw e;
              showError(sinRespuestaAlAvanzar("Preparar", p.code, navigator.onLine));
              return;
            }
            router.push(t.href);
          });
        }}
      >
        {pending ? "Abriendo…" : t.texto}
      </button>
    );
  }
  if (t.tipo === "seguir" || t.tipo === "rendicion") {
    return (
      <Link href={t.href} data-tecla-de={p.id} className={TECLA_PRIMARIA} aria-label={etiqueta}>
        {t.texto}
      </Link>
    );
  }
  return (
    <button type="button" data-tecla-de={p.id} className={TECLA_PRIMARIA} aria-label={etiqueta} onClick={() => onAbrir(p.id, "cobro")}>
      {t.tipo === "cobrar" ? `Cobrar ${textoPlata(p.total)}` : t.texto}
    </button>
  );
}

/** «Avisar» (Listo sin avisar) o «Recordarle» (el retiro, o el pago de lo entregado sin cobrar). */
function TeclaDeWhatsApp({ p }: { p: PedidoDelTablero }) {
  const router = useRouter();
  if (p.status === "READY" && p.avisoWa && !p.avisado && !p.reparto) {
    return (
      <a
        href={p.avisoWa}
        target="_blank"
        rel="noopener noreferrer"
        className={TECLA_SECUNDARIA}
        aria-label={`Avisar por WhatsApp que está listo: ${p.cliente}, pedido #${p.code}`}
        onClick={() => void registrarAvisoWhatsApp(p.id, "pedido-listo").catch(() => undefined).finally(() => router.refresh())}
      >
        Avisar
      </a>
    );
  }
  if (!p.recordarle) return null;
  return (
    <a
      href={p.recordarle}
      target="_blank"
      rel="noopener noreferrer"
      className={TECLA_SECUNDARIA}
      aria-label={`Recordarle por WhatsApp: ${p.cliente}, pedido #${p.code}`}
      onClick={() => {
        const constancia = p.status === "DELIVERED" ? registrarRecordatorioDeCobro(p.id) : registrarAvisoWhatsApp(p.id, "recordatorio-retiro");
        void constancia.catch(() => undefined);
      }}
    >
      Recordarle
    </a>
  );
}

function TarjetaDelPedido({
  p,
  extra,
  otros,
  puedeOperar,
  anulacion,
  hoy,
  onAbrir,
  onNoRetiro,
}: {
  p: PedidoDelTablero;
  extra: ExtraDelPedido | undefined;
  otros: readonly number[];
  puedeOperar: boolean;
  anulacion: Anulacion;
  hoy: string;
  onAbrir: (id: string, seccion?: SeccionDelCajon) => void;
  onNoRetiro: (p: PedidoDelTablero) => void;
}) {
  const vocab = useVocabulario();
  const uid = useId();
  const doble = textoDeOtrosPedidos(otros);
  const entrega =
    p.entrega === "DELIVERY"
      ? ["Envío", p.zona, p.horario?.texto.replace(/^Envío\s+/, "")].filter(Boolean).join(" · ")
      : (p.horario?.texto ?? vocab.corto);
  const resumen = resumenDeLineas(p.lineas);
  const deAyer = listoDesdeAyer(p, hoy);
  return (
    <li>
      <article aria-labelledby={`${uid}-t`} data-pedido={p.code} className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface-raised p-3">
        <header className="flex items-start justify-between gap-2">
          <button
            type="button"
            id={`${uid}-t`}
            onClick={() => onAbrir(p.id)}
            className="min-w-0 text-left font-semibold text-strong hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <span className="tabular-nums">#{p.code}</span> · {p.cliente}
            {p.canal === "COUNTER" && <span className="font-normal text-muted"> · mostrador</span>}
          </button>
          <span className="shrink-0 text-xs text-muted tabular-nums">{p.cuando}</span>
        </header>
        {p.telefono && <p className="text-xs text-muted tabular-nums">{p.telefono}</p>}
        <p className={`text-sm ${p.horario?.esHoy ? "font-semibold text-strong" : "text-body"}`}>{entrega}</p>
        <p className="flex items-baseline justify-between gap-2 text-sm">
          <span className="min-w-0 text-muted">{resumen || `${p.lineas.length} renglones`}</span>
          <span className="shrink-0 font-semibold tabular-nums text-strong">
            <Plata valor={p.total} />
          </span>
        </p>
        <p className="flex flex-wrap gap-1.5">
          {p.cobrado ? <Marca tipo="hecho">{p.medio ? `Cobrado · ${p.medio}` : "Cobrado"}</Marca> : null}
          {p.reparto && <Marca tipo="info">En la calle desde {p.reparto.desde}</Marca>}
          {p.status === "READY" && p.avisado && !p.reparto && <Marca tipo="hecho">Avisado {p.avisado}</Marca>}
          {deAyer && p.entrega === "PICKUP" && <Marca tipo="atencion">Listo desde ayer sin retirar</Marca>}
          {doble && <Marca tipo="atencion">{doble}</Marca>}
        </p>
        {puedeOperar && (
          <footer className="mt-1 flex items-center gap-1.5">
            <TeclaGrande p={p} onAbrir={onAbrir} />
            <TeclaDeWhatsApp p={p} />
            <MenuMas etiqueta={`Más acciones del pedido #${p.code}`}>
              <button type="button" onClick={() => onAbrir(p.id)}>
                Ver el pedido
              </button>
              {extra?.whatsapp && (
                <a href={extra.whatsapp} target="_blank" rel="noopener noreferrer">
                  Escribirle por WhatsApp
                </a>
              )}
              {extra?.ajustar && (
                <button type="button" onClick={() => onAbrir(p.id, "ajustar")}>
                  {extra.ajustar.items.some((i) => i.saleUnit === "WEIGHT") ? "Pesar y ajustar" : "Ajustar el pedido"}
                </button>
              )}
              {extra?.link && (
                <button type="button" onClick={() => onAbrir(p.id, "link")}>
                  Mandar link de pago
                </button>
              )}
              {anulacion && puedeMarcarNoRetiro(p) && (
                <button type="button" onClick={() => onNoRetiro(p)}>
                  No retiró…
                </button>
              )}
              {anulacion && (
                <button type="button" data-peligro onClick={() => onAbrir(p.id, "anular")}>
                  Anular…
                </button>
              )}
            </MenuMas>
          </footer>
        )}
      </article>
    </li>
  );
}

function BandejaEnColumnas({
  pedidos,
  todos,
  extras,
  puedeOperar,
  anulacion,
  hoy,
  columna,
  onColumna,
  onAbrir,
  onNoRetiro,
  fiado = false,
}: {
  pedidos: PedidoDelTablero[];
  /** Todos los abiertos (el doble pedido de la clienta se busca en todos, no sólo en los filtrados). */
  todos: PedidoDelTablero[];
  extras: Record<string, ExtraDelPedido>;
  puedeOperar: boolean;
  anulacion: Anulacion;
  hoy: string;
  columna: ColumnaDeLaBandeja;
  onColumna: (c: ColumnaDeLaBandeja) => void;
  onAbrir: (id: string, seccion?: SeccionDelCajon) => void;
  onNoRetiro: (p: PedidoDelTablero) => void;
  /** El fiado del negocio prendido (2D): lo entregado sin cobrar con ficha va a la cuenta del cliente. */
  fiado?: boolean;
}) {
  const uid = useId();
  const columnas = bandejaEnColumnas(pedidos);
  const conteos = conteosDeLasColumnas(columnas);
  const otros = otrosPedidosDeLaClienta(todos);
  return (
    <div data-bandeja="columnas">
      {/* Celular y tablet vertical: una columna por vez, con su contador. */}
      <div role="tablist" aria-label="Columnas de pedidos" className="mb-3 flex max-w-full gap-1.5 overflow-x-auto pb-0.5 lg:hidden">
        {COLUMNAS_DE_LA_BANDEJA.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            id={`${uid}-tab-${c}`}
            aria-selected={columna === c}
            aria-controls={`${uid}-col-${c}`}
            data-ui="chip"
            onClick={() => onColumna(c)}
            className={
              "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium " +
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus " +
              (columna === c ? "border-accent bg-accent text-on-accent" : "border-line-strong bg-surface-raised text-strong")
            }
          >
            {TITULO_DE_LA_COLUMNA[c]}
            <span className="tabular-nums">{conteos[c]}</span>
          </button>
        ))}
      </div>
      <div className="lg:grid lg:grid-cols-5 lg:gap-3">
        {COLUMNAS_DE_LA_BANDEJA.map((c) => (
          <section
            key={c}
            id={`${uid}-col-${c}`}
            role="tabpanel"
            aria-labelledby={`${uid}-h-${c}`}
            className={`min-w-0 flex-col gap-2 ${columna === c ? "flex" : "hidden lg:flex"}`}
          >
            <h2 id={`${uid}-h-${c}`} className="flex items-center justify-between gap-2 border-b border-line-strong pb-1 text-sm font-semibold uppercase tracking-wide text-muted">
              <span>{TITULO_DE_LA_COLUMNA[c]}</span>
              <span className="tabular-nums text-strong">{conteos[c]}</span>
            </h2>
            {c === "a-cobrar" && fiado && (
              <p data-bandeja="fiado" className="text-sm text-muted">
                Lo que se entrega sin cobrar a un cliente con ficha va a su cuenta:{" "}
                <Link href="/admin/cuentas-a-cobrar" className="font-medium text-accent-ink underline underline-offset-4">
                  Fiado y cuentas
                </Link>
                .
              </p>
            )}
            {c === "en-reparto" && conteos[c] > 0 && (
              <Link href={HREF_RENDICION} className="text-sm font-medium text-accent-ink underline underline-offset-4">
                Rendición del cadete
              </Link>
            )}
            {columnas[c].length === 0 ? (
              <p className="py-2 text-sm text-muted">{VACIO_DE_LA_COLUMNA[c]}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {columnas[c].map((p) => (
                  <TarjetaDelPedido
                    key={p.id}
                    p={p}
                    extra={extras[p.id]}
                    otros={otros.get(p.id) ?? []}
                    puedeOperar={puedeOperar}
                    anulacion={anulacion}
                    hoy={hoy}
                    onAbrir={onAbrir}
                    onNoRetiro={onNoRetiro}
                  />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

/**
 * «No retiró»: anular el Listo que nunca vinieron a buscar, con el motivo ya escrito (E31). La
 * carne vuelve al stock salvo que se tilde lo contrario; la regla (quién, qué día, motivo) la
 * decide el servidor en `anularVenta`, como cualquier anulación. Sin estado propio (Gate 2).
 */
function NoRetiro({ p, motivoObligatorio, onCerrar }: { p: PedidoDelTablero; motivoObligatorio: boolean; onCerrar: () => void }) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [motivo, setMotivo] = useState(MOTIVO_NO_RETIRO);
  const [stockNoVolvio, setStockNoVolvio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Doble salida (src/lib/caja/doble-salida.ts): el servidor avisa y el segundo clic confirma.
  const [porConfirmar, setPorConfirmar] = useState(false);
  const [pending, startTransition] = useTransition();
  const uid = useId();
  function enviar() {
    const fd = new FormData();
    fd.set("id", p.id);
    fd.set("motivo", motivo);
    if (stockNoVolvio) fd.set("stockNoVolvio", "on");
    if (porConfirmar) fd.set("confirmar", "1");
    startTransition(async () => {
      let r;
      try {
        r = await anularVenta(null, fd);
      } catch (e) {
        if (esRedirectDeNext(e)) throw e;
        const msg = "No se pudo anular. Revisá la conexión y volvé a intentar: si ya se había anulado, no se anula dos veces.";
        setError(msg);
        showError(msg);
        return;
      }
      if (r && !r.ok) {
        setError(r.error);
        setPorConfirmar(r.tipo === "sin-confirmar");
        return;
      }
      showSuccess(r?.mensaje ?? `Pedido #${p.code} anulado: no lo retiró.`);
      onCerrar();
      router.refresh();
    });
  }
  return (
    <Dialogo abierto onCerrar={onCerrar} titulo={`#${p.code} no se retiró`} descripcion={`${p.cliente} · ${p.cuando}`}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!pending) enviar();
        }}
        className="flex flex-col gap-3"
      >
        <p className="text-sm text-body">
          {p.cobrado ? "Estaba cobrado: se devuelve la plata en la caja del día en que se cobró." : "No estaba cobrado: la caja no se toca."} La
          mercadería vuelve al stock.
        </p>
        <Field label={`Motivo ${motivoObligatorio ? "(obligatorio)" : "(queda en la auditoría)"}`} htmlFor={`${uid}-motivo`} error={error ?? undefined}>
          <Input
            id={`${uid}-motivo`}
            value={motivo}
            maxLength={MOTIVO_MAX}
            aria-required={motivoObligatorio || undefined}
            aria-invalid={error ? true : undefined}
            onChange={(e) => {
              setMotivo(e.target.value);
              setPorConfirmar(false);
              setError(null);
            }}
          />
        </Field>
        <label htmlFor={`${uid}-stock`} className="flex min-h-11 items-center gap-2 text-sm text-body">
          <input id={`${uid}-stock`} type="checkbox" checked={stockNoVolvio} onChange={(e) => setStockNoVolvio(e.target.checked)} className="size-5" />
          La mercadería no volvió al stock (se tiró o se regaló)
        </label>
        <Button type="submit" variant="danger" disabled={pending} estado={pending ? "cargando" : undefined}>
          {pending ? "Anulando…" : porConfirmar ? "Sí, anular igual" : `Anular el pedido #${p.code}`}
        </Button>
      </form>
    </Dialogo>
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
  fiado = false,
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
  /** Mostrador boutique con el fiado del negocio prendido (2D): lo dice la columna «A cobrar». */
  fiado?: boolean;
}) {
  const vocab = useVocabulario();
  const params = useSearchParams();
  const ruta = usePathname();
  const filtros = leerFiltrosDelTablero(params);
  const [q, setQ] = useState(filtros.q);
  const buscador = useRef<HTMLInputElement>(null);
  const [seccion, setSeccion] = useState<SeccionDelCajon>(null);
  const [avisar, setAvisar] = useState<string[]>([]);
  const [anularCerrado, setAnularCerrado] = useState<PedidoCerrado | null>(null);
  const [noRetiro, setNoRetiro] = useState<PedidoDelTablero | null>(null);
  const empujado = useRef(false);
  // MOSTRADOR BOUTIQUE (2C): la bandeja en columnas. `?vista=lista` vuelve a la tabla de siempre
  // (con el lote y los filtros por estado); «Cerrados» sigue siendo la tabla del historial.
  const { boutique } = useCobroDelNegocio();
  const enColumnas = boutique && comercio && params.get("vista") !== "lista" && filtros.estado !== "cerrados";
  const [columna, setColumna] = useState<ColumnaDeLaBandeja>(() => leerColumnaDeLaUrl(params.get("columna")));

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
  // Sólo comercio: la bandeja de CH queda como estaba.
  const otrosDeLaClienta = comercio ? otrosPedidosDeLaClienta(abiertos) : new Map<string, number[]>();

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
        // En la tabla (más de 40rem: el apilado de la piel es hasta 40rem inclusive) el nombre tiene un ancho fijo, un cuarto de la tabla (`cqi`: la
        // tabla densa es contenedor), y se corta con «…» (el completo, en el título): así cede lugar
        // a lo accionable y en una tablet de 820 el cobro y el paso que sigue entran sin deslizar.
        // Un tope (max-width) no alcanza: la tabla automática lo ignora al repartir las columnas.
        <button
          type="button"
          onClick={() => abrir(p.id)}
          title={p.canal === "COUNTER" ? `${p.cliente} · mostrador` : p.cliente}
          className="max-w-full truncate text-left font-semibold text-strong hover:underline @min-[40.0625rem]:block @min-[40.0625rem]:w-[24cqi]"
        >
          {p.cliente}
          {p.canal === "COUNTER" && <span className="font-normal text-muted"> · mostrador</span>}
        </button>
      ),
    },
    {
      clave: "estado",
      titulo: "Estado",
      movil: "detalle",
      celda: (p) => <EstadoDeFila p={p} comercio={comercio} otros={otrosDeLaClienta.get(p.id) ?? []} />,
    },
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
    // Lo accionable (total, cobro y el paso que sigue) va antes: en una tablet de 820 se ve sin
    // deslizar. Retiro / envío y las líneas quedan después, deslizando (decisión de producto 21/10:
    // no se esconde ninguna columna).
    { clave: "entrega", titulo: tituloDeEntrega(vocab), ordenable: true, movil: "oculta", celda: (p) => <Entrega p={p} /> },
    { clave: "lineas", titulo: "Líneas", alinear: "derecha", movil: "oculta", celda: (p) => p.lineas.length },
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

  const aSalir = enColumnas ? abiertos.filter((p) => p.entrega === "DELIVERY" && p.status === "READY" && !p.reparto).length : 0;
  const barraDeColumnas = enColumnas ? (
    <div data-ui="filtros" role="toolbar" aria-label="Filtrar y repartir los pedidos" className="mb-3 flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Canal" className="flex gap-1.5">
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
      <Link
        href={HREF_ARMAR_REPARTO}
        className="inline-flex min-h-11 items-center rounded-md border border-line-strong px-3 text-sm font-semibold text-strong hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        Armar reparto{aSalir > 0 ? ` · ${aSalir} para salir` : ""}
      </Link>
      <button
        type="button"
        className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-accent-ink underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        onClick={() => cambiarUrl({ vista: "lista" })}
      >
        Ver en lista
      </button>
      <button
        type="button"
        className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-accent-ink underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        onClick={() => cambiarUrl({ estado: "cerrados", vista: null })}
      >
        Cerrados
      </button>
      {buscadorEl}
    </div>
  ) : null;

  return (
    <section aria-label="Pedidos" data-tablero="pedidos">
      {enColumnas ? (
        <>
          {barraDeColumnas}
          {abiertos.length === 0 ? (
            <p data-ui="vacio" className="flex flex-wrap items-center gap-3 border-y border-line py-4 text-sm text-body">
              Nada esperando. Tomá un pedido o vendé en el mostrador.
              {tomarPedido && (
                <a href={tomarPedido} data-ui="button" data-variant="outline" data-size="sm" className="inline-flex h-11 items-center rounded-md border border-line-strong px-3 text-sm font-medium sm:h-9">
                  Tomar un pedido
                </a>
              )}
            </p>
          ) : (
            <BandejaEnColumnas
              pedidos={filtrarPedidos(abiertos, { estado: "abiertos", canal: filtros.canal, q })}
              todos={abiertos}
              extras={extras}
              puedeOperar={puedeOperar}
              anulacion={anulacion}
              hoy={dateStrInBusinessTz(new Date())}
              columna={columna}
              onColumna={(c) => {
                setColumna(c);
                cambiarUrl({ columna: c === "nuevos" ? null : c });
              }}
              onAbrir={abrir}
              onNoRetiro={setNoRetiro}
              fiado={fiado}
            />
          )}
        </>
      ) : (
      <>
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
        {boutique && comercio && (
          <Chip onClick={() => cambiarUrl({ vista: null, estado: null })} className="shrink-0">
            Ver en columnas
          </Chip>
        )}
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
      </>
      )}

      {noRetiro && anulacion && (
        <NoRetiro p={noRetiro} motivoObligatorio={anulacion.motivoObligatorio} onCerrar={() => setNoRetiro(null)} />
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
