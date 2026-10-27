"use client";

// ============================================================================
// CAMPO ÚNICO «Escaneá o buscá» — etiqueta de la balanza, código de barras o nombre, en UN campo.
// ============================================================================
//
// Reingeniería Magra, tanda 1 · 1F. Contrato: magra-DISENO.md §4.0 (`CampoUnicoProps`,
// `LecturaUnica`). Lo usan Vender (1B, reemplaza buscador + «Etiqueta de la balanza») y Armar
// (1C). Qué hace:
//   · Enter en el campo → `decidirLectura` (lib/lector/decidir-lectura.ts) → `onLectura`. Etiqueta
//     o código: el campo se vacía para la próxima. Texto o algo que no se pudo leer: queda escrito
//     para corregir o seguir buscando.
//   · Ráfaga SIN foco (`rafaga`, por defecto prendida si hay balanza): el lector que pasa la
//     etiqueta con el foco en un botón o en la página también entra (MG-020/021), con el criterio
//     de Vender (lib/lector/rafaga.ts). Si la ráfaga cayó en el peso o la cantidad de un renglón,
//     ese campo vuelve a lo que tenía: eran los números de la etiqueta, no un peso.
//   · Bip corto al entrar, dos tonos graves si no se pudo leer; se apaga acá mismo.
//   · `aria-live` que dice lo que entró («Entró Vacío: 1,24 kg a $28.600,00/kg…»).
//
// El campo no tiene `name`: no viaja al servidor, que vuelve a decidir todo al cobrar. Quien
// integra devuelve el foco con `enfocarCampoUnico()` después de `limpiar()` (1B).

import { useEffect, useMemo, useState } from "react";
import { Button, Input, cn } from "@/components/ui";
import type { FormatoBalanza } from "@/lib/supermercado/balanza";
import type { LectorDelEquipo } from "@/lib/terminal/lector-core";
import { esCampoDeCantidad } from "@/lib/terminal/lector-core";
import { useLectorDeRafaga, type OrigenDeLaLectura } from "@/lib/terminal/usar-lector";
import {
  anunciarLectura,
  decidirLectura,
  indiceDelCampo,
  type LecturaUnica,
  type ProductoDelCampo,
} from "@/lib/lector/decidir-lectura";
import { LECTOR_DE_FABRICA, rafagaPrendida, teclaParaLaRafaga } from "@/lib/lector/rafaga";
import { bipDelLector, guardarSonidoDelLector, useSonidoDelLector } from "./sonido-del-lector";

export type { LecturaUnica, ProductoDelCampo } from "@/lib/lector/decidir-lectura";

export const ID_CAMPO_UNICO = "campo-unico";

export interface CampoUnicoProps {
  productos: readonly ProductoDelCampo[];
  /** null = sin formato guardado: sólo código y texto. */
  balanza: { formato: FormatoBalanza } | null;
  /** Leer sin foco (default true si hay balanza). */
  rafaga?: boolean;
  /** Foco al montar (default true). */
  autoFoco?: boolean;
  onLectura(l: LecturaUnica): void;
  /** Agregados al contrato (opcionales): id del input, rótulo visible y lector del equipo. */
  id?: string;
  etiqueta?: string;
  /** El prefijo/sufijo del lector de ESTE equipo (perfil de `terminal`); si no, el de fábrica. */
  lector?: LectorDelEquipo;
}

/** Devuelve el foco al campo único (después de cobrar o de `limpiar()`). */
export function enfocarCampoUnico(id: string = ID_CAMPO_UNICO): void {
  const el = document.getElementById(id);
  if (el instanceof HTMLInputElement) el.focus();
}

/** La ráfaga cayó en el peso o la cantidad de un renglón: el campo vuelve a lo que tenía (y React se entera). */
function devolverValor(origen: OrigenDeLaLectura): void {
  const campo = origen.objetivo;
  if (!(campo instanceof HTMLInputElement) || origen.antes === undefined || !esCampoDeCantidad(campo)) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(campo, origen.antes);
  campo.dispatchEvent(new Event("input", { bubbles: true }));
}

type Anuncio = { tono: "ok" | "error"; texto: string; vez: number };

export function CampoUnico({
  productos,
  balanza,
  rafaga,
  autoFoco = true,
  onLectura,
  id = ID_CAMPO_UNICO,
  etiqueta = "Escaneá o buscá",
  lector = LECTOR_DE_FABRICA,
}: CampoUnicoProps) {
  const indice = useMemo(() => indiceDelCampo(productos), [productos]);
  const nombres = useMemo(() => new Map(productos.map((p) => [p.id, p.name])), [productos]);
  const formato = balanza?.formato ?? null;
  const [texto, setTexto] = useState("");
  const [anuncio, setAnuncio] = useState<Anuncio | null>(null);
  const sonido = useSonidoDelLector();

  // `Input` no pasa `ref`: el foco va por el id (el mismo camino que usa quien integra).
  useEffect(() => {
    if (autoFoco) enfocarCampoUnico(id);
  }, [autoFoco, id]);

  function leer(entrada: string, desdeElCampo: boolean) {
    if (desdeElCampo && entrada.trim() === "") return; // Enter con el campo vacío: nada.
    const l = decidirLectura(entrada, indice, formato);
    const error = l.tipo === "desconocida";
    // `vez` cambia el nodo del anuncio: tres etiquetas iguales seguidas se anuncian tres veces.
    setAnuncio((a) => ({ tono: error ? "error" : "ok", texto: anunciarLectura(l, (pid) => nombres.get(pid)), vez: (a?.vez ?? 0) + 1 }));
    if (l.tipo === "etiqueta" || l.tipo === "codigo") {
      bipDelLector("ok", sonido);
      if (desdeElCampo) setTexto("");
    } else if (error) {
      bipDelLector("error", sonido);
    }
    if (!desdeElCampo && autoFoco) enfocarCampoUnico(id);
    onLectura(l);
  }

  useLectorDeRafaga({
    lector: rafagaPrendida(rafaga, balanza !== null) ? lector : null,
    acepta: (e) => teclaParaLaRafaga(e.target as HTMLElement | null, document.querySelector("dialog[open]") !== null),
    alLeer: (codigo, origen) => {
      devolverValor(origen);
      leer(codigo, false);
    },
  });

  const idAnuncio = `${id}-anuncio`;

  return (
    <div data-lector="campo-unico" className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-strong">
          {etiqueta}
        </label>
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={sonido}
          onClick={() => guardarSonidoDelLector(!sonido)}
          title="Prender o apagar el bip del lector"
        >
          {sonido ? "Bip prendido" : "Bip apagado"}
        </Button>
      </div>
      <Input
        id={id}
        type="text"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        placeholder={formato ? "Pasá la etiqueta, el código o escribí el nombre" : "Pasá el código o escribí el nombre"}
        value={texto}
        aria-describedby={idAnuncio}
        aria-invalid={anuncio?.tono === "error" || undefined}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && texto) {
            setTexto("");
            return;
          }
          if (e.key !== "Enter") return;
          // Sin esto, el Enter del lector mandaría el formulario que contiene al campo.
          e.preventDefault();
          leer(texto, true);
        }}
      />
      <p
        id={idAnuncio}
        role={anuncio?.tono === "error" ? "alert" : "status"}
        aria-live="polite"
        className={cn("min-h-5 text-sm", anuncio?.tono === "error" ? "font-medium text-danger" : "text-body")}
      >
        {anuncio && <span key={anuncio.vez}>{anuncio.texto}</span>}
      </p>
    </div>
  );
}

export default CampoUnico;
