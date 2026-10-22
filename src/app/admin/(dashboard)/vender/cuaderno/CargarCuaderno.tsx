"use client";

// ============================================================================
// «CARGAR VENTAS DEL CUADERNO» — la pantalla (Magra, tanda 2 · 2E; MG-060).
// ============================================================================
//
// Varias ventas seguidas, como están en el cuaderno: la hora, el corte (uno o varios), el peso o la
// cantidad y cómo pagó. Un solo «Cargar» manda todas; cada una vuelve con su resultado (la venta #N
// con su total, o por qué no entró) y la que entró queda trabada para no tocarla otra vez.
//
// Pensada para el celular del local (390 px): cada venta es una tarjeta apilada, todo táctil (44 px),
// el teclado numérico para la hora y el peso, y el botón «Cargar» abajo y fijo. El borrador (con las
// CLAVES de cada venta) se guarda en el equipo: si se recarga o se vuelve a cortar, sigue ahí y
// mandarlo otra vez no duplica nada. La plata la decide el servidor: «Da $X» es la cuenta de la base
// para comparar con lo anotado.

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { BuscadorCombo, Chip, Input, type OpcionBuscador } from "@/components/ui";
import { fmtMoneyARS } from "@/components/ui/format";
import { MEDIOS_DE_COBRO } from "@/lib/caja/medio-cobro";
import { formatDayLabel } from "@/lib/caja/cierre-diario";
import {
  claveDelBorrador,
  faltaEnLaFila,
  filaCargada,
  filaNueva,
  filaVacia,
  leerBorrador,
  resumenDeLaCarga,
  textoDelTotal,
  totalDeLaFila,
  ventaDeLaFila,
  type FilaDelCuaderno,
  type ProductoDelCuaderno,
  type RenglonDelCuaderno,
  type ResultadoDelCuaderno,
  type VentaDelCuaderno,
} from "./cuaderno-core";

function claveNueva(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // sin crypto: la de abajo
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function diaAnterior(dia: string): string {
  const d = new Date(`${dia}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const CLASE_ESTADO: Record<string, string> = {
  grabada: "border-success/50 bg-success-soft/40",
  "ya-estaba": "border-success/50 bg-success-soft/40",
  rechazada: "border-danger/60 bg-danger-soft/40",
  "sin-confirmar": "border-warning bg-warning-soft/40",
};

export default function CargarCuaderno({
  productos,
  hoy,
  primerDia,
  cerradoHasta,
  negocioId,
  usuarioId,
  cargar: cargarVentas,
}: {
  productos: ProductoDelCuaderno[];
  hoy: string;
  /** El día más viejo que este rol puede cargar. */
  primerDia: string;
  /** Hasta qué día está cerrada la caja (null = nunca se cerró). */
  cerradoHasta: string | null;
  negocioId: string;
  usuarioId: string;
  /** La acción que graba (`cargarVentasDelCuaderno`, la pasa la página: así la pantalla se prueba sola). */
  cargar: (ventas: VentaDelCuaderno[]) => Promise<ResultadoDelCuaderno>;
}) {
  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const opciones = useMemo<OpcionBuscador[]>(
    () =>
      productos
        .filter((p) => p.precio !== null)
        .map((p) => ({ id: p.id, etiqueta: p.nombre, detalle: `${fmtMoneyARS(p.precio ?? 0)}${p.porPeso ? "/kg" : " c/u"}` })),
    [productos],
  );

  const [dia, setDia] = useState(hoy);
  const [filas, setFilas] = useState<FilaDelCuaderno[]>(() => [filaNueva(claveNueva())]);
  const [faltas, setFaltas] = useState<Record<string, string>>({});
  const [resumen, setResumen] = useState<{ texto: string; todoBien: boolean } | null>(null);
  const [pendiente, empezar] = useTransition();
  const leido = useRef(false);
  const almacen = claveDelBorrador(negocioId, usuarioId);

  // El borrador del equipo: se lee una vez al montar y se guarda en cada cambio.
  useEffect(() => {
    try {
      const b = leerBorrador(window.localStorage.getItem(almacen));
      if (b && b.filas.length > 0) {
        setFilas(b.filas);
        if (b.dia >= primerDia && b.dia <= hoy) setDia(b.dia);
      }
    } catch {
      // sin almacén: el borrador vive en memoria
    }
    leido.current = true;
  }, [almacen, primerDia, hoy]);
  useEffect(() => {
    if (!leido.current) return;
    try {
      window.localStorage.setItem(almacen, JSON.stringify({ v: 1, dia, filas }));
    } catch {
      // modo privado o almacén lleno: sigue en memoria
    }
  }, [almacen, dia, filas]);

  const diaCerrado = cerradoHasta !== null && dia <= cerradoHasta;
  const porCargar = filas.filter((f) => !filaCargada(f) && !filaVacia(f));
  const yaCargadas = filas.filter(filaCargada).length;
  const ayer = diaAnterior(hoy);

  function cambiarFila(clave: string, cambio: (f: FilaDelCuaderno) => FilaDelCuaderno) {
    setFilas((fs) => fs.map((f) => (f.clave === clave ? cambio(f) : f)));
    setFaltas((x) => {
      if (!(clave in x)) return x;
      const { [clave]: _quitada, ...resto } = x;
      void _quitada;
      return resto;
    });
  }
  function cambiarRenglon(clave: string, i: number, r: Partial<RenglonDelCuaderno>) {
    cambiarFila(clave, (f) => ({ ...f, resultado: undefined, renglones: f.renglones.map((x, j) => (j === i ? { ...x, ...r } : x)) }));
  }
  function otraVenta() {
    const nueva = filaNueva(claveNueva());
    setFilas((fs) => [...fs, nueva]);
    // El foco va a la hora de la venta nueva: se sigue tipeando sin tocar la pantalla de más.
    requestAnimationFrame(() => document.getElementById(`hora-${nueva.clave}`)?.focus());
  }

  function cargar() {
    if (pendiente || diaCerrado) return;
    const nuevasFaltas: Record<string, string> = {};
    for (const f of porCargar) {
      const falta = faltaEnLaFila(f, porId);
      if (falta) nuevasFaltas[f.clave] = falta;
    }
    setFaltas(nuevasFaltas);
    const primera = porCargar.find((f) => nuevasFaltas[f.clave]);
    if (primera) {
      setResumen({ texto: "Hay ventas incompletas: completalas o quitalas antes de cargar.", todoBien: false });
      document.getElementById(`venta-${primera.clave}`)?.focus();
      return;
    }
    const ventas = porCargar.map((f) => ventaDeLaFila(f, dia)).filter((v) => v !== null);
    if (ventas.length === 0) return;
    empezar(async () => {
      try {
        const r = await cargarVentas(ventas);
        if (!r.ok) {
          setResumen({ texto: r.error, todoBien: false });
          return;
        }
        const porClave = new Map(r.resultados.map((x) => [x.clave, x]));
        setFilas((fs) => fs.map((f) => (porClave.has(f.clave) ? { ...f, resultado: porClave.get(f.clave) } : f)));
        setResumen({ texto: resumenDeLaCarga(r.resultados), todoBien: r.resultados.every((x) => x.estado === "grabada" || x.estado === "ya-estaba") });
      } catch {
        // Se cortó en el medio: no sabemos qué entró. Las claves son las mismas: volver a cargar no duplica.
        setResumen({ texto: "Se cortó la conexión y no sabemos cuáles entraron. Cuando vuelva la señal, tocá «Cargar» de nuevo: las que ya estaban no se duplican.", todoBien: false });
      }
    });
  }

  function limpiarCargadas() {
    setFilas((fs) => {
      const quedan = fs.filter((f) => !filaCargada(f));
      return quedan.length > 0 ? quedan : [filaNueva(claveNueva())];
    });
    setResumen(null);
  }

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-strong">¿De qué día son?</legend>
        <div className="flex flex-wrap items-center gap-2">
          <Chip prendido={dia === hoy} onClick={() => setDia(hoy)}>
            Hoy
          </Chip>
          {ayer >= primerDia && (
            <Chip prendido={dia === ayer} onClick={() => setDia(ayer)}>
              Ayer
            </Chip>
          )}
          <label className="flex items-center gap-2 text-sm text-body">
            <span>Otro día</span>
            <Input
              type="date"
              value={dia}
              min={primerDia}
              max={hoy}
              onChange={(e) => e.target.value && setDia(e.target.value)}
              className="w-auto"
              aria-describedby="ayuda-dia"
            />
          </label>
        </div>
        <p id="ayuda-dia" className="text-xs text-muted">
          Se pueden cargar desde el {formatDayLabel(primerDia)} hasta hoy.
        </p>
        {diaCerrado && (
          <p role="alert" className="rounded-md border border-danger/60 bg-danger-soft/40 p-2 text-sm text-strong">
            El {formatDayLabel(dia)} ya está cerrado: la caja de ese día se contó y se firmó, así que no entran ventas nuevas. Avisale al dueño.
          </p>
        )}
      </fieldset>

      <p className="text-xs text-muted">
        Medios: efectivo, Mercado Pago o transferencia (sólo si viste la plata acreditada). Lo cobrado con el posnet, con el medio en que te
        acredita (provisional a confirmar con el dueño).
      </p>

      <ol className="space-y-3">
        {filas.map((f, n) => {
          const cargada = filaCargada(f);
          const total = totalDeLaFila(f, porId);
          const falta = faltas[f.clave];
          const estado = f.resultado?.estado;
          return (
            <li
              key={f.clave}
              id={`venta-${f.clave}`}
              tabIndex={-1}
              aria-labelledby={`titulo-${f.clave}`}
              className={`rounded-lg border p-3 focus-visible:outline-2 focus-visible:outline-focus ${estado ? CLASE_ESTADO[estado] : "border-line bg-surface-raised"}`}
            >
              <fieldset disabled={cargada || pendiente} className="space-y-3">
                <legend className="sr-only">Venta {n + 1}</legend>
                <div className="flex items-center justify-between gap-2">
                  <p id={`titulo-${f.clave}`} className="text-sm font-semibold text-strong">
                    Venta {n + 1}
                  </p>
                  <span className="text-sm text-body tabular-nums">
                    Da <strong className="text-strong">{textoDelTotal(total)}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-[6rem_1fr] gap-2 sm:grid-cols-[6rem_1fr_1fr]">
                  <label className="flex flex-col gap-1 text-sm text-strong">
                    Hora
                    <Input
                      id={`hora-${f.clave}`}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="11:20"
                      value={f.hora}
                      onChange={(e) => cambiarFila(f.clave, (x) => ({ ...x, hora: e.target.value, resultado: undefined }))}
                      aria-invalid={Boolean(falta && /hora/.test(falta)) || undefined}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-strong">
                    Cliente (si lo anotaste)
                    <Input
                      value={f.cliente}
                      autoComplete="off"
                      onChange={(e) => cambiarFila(f.clave, (x) => ({ ...x, cliente: e.target.value }))}
                    />
                  </label>
                  <div role="group" aria-label={`Cómo pagó la venta ${n + 1}`} className="col-span-2 flex flex-wrap items-end gap-2 sm:col-span-1">
                    {MEDIOS_DE_COBRO.map((m) => (
                      <Chip
                        key={m.valor}
                        prendido={f.medio === m.valor}
                        onClick={() => cambiarFila(f.clave, (x) => ({ ...x, medio: m.valor, resultado: undefined }))}
                      >
                        {m.etiqueta}
                      </Chip>
                    ))}
                  </div>
                </div>

                <ul className="space-y-2">
                  {f.renglones.map((r, i) => {
                    const p = porId.get(r.productId);
                    return (
                      <li key={i} className="grid grid-cols-[1fr_6.5rem_auto] items-end gap-2">
                        <div className="flex min-w-0 flex-col gap-1 text-sm text-strong">
                          <span id={`corte-${f.clave}-${i}`}>Corte</span>
                          <BuscadorCombo
                            opciones={opciones}
                            valor={r.productId}
                            ariaLabel={`Corte ${i + 1} de la venta ${n + 1}`}
                            placeholder="Buscá el corte"
                            onElegir={(id) => cambiarRenglon(f.clave, i, { productId: id })}
                          />
                        </div>
                        <label className="flex flex-col gap-1 text-sm text-strong">
                          {p?.porPeso ? "Peso (kg)" : p ? "Cantidad" : "Cuánto"}
                          <Input
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder={p?.porPeso ? "1,240" : "1"}
                            value={r.cantidad}
                            onChange={(e) => cambiarRenglon(f.clave, i, { cantidad: e.target.value })}
                            className="tabular-nums"
                          />
                        </label>
                        <button
                          type="button"
                          aria-label={`Quitar el corte ${i + 1} de la venta ${n + 1}`}
                          onClick={() =>
                            cambiarFila(f.clave, (x) => ({
                              ...x,
                              resultado: undefined,
                              renglones: x.renglones.length > 1 ? x.renglones.filter((_, j) => j !== i) : [{ productId: "", cantidad: "" }],
                            }))
                          }
                          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                        >
                          ×
                        </button>
                      </li>
                    );
                  })}
                </ul>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => cambiarFila(f.clave, (x) => ({ ...x, renglones: [...x.renglones, { productId: "", cantidad: "" }] }))}
                    className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-accent-ink underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    + Otro corte en esta venta
                  </button>
                  {!cargada && filas.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setFilas((fs) => fs.filter((x) => x.clave !== f.clave))}
                      className="inline-flex min-h-11 items-center rounded-md px-3 text-sm text-muted underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      Quitar esta venta
                    </button>
                  )}
                </div>
              </fieldset>
              {falta && (
                <p role="alert" className="mt-2 text-sm text-danger">
                  {falta}
                </p>
              )}
              {f.resultado && (
                <p role={estado === "rechazada" ? "alert" : "status"} className="mt-2 text-sm text-strong">
                  {estado === "grabada" || estado === "ya-estaba" ? "✓ " : ""}
                  {f.resultado.mensaje}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={otraVenta}
          disabled={pendiente}
          className="inline-flex min-h-11 items-center rounded-md border border-line-strong px-4 text-sm font-medium text-strong hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50"
        >
          + Otra venta
        </button>
        {yaCargadas > 0 && (
          <button
            type="button"
            onClick={limpiarCargadas}
            disabled={pendiente}
            className="inline-flex min-h-11 items-center rounded-md px-3 text-sm text-muted underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Sacar de la lista las ya cargadas ({yaCargadas})
          </button>
        )}
      </div>

      {resumen && (
        <p
          role={resumen.todoBien ? "status" : "alert"}
          className={`rounded-md border p-3 text-sm text-strong ${resumen.todoBien ? "border-success/50 bg-success-soft/40" : "border-warning bg-warning-soft/40"}`}
        >
          {resumen.texto}
        </p>
      )}

      {/* El botón que carga, pegado abajo en el celular por encima de la barra del panel y de la zona
          segura (el mismo patrón que Recibir mercadería); en la PC, en su lugar. */}
      <div className="sticky bottom-[var(--alto-barra-inferior,0px)] z-10 -mx-4 border-t border-line-strong bg-surface px-4 pt-3 pb-[max(0.75rem,calc(env(safe-area-inset-bottom)_-_var(--alto-barra-inferior,0px)))] sm:static sm:z-auto sm:mx-0 sm:border-0 sm:px-0 sm:pb-0">
        <button
          type="button"
          onClick={cargar}
          disabled={pendiente || diaCerrado || porCargar.length === 0}
          aria-busy={pendiente || undefined}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-accent px-4 text-base font-semibold text-on-accent hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:bg-surface-sunken disabled:text-faint sm:w-auto"
        >
          {pendiente
            ? "Cargando…"
            : porCargar.length === 0
              ? "No hay ventas para cargar"
              : porCargar.length === 1
                ? `Cargar 1 venta del ${formatDayLabel(dia)}`
                : `Cargar ${porCargar.length} ventas del ${formatDayLabel(dia)}`}
        </button>
      </div>
    </div>
  );
}
