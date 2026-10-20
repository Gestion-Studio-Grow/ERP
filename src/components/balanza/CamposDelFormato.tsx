"use client";

// Los campos del formato de la etiqueta de la balanza: «Mi balanza es…», prefijos, dígitos del
// producto, peso o importe, y los dos casos menos comunes (etiqueta de 12 dígitos y control del
// precio). Controlado: el estado lo tiene la pantalla que lo usa (Caja con lector y Balanza y
// lector), que también arma el formulario. Los `name` son los que lee `formatoDelFormulario`
// (supermercado/balanza.ts): la marca no se guarda, sólo rellena los campos.

import { Field, Select } from "@/components/ui";
import { armarEtiquetaDeBalanza, describirFormato, digitosDeValor, problemaDelFormato, type FormatoBalanza } from "@/lib/supermercado/balanza";
import { PRESETS_BALANZA, presetDelFormato, presetPorId } from "@/lib/supermercado/balanza-presets";

const PREFIJOS_DE_DOS = ["20", "21", "22", "23", "24", "25", "26", "27", "28", "29"];

export default function CamposDelFormato({ f, setF }: { f: FormatoBalanza; setF: (f: FormatoBalanza) => void }) {
  const problema = problemaDelFormato(f);
  const presetElegido = presetDelFormato(f);
  const unDigito = f.prefijos[0]?.length === 1;
  const usarPreset = (id: string) => {
    const preset = presetPorId(id);
    if (preset) setF({ ...preset.formato, prefijos: [...preset.formato.prefijos] });
  };
  let ejemplo: string | null = null;
  if (!problema) {
    try {
      ejemplo = armarEtiquetaDeBalanza(f, "123", f.contenido === "peso" ? 1.25 : 4520);
    } catch {
      ejemplo = null;
    }
  }
  // El control del precio sólo existe con 4 o 5 dígitos de valor: se ofrece sólo si entra.
  const valorConControl = digitosDeValor({ ...f, verificadorDePrecio: true });
  const admiteControl = valorConControl === 4 || valorConControl === 5;

  return (
    <div className="space-y-4">
      <Field
        label="Mi balanza es…"
        htmlFor="presetBalanza"
        hint={
          presetElegido
            ? `${presetPorId(presetElegido)!.descripcion} Es el formato habitual de la marca: confirmalo probando una etiqueta.`
            : "Los datos de abajo están cargados a mano o detectados con una etiqueta."
        }
      >
        <Select id="presetBalanza" value={presetElegido ?? ""} onChange={(e) => usarPreset(e.target.value)}>
          {PRESETS_BALANZA.map((p) => (
            <option key={p.id} value={p.id}>
              {p.marca}
            </option>
          ))}
          <option value="">Otra (Toledo, Dibal, Digi…): la detecto o la cargo a mano</option>
        </Select>
      </Field>

      <fieldset>
        <legend className="text-sm font-medium text-strong">Con qué empieza la etiqueta</legend>
        <label className="mt-2 flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={unDigito}
            onChange={(e) => setF({ ...f, prefijos: e.target.checked ? ["2"] : ["20"] })}
            className="h-5 w-5"
          />
          Sólo con un 2 (el número siguiente ya es el producto)
        </label>
        {unDigito ? (
          <input type="hidden" name="prefijos" value="2" />
        ) : (
          <div className="mt-2 grid grid-cols-5 gap-2">
            {PREFIJOS_DE_DOS.map((p) => (
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
        )}
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

      <details className="rounded-md border border-line p-3" open={f.largo === 12 || Boolean(f.verificadorDePrecio)}>
        <summary className="min-h-11 cursor-pointer text-sm font-medium text-strong">Casos menos comunes</summary>
        <div className="mt-2 space-y-3">
          <Field label="Cuántos números tiene la etiqueta" htmlFor="largo" hint="Contá los números de abajo del código de barras.">
            <Select id="largo" name="largo" value={f.largo ?? 13} onChange={(e) => setF({ ...f, largo: Number(e.target.value) === 12 ? 12 : 13 })}>
              <option value={13}>13 (lo común)</option>
              <option value={12}>12</option>
            </Select>
          </Field>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="verificadorDePrecio"
              value="si"
              disabled={!admiteControl && !f.verificadorDePrecio}
              checked={Boolean(f.verificadorDePrecio)}
              onChange={(e) => setF({ ...f, verificadorDePrecio: e.target.checked })}
              className="h-5 w-5"
            />
            Lleva un número de control antes del {f.contenido === "peso" ? "peso" : "importe"}
          </label>
          {/* Sin tildar, el checkbox no viaja: el «no» se manda aparte para que guardar lo apague. */}
          {!f.verificadorDePrecio && <input type="hidden" name="verificadorDePrecio" value="no" />}
        </div>
      </details>

      <div className="rounded-md bg-surface-sunken p-3 text-sm" role="status">
        {problema ? (
          <p className="text-danger">{problema}</p>
        ) : (
          <>
            <p className="text-body">{describirFormato(f)}</p>
            {ejemplo && (
              <p className="mt-1 text-muted">
                Así se ve: el producto 123 con {f.contenido === "peso" ? "1,250 kg" : "$4.520"} sale como <span className="font-mono text-strong">{ejemplo}</span>.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
