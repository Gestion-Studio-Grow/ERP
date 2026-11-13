"use client";

// ============================================================================
// PEDÍ LOCAL · EL SELECTOR DE OPCIONES — «Tamaño» (una) y «Leche y extras» (varias), al agregar.
// ============================================================================
//
// Se abre dentro de la tarjeta del producto (no es un modal: el foco sigue en la página). Los grupos
// y recargos salen de la config del local (src/lib/delivery-local/opciones.ts) y se validan con la
// MISMA `leerEleccion` del servidor. El precio que muestra es vista previa: el servidor recalcula.
// Los controles NO están dentro del formulario del pedido: no viajan; viaja la elección codificada
// de cada línea de la bolsa.

import { useState } from "react";
import { codificarEleccion, leerEleccion, recargoUnitario, type GrupoDeOpciones } from "@/lib/delivery-local/opciones";
import s from "./local.module.css";

const plata = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

/** De entrada, la primera opción de cada grupo único obligatorio (la de menor tamaño, sin recargo). */
function eleccionInicial(grupos: readonly GrupoDeOpciones[]): Record<string, string[]> {
  const r: Record<string, string[]> = {};
  for (const g of grupos) if (g.tipo === "unico" && g.obligatorio && g.opciones[0]) r[g.id] = [g.opciones[0].id];
  return r;
}

export default function SelectorDeOpciones({
  id,
  nombre,
  precioBase,
  grupos,
  alSumar,
  alCerrar,
}: {
  /** Prefijo único para los name/id de los controles (el id del producto). */
  id: string;
  nombre: string;
  precioBase: number;
  grupos: readonly GrupoDeOpciones[];
  /** La elección codificada (canónica), lista para la clave de la bolsa. */
  alSumar: (opciones: string) => void;
  alCerrar: () => void;
}) {
  const [eleccion, setEleccion] = useState(() => eleccionInicial(grupos));
  const [error, setError] = useState<string | null>(null);
  const texto = grupos
    .filter((g) => (eleccion[g.id] ?? []).length > 0)
    .map((g) => `${g.id}:${eleccion[g.id].join(",")}`)
    .join("|");
  const lectura = leerEleccion(grupos, texto, nombre);
  const precio = precioBase + (lectura.ok ? recargoUnitario(lectura.elegidas) : 0);

  function elegir(g: GrupoDeOpciones, opcion: string, marcada: boolean) {
    setError(null);
    setEleccion((e) => {
      const antes = e[g.id] ?? [];
      const ahora = g.tipo === "unico" ? (marcada ? [opcion] : []) : marcada ? [...antes, opcion] : antes.filter((x) => x !== opcion);
      return { ...e, [g.id]: ahora };
    });
  }

  function sumar() {
    if (!lectura.ok) {
      setError(lectura.error);
      return;
    }
    alSumar(codificarEleccion(lectura.elegidas));
  }

  return (
    <div className={s.selector} role="group" aria-label={`Opciones de ${nombre}`}>
      {grupos.map((g) => (
        <fieldset key={g.id} className={s.grupo}>
          <legend className={s.leyenda}>
            {g.nombre}
            {g.obligatorio ? " *" : g.tipo === "multiple" ? " (opcional)" : ""}
          </legend>
          <div className={s.opciones}>
            {g.opciones.map((o) => {
              const marcada = (eleccion[g.id] ?? []).includes(o.id);
              return (
                <label key={o.id} className={s.opcion}>
                  <input
                    type={g.tipo === "unico" ? "radio" : "checkbox"}
                    name={`op-${id}-${g.id}`}
                    value={o.id}
                    checked={marcada}
                    onChange={(e) => elegir(g, o.id, e.currentTarget.checked)}
                  />
                  <span>
                    {o.nombre}
                    {o.recargo > 0 ? ` · +${plata.format(o.recargo)}` : ""}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      {error && (
        <p role="alert" className={s.ayuda}>
          {error}
        </p>
      )}
      <div className={s.opciones}>
        <button type="button" className={`${s.boton} ${s.botonPrincipal}`} onClick={sumar}>
          Sumar al pedido · {plata.format(precio)}
        </button>
        <button type="button" className={s.boton} onClick={alCerrar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
