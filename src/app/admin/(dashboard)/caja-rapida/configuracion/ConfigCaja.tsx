"use client";

// El formulario del formato de la balanza y de los encargados. La vista previa de la etiqueta
// sale de la misma función que la lee en la caja (supermercado/balanza.ts). "Mi balanza es…"
// sólo rellena el formulario con un preset (balanza-presets.ts, provisionales a confirmar con
// una etiqueta real); lo que se guarda sigue siendo el formato, por la misma acción de siempre.

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import { guardarConfigDeCaja, type EstadoConfigCaja } from "@/lib/supermercado/caja-actions";
import { problemaDelFormato, type FormatoBalanza } from "@/lib/supermercado/balanza";
import { presetPorId } from "@/lib/supermercado/balanza-presets";
import CamposDelFormato from "@/components/balanza/CamposDelFormato";
import ProbadorEtiqueta from "./ProbadorEtiqueta";

export default function ConfigCaja({
  formato,
  encargados,
  version,
  usuarios,
  porDefecto,
}: {
  formato: FormatoBalanza;
  encargados: string[];
  version: string | null;
  usuarios: { id: string; name: string; email: string }[];
  porDefecto: boolean;
}) {
  const [estado, accion, enviando] = useActionState<EstadoConfigCaja, FormData>(guardarConfigDeCaja, null);
  const [f, setF] = useState<FormatoBalanza>(formato);
  const problema = problemaDelFormato(f);
  const usarPreset = (id: string) => {
    const preset = presetPorId(id);
    if (preset) setF({ ...preset.formato, prefijos: [...preset.formato.prefijos] });
  };

  return (
    <form action={accion} className="space-y-6">
      <input type="hidden" name="version" value={version ?? ""} />
      <section className="space-y-4 rounded-md border border-line bg-surface-raised p-4">
        <h2 className="text-base font-semibold text-strong">Etiqueta de la balanza</h2>
        {porDefecto && (
          <p className="text-sm text-muted">
            Está el formato de fábrica, el más común. Si la caja no reconoce las etiquetas, pedile al técnico de la balanza estos datos y cargalos acá.
          </p>
        )}
        <CamposDelFormato f={f} setF={setF} />
      </section>

      <ProbadorEtiqueta formato={f} onUsarPreset={usarPreset} />

      <section className="space-y-3 rounded-md border border-line bg-surface-raised p-4">
        <h2 className="text-base font-semibold text-strong">Quién autoriza anular en la caja</h2>
        <p className="text-sm text-muted">Los dueños siempre. Sumá a quien hace de encargado de turno: anula sin pedir otra clave y autoriza las anulaciones de los cajeros.</p>
        {usuarios.length === 0 ? (
          <p className="text-sm text-body">No hay usuarios de recepción todavía. Se agregan en Usuarios.</p>
        ) : (
          <ul className="space-y-1">
            {usuarios.map((u) => (
              <li key={u.id}>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input type="checkbox" name="encargados" value={u.id} defaultChecked={encargados.includes(u.id)} className="h-5 w-5" />
                  <span className="text-strong">{u.name}</span>
                  <span className="text-muted">{u.email}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      {estado && (
        <p role={estado.ok ? "status" : "alert"} className={estado.ok ? "text-sm text-success" : "text-sm font-medium text-danger"}>
          {estado.ok ? estado.mensaje : estado.error}
        </p>
      )}
      <Button type="submit" disabled={enviando || problema !== null}>
        {enviando ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}
