"use client";

// La parte «etiqueta» de Balanza y lector: detectar el formato con una etiqueta real, ajustarlo
// a mano si hace falta, probarlo y guardarlo. Lo que se guarda es el formato (el mismo que lee la
// caja con lector), por `guardarFormatoDeBalanza`.

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import { problemaDelFormato, type FormatoBalanza } from "@/lib/supermercado/balanza";
import { presetPorId } from "@/lib/supermercado/balanza-presets";
import { guardarFormatoDeBalanza, type EstadoBalanza } from "@/lib/balanza/balanza-actions";
import CamposDelFormato from "@/components/balanza/CamposDelFormato";
import DetectarConEtiqueta from "@/components/balanza/DetectarConEtiqueta";
import ProbadorEtiqueta from "../caja-rapida/configuracion/ProbadorEtiqueta";

export default function EtiquetaDeLaBalanza({ formato, version, guardado }: { formato: FormatoBalanza; version: string | null; guardado: boolean }) {
  const [estado, accion, enviando] = useActionState<EstadoBalanza, FormData>(guardarFormatoDeBalanza, null);
  const [f, setF] = useState<FormatoBalanza>(formato);
  const [elegido, setElegido] = useState(false);
  const problema = problemaDelFormato(f);
  const usar = (nuevo: FormatoBalanza) => {
    setF({ ...nuevo, prefijos: [...nuevo.prefijos] });
    setElegido(true);
  };

  return (
    <div className="space-y-4">
      <DetectarConEtiqueta alElegir={usar} />
      <form action={accion} className="space-y-4">
        <input type="hidden" name="version" value={version ?? ""} />
        <section className="space-y-4 rounded-md border border-line bg-surface-raised p-4" aria-labelledby="formato-titulo">
          <h3 id="formato-titulo" className="text-base font-semibold text-strong">
            El formato de tu etiqueta
          </h3>
          <p className="text-sm text-muted">
            {elegido
              ? "Lo completamos con lo que detectaste. Probalo abajo con otra etiqueta antes de guardar."
              : guardado
                ? "Este es el formato con que se leen hoy tus etiquetas."
                : "Todavía no guardaste el formato de tu balanza: hasta que lo guardes, Vender y Pedidos no muestran el campo de la etiqueta."}
          </p>
          <CamposDelFormato f={f} setF={setF} />
        </section>
        <ProbadorEtiqueta nivel={3} formato={f} onUsarPreset={(id) => usar(presetPorId(id)!.formato)} />
        <p role={estado && !estado.ok ? "alert" : "status"} className={estado && !estado.ok ? "text-sm font-medium text-danger" : "text-sm text-success"}>
          {estado ? (estado.ok ? estado.mensaje : estado.error) : ""}
        </p>
        <Button type="submit" disabled={enviando || problema !== null}>
          {enviando ? "Guardando…" : "Guardar el formato"}
        </Button>
      </form>
    </div>
  );
}
