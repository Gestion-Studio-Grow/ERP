"use client";

// Rol "Quien aprueba": aprobación POR LEGAJO (plan §6.4), lo que el workflow estándar de SAP no
// hace. La bandeja muestra "Laura Benítez · septiembre · 4 comprobantes · $ … · 1 aviso", no
// treinta facturas sueltas.
//
// Quién puede aprobar lo resuelve el motor (`nivelesDeAprobacion` con la matriz, las suplencias
// y la separación de funciones; `puedeAprobar` para el actor). Aprobar, devolver y rechazar son
// `aplicarAccion`: si el motor dice que no (p. ej. falta el comentario), se muestra su motivo.

import { useId, useState, type ReactNode } from "react";
import { AvisoError, Badge, Button, Card, EmptyState, Textarea, cn } from "@/components/ui";
import {
  aplicarAccion,
  etiquetaClase,
  formatearFecha,
  formatearPesos,
  puedeAprobar,
  type Comprobante,
  type Evaluacion,
} from "@/lib/rendiciones";
import { escenarioDemo } from "./escenario";
import { useDemo } from "./contexto";
import {
  ACCION,
  ESTADO_RENDICION,
  TRATAMIENTO,
  aprobadores,
  contextoTransicion,
  emisorDe,
  etiquetaTipo,
  fechaCorta,
  luzDe,
  mesDe,
  nombreDe,
  nombreDePila,
  plural,
  suplenciasDe,
  ultimoEvento,
  type ResumenRendicion,
} from "./derivados";
import { AvisoExito, Avatar, Campo, EncabezadoRol, IconoCheck, IconoVolver, ListaValidaciones, Semaforo } from "./piezas";
import { MiniTicket, Ticket } from "./Ticket";

export default function RolAprueba() {
  const { vista, resumenes, despachar } = useDemo();
  const actor = vista.legajoAprueba;
  const todas = [...resumenes.values()];
  const bandeja = todas.filter((res) => puedeAprobar(actor, res.rendicion, res.niveles));
  const seguimiento = todas.filter(
    (res) => !bandeja.includes(res) && (res.persona?.jefeLegajo === actor || res.niveles.some((n) => n.includes(actor))),
  );
  const abierta = vista.rendicionAprobador ? resumenes.get(vista.rendicionAprobador) : undefined;
  const abrir = (id: string | null) => despachar({ tipo: "ir", vista: { rendicionAprobador: id } });

  return (
    <div className="space-y-6">
      <EncabezadoRol
        id="aprueba-titulo"
        eyebrow="Quien aprueba · teléfono y web"
        titulo="Aprobás la rendición de septiembre de cada persona, no treinta facturas sueltas."
        descripcion="Bandeja por persona y período, con los avisos del sistema a la vista. Suplencias con fecha y separación de funciones: nadie aprueba lo propio."
      />

      <SelectorAprobador
        valor={actor}
        alCambiar={(legajo) => despachar({ tipo: "ir", vista: { legajoAprueba: legajo, rendicionAprobador: null } })}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className={cn("space-y-6", abierta && "hidden lg:block")}>
          <Bandeja titulo="Te toca aprobar" items={bandeja} abierta={abierta?.rendicion.id} onAbrir={abrir} vacio={<BandejaVacia actor={actor} />} />
          {seguimiento.length ? (
            <Bandeja titulo="Seguimiento de tu equipo" items={seguimiento} abierta={abierta?.rendicion.id} onAbrir={abrir} />
          ) : null}
          <ReglasDeAprobacion />
        </div>
        <div className={cn(!abierta && "hidden lg:block")}>
          {abierta ? (
            <DetalleAprobacion key={`${abierta.rendicion.id}-${actor}`} resumen={abierta} actor={actor} onCerrar={() => abrir(null)} />
          ) : (
            <EmptyState
              title="Elegí una rendición de la bandeja"
              description="Vas a ver los comprobantes con su miniatura, los avisos del sistema y el historial."
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SelectorAprobador({ valor, alCambiar }: { valor: string; alCambiar: (legajo: string) => void }) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-medium text-strong">¿Quién sos?</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {aprobadores.map((p) => {
          const activo = p.legajo === valor;
          const suplencias = suplenciasDe(p.legajo);
          return (
            <label
              key={p.legajo}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                activo ? "border-accent bg-accent-soft" : "border-line bg-surface-raised hover:border-line-strong",
              )}
            >
              <input type="radio" name="rendi-quien-aprueba" value={p.legajo} checked={activo} onChange={() => alCambiar(p.legajo)} className="sr-only" />
              <Avatar legajo={p.legajo} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-strong">{p.nombre}</span>
                <span className="block truncate text-xs text-muted">{p.puesto}</span>
                {suplencias.map((s) => (
                  <span key={s.titularLegajo} className="mt-0.5 block text-xs font-medium text-accent-ink">
                    Suplente de {nombreDe(s.titularLegajo)} del {fechaCorta(s.desde)} al {fechaCorta(s.hasta)}
                  </span>
                ))}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function Bandeja({
  titulo,
  items,
  abierta,
  onAbrir,
  vacio,
}: {
  titulo: string;
  items: ResumenRendicion[];
  abierta?: string;
  onAbrir: (id: string) => void;
  vacio?: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-2.5">
      <h3 id={id} className="flex items-center gap-2 text-base font-semibold text-strong">
        {titulo}
        <Badge tone={items.length ? "accent" : "neutral"}>{items.length}</Badge>
      </h3>
      {items.length ? (
        <ul className="space-y-2">
          {items.map((res) => {
            const r = res.rendicion;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onAbrir(r.id)}
                  aria-current={abierta === r.id ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                    abierta === r.id ? "border-accent bg-accent-soft" : "border-line bg-surface-raised hover:border-line-strong",
                  )}
                >
                  <Avatar legajo={r.legajo} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-strong">
                      {nombreDe(r.legajo)} · {mesDe(r.periodo)}
                    </span>
                    <span className="block text-xs tabular-nums text-muted">
                      {plural(res.comprobantes.length, "comprobante", "comprobantes")} · {formatearPesos(res.total)}
                      {res.avisos ? ` · ${plural(res.avisos, "aviso", "avisos")}` : ""}
                      {res.bloqueados ? ` · ${plural(res.bloqueados, "bloqueado", "bloqueados")}` : ""}
                    </span>
                  </span>
                  <Badge tone={ESTADO_RENDICION[r.estado].tono}>{ESTADO_RENDICION[r.estado].texto}</Badge>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        vacio ?? null
      )}
    </section>
  );
}

function BandejaVacia({ actor }: { actor: string }) {
  const otros = aprobadores.filter((p) => p.legajo !== actor).map((p) => p.nombre);
  return (
    <EmptyState
      title="No tenés rendiciones para aprobar"
      description={`Cuando alguien de tu equipo envíe la suya, aparece acá. Para ver una en curso, probá como ${otros.join(" o ")}.`}
    />
  );
}

/** La matriz de aprobación y las suplencias: son datos, no código. */
function ReglasDeAprobacion() {
  return (
    <Card className="space-y-3">
      <p className="text-sm font-semibold text-strong">Reglas de aprobación (son datos, se configuran)</p>
      <ul className="space-y-2 text-sm text-body">
        {escenarioDemo.reglasAprobacion.map((regla) => (
          <li key={regla.id}>
            <span className="font-medium text-strong">
              {regla.hasta ? `De ${formatearPesos(regla.desde)} a ${formatearPesos(regla.hasta)}` : `Desde ${formatearPesos(regla.desde)}`}
              {regla.centroCosto ? ` · ${regla.centroCosto}` : ""}:
            </span>{" "}
            {regla.niveles.map((n) => (n === "jefe" ? "jefe directo" : n.map(nombreDe).join(" o "))).join(", después ")}.
          </li>
        ))}
      </ul>
      {escenarioDemo.suplencias.length ? (
        <p className="text-xs leading-relaxed text-muted">
          Suplencias:{" "}
          {escenarioDemo.suplencias
            .map((s) => `${nombreDe(s.suplenteLegajo)} reemplaza a ${nombreDe(s.titularLegajo)} del ${fechaCorta(s.desde)} al ${fechaCorta(s.hasta)}`)
            .join("; ")}
          .
        </p>
      ) : null}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Detalle de una rendición
// ─────────────────────────────────────────────────────────────────────────────

function DetalleAprobacion({ resumen: res, actor, onCerrar }: { resumen: ResumenRendicion; actor: string; onCerrar: () => void }) {
  const id = useId();
  const { despachar, evaluaciones } = useDemo();
  const r = res.rendicion;
  const puede = puedeAprobar(actor, r, res.niveles);
  const [modo, setModo] = useState<null | "devolver" | "rechazar">(null);
  const [comentario, setComentario] = useState("");
  const [lineas, setLineas] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const quien = nombreDePila(r.legajo);

  const aprobar = () => {
    const resultado = aplicarAccion(r, "aprobar", contextoTransicion(res, actor));
    if (!resultado.ok) {
      setError(resultado.motivo);
      return;
    }
    despachar({ tipo: "transicion", rendicion: resultado.rendicion });
    const siguiente = res.niveles[resultado.rendicion.nivelActual];
    setHecho(
      resultado.rendicion.estado === "aprobada"
        ? `Aprobaste la rendición de ${quien}. Pasa a Tesorería para el control.`
        : `Aprobaste tu nivel. Ahora la aprueba ${siguiente?.map(nombreDe).join(" o ") ?? "el nivel siguiente"}.`,
    );
    setError(null);
  };

  const confirmar = () => {
    if (modo === "devolver" && !lineas.length) {
      setError("Marcá en la lista al menos una línea para devolver.");
      return;
    }
    const resultado =
      modo === "devolver"
        ? aplicarAccion(r, "devolver", contextoTransicion(res, actor, { comentario: comentario.trim(), comprobanteIds: lineas }))
        : aplicarAccion(r, "rechazar", contextoTransicion(res, actor, { comentario: comentario.trim() }));
    if (!resultado.ok) {
      setError(resultado.motivo);
      return;
    }
    despachar({ tipo: "transicion", rendicion: resultado.rendicion });
    setHecho(
      modo === "devolver"
        ? `Le devolviste ${plural(lineas.length, "línea", "líneas")} a ${quien}. La va a ver en el teléfono con tu comentario.`
        : `Rechazaste la rendición de ${quien}.`,
    );
    setModo(null);
    setError(null);
  };

  const cancelar = () => {
    setModo(null);
    setError(null);
    setLineas([]);
  };

  const alternarLinea = (comprobanteId: string) =>
    setLineas((xs) => (xs.includes(comprobanteId) ? xs.filter((x) => x !== comprobanteId) : [...xs, comprobanteId]));

  return (
    <article aria-labelledby={`${id}-titulo`} className="space-y-5 rounded-2xl border border-line bg-surface-raised p-4 shadow-card sm:p-6">
      <Button variant="ghost" size="sm" onClick={onCerrar} className="-ml-2 lg:hidden">
        <IconoVolver />
        Volver a la bandeja
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar legajo={r.legajo} className="size-11" />
          <div className="min-w-0">
            <h3 id={`${id}-titulo`} className="text-lg font-semibold text-strong">
              {nombreDe(r.legajo)} · {mesDe(r.periodo)}
            </h3>
            <p className="text-sm text-muted">
              {res.persona?.puesto} · centro de costo {res.persona?.centroCosto} · <span className="font-mono">{r.id}</span>
            </p>
          </div>
        </div>
        <div className="text-right">
          <Badge tone={ESTADO_RENDICION[r.estado].tono} dot>
            {ESTADO_RENDICION[r.estado].texto}
          </Badge>
          <p className="mt-1 text-xl font-bold tabular-nums text-strong">{formatearPesos(res.total)}</p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className={cn("rounded-xl border p-3 text-sm", res.cuadratura.cuadra ? "border-success/25 bg-success-soft" : "border-danger/25 bg-danger-soft")}>
          <p className="font-medium text-strong">{res.cuadratura.cuadra ? "Cuadra con el anticipo" : "No cuadra con el anticipo"}</p>
          <p className="mt-0.5 text-body">{res.cuadratura.mensaje}</p>
        </div>
        <NivelesAprobacion resumen={res} />
      </div>

      <Controles resumen={res} actor={actor} puede={puede} />

      {hecho ? <AvisoExito>{hecho}</AvisoExito> : null}

      <section aria-labelledby={`${id}-lineas`} className="space-y-2.5">
        <h4 id={`${id}-lineas`} className="text-sm font-semibold text-strong">
          {plural(res.comprobantes.length, "comprobante", "comprobantes")}
          {modo === "devolver" ? ` · marcá los que devolvés (${lineas.length})` : ""}
        </h4>
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {res.comprobantes.map((c) => (
            <LineaAprobacion
              key={c.id}
              comprobante={c}
              seleccionable={modo === "devolver"}
              seleccionada={lineas.includes(c.id)}
              onAlternar={() => alternarLinea(c.id)}
              evaluacion={evaluaciones.get(c.id)}
            />
          ))}
        </ul>
      </section>

      {puede && !hecho ? (
        modo === null ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={aprobar}>
              <IconoCheck />
              Aprobar todo
            </Button>
            <Button variant="outline" onClick={() => setModo("devolver")}>
              Devolver líneas
            </Button>
            <Button variant="ghost" className="text-danger" onClick={() => setModo("rechazar")}>
              Rechazar
            </Button>
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-line bg-surface-sunken p-4">
            <p className="text-sm font-medium text-strong">
              {modo === "devolver"
                ? `Marcá arriba las líneas a corregir y contale a ${quien} qué tiene que hacer.`
                : `Rechazás la rendición entera. ${quien} va a ver tu motivo.`}
            </p>
            <Campo id={`${id}-comentario`} etiqueta="Comentario" obligatorio error={error ?? undefined}>
              {(control) => (
                <Textarea
                  {...control}
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  placeholder={modo === "devolver" ? "Ej.: sacá la comida del viaje, ya la paga el convenio." : "Ej.: los gastos no corresponden a este centro de costo."}
                />
              )}
            </Campo>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={cancelar}>
                Cancelar
              </Button>
              <Button variant={modo === "rechazar" ? "danger" : "solid"} onClick={confirmar}>
                {modo === "devolver" ? `Devolver ${plural(lineas.length, "línea", "líneas")}` : "Rechazar la rendición"}
              </Button>
            </div>
          </div>
        )
      ) : null}
      {modo === null && error ? <AvisoError titulo="No se pudo" comoSeguir={error} /> : null}

      <Historial resumen={res} />
    </article>
  );
}

function NivelesAprobacion({ resumen: res }: { resumen: ResumenRendicion }) {
  const r = res.rendicion;
  const yaAprobada = ["aprobada", "en_control", "contabilizada", "cerrada"].includes(r.estado);
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="text-sm font-medium text-strong">Quién la aprueba</p>
      <ol className="mt-2 space-y-2">
        {res.niveles.map((nivel, i) => {
          const estado = yaAprobada || i < r.nivelActual ? "aprobó" : i === r.nivelActual && r.estado === "en_aprobacion" ? "le toca" : "después";
          return (
            <li key={i} className="flex items-start gap-2.5 text-sm">
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                  estado === "aprobó" ? "bg-success-soft text-success" : estado === "le toca" ? "bg-accent-soft text-accent-ink" : "bg-surface-sunken text-muted",
                )}
                aria-hidden="true"
              >
                {estado === "aprobó" ? "✓" : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-strong">{nivel.length ? nivel.map(nombreConSuplencia).join(" o ") : "Sin aprobador"}</span>
                <span className="block text-xs text-muted">
                  Nivel {i + 1} · {estado}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function nombreConSuplencia(legajo: string): string {
  return suplenciasDe(legajo).length ? `${nombreDe(legajo)} (suplente)` : nombreDe(legajo);
}

function Controles({ resumen: res, actor, puede }: { resumen: ResumenRendicion; actor: string; puede: boolean }) {
  const r = res.rendicion;
  const suplentes = res.niveles.flat().flatMap((legajo) => suplenciasDe(legajo).map((s) => ({ ...s, legajo })));
  const nivelActual = res.niveles[r.nivelActual] ?? [];
  return (
    <ul className="space-y-1.5 text-sm text-body">
      <li className="flex gap-2">
        <IconoCheck className="mt-0.5 text-success" />
        <span>Separación de funciones: {nombreDe(r.legajo)} no puede aprobar su propia rendición.</span>
      </li>
      {suplentes.map((s) => (
        <li key={`${s.titularLegajo}-${s.legajo}`} className="flex gap-2">
          <IconoCheck className="mt-0.5 text-success" />
          <span>
            Suplencia vigente: {nombreDe(s.legajo)} reemplaza a {nombreDe(s.titularLegajo)} del {fechaCorta(s.desde)} al {fechaCorta(s.hasta)}.
          </span>
        </li>
      ))}
      <li className="flex gap-2">
        <IconoCheck className="mt-0.5 text-success" />
        <span>Cada paso queda en la bitácora con fecha y responsable, y no se puede borrar.</span>
      </li>
      {!puede ? (
        <li className="rounded-lg bg-surface-sunken px-3 py-2 text-muted">
          {r.estado !== "en_aprobacion"
            ? `Está ${ESTADO_RENDICION[r.estado].texto.toLowerCase()}: no hay nada para aprobar.`
            : r.legajo === actor
              ? "Es tu propia rendición: no la podés aprobar."
              : `La aprueba ${nivelActual.map(nombreDe).join(" o ") || "otro nivel"}; vos no estás en ese nivel.`}
        </li>
      ) : null}
    </ul>
  );
}

function LineaAprobacion({
  comprobante: c,
  evaluacion,
  seleccionable,
  seleccionada,
  onAlternar,
}: {
  comprobante: Comprobante;
  evaluacion: Evaluacion | undefined;
  seleccionable: boolean;
  seleccionada: boolean;
  onAlternar: () => void;
}) {
  const id = useId();
  return (
    <li className={cn("p-3", seleccionada && "bg-warning-soft")}>
      <div className="flex items-start gap-3">
        {seleccionable ? (
          <input
            id={`${id}-devolver`}
            type="checkbox"
            checked={seleccionada}
            onChange={onAlternar}
            className="mt-4 size-5 shrink-0 accent-accent"
          />
        ) : null}
        <MiniTicket datos={c.datos} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            {seleccionable ? (
              <label htmlFor={`${id}-devolver`} className="min-w-0 cursor-pointer truncate text-sm font-medium text-strong">
                <span className="sr-only">Devolver </span>
                {emisorDe(c)}
              </label>
            ) : (
              <p className="min-w-0 truncate text-sm font-medium text-strong">{emisorDe(c)}</p>
            )}
            <p className="shrink-0 text-sm font-semibold tabular-nums text-strong">{formatearPesos(c.datos.total)}</p>
          </div>
          <p className="text-xs text-muted">
            {etiquetaTipo(c.imputacion.tipoGastoId)} · {etiquetaClase(c.datos.clase)} · {fechaCorta(c.datos.fecha)}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Semaforo luz={luzDe(evaluacion)} />
            {evaluacion ? <Badge tone={TRATAMIENTO[evaluacion.tratamiento].tono}>{TRATAMIENTO[evaluacion.tratamiento].texto}</Badge> : null}
          </div>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer select-none text-xs font-medium text-accent-ink">
              Ver el comprobante{evaluacion?.validaciones.length ? ` y ${plural(evaluacion.validaciones.length, "observación", "observaciones")}` : ""}
            </summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
              <Ticket datos={c.datos} semilla={c.id} concepto={etiquetaTipo(c.imputacion.tipoGastoId)} />
              {evaluacion ? <ListaValidaciones validaciones={evaluacion.validaciones} conFuente /> : null}
            </div>
          </details>
        </div>
      </div>
    </li>
  );
}

function Historial({ resumen: res }: { resumen: ResumenRendicion }) {
  const r = res.rendicion;
  const ultimaDevolucion = ultimoEvento(r, "devolver");
  return (
    <section className="space-y-2.5">
      <h4 className="text-sm font-semibold text-strong">Historial</h4>
      {r.historial.length ? (
        <ol className="space-y-3 border-l border-line pl-4">
          {r.historial.map((e, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-surface-raised bg-line-strong" aria-hidden="true" />
              <p className="text-sm text-strong">
                <span className="font-medium">{nombreDe(e.actorLegajo)}</span> · {ACCION[e.accion]}
                {e.accion === "aprobar" && e.nivel !== undefined ? ` (nivel ${e.nivel + 1})` : ""}
              </p>
              <p className="text-xs text-muted">
                {formatearFecha(e.fecha)}
                {e.comprobanteIds?.length ? ` · ${plural(e.comprobanteIds.length, "línea", "líneas")}` : ""}
              </p>
              {e.comentario ? <p className="mt-0.5 text-sm text-body">“{e.comentario}”</p> : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted">Todavía no hay movimientos.</p>
      )}
      <p className="text-xs text-muted">
        La bitácora sólo se agrega: nadie puede borrar ni editar un paso.
        {ultimaDevolucion ? ` Última devolución: ${fechaCorta(ultimaDevolucion.fecha)}.` : ""}
      </p>
    </section>
  );
}
