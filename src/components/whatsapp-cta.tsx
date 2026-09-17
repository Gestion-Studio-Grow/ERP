"use client";

// CTA de WhatsApp de la vidriera — un solo componente para las superficies públicas
// (Storefront genérico, SiteReplica, el modal de reserva de CH y la vidriera de MAGRA).
//
// REGLA: nunca se abre WhatsApp a un número que no sea EL DEL NEGOCIO.
//
// Hasta acá el camino sin número hacía lo contrario de lo que esa regla dice. Si
// `BusinessSettings.whatsapp` estaba vacío, el primer clic abría un modal titulado
// "Tu WhatsApp" que le pedía el número A QUIEN ESTABA MIRANDO LA PÁGINA, se lo guardaba en
// su localStorage y abría el chat contra ÉL. O sea: el cliente que quería hacer un pedido
// terminaba escribiéndose a sí mismo, y el pedido no le llegaba a nadie.
//
// No era hipotético. `BusinessSettings.whatsapp` está vacío en la fila de MAGRA: ni el
// script de corrección de datos (`scripts/fix-magra-data-2026-07-07.ts`) ni la semilla lo
// escriben. Y en la vidriera de MAGRA ese botón es el ÚNICO canal de venta: son seis CTA en
// la misma página, todos apuntando al mismo lugar equivocado.
//
// Ahora, sin número del negocio, NO se abre WhatsApp. Se dice que el local todavía no lo
// publicó y se ofrecen los otros contactos. Es peor para la conversión y es lo único
// honesto: un botón que promete hablar con la carnicería no puede abrir un chat con
// cualquier otra persona. Que el número falte lo tiene que resolver el local desde
// /admin/localizacion, y el checklist de apertura de la consola lo pide antes de abrir.

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { buildWhatsAppHref, sanitizePhone } from "@/lib/whatsapp-cta";

type WhatsAppCtaContextValue = {
  /** Dispara el CTA: abre directo si ya hay número, si no pide el prompt. */
  requestWhatsApp: (message: string) => void;
};

const WhatsAppCtaContext = createContext<WhatsAppCtaContextValue | null>(null);

export function useWhatsAppCta(): WhatsAppCtaContextValue {
  const ctx = useContext(WhatsAppCtaContext);
  if (!ctx) throw new Error("useWhatsAppCta debe usarse dentro de <WhatsAppCtaProvider>");
  return ctx;
}

export function WhatsAppCtaProvider({
  tenantKey,
  configuredNumber,
  children,
}: {
  /** Identifica al tenant para namespacear el localStorage (slug del tenant). */
  tenantKey: string;
  /** Número real del tenant (BusinessSettings.whatsapp), o vacío/null si no tiene. */
  configuredNumber: string | null | undefined;
  children: ReactNode;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const configured = sanitizePhone(configuredNumber);

  const requestWhatsApp = useCallback(
    (message: string) => {
      // Sólo el número del NEGOCIO abre el chat. Si no hay, no se inventa uno ni se le
      // pregunta al visitante: se le explica.
      if (configured) {
        window.open(buildWhatsAppHref(configured, message), "_blank", "noopener,noreferrer");
        return;
      }
      setModalOpen(true);
    },
    [configured],
  );

  return (
    <WhatsAppCtaContext.Provider value={{ requestWhatsApp }}>
      {children}
      {modalOpen && (
        <div
          role="presentation"
          onClick={() => setModalOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            background: "rgba(20,20,20,.5)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="wa-cta-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 380,
              background: "var(--surface-raised)",
              color: "var(--text-strong)",
              borderRadius: 16,
              padding: 22,
              boxShadow: "0 24px 60px -12px rgba(0,0,0,.35)",
              marginBottom: "min(8vh, 48px)",
            }}
          >
            <h2 id="wa-cta-title" style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
              Todavía no publicamos el WhatsApp
            </h2>
            <p style={{ margin: "8px 0 0", fontSize: 13.5, lineHeight: 1.55, color: "var(--text-muted)" }}>
              Este local todavía no cargó su número. Escribinos por los otros medios que figuran
              más abajo y te contestamos igual.
            </p>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              autoFocus
              style={{
                width: "100%",
                marginTop: 18,
                height: 46,
                border: "1px solid var(--line-strong)",
                borderRadius: 12,
                background: "var(--surface)",
                color: "var(--text-strong)",
                fontWeight: 700,
                fontSize: 14.5,
                cursor: "pointer",
              }}
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </WhatsAppCtaContext.Provider>
  );
}
