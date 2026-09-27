"use client";

// El formulario del formato de la balanza y de los encargados. La vista previa de la etiqueta
// sale de la misma función que la lee en la caja (supermercado/balanza.ts).

import { useActionState, useState } from "react";
import { Button, Field, Select } from "@/components/ui";
import { guardarConfigDeCaja, type EstadoConfigCaja } from "@/lib/supermercado/caja-actions";
import { armarEtiquetaDeBalanza, describirFormato, problemaDelFormato, type FormatoBalanza } from "@/lib/supermercado/balanza";

const PREFIJOS = ["20", "21", "22", "23", "24", "25", "26", "27", "28", "29"];

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
  let ejemplo: string | null = null;
  if (!problema) {
    try {
      ejemplo = armarEtiquetaDeBalanza(f, "123", f.contenido === "peso" ? 1.25 : 4520);
    } catch {
      ejemplo = null;
    }
  }

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
        <fieldset>
          <legend className="text-sm font-medium text-strong">Prefijos que imprime la balanza</legend>
          <div className="mt-2 grid grid-cols-5 gap-2">
            {PREFIJOS.map((p) => (
              <label key={p} className="flex min-h-11 items-center gap-2 rounded-md border border-line px-2 text-sm">
                <input
                  type="checkbox"
                  name="prefijos"
                  value={p}
                  checked={f.prefijos.includes(p)}
                  onChange={(e) => setF({ ...f, prefijos: e.target.checked ? [...f.prefijos, p].sort() : f.prefijos.filter((x) => x !== p) })}
                  className="h-5 w-5"
                />
                {p}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Dígitos del código del producto" htmlFor="digitosProducto">
          <Select id="digitosProducto" name="digitosProducto" value={f.digitosProducto} onChange={(e) => setF({ ...f, digitosProducto: Number(e.target.value) as 4 | 5 | 6 })}>
            <option value={4}>4</option>
            <option value={5}>5</option>
            <option value={6}>6</option>
          </Select>
        </Field>
        <Field label="La etiqueta trae" htmlFor="contenido">
          <Select
            id="contenido"
            name="contenido"
            value={f.contenido}
            onChange={(e) => {
              const contenido = e.target.value as "peso" | "importe";
              setF({ ...f, contenido, decimales: contenido === "peso" ? 3 : 0 });
            }}
          >
            <option value="peso">El peso</option>
            <option value="importe">El importe</option>
          </Select>
        </Field>
        <Field label={f.contenido === "peso" ? "El peso viene en" : "El importe viene en"} htmlFor="decimales">
          <Select id="decimales" name="decimales" value={f.decimales} onChange={(e) => setF({ ...f, decimales: Number(e.target.value) })}>
            {f.contenido === "peso" ? (
              <>
                <option value={3}>Gramos (3 decimales)</option>
                <option value={2}>Decenas de gramos (2 decimales)</option>
              </>
            ) : (
              <>
                <option value={0}>Pesos, sin centavos</option>
                <option value={1}>Pesos con décimos</option>
                <option value={2}>Pesos con centavos</option>
              </>
            )}
          </Select>
        </Field>
        <div className="rounded-md bg-surface-sunken p-3 text-sm">
          {problema ? (
            <p className="text-danger">{problema}</p>
          ) : (
            <>
              <p className="text-body">{describirFormato(f)}</p>
              {ejemplo && (
                <p className="mt-1 text-muted">
                  Ejemplo: el producto 123 con {f.contenido === "peso" ? "1,250 kg" : "$4.520"} sale como <span className="font-mono text-strong">{ejemplo}</span>.
                </p>
              )}
            </>
          )}
        </div>
      </section>

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
