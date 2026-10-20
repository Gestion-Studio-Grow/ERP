// "Probá una etiqueta": el dueño pasa por el lector (o pega) una etiqueta que imprimió su
// balanza y ve cómo la lee la caja con el formato que está configurando, ANTES de guardar.
// No guarda nada ni va al servidor: usa las mismas funciones puras que la caja
// (supermercado/balanza.ts vía balanza-presets.ts). Lo usa sólo ConfigCaja (componente de
// cliente), por eso no lleva su propio "use client".

import { useId, useState } from "react";
import { Button, Field, Input, fmtMoneyARS, fmtNumberAR } from "@/components/ui";
import { leerEtiquetaDeBalanza, type FormatoBalanza, type LecturaBalanza } from "@/lib/supermercado/balanza";
import {
  PRESETS_BALANZA,
  presetDelFormato,
  presetQueCalza,
  probarEtiqueta,
  type IdPresetBalanza,
} from "@/lib/supermercado/balanza-presets";

type Leida = Extract<LecturaBalanza, { ok: true }>;

function valorLeido(l: Leida, decimales: number): string {
  return l.contenido === "peso" ? `${fmtNumberAR(l.peso, 3)} kg` : fmtMoneyARS(l.importe, decimales);
}

export default function ProbadorEtiqueta({
  formato,
  onUsarPreset,
  nivel = 2,
}: {
  formato: FormatoBalanza;
  onUsarPreset: (id: IdPresetBalanza) => void;
  /** Nivel del título: 2 en Caja con lector, 3 adentro de una sección de Balanza y lector. */
  nivel?: 2 | 3;
}) {
  const Titulo = nivel === 3 ? "h3" : "h2";
  const [texto, setTexto] = useState("");
  const tituloId = useId();
  const resultado = probarEtiqueta(texto, formato);
  const elegido = presetDelFormato(formato);
  // Las otras opciones que también leen esta etiqueta (el mismo código se puede leer como peso
  // o como importe: el dueño compara con lo que dice impreso la etiqueta).
  const otras =
    resultado.estado === "vacio"
      ? []
      : presetQueCalza(resultado.codigo)
          .filter((id) => id !== elegido)
          .map((id) => PRESETS_BALANZA.find((p) => p.id === id)!)
          .map((p) => ({ preset: p, lectura: leerEtiquetaDeBalanza(resultado.codigo, p.formato) as Leida }));

  return (
    <section aria-labelledby={tituloId} className="space-y-3 rounded-md border border-line bg-surface-raised p-4">
      <Titulo id={tituloId} className="text-base font-semibold text-strong">
        Probá una etiqueta
      </Titulo>
      <p className="text-sm text-muted">
        Pasá por el lector una etiqueta que haya impreso tu balanza, o tipeá los números de abajo del código de barras. Te
        mostramos cómo la lee la caja con lo que elegiste arriba. No se guarda nada.
      </p>
      <Field label="Código de la etiqueta" htmlFor="probador-etiqueta">
        <Input
          id="probador-etiqueta"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          // El lector manda un Enter al final: acá no tiene que guardar el formulario.
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          placeholder="Ej.: 2000123012506"
          className="font-mono"
        />
      </Field>

      {/* La región de estado está siempre montada (si aparece recién con el texto, el lector de
          pantalla no lo anuncia); vacía no ocupa lugar. */}
      <div role="status" aria-live="polite" className={resultado.estado === "vacio" ? undefined : "rounded-md bg-surface-sunken p-3 text-sm"}>
        {resultado.estado === "aviso" && <p className="text-danger">{resultado.mensaje}</p>}
        {resultado.estado === "leida" && (
          <>
            <p className="font-medium text-success">La caja la lee bien.</p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-muted">Producto en la balanza</dt>
              <dd className="font-mono text-strong">{resultado.lectura.plu}</dd>
              <dt className="text-muted">{resultado.lectura.contenido === "peso" ? "Peso" : "Importe"}</dt>
              <dd className="text-strong">{valorLeido(resultado.lectura, formato.decimales)}</dd>
              <dt className="text-muted">Último dígito</dt>
              <dd className="text-strong">Cierra: el código se leyó entero</dd>
            </dl>
            <p className="mt-2 text-muted">Fijate que coincida con lo que dice impreso la etiqueta.</p>
          </>
        )}
      </div>

      {otras.length > 0 && (
        <div className="space-y-2 text-sm">
          <p className="text-body">
            {resultado.estado === "leida" ? "También se lee con otras opciones. Si la etiqueta dice otra cosa, elegí la que coincida:" : "Con estas opciones sí se lee:"}
          </p>
          <ul className="space-y-2">
            {otras.map(({ preset, lectura }) => (
              <li key={preset.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line p-2">
                <span>
                  <span className="font-medium text-strong">{preset.marca}</span>
                  <span className="text-muted">
                    {" "}
                    · producto {lectura.plu} · {lectura.contenido === "peso" ? "peso" : "importe"} {valorLeido(lectura, preset.formato.decimales)}
                  </span>
                </span>
                <Button variant="outline" size="sm" onClick={() => onUsarPreset(preset.id)} aria-label={`Usar esta: ${preset.marca}`}>
                  Usar esta
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted">
        Los formatos por marca son un punto de partida: el que manda es el que programó el técnico de tu balanza. Si tu etiqueta
        no se lee, probá otra opción o pedinos ayuda.
      </p>
    </section>
  );
}
