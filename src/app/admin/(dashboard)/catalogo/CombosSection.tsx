"use client";

// ============================================================================
// CATÁLOGO → COMBOS — el combo frecuente como un servicio más (camino A, D8). ABM propio (ADR-055).
// ============================================================================
//
// Reingeniería CH, Tanda 3 · 3-B (CH-034). La dueña elige las zonas que van juntas (Piernas +
// Axilas + Cavado), ve lo que suman (60′, $28.000 por separado), le pone su precio de combo y quién
// lo hace, y lo da de alta. Desde ahí, en «Dar turno» es una tecla más: un turno, un precio.
//
// Es un ALTA: los servicios que lo componen no se tocan (ni precio, ni duración, ni a quién están
// asignados). La asignación del combo es aparte (sólo quien hace todas sus zonas). La baja es sólo
// de los combos hechos acá. Cambiar el precio o el nombre: en Servicios, como cualquier servicio.
//
// Con la migración M3 aplicada, además, «Dar turno» deja sumar zonas sueltas en un solo turno
// (camino B); los combos de acá siguen sirviendo para los que se piden siempre igual.

import { useMemo, useState, useTransition } from "react";
import { crearCombo, darDeBajaCombo } from "@/lib/catalogo/combos-actions";
import { Button, Chip, Input } from "@/components/ui";
import { duracionDelCombo, quienesHacenTodo } from "@/lib/turnos/combos";
import { importeParaFormulario } from "@/lib/pos-peso";
import { leerImporte } from "@/lib/dinero/leer";
import { useToast } from "../ToastProvider";
import { esCombo } from "./catalogo-servicios-core";

export type ServicioDelCatalogo = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
  depositAmount: number | null;
  active: boolean;
  categoryName: string | null;
  description: string | null;
};

export type ProfesionalDelCatalogo = { id: string; name: string; active: boolean; serviceIds: string[] };

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;

export default function CombosSection({ servicios, profesionales }: { servicios: ServicioDelCatalogo[]; profesionales: ProfesionalDelCatalogo[] }) {
  const combos = servicios.filter(esCombo);
  const zonas = servicios.filter((s) => s.active && !esCombo(s));
  return (
    <section aria-labelledby="combos-titulo">
      <h2 id="combos-titulo" className="mb-1 text-lg font-medium text-strong">
        Combos
      </h2>
      <p className="mb-4 text-sm text-muted">
        Los que se piden siempre juntos, con su precio de combo. En «Dar turno» son una tecla más. Armar un combo no cambia los servicios que lo componen.
      </p>
      {combos.length > 0 ? (
        <ul className="mb-6 divide-y divide-line border-y border-line" aria-label="Combos cargados">
          {combos.map((c) => (
            <FilaDeCombo key={c.id} combo={c} profesionales={profesionales} />
          ))}
        </ul>
      ) : (
        <p className="mb-6 text-sm text-body">Todavía no hay combos. Armá el primero abajo.</p>
      )}
      <NuevoCombo zonas={zonas} profesionales={profesionales.filter((p) => p.active)} />
    </section>
  );
}

function FilaDeCombo({ combo, profesionales }: { combo: ServicioDelCatalogo; profesionales: ProfesionalDelCatalogo[] }) {
  const { showError, showSuccess } = useToast();
  const [pendiente, empezar] = useTransition();
  const quienes = profesionales.filter((p) => p.serviceIds.includes(combo.id)).map((p) => p.name);
  const baja = () => {
    if (!confirm(`¿Dar de baja el combo «${combo.name}»? Los turnos ya dados no cambian.`)) return;
    const fd = new FormData();
    fd.set("id", combo.id);
    empezar(async () => {
      try {
        const r = await darDeBajaCombo(fd);
        if (!r.ok) showError(r.error);
        else showSuccess(`Combo «${combo.name}» dado de baja.`);
      } catch {
        showError("No se pudo dar de baja. Probá de nuevo; si sigue, avisá.");
      }
    });
  };
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-strong">
          {combo.name}
          <span className="font-normal tabular-nums text-muted">
            {" "}
            · {combo.durationMin}′ · {pesos(combo.price)}
            {combo.depositAmount ? ` · seña ${pesos(combo.depositAmount)}` : ""}
            {!combo.active ? " · pausado" : ""}
          </span>
        </p>
        <p className="text-xs text-muted">
          {combo.description ?? ""}
          {quienes.length > 0 ? ` · lo hace ${quienes.join(", ")}` : " · nadie lo tiene asignado"}
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" className="max-sm:min-h-11" disabled={pendiente} estado={pendiente ? "cargando" : undefined} onClick={baja}>
        Dar de baja
      </Button>
    </li>
  );
}

function NuevoCombo({ zonas, profesionales }: { zonas: ServicioDelCatalogo[]; profesionales: ProfesionalDelCatalogo[] }) {
  const { showSuccess } = useToast();
  const [ids, setIds] = useState<string[]>([]);
  const [nombre, setNombre] = useState("");
  const [nombreTocado, setNombreTocado] = useState(false);
  const [precio, setPrecio] = useState("");
  const [duracion, setDuracion] = useState("");
  const [senia, setSenia] = useState("");
  const [quienes, setQuienes] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();

  const elegidas = useMemo(() => ids.map((id) => zonas.find((z) => z.id === id)).filter((z): z is ServicioDelCatalogo => !!z), [ids, zonas]);
  const suma = { minutos: duracionDelCombo(elegidas), precio: elegidas.reduce((s, z) => s + z.price, 0) };
  const hacenTodo = quienesHacenTodo(elegidas.map((z) => ({ profesionales: profesionales.filter((p) => p.serviceIds.includes(z.id)).map((p) => p.id) })));
  // Por defecto, todas las que hacen todas las zonas; la dueña puede sacar alguna.
  const marcadas = (quienes ?? hacenTodo).filter((id) => hacenTodo.includes(id));
  const nombreSugerido = elegidas.map((z, i) => (i === 0 ? z.name : z.name.charAt(0).toLowerCase() + z.name.slice(1))).join(" + ");
  const nombreFinal = nombreTocado ? nombre : nombreSugerido;

  const tocar = (id: string) => {
    setError("");
    setQuienes(null);
    setIds((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  };

  const alta = () => {
    setError("");
    const fd = new FormData();
    fd.set("nombre", nombreFinal);
    for (const id of ids) fd.append("serviceIds", id);
    const p = leerImporte(precio);
    fd.set("precio", p.estado === "ok" ? importeParaFormulario(p.valor) : precio);
    fd.set("duracion", duracion.trim() || String(suma.minutos));
    const s = leerImporte(senia);
    if (s.estado === "ok") fd.set("senia", importeParaFormulario(s.valor));
    for (const id of marcadas) fd.append("profesionales", id);
    empezar(async () => {
      try {
        const r = await crearCombo(fd);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        showSuccess(`Combo «${nombreFinal}» dado de alta. Ya aparece en «Dar turno».`);
        setIds([]);
        setNombre("");
        setNombreTocado(false);
        setPrecio("");
        setDuracion("");
        setSenia("");
        setQuienes(null);
      } catch {
        setError("No se pudo dar de alta el combo por un error del sistema. Probá de nuevo; si sigue, avisá.");
      }
    });
  };

  if (zonas.length < 2) return <p className="text-sm text-muted">Para armar un combo hacen falta al menos dos servicios activos.</p>;

  return (
    <div className="space-y-4 rounded-lg border border-line p-4" data-ui="nuevo-combo">
      <p className="text-sm font-medium text-strong">Nuevo combo</p>
      <div role="group" aria-label="Qué lleva el combo" className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
        {zonas.map((z) => (
          <Chip key={z.id} prendido={ids.includes(z.id)} onClick={() => tocar(z.id)} className="max-sm:min-h-11">
            {z.name} · {z.durationMin}′
          </Chip>
        ))}
      </div>
      {elegidas.length > 0 && (
        <p className="text-sm text-body" aria-live="polite">
          {elegidas.length === 1 ? "Elegí al menos una más." : `Por separado: ${suma.minutos}′ y ${pesos(suma.precio)}.`}
        </p>
      )}
      {elegidas.length > 1 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Nombre</span>
              <Input
                value={nombreFinal}
                maxLength={80}
                onChange={(e) => {
                  setNombreTocado(true);
                  setNombre(e.target.value);
                }}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Precio del combo</span>
              <Input importe inputMode="decimal" autoComplete="off" placeholder={String(suma.precio)} value={precio} onChange={(e) => setPrecio(e.target.value)} className="text-right tabular-nums" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Duración (minutos)</span>
              <Input inputMode="numeric" autoComplete="off" placeholder={String(suma.minutos)} value={duracion} onChange={(e) => setDuracion(e.target.value.replace(/\D/g, ""))} className="text-right tabular-nums" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Seña (opcional)</span>
              <Input importe inputMode="decimal" autoComplete="off" value={senia} onChange={(e) => setSenia(e.target.value)} className="text-right tabular-nums" />
            </label>
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted">Quién lo hace</legend>
            {hacenTodo.length === 0 ? (
              <p className="text-sm text-body" role="status">
                Nadie hace todas esas zonas: asignalas en «Asignación de servicios» antes de armar el combo.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {profesionales
                  .filter((p) => hacenTodo.includes(p.id))
                  .map((p) => (
                    <Chip
                      key={p.id}
                      prendido={marcadas.includes(p.id)}
                      onClick={() => setQuienes(marcadas.includes(p.id) ? marcadas.filter((x) => x !== p.id) : [...marcadas, p.id])}
                      className="max-sm:min-h-11"
                    >
                      {p.name}
                    </Chip>
                  ))}
              </div>
            )}
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button type="button" size="lg" className="w-full sm:w-auto" disabled={pendiente || marcadas.length === 0 || !precio.trim()} estado={pendiente ? "cargando" : undefined} onClick={alta}>
            {pendiente ? "Dando de alta…" : "Dar de alta el combo"}
          </Button>
        </>
      )}
    </div>
  );
}
