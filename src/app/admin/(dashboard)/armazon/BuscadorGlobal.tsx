"use client";

// ============================================================================
// EL BUSCADOR GLOBAL «/» EN EL ARMAZÓN DE SIEMPRE (CH con «Diseño nuevo» apagado).
// ============================================================================
//
// Reingeniería CH, Tanda 2 (§2.1, §3.5, CH-028): desde cualquier pantalla del panel, «/» abre el
// buscador de clientas y turnos (la paleta de Ctrl/⌘K con fichas: src/components/ui/PaletaDeComandos.tsx
// + src/lib/clientes/buscar-actions.ts). Lo monta AdminShell (ArmazonDeSiempre) SÓLO si quien mira
// ve la agenda; con el diseño nuevo prendido lo atiende ArmazonNuevo.
//
// HTML DE SIEMPRE: cerrado no dibuja NADA (ni un nodo): la paleta y la hoja de la piel se piden
// recién la primera vez que se abre (`next/dynamic` + `PielPropia conHoja`). El armazón de CH
// sigue rindiendo el HTML de HEAD (armazon/armazon-ch.test.ts).
//
// LA TECLA: se escucha en la fase de CAPTURA de `window`, antes que el «/» de siempre (que enfoca el
// filtro del menú, AdminShell `NavBuscable`): si es nuestra, se la queda (`stopImmediatePropagation`)
// y el filtro no se entera; en un campo de texto no es nuestra (`esAtajoDeBuscar`) y la barra se
// escribe. Ctrl/⌘K sigue siendo el filtro del menú, como siempre.
// Cualquier botón «Buscar» de una pantalla lo abre con `abrirBuscadorGlobal()` (buscar-global.ts).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { buscarClientasYTurnos } from "@/lib/clientes/buscar-actions";
import PielPropia from "./PielPropia";
import { EVENTO_BUSCAR, comandosDelMenu, esAtajoDeBuscar } from "./buscar-global";

const PaletaDeComandos = dynamic(() => import("@/components/ui/PaletaDeComandos").then((m) => m.PaletaDeComandos));

export default function BuscadorGlobal({
  menu,
  letraDelNegocio = false,
}: {
  /** La barra de la persona (ya decidida en el servidor): «/» también lleva a sus pantallas. */
  menu: readonly { href: string; label: string }[];
  letraDelNegocio?: boolean;
}) {
  const [abierta, setAbierta] = useState(false);
  // Una vez abierta queda montada (cerrar es `dialog.close()`, con su salida); antes, nada.
  const [montada, setMontada] = useState(false);
  const focoAntes = useRef<HTMLElement | null>(null);
  const comandos = useMemo(() => comandosDelMenu(menu), [menu]);

  const abrir = useCallback(() => {
    focoAntes.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setMontada(true);
    setAbierta(true);
  }, []);
  const cerrar = useCallback(() => {
    setAbierta(false);
    // Devolver el foco a donde estaba (si sigue en la página).
    const antes = focoAntes.current;
    if (antes?.isConnected) requestAnimationFrame(() => antes.focus());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!esAtajoDeBuscar(e)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      abrir();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener(EVENTO_BUSCAR, abrir);
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener(EVENTO_BUSCAR, abrir);
    };
  }, [abrir]);

  if (!montada) return null;
  return (
    <PielPropia pantalla="buscador-global" conHoja letraDelNegocio={letraDelNegocio}>
      <PaletaDeComandos
        abierta={abierta}
        onCerrar={cerrar}
        comandos={comandos}
        buscarFichas={buscarClientasYTurnos}
        etiqueta="Buscar una clienta o un turno"
        // TODO(2-B): `dibujarHueco` con «Llegó la seña» (`cobrarSeniaYConfirmar`) y «Cobrar lo que
        // debe» (`cobrarVariosTurnos`) de src/lib/turnos/cobro-actions.ts al integrar la Tanda 2.
        // Mientras, «Cobrar lo que debe» es un enlace a «Saldos a cobrar» y «Llegó la seña» no se ofrece.
      />
    </PielPropia>
  );
}
