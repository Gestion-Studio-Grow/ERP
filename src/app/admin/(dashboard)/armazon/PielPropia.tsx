"use client";

// ============================================================================
// PielPropia — una pantalla (o un diálogo) nueva con la piel «Renglón» sin el interruptor.
// ============================================================================
//
// Regla de independencia del interruptor (diseño CH §0.2): lo nuevo de la reingeniería se viste con
// la piel «Renglón» por su cuenta, así CH lo ve bien con «Diseño nuevo» apagado. La piel vive bajo
// `data-diseno` y su modo oscuro se lee del MISMO elemento: como este contenedor queda adentro de la
// raíz del panel, copia el `data-theme` de la raíz (lo corrige AdminThemeScript y lo cambia el
// selector de tema) y lo sigue. Es lo mismo que hace la bandeja «Cerrar lo pendiente»
// (turnos/cerrar/CerrarPendientes.tsx), sacado a una pieza para las pantallas de la Tanda 2.
//
// `conHoja`: enlaza la hoja de la piel desde acá (React la sube al <head> una sola vez y no la
// repite si el layout o la página ya la enlazaron). Para lo que se monta en el CLIENTE (el buscador
// global): una página del servidor la enlaza con `ConDiseno nuevo`.
// `letraDelNegocio`: la letra de cuerpo del negocio en vez de la de la piel (CH: Hanken).

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { HOJAS_DEL_DISENO, PIEL_RENGLON, PRECEDENCIA_DEL_DISENO } from "@/lib/diseno/diseno";

export function useTemaDeLaRaiz(ref: React.RefObject<HTMLElement | null>): "light" | "dark" {
  const [tema, setTema] = useState<"light" | "dark">("light");
  useEffect(() => {
    const raiz = ref.current?.parentElement?.closest("[data-theme]");
    if (!raiz) return;
    const leer = () => setTema(raiz.getAttribute("data-theme") === "dark" ? "dark" : "light");
    leer();
    const obs = new MutationObserver(leer);
    obs.observe(raiz, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, [ref]);
  return tema;
}

export default function PielPropia({
  children,
  pantalla,
  conHoja = false,
  letraDelNegocio = false,
  className,
}: {
  children: ReactNode;
  /** `data-pantalla`, para encontrarla en las pruebas y en la hoja. */
  pantalla: string;
  conHoja?: boolean;
  letraDelNegocio?: boolean;
  className?: string;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const tema = useTemaDeLaRaiz(raiz);
  const estilo = letraDelNegocio ? ({ "--font-ui": "var(--font-body), ui-sans-serif, system-ui, sans-serif" } as CSSProperties) : undefined;
  return (
    <div ref={raiz} data-diseno={PIEL_RENGLON} data-theme={tema} data-pantalla={pantalla} style={estilo} className={className}>
      {conHoja &&
        HOJAS_DEL_DISENO.map((href) => <link key={href} rel="stylesheet" href={href} precedence={PRECEDENCIA_DEL_DISENO} />)}
      {children}
    </div>
  );
}
