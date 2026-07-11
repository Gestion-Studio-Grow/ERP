"use client";

// CTA de WhatsApp de la vidriera — un solo componente compartido para las tres
// superficies reales (Storefront genérico, SiteReplica y el modal de reserva de
// CH), así el comportamiento y el prompt just-in-time no se reimplementan tres
// veces (regla de consistencia SAP Fiori).
//
// Regla del dueño: NUNCA un número hardcodeado ni abrir WhatsApp a un número
// falso.
// - Si `configuredNumber` viene de BusinessSettings.whatsapp (real) → el CTA
//   abre directo a ese número.
// - Si no hay número real configurado → el primer clic muestra este prompt
//   pidiéndolo ahí mismo; recién con eso abre WhatsApp. El número que complete
//   el visitante se guarda en localStorage (namespaced por tenant), nunca en
//   el repo ni en la base — sigue siendo "sin backend, sin secretos".

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { buildWhatsAppHref, sanitizePhone, whatsappStorageKey } from "@/lib/whatsapp-cta";

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
  const [draft, setDraft] = useState("");
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const storageKey = whatsappStorageKey(tenantKey);
  const configured = sanitizePhone(configuredNumber);

  const requestWhatsApp = useCallback(
    (message: string) => {
      const number = configured || (typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null);
      if (number) {
        window.open(buildWhatsAppHref(number, message), "_blank", "noopener,noreferrer");
        return;
      }
      setPendingMessage(message);
      setDraft("");
      setModalOpen(true);
    },
    [configured, storageKey],
  );

  const confirm = () => {
    const digits = sanitizePhone(draft);
    if (!digits) return;
    window.localStorage.setItem(storageKey, digits);
    setModalOpen(false);
    if (pendingMessage) window.open(buildWhatsAppHref(digits, pendingMessage), "_blank", "noopener,noreferrer");
    setPendingMessage(null);
  };

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
              Un dato antes de escribirte
            </h2>
            <p style={{ margin: "8px 0 0", fontSize: 13.5, lineHeight: 1.55, color: "var(--text-muted)" }}>
              Para abrir WhatsApp necesitamos un número. Lo guardamos solo en este navegador, no se
              envía a ningún lado.
            </p>
            <label style={{ display: "block", marginTop: 16, fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--text-muted)" }}>
              Tu WhatsApp
              <input
                type="tel"
                inputMode="numeric"
                autoFocus
                autoComplete="tel"
                placeholder="54 9 11...."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirm();
                }}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 8,
                  fontSize: 15,
                  fontWeight: 400,
                  textTransform: "none",
                  letterSpacing: "normal",
                  padding: "11px 13px",
                  border: "1px solid var(--line-strong)",
                  borderRadius: 9,
                  background: "var(--surface)",
                  color: "var(--text-strong)",
                }}
              />
            </label>
            <button
              type="button"
              onClick={confirm}
              style={{
                width: "100%",
                marginTop: 16,
                height: 46,
                border: "1px solid #25D366",
                borderRadius: 12,
                background: "#fff",
                color: "#118648",
                fontWeight: 700,
                fontSize: 14.5,
                cursor: "pointer",
              }}
            >
              Continuar por WhatsApp
            </button>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              style={{
                width: "100%",
                marginTop: 8,
                border: "none",
                background: "none",
                color: "var(--text-faint)",
                fontSize: 12.5,
                textDecoration: "underline",
                textUnderlineOffset: 2,
                cursor: "pointer",
              }}
            >
              Ahora no
            </button>
          </div>
        </div>
      )}
    </WhatsAppCtaContext.Provider>
  );
}
