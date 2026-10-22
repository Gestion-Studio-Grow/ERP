"use client";

// ============================================================================
// «CERRAR LO PENDIENTE» — la bandeja (cliente). §2.5 del diseño de la reingeniería de CH.
// ============================================================================
//
// Un renglón por turno pasado sin cerrar, agrupados por día, con UNA decisión a la vista:
//   [✓ Vino]   pagado → cierra sin cobrar; con saldo → despliega los medios en la misma línea
//              (en el celular, una hoja con teclas grandes) y UN TOQUE en el medio cierra y cobra;
//   [Debe]     cierra dejando el saldo como cuenta a cobrar;
//   [✗ No vino] pregunta (y si ya pagó algo, qué pasa con esa plata) antes de marcar el faltazo;
//   ⋯          el resto (ver en la agenda, su ficha, WhatsApp).
// Arriba, la línea de estado, el filtro por profesional y «Cerrar las que ya pagaron todo (N)».
// Con casillas se arma un lote; la barra de abajo cobra todos con un medio, previa confirmación
// («¿Cerrar 8 turnos y cobrar $94.000 en efectivo?»). El progreso es por línea: la que falla queda
// en rojo con su motivo y, si fue por la caja cerrada, [Cobrarlo hoy] [Queda debiendo].
//
// Todo lo que se decide sin pantalla vive en cerrar-core.ts (con su test). El servidor vuelve a
// validar cada ítem (`cerrarTurnosEnLote`): lo que acá se ofrece es lo que allá se acepta.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bloque, Button, Hoja, Input, LineaDeEstado, MenuMas, PageContainer, Plata, Select, atributosBoton, buttonClasses } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { PIEL_RENGLON } from "@/lib/diseno/diseno";
import { cerrarTurnosEnLote } from "@/lib/turnos/cierre-lote-actions";
import type { PedidoDeCierre, ResultadoDeLinea } from "@/lib/turnos/cierre-lote";
import { preguntaDeCierre } from "@/lib/turnos/practica";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import type { MetodoDePago } from "@/lib/turnos/cobros";
import { useToast } from "../../ToastProvider";
import { pesos } from "../agenda-core";
import TeclasDeMedio from "./TeclasDeMedio";
import {
  VACIO,
  agruparPorDia,
  alternar,
  alternarTodos,
  avisoDelLote,
  cobraEste,
  detalleDeConfirmacion,
  detalleDePlata,
  diaDelTurno,
  filtrarTurnos,
  formularioDeLote,
  horaDelTurno,
  itemsDelLote,
  lasQueYaPagaron,
  lineaDeLaBandeja,
  loteNecesitaMedio,
  partirEnTandas,
  profesionalesDeLaBandeja,
  resumenDelLote,
  seleccionable,
  teclasDeLaFalla,
  teclasDelRenglon,
  textoDeConfirmacion,
  textosDeLaLinea,
  tituloDelDia,
  type DestinoSenia,
  type PermisosDeLaBandeja,
  type TurnoPendiente,
} from "./cerrar-core";

type EstadoDeLinea = { fase: "corriendo" } | { fase: "ok" } | { fase: "error"; error: string };

// ── La piel propia (regla de independencia del interruptor, §0.2) ────────────────
//
// La hoja «Renglón» se viste bajo `data-diseno`; su modo oscuro lo lee del MISMO elemento o de un
// descendiente. Como esta pantalla pone su propio atributo adentro de la raíz del panel, copia el
// `data-theme` de la raíz (lo corrige AdminThemeScript y lo cambia el selector de tema) y lo sigue.
function useTemaDeLaRaiz(ref: React.RefObject<HTMLElement | null>): "light" | "dark" {
  const [tema, setTema] = useState<"light" | "dark">("light");
  useEffect(() => {
    const raiz = ref.current?.parentElement?.closest("[data-theme]");
    if (!raiz) return;
    const leer = () => setTema(raiz.getAttribute("data-theme") === "dark" ? "dark" : "light");
    leer();
    const obs = new MutationObserver(leer);
    obs.observe(raiz, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, [ref]);
  return tema;
}

/** ¿Celular? (el mismo corte que la piel: < 1024 px o sin puntero fino). */
function useEsCelular(): boolean {
  const [cel, setCel] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px), (hover: none)");
    const leer = () => setCel(mq.matches);
    leer();
    mq.addEventListener("change", leer);
    return () => mq.removeEventListener("change", leer);
  }, []);
  return cel;
}

const TOQUE_LARGO_MS = 500;

export default function CerrarPendientes({
  turnos,
  permisos,
  hoy,
  hayMas = false,
  letraDelNegocio,
}: {
  turnos: TurnoPendiente[];
  /** Permisos de quien mira + si la caja de hoy ya está cerrada (del servidor). */
  permisos: PermisosDeLaBandeja;
  /** El servidor trajo el tope: quedan más atrás (se ven al cerrar estos). */
  hayMas?: boolean;
  /** «2026-10-22» en la zona del negocio (para titular «Ayer»). */
  hoy: string;
  /** La letra de cuerpo del negocio en vez de la de la piel (CH: Hanken; los títulos, Fraunces). */
  letraDelNegocio: boolean;
}) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const raiz = useRef<HTMLDivElement>(null);
  const tema = useTemaDeLaRaiz(raiz);
  const celular = useEsCelular();

  const [profesionalId, setProfesionalId] = useState("");
  const [buscar, setBuscar] = useState("");
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [estados, setEstados] = useState<Record<string, EstadoDeLinea>>({});
  const [cerrados, setCerrados] = useState<Set<string>>(() => new Set());
  /** El renglón con los medios desplegados en la línea (PC). */
  const [abierto, setAbierto] = useState<string | null>(null);
  /** La hoja de medios (celular), la de «no vino» y la confirmación del lote. */
  const [hojaVino, setHojaVino] = useState<string | null>(null);
  const [hojaNoVino, setHojaNoVino] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<MetodoDePago | "sin-cobro" | null>(null);
  const [enCurso, setEnCurso] = useState<{ id: string | "lote"; medio: MetodoDePago | null } | null>(null);

  // Lo que se ve: lo que mandó el servidor, sin lo que se acaba de cerrar, con el filtro puesto.
  const vivos = useMemo(() => turnos.filter((t) => !cerrados.has(t.id)), [turnos, cerrados]);
  const visibles = useMemo(() => filtrarTurnos(vivos, { profesionalId, buscar }), [vivos, profesionalId, buscar]);
  const dias = useMemo(() => agruparPorDia(visibles), [visibles]);
  const linea = useMemo(() => lineaDeLaBandeja(visibles, permisos), [visibles, permisos]);
  const profesionales = useMemo(() => profesionalesDeLaBandeja(vivos, permisos), [vivos, permisos]);
  const pagados = useMemo(() => lasQueYaPagaron(visibles, permisos), [visibles, permisos]);
  const resumen = useMemo(() => resumenDelLote(visibles, sel, permisos), [visibles, sel, permisos]);
  const porId = useMemo(() => new Map(turnos.map((t) => [t.id, t])), [turnos]);
  const ocupado = enCurso !== null;

  // Un id marcado que el servidor ya no manda (se cerró, o lo cerró otra persona) no molesta: el
  // resumen y los pedidos del lote salen sólo de los turnos visibles (`resumenDelLote`, `itemsDelLote`).

  /** Corre ítems contra el servidor de a tandas, marcando el progreso línea por línea. */
  const correr = useCallback(
    async (items: PedidoDeCierre[], quien: { id: string | "lote"; medio: MetodoDePago | null }) => {
      if (items.length === 0) return;
      setEnCurso(quien);
      setAbierto(null);
      setEstados((e) => {
        const n = { ...e };
        for (const i of items) n[i.id] = { fase: "corriendo" };
        return n;
      });
      const todos: ResultadoDeLinea[] = [];
      try {
        for (const tanda of partirEnTandas(items)) {
          let resultados: ResultadoDeLinea[];
          try {
            const r = await cerrarTurnosEnLote(formularioDeLote(tanda));
            // Un lote que el servidor no pudo ni leer: cada línea de la tanda queda con ese motivo.
            resultados = r.error && r.resultados.length === 0 ? tanda.map((i) => ({ id: i.id, ok: false, error: r.error })) : r.resultados;
          } catch {
            resultados = tanda.map((i) => ({ id: i.id, ok: false, error: "No se pudo cerrar. Probá de nuevo; si sigue, avisá." }));
          }
          todos.push(...resultados);
          const okIds = resultados.filter((r) => r.ok).map((r) => r.id);
          setEstados((e) => {
            const n = { ...e };
            for (const r of resultados) n[r.id] = r.ok ? { fase: "ok" } : { fase: "error", error: r.error ?? "No se pudo cerrar." };
            return n;
          });
          setSel((s) => {
            const n = new Set(s);
            for (const id of okIds) n.delete(id);
            return n;
          });
          // La línea cerrada se tacha y se desvanece (200 ms) antes de salir de la lista.
          if (okIds.length > 0) window.setTimeout(() => setCerrados((c) => new Set([...c, ...okIds])), 220);
        }
      } finally {
        setEnCurso(null);
      }
      const aviso = avisoDelLote(todos);
      if (aviso.tono === "ok") showSuccess(aviso.texto);
      else showError(aviso.texto);
      router.refresh();
    },
    [router, showError, showSuccess],
  );

  const vino = (t: TurnoPendiente) => {
    const teclas = teclasDelRenglon(t, permisos);
    if (teclas.tipo === "pagado") return void correr([{ id: t.id, accion: "vino" }], { id: t.id, medio: null });
    if (teclas.tipo !== "cobrar") return;
    if (celular) setHojaVino(t.id);
    else setAbierto((a) => (a === t.id ? null : t.id));
  };
  const cobrar = (t: TurnoPendiente, medio: MetodoDePago) => {
    setHojaVino(null);
    void correr([{ id: t.id, accion: "vino", method: medio }], { id: t.id, medio });
  };
  const debe = (t: TurnoPendiente) => {
    setHojaVino(null);
    void correr([{ id: t.id, accion: "debe" }], { id: t.id, medio: null });
  };
  /** [Cobrarlo hoy] de una línea que falló: se borra el rojo y se vuelven a abrir los medios. */
  const cobrarHoy = (t: TurnoPendiente) => {
    setEstados((e) => {
      const n = { ...e };
      delete n[t.id];
      return n;
    });
    if (celular) setHojaVino(t.id);
    else setAbierto(t.id);
  };
  const noVino = (t: TurnoPendiente, senia?: DestinoSenia) => {
    setHojaNoVino(null);
    void correr([{ id: t.id, accion: "no-vino", ...(senia ? { senia } : {}) }], { id: t.id, medio: null });
  };
  const cerrarLote = (medio: MetodoDePago | null) => {
    setConfirmar(null);
    void correr(itemsDelLote(visibles, sel, permisos, medio), { id: "lote", medio });
  };

  const turnoVino = hojaVino ? porId.get(hojaVino) : undefined;
  const turnoNoVino = hojaNoVino ? porId.get(hojaNoVino) : undefined;
  const hayFiltro = profesionalId !== "" || buscar.trim() !== "";
  const estilo = letraDelNegocio ? ({ "--font-ui": "var(--font-body), ui-sans-serif, system-ui, sans-serif" } as CSSProperties) : undefined;

  return (
    <div ref={raiz} data-diseno={PIEL_RENGLON} data-theme={tema} data-pantalla="cerrar-pendientes" style={estilo} className="min-h-full bg-surface text-body">
      <PageContainer className="pb-0 sm:pb-0">
        <header className="mb-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h1 className="text-[27px] font-semibold leading-tight text-strong">Cerrar lo pendiente</h1>
            <Link href="/admin/turnos" className="text-sm text-muted underline-offset-2 hover:underline">
              ← Volver a la agenda
            </Link>
          </div>
          {vivos.length > 0 && (
            <LineaDeEstado
              className="mt-2"
              datos={textosDeLaLinea(linea).map((texto, i) =>
                i === 1 && linea.porCobrar > 0 ? (
                  <span key="cobrar">
                    <span className="font-display text-base text-strong tabular-nums">{pesos(linea.porCobrar)}</span> por cobrar
                  </span>
                ) : (
                  texto
                ),
              )}
            />
          )}
          {vivos.length > 0 && permisos.cajaDeHoyCerrada && permisos.cobrar && (
            <p role="note" className="mt-3 border-l-2 border-warning pl-3 text-sm text-body">
              La caja de hoy ya está cerrada: los turnos con saldo se cierran dejando lo que falta como deuda, y se cobra mañana.
            </p>
          )}
          {vivos.length > 0 && (
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="flex min-w-[12rem] flex-col gap-1 text-xs font-medium text-muted">
                Profesional
                <Select value={profesionalId} onChange={(e) => setProfesionalId(e.target.value)} className="min-h-11 sm:min-h-9">
                  <option value="">Todas ({vivos.length})</option>
                  {profesionales.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} ({p.cuenta}){p.cobraAparte ? " · cobra aparte" : ""}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-muted sm:max-w-xs">
                Buscar
                <Input
                  type="search"
                  value={buscar}
                  onChange={(e) => setBuscar(e.target.value)}
                  placeholder="Clienta, servicio o teléfono"
                  className="min-h-11 sm:min-h-9"
                />
              </label>
              {pagados.length > 0 && (
                <Button
                  type="button"
                  variant="solid"
                  className="max-sm:w-full"
                  disabled={ocupado}
                  onClick={() => void correr(pagados.map((t) => ({ id: t.id, accion: "vino" })), { id: "lote", medio: null })}
                >
                  Cerrar las que ya pagaron todo ({pagados.length})
                </Button>
              )}
            </div>
          )}
        </header>

        {vivos.length === 0 ? (
          <section aria-labelledby="cp-vacio" className="border-t border-line-strong py-10">
            <h2 id="cp-vacio" className="text-xl text-strong">
              {VACIO.titulo}
            </h2>
            <p className="mt-1 text-sm text-muted">Todos los turnos que ya pasaron quedaron cerrados.</p>
            <Link href={VACIO.accion.href} className={buttonClasses("solid", "md", "mt-5")} {...atributosBoton("solid", "md")}>
              {VACIO.accion.etiqueta} →
            </Link>
          </section>
        ) : visibles.length === 0 ? (
          <section aria-labelledby="cp-sin-resultados" className="border-t border-line-strong py-8">
            <h2 id="cp-sin-resultados" className="text-lg text-strong">
              No hay turnos sin cerrar con ese filtro
            </h2>
            {hayFiltro && (
              <Button
                type="button"
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setProfesionalId("");
                  setBuscar("");
                }}
              >
                Ver todos
              </Button>
            )}
          </section>
        ) : (
          <div className="space-y-7 pb-6">
            {dias.map((d) => {
              const ids = d.turnos.filter((t) => seleccionable(t, permisos)).map((t) => t.id);
              const todosMarcados = ids.length > 0 && ids.every((id) => sel.has(id));
              return (
                <Bloque
                  key={d.dia}
                  id={`dia-${d.dia}`}
                  titulo={tituloDelDia(d.dia, hoy)}
                  cuenta={
                    <>
                      {d.turnos.length} {d.turnos.length === 1 ? "turno" : "turnos"}
                      {d.porCobrar > 0 && (
                        <>
                          {" · "}
                          <span className="font-display text-strong tabular-nums">{pesos(d.porCobrar)}</span> por cobrar
                        </>
                      )}
                      {tituloDelDia(d.dia, hoy) === "Ayer" && <span className="sr-only"> ({d.dia})</span>}
                    </>
                  }
                  nota={
                    permisos.terminar && ids.length > 1 ? (
                      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 sm:min-h-0">
                        <input
                          type="checkbox"
                          className="size-4 accent-accent"
                          checked={todosMarcados}
                          onChange={() => setSel((s) => alternarTodos(s, ids))}
                          disabled={ocupado}
                        />
                        Marcar el día
                      </label>
                    ) : undefined
                  }
                >
                  <ul>
                    {d.turnos.map((t) => (
                      <RenglonPendiente
                        key={t.id}
                        t={t}
                        dia={diaDelTurno(t)}
                        permisos={permisos}
                        marcado={sel.has(t.id)}
                        onMarcar={() => setSel((s) => alternar(s, t.id))}
                        estado={estados[t.id]}
                        abierto={abierto === t.id}
                        onCerrarMedios={() => setAbierto(null)}
                        enCurso={enCurso && enCurso.id === t.id ? enCurso.medio : null}
                        ocupado={ocupado}
                        onVino={() => vino(t)}
                        onCobrar={(m) => cobrar(t, m)}
                        onDebe={() => debe(t)}
                        onNoVino={() => setHojaNoVino(t.id)}
                        onCobrarHoy={() => cobrarHoy(t)}
                      />
                    ))}
                  </ul>
                </Bloque>
              );
            })}
            {hayMas && (
              <p className="border-t border-line pt-3 text-sm text-muted">
                Hay más turnos sin cerrar, más viejos. Cerrá estos y van a aparecer.
              </p>
            )}
          </div>
        )}

        {/* BARRA DEL LOTE: pegada abajo (encima de la barra del celular si la hay). */}
        {resumen.cantidad > 0 && (
          <div
            role="region"
            aria-label="Lote marcado"
            className="sticky bottom-[var(--alto-barra-inferior,0px)] z-30 -mx-4 flex flex-col gap-2 border-t border-line-strong bg-surface-raised px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:-mx-8 sm:px-8 lg:flex-row lg:flex-wrap lg:items-center"
          >
            <p className="text-sm text-body" aria-live="polite">
              <strong className="text-strong">
                {resumen.cantidad} {resumen.cantidad === 1 ? "marcada" : "marcadas"}
              </strong>
              {resumen.aCobrar > 0 && (
                <>
                  {" · "}
                  <span className="font-display text-lg text-strong tabular-nums">{pesos(resumen.aCobrar)}</span>
                </>
              )}
            </p>
            {loteNecesitaMedio(resumen) ? (
              <div className="flex flex-col gap-1.5 lg:flex-row lg:items-center">
                <span className="text-sm text-muted">
                  Marcar {resumen.cantidad} como «vino» · cobrar con:
                </span>
                <TeclasDeMedio
                  etiqueta={`Cerrar ${resumen.cantidad} y cobrar ${pesos(resumen.aCobrar)} con`}
                  onElegir={(m) => setConfirmar(m)}
                  enCurso={enCurso?.id === "lote" ? enCurso.medio : null}
                  disabled={ocupado}
                />
              </div>
            ) : (
              <Button type="button" disabled={ocupado} onClick={() => setConfirmar("sin-cobro")}>
                Marcar {resumen.cantidad} como «vino»
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" className="lg:ml-auto" disabled={ocupado} onClick={() => setSel(new Set())}>
              Quitar
            </Button>
          </div>
        )}
      </PageContainer>

      {/* CONFIRMACIÓN DEL LOTE (mueve plata: se pregunta). */}
      <Hoja
        abierta={confirmar !== null}
        onCerrar={() => setConfirmar(null)}
        titulo={textoDeConfirmacion(resumen, confirmar === "sin-cobro" ? null : confirmar)}
        descripcion={detalleDeConfirmacion(resumen) || undefined}
        pie={
          <>
            <Button type="button" size="lg" className="flex-1" onClick={() => cerrarLote(confirmar === "sin-cobro" ? null : confirmar)}>
              Sí, cerrar
            </Button>
            <Button type="button" size="lg" variant="ghost" onClick={() => setConfirmar(null)}>
              No
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">Cada turno se cierra por separado: si uno no se puede, los demás pasan igual y ese queda marcado en rojo.</p>
      </Hoja>

      {/* CELULAR: «✓ Vino» abre esta hoja con los medios en teclas grandes. */}
      <Hoja
        abierta={!!turnoVino}
        onCerrar={() => setHojaVino(null)}
        titulo={turnoVino ? `Vino ${turnoVino.clienta}` : ""}
        descripcion={turnoVino ? `${horaDelTurno(turnoVino)} · ${turnoVino.servicio} · ${turnoVino.profesional}` : undefined}
      >
        {turnoVino && (
          <div className="space-y-4">
            <p className="flex items-baseline justify-between gap-3 text-sm text-muted">
              <span>Falta cobrar</span>
              <span className="font-display text-4xl text-strong tabular-nums">{pesos(turnoVino.saldo)}</span>
            </p>
            <TeclasDeMedio
              tamano="grande"
              etiqueta={`Cobrar ${pesos(turnoVino.saldo)} a ${turnoVino.clienta} con`}
              onElegir={(m) => cobrar(turnoVino, m)}
              disabled={ocupado}
            />
            <Button type="button" variant="ghost" size="lg" className="w-full" disabled={ocupado} onClick={() => debe(turnoVino)}>
              Queda debiendo
            </Button>
          </div>
        )}
      </Hoja>

      {/* «✗ NO VINO»: nunca un toque suelto. Si ya pagó algo, se elige qué pasa con esa plata. */}
      <Hoja
        abierta={!!turnoNoVino}
        onCerrar={() => setHojaNoVino(null)}
        titulo={turnoNoVino ? `¿${turnoNoVino.clienta} no vino?` : ""}
        descripcion={turnoNoVino ? preguntaDeCierre({ accion: "no-vino", clienta: turnoNoVino.clienta, hora: horaDelTurno(turnoNoVino) }) : undefined}
        pie={
          turnoNoVino && turnoNoVino.cobrado <= 0 ? (
            <>
              <Button type="button" size="lg" className="flex-1" onClick={() => noVino(turnoNoVino)}>
                Sí, no vino
              </Button>
              <Button type="button" size="lg" variant="ghost" onClick={() => setHojaNoVino(null)}>
                No, volver
              </Button>
            </>
          ) : undefined
        }
      >
        {turnoNoVino && turnoNoVino.cobrado > 0 && (
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm text-body">
              Ya pagó <span className="font-display text-strong tabular-nums">{pesos(turnoNoVino.cobrado)}</span>. ¿Qué pasa con esa plata?
            </legend>
            <Button type="button" size="lg" className="w-full" onClick={() => noVino(turnoNoVino, "retener")}>
              Se la queda el negocio
            </Button>
            {cobraEste(turnoNoVino, permisos) ? (
              <Button type="button" size="lg" variant="outline" className="w-full" onClick={() => noVino(turnoNoVino, "devolver")}>
                Se la devolvemos (se anula el cobro en la caja)
              </Button>
            ) : (
              <p className="text-sm text-muted">Para devolverla, que lo haga quien cobra este turno.</p>
            )}
            <Button type="button" variant="ghost" className="w-full" onClick={() => setHojaNoVino(null)}>
              No, volver
            </Button>
          </fieldset>
        )}
      </Hoja>
    </div>
  );
}

// ── Un renglón ──────────────────────────────────────────────────────────────────

function RenglonPendiente({
  t,
  dia,
  permisos,
  marcado,
  onMarcar,
  estado,
  abierto,
  onCerrarMedios,
  enCurso,
  ocupado,
  onVino,
  onCobrar,
  onDebe,
  onNoVino,
  onCobrarHoy,
}: {
  t: TurnoPendiente;
  dia: string;
  permisos: PermisosDeLaBandeja;
  marcado: boolean;
  onMarcar: () => void;
  estado: EstadoDeLinea | undefined;
  abierto: boolean;
  onCerrarMedios: () => void;
  enCurso: MetodoDePago | null;
  ocupado: boolean;
  onVino: () => void;
  onCobrar: (m: MetodoDePago) => void;
  onDebe: () => void;
  onNoVino: () => void;
  onCobrarHoy: () => void;
}) {
  const teclas = teclasDelRenglon(t, permisos);
  const falla = teclasDeLaFalla(t, permisos);
  const hora = horaDelTurno(t);
  const corriendo = estado?.fase === "corriendo";
  const resuelto = estado?.fase === "ok";
  const fallo = estado?.fase === "error" ? estado : null;
  const idVino = `vino-${t.id}`;
  const mediosRef = useRef<HTMLDivElement>(null);
  const largo = useRef<number | null>(null);
  const wa = waLinkClienta(t.telefono);

  // Al desplegar los medios, el foco va al primero; al plegarlos (Escape), vuelve a «Vino».
  const estabaAbierto = useRef(false);
  useEffect(() => {
    if (abierto) mediosRef.current?.querySelector("button")?.focus();
    else if (estabaAbierto.current) document.getElementById(idVino)?.focus();
    estabaAbierto.current = abierto;
  }, [abierto, idVino]);

  const cortarLargo = () => {
    if (largo.current !== null) window.clearTimeout(largo.current);
    largo.current = null;
  };

  return (
    <li
      data-ui="renglon"
      data-resuelto={resuelto || undefined}
      data-fallo={fallo ? "" : undefined}
      aria-busy={corriendo || undefined}
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line py-2",
        resuelto && "line-through motion-reduce:transition-none",
        fallo && "bg-danger-soft",
        marcado && !fallo && "bg-accent-soft",
      )}
      onKeyDown={(e) => {
        if (e.key === "Escape" && abierto) {
          e.stopPropagation();
          onCerrarMedios();
        }
      }}
      // Celular: un toque largo en el renglón lo marca para el lote.
      onPointerDown={(e) => {
        if (e.pointerType !== "touch" || !permisos.terminar || ocupado) return;
        if ((e.target as HTMLElement).closest("button, a, input, select")) return;
        largo.current = window.setTimeout(() => {
          largo.current = null;
          onMarcar();
        }, TOQUE_LARGO_MS);
      }}
      onPointerUp={cortarLargo}
      onPointerCancel={cortarLargo}
      onPointerMove={cortarLargo}
    >
      <span data-parte="folio" className="flex items-center gap-2 text-[13px] text-muted">
        {permisos.terminar && (
          <input
            type="checkbox"
            className="size-4 shrink-0 accent-accent"
            checked={marcado}
            onChange={onMarcar}
            disabled={ocupado || resuelto}
            aria-label={`Marcar el turno de ${t.clienta} de las ${hora}`}
          />
        )}
        <time dateTime={t.inicio} className="tabular-nums">
          {hora}
        </time>
        {t.estado === "PENDING" && <span className="sr-only">, reservado sin confirmar</span>}
      </span>

      <span data-parte="asunto" className="min-w-0 flex-1">
        <span data-parte="titulo" className="block text-strong">
          {t.clienta}
        </span>
        <span data-parte="detalle" className="block text-[13px] text-muted" title={`${t.servicio} · ${t.profesional} · ${detalleDePlata(t)}`}>
          {t.servicio} · {t.profesional}
          {t.estado === "PENDING" ? " · reservado" : ""} · {detalleDePlata(t)}
        </span>
        {teclas.tipo === "cobra-aparte" && <span className="mt-0.5 block text-[13px] text-warning">{teclas.motivo}</span>}
        {fallo && (
          <span role="alert" className="mt-1 block text-[13px] font-medium text-danger">
            {fallo.error}
          </span>
        )}
      </span>

      <span data-parte="plata" className="text-right">
        {t.saldo > 0 ? <Plata valor={t.saldo} sinCentavos tono="peligro" /> : <span className="text-[13px] text-success">Pagado ✓</span>}
      </span>

      <span data-parte="tecla" className="flex flex-wrap items-center justify-end gap-1.5">
        {fallo && (falla.cobrarHoy || falla.debe) ? (
          <>
            {falla.cobrarHoy && (
              <Button type="button" size="sm" disabled={ocupado} onClick={onCobrarHoy} aria-label={`Cobrarle hoy ${pesos(t.saldo)} a ${t.clienta}`}>
                Cobrarlo hoy
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={onDebe} aria-label={`${t.clienta} queda debiendo ${pesos(t.saldo)}`}>
              Queda debiendo
            </Button>
          </>
        ) : abierto && teclas.tipo === "cobrar" ? (
          <div ref={mediosRef} className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-medium text-strong" aria-hidden>
              ✓ Vino →
            </span>
            <TeclasDeMedio etiqueta={`Cobrar ${pesos(t.saldo)} a ${t.clienta} con`} onElegir={onCobrar} enCurso={enCurso} disabled={ocupado}>
              <Button type="button" size="sm" variant="ghost" disabled={ocupado} onClick={onDebe}>
                Debe
              </Button>
            </TeclasDeMedio>
            <Button type="button" size="sm" variant="ghost" aria-label="Volver sin cerrar" onClick={onCerrarMedios}>
              ✕
            </Button>
          </div>
        ) : teclas.tipo === "pagado" || teclas.tipo === "cobrar" ? (
          <>
            <Button
              id={idVino}
              type="button"
              size="sm"
              variant="outline"
              disabled={ocupado || resuelto}
              estado={corriendo ? "cargando" : undefined}
              aria-expanded={teclas.tipo === "cobrar" ? abierto : undefined}
              aria-label={teclas.tipo === "pagado" ? `Vino ${t.clienta}: cerrar sin cobrar` : `Vino ${t.clienta}: elegir cómo pagó ${pesos(t.saldo)}`}
              onClick={onVino}
            >
              ✓ Vino
            </Button>
            {teclas.tipo === "cobrar" && (
              <Button type="button" size="sm" variant="ghost" className="max-lg:hidden" disabled={ocupado || resuelto} onClick={onDebe} aria-label={`${t.clienta} queda debiendo ${pesos(t.saldo)}`}>
                Debe
              </Button>
            )}
            <Button type="button" size="sm" variant="ghost" disabled={ocupado || resuelto} onClick={onNoVino} aria-label={`${t.clienta} no vino`}>
              ✗ No vino
            </Button>
          </>
        ) : teclas.tipo === "cobra-aparte" ? (
          <Button type="button" size="sm" variant="outline" disabled={ocupado || resuelto} estado={corriendo ? "cargando" : undefined} onClick={onDebe}>
            Terminar y dejar el saldo
          </Button>
        ) : null}
        <MenuMas etiqueta={`Más acciones del turno de ${t.clienta}`}>
          <Link href={`/admin/turnos?date=${dia}`} role="menuitem">
            Ver el día en la agenda
          </Link>
          {t.clienteId && (
            <Link href={`/admin/clientes/${t.clienteId}`} role="menuitem">
              Ver su ficha
            </Link>
          )}
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" role="menuitem">
              Escribirle por WhatsApp
            </a>
          )}
          {teclas.tipo === "cobra-aparte" && (
            <button type="button" role="menuitem" onClick={onNoVino}>
              No vino
            </button>
          )}
          {teclas.tipo === "cobrar" && (
            <button type="button" role="menuitem" className="lg:hidden" onClick={onDebe}>
              Queda debiendo
            </button>
          )}
        </MenuMas>
      </span>
    </li>
  );
}
