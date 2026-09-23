"use client";

// Planilla de RECUENTO por góndola. Client component: no importa nada de servidor (la acción
// llega como referencia de "use server", los helpers son puros).
//
// Qué guarda cada línea: el TEXTO contado (se lee con `leerCantidad`, coma decimal, igual que
// el servidor) y la HORA en que se empezó a tipear, con el reloj del teléfono (`marcaDeConteo`).
// Al guardar, el formulario agrega la hora del teléfono en ese momento (`enviadoA`): el servidor
// usa sólo la diferencia entre las dos ("se contó hace 12 minutos") y compara contra el stock que
// había entonces. No se usa ninguna hora del servidor de cuando se armó la página: al volver con
// Atrás, Next muestra esa página guardada y la hora quedaría vieja (`horaDelConteo`).
//
// Conteo ciego (opcional): esconde el stock del sistema y la diferencia mientras se cuenta,
// para que el número esperado no empuje lo que se anota. La diferencia se ve al guardar.

import { useEffect, useMemo, useState } from "react";
import { registrarRecuento, type EstadoAjuste } from "@/lib/stock-adjustment-actions";
import { AvisoError, Input, Textarea, buttonClasses, fmtMoneyARS } from "@/components/ui";
import { cantidadParaFormulario, formatearCantidad, leerCantidad } from "@/lib/pos-peso";
import { round3 } from "@/lib/stock/ledger";
import { marcaDeConteo } from "@/lib/stock/adjustment-core";
import { useEnvio } from "@/lib/inventario/envio";
import {
  desdeRecuentoReciente,
  pideRecuento,
  resumirRecuento,
  type Gondola,
  type LineaDeRecuento,
} from "@/lib/inventario/recuento";

type Conteo = { texto: string; contadoA: number | null };

const signed = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3, signDisplay: "always" });

function diasDesde(iso: string | null, ahora: number): string {
  if (!iso) return "nunca contado";
  const dias = Math.floor((ahora - Date.parse(iso)) / 86_400_000);
  if (dias <= 0) return "contado hoy";
  return dias === 1 ? "contado ayer" : `contado hace ${dias} días`;
}

function GuardarSubmit({ n, enviando }: { n: number; enviando: boolean }) {
  return (
    <button type="submit" disabled={n === 0 || enviando} className={`${buttonClasses("solid", "lg")} w-full sm:w-auto`}>
      {enviando ? "Guardando…" : n === 0 ? "Cargá lo contado" : `Guardar recuento (${n})`}
    </button>
  );
}

export default function RecuentoForm({
  gondolas,
  conCostos,
  ahoraServidor,
  productoInicial,
  conTope = false,
}: {
  gondolas: Gondola[];
  conCostos: boolean;
  /** Hora del servidor al armar la pantalla. SÓLO para mostrar "contado hace N días". */
  ahoraServidor: number;
  productoInicial: string | null;
  /**
   * ¿Quien cuenta tiene tope por carga (el encargado)? El faltante del recuento pasa por el
   * mismo tope que la merma; se avisa antes de contar, sin el monto (no ve costos).
   */
  conTope?: boolean;
}) {
  const inicial = productoInicial ? gondolas.find((g) => g.productos.some((p) => p.id === productoInicial))?.id : undefined;
  const [gondola, setGondola] = useState<string>(inicial ?? gondolas[0]?.id ?? "");
  const [ciego, setCiego] = useState(false);
  const [conteos, setConteos] = useState<Record<string, Conteo>>({});
  const [nota, setNota] = useState("");
  useEffect(() => {
    if (productoInicial) document.getElementById(`cont-${productoInicial}`)?.focus();
  }, [productoInicial]);

  // Si se guardó, la planilla vuelve a empezar: el resultado queda a la vista y un segundo
  // toque no guarda el mismo recuento dos veces. Antes de enviar se agrega la hora del
  // teléfono al tocar Guardar: con ella el servidor sabe hace cuánto se contó cada línea.
  // `useEnvio` (onSubmit) y no `<form action>`: con action, React vaciaba el formulario también
  // cuando el recuento volvía con error.
  const { estado, enviar, enviando } = useEnvio<EstadoAjuste>(async (prev, fd) => {
    fd.set("enviadoA", String(Date.now()));
    const r = await registrarRecuento(prev, fd);
    if (r?.ok) {
      setConteos({});
      setNota("");
    }
    return r;
  }, null);

  const todos = useMemo(() => gondolas.flatMap((g) => g.productos), [gondolas]);
  const actual = gondolas.find((g) => g.id === gondola) ?? gondolas[0];
  const reciente = desdeRecuentoReciente(new Date(ahoraServidor));

  // Lo que viaja: sólo los productos con algo legible, de TODAS las góndolas (cambiar de
  // góndola no pierde lo contado).
  const cargados = todos.flatMap((p) => {
    const c = conteos[p.id];
    if (!c) return [];
    const l = leerCantidad(c.texto);
    return l.estado === "ok" && c.contadoA !== null ? [{ p, valor: l.valor, contadoA: c.contadoA }] : [];
  });
  const ilegibles = todos.filter((p) => conteos[p.id] && leerCantidad(conteos[p.id].texto).estado === "invalida");

  return (
    <div className="space-y-6">
      {estado?.ok === false && <AvisoError titulo="No se guardó el recuento" comoSeguir={estado.error} />}
      {estado?.ok && estado.recuento && <Resultado mensaje={estado.mensaje} lineas={estado.recuento} conCostos={conCostos} />}

      <form onSubmit={enviar} className="space-y-4">
        {/* Góndolas: cada una es un tramo del recorrido. */}
        {gondolas.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Góndola">
            {gondolas.map((g) => {
              const n = g.productos.filter((p) => conteos[p.id]).length;
              return (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={g.id === actual?.id}
                  onClick={() => setGondola(g.id)}
                  className={`chip-btn min-h-11 text-sm ${g.id === actual?.id ? "bg-accent text-on-accent" : ""}`}
                >
                  {g.nombre}
                  <span className="ml-1 tabular-nums opacity-80">
                    {n}/{g.productos.length}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <label className="flex min-h-11 items-center gap-3 text-sm text-body">
          <input
            type="checkbox"
            checked={ciego}
            onChange={(e) => setCiego(e.target.checked)}
            className="size-5 accent-[var(--accent)]"
          />
          Conteo ciego: no mostrar el stock del sistema mientras cuento
        </label>
        {!ciego && (
          <p className="text-xs text-faint">
            La diferencia que ves al lado de cada uno es contra el stock de este momento. Al guardar se calcula con lo que
            había cuando lo contaste.
          </p>
        )}
        {conTope && (
          <p className="text-xs text-muted">
            Tenés un tope por carga: si el recuento da un faltante grande, no se guarda y lo guarda la dueña o el dueño.
          </p>
        )}

        <ul className="divide-y divide-line rounded-lg border border-line">
          {actual?.productos.map((p) => {
            const c = conteos[p.id];
            const l = c ? leerCantidad(c.texto) : null;
            const dif = l?.estado === "ok" ? round3(l.valor - p.stock) : null;
            const pide = pideRecuento(p.ultimoRecuento, reciente);
            return (
              <li key={p.id} className="grid grid-cols-[1fr_7.5rem] items-center gap-x-3 gap-y-1 px-3 py-3">
                <div className="min-w-0">
                  <label htmlFor={`cont-${p.id}`} className="block text-sm font-medium text-strong">
                    {p.nombre}
                  </label>
                  <p className="text-xs text-muted">
                    {!ciego && (
                      <span className="tabular-nums">
                        sistema {formatearCantidad(p.stock)} {p.unidad} ·{" "}
                      </span>
                    )}
                    <span className={pide ? "text-warning" : ""}>{diasDesde(p.ultimoRecuento, ahoraServidor)}</span>
                  </p>
                </div>
                <Input
                  id={`cont-${p.id}`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={p.kilo ? "kg" : p.unidad}
                  aria-invalid={l?.estado === "invalida" ? true : undefined}
                  value={c?.texto ?? ""}
                  onChange={(e) => {
                    const texto = e.target.value;
                    const ahora = Date.now();
                    setConteos((m) => {
                      const n = { ...m };
                      if (texto.trim() === "") delete n[p.id];
                      else n[p.id] = { texto, contadoA: marcaDeConteo(m[p.id], texto, ahora) };
                      return n;
                    });
                  }}
                  className="h-11 text-right tabular-nums"
                />
                {l?.estado === "invalida" && (
                  <p role="alert" className="col-span-2 text-xs text-danger">
                    Eso no es una cantidad. Escribila con coma si tiene gramos (4,350).
                  </p>
                )}
                {!ciego && dif !== null && dif !== 0 && (
                  <p className={`col-span-2 text-xs tabular-nums ${dif < 0 ? "text-danger" : "text-success"}`}>
                    {signed.format(dif)} {p.unidad}
                    {conCostos && p.costo !== null && ` · ${fmtMoneyARS(dif * p.costo)}`}
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        {/* Lo que viaja a la acción: arrays paralelos, en forma canónica. */}
        {cargados.map(({ p, valor, contadoA }) => (
          <span key={p.id} hidden>
            <input type="hidden" name="productId" value={p.id} />
            <input type="hidden" name="value" value={cantidadParaFormulario(valor)} />
            <input type="hidden" name="contadoA" value={String(contadoA)} />
          </span>
        ))}

        <label className="block text-sm">
          <span className="mb-1 block text-muted">Nota (opcional)</span>
          <Textarea name="note" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: recuento del lunes, heladera 2" />
        </label>

        {ilegibles.length > 0 && (
          <p role="alert" className="text-sm text-danger">
            Hay {ilegibles.length === 1 ? "1 cantidad que no se entiende" : `${ilegibles.length} cantidades que no se entienden`}:{" "}
            {ilegibles.map((p) => p.nombre).join(", ")}. Corregilas antes de guardar.
          </p>
        )}
        <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-faint">Se guardan sólo los que cargaste. Los que coinciden quedan registrados como contados.</p>
          <GuardarSubmit n={ilegibles.length > 0 ? 0 : cargados.length} enviando={enviando} />
        </div>
      </form>
    </div>
  );
}

function Resultado({ mensaje, lineas, conCostos }: { mensaje: string; lineas: LineaDeRecuento[]; conCostos: boolean }) {
  const r = resumirRecuento(lineas);
  const conDiferencia = lineas.filter((l) => l.diferencia !== 0);
  return (
    <section role="status" className="rounded-lg border border-success/30 bg-success-soft p-4">
      <p className="text-sm font-semibold text-strong">{mensaje}</p>
      {conCostos && (r.pesosFaltante > 0 || r.pesosSobrante > 0) && (
        <p className="mt-1 text-sm text-body">
          Faltante {fmtMoneyARS(r.pesosFaltante)} · sobrante {fmtMoneyARS(r.pesosSobrante)} a costo
          {r.sinCosto > 0 && ` (${r.sinCosto} sin costo cargado)`}.
        </p>
      )}
      {conDiferencia.length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-surface-raised">
          {conDiferencia.map((l, i) => (
            <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-2 text-sm">
              <span className="text-strong">{l.nombre}</span>
              <span className="tabular-nums text-body">
                había {formatearCantidad(l.teorico)} · contaste {formatearCantidad(l.contado)} ·{" "}
                <span className={l.diferencia < 0 ? "font-medium text-danger" : "font-medium text-success"}>
                  {signed.format(l.diferencia)} {l.unidad}
                </span>
                {conCostos && l.pesos !== null && ` · ${fmtMoneyARS(l.pesos)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
