"use client";

// CRM COMERCIAL · alta, cambio o baja de UN miembro (GSG-CRM-011). Una acción = una llamada a guardarMiembroCrm;
// el permiso («configurar», sólo Dirección) y las reglas (puesto válido, topes, que el CRM no quede sin Dirección)
// las decide el servidor. Si rechaza, se muestra su motivo tal cual.

import { useId, useState } from "react";
import { Button, Input, Select } from "@/components/ui";
import type { Puesto, Rol } from "@/lib/crm-comercial/permisos";
import { guardarMiembroCrm } from "@/lib/crm-comercial/acciones";
import { Resultado, ROTULO } from "../Avisos";
import { useAccion } from "../useAccion";

export interface MiembroActual {
  rol: Rol;
  puesto: Puesto | null;
  activo: boolean;
  topeAccionesDia: number | null;
  topeCostoDiaUsd: number | null;
}

const ROLES: { valor: Rol; etiqueta: string }[] = [
  { valor: "DIRECCION", etiqueta: "Dirección" },
  { valor: "COMERCIAL", etiqueta: "Comercial" },
  { valor: "PUESTO", etiqueta: "Puesto del equipo" },
];

/** Vacío = sin tope (null). Un número inválido devuelve undefined: se avisa sin llamar al servidor. */
function tope(v: string, entero: boolean): number | null | undefined {
  const t = v.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || (entero && !Number.isInteger(n))) return undefined;
  return n;
}

export function FormularioMiembro({ userId, nombre, actual, puestos }: { userId: string; nombre: string; actual: MiembroActual | null; puestos: readonly { valor: Puesto; etiqueta: string }[] }) {
  const id = useId();
  const { correr, pendiente, motivo, hecho } = useAccion();
  const [aviso, setAviso] = useState<string | null>(null);
  const [f, setF] = useState({
    rol: actual?.rol ?? "COMERCIAL",
    puesto: actual?.puesto ?? "",
    acciones: actual?.topeAccionesDia == null ? "" : String(actual.topeAccionesDia),
    costo: actual?.topeCostoDiaUsd == null ? "" : String(actual.topeCostoDiaUsd),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const esPuesto = f.rol === "PUESTO";

  function guardar(listo: string) {
    setAviso(null);
    const acciones = esPuesto ? tope(f.acciones, true) : null;
    const costo = esPuesto ? tope(f.costo, false) : null;
    if (acciones === undefined || costo === undefined) {
      setAviso("Los topes van en números positivos (acciones por día, entero) o vacíos si no hay tope.");
      return;
    }
    correr(() => guardarMiembroCrm({ userId, rol: f.rol, puesto: esPuesto ? f.puesto || null : null, topeAccionesDia: acciones, topeCostoDiaUsd: costo, activo: true }), { listo });
  }

  // Desactivar guarda el papel que TIENE (no lo que esté a medio cambiar en el formulario), sin acceso.
  function desactivar() {
    if (!actual) return;
    setAviso(null);
    correr(() => guardarMiembroCrm({ userId, rol: actual.rol, puesto: actual.puesto, topeAccionesDia: actual.topeAccionesDia, topeCostoDiaUsd: actual.topeCostoDiaUsd, activo: false }), { listo: "Listo: quedó sin acceso al CRM." });
  }

  return (
    <form
      className="grid gap-3"
      aria-label={`Papel de ${nombre} en el CRM`}
      onSubmit={(e) => {
        e.preventDefault();
        guardar(actual ? "Listo: cambio guardado." : "Listo: quedó dado de alta.");
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor={`${id}-rol`} className={ROTULO}>Papel</label>
          <Select id={`${id}-rol`} value={f.rol} onChange={set("rol")} className="w-full">
            {ROLES.map((r) => <option key={r.valor} value={r.valor}>{r.etiqueta}</option>)}
          </Select>
        </div>
        {esPuesto && (
          <div className="min-w-0">
            <label htmlFor={`${id}-puesto`} className={ROTULO}>Cuál puesto</label>
            <Select id={`${id}-puesto`} value={f.puesto} onChange={set("puesto")} className="w-full" required>
              <option value="">Elegí el puesto</option>
              {puestos.map((p) => <option key={p.valor} value={p.valor}>{p.etiqueta}</option>)}
            </Select>
          </div>
        )}
      </div>
      {esPuesto && (
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-1 text-sm text-muted">Topes por día (opcionales: vacío es sin tope). Pasado el tope, el puesto se frena hasta el día siguiente.</legend>
          <div className="min-w-0">
            <label htmlFor={`${id}-acc`} className={ROTULO}>Acciones por día</label>
            <Input id={`${id}-acc`} type="number" inputMode="numeric" min={0} step={1} value={f.acciones} onChange={set("acciones")} className="w-full" />
          </div>
          <div className="min-w-0">
            <label htmlFor={`${id}-usd`} className={ROTULO}>Gasto por día (US$)</label>
            <Input id={`${id}-usd`} type="number" inputMode="decimal" min={0} step={0.01} value={f.costo} onChange={set("costo")} className="w-full" />
          </div>
        </fieldset>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pendiente}>
          {pendiente ? "Guardando…" : !actual ? "Dar de alta" : actual.activo ? "Guardar cambios" : "Reactivar con este papel"}
        </Button>
        {actual?.activo && (
          <Button type="button" size="sm" variant="outline" disabled={pendiente} onClick={desactivar}>
            Desactivar
          </Button>
        )}
      </div>
      <Resultado motivo={aviso ?? motivo} hecho={hecho} />
    </form>
  );
}
