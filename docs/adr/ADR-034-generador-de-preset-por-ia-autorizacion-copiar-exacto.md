# ADR-034: Generador de preset por IA — onboarding por ingesta, con autorización obligatoria del cliente y método "copiar exacto" (leer el render, no el fetch)

**Estado:** Aceptado (2026-07-06) — método vigente; contrato en código, altas reales gated
**Fecha:** 2026-07-06
**Depende de:** ADR-019 (provisioning), ADR-002 (blueprints), ADR-009 (onboarding self-service)
**Relacionado:** ADR-033 (regla de copia exacta ↔ auditoría), ADR-028 (modelo de entrega)

---

## Contexto
El alta manual de tenants **no escala**, y el valor comercial es mostrarle al cliente **"así se ve TU
negocio"** en minutos. Eso exige **replicar su marca** (identidad, catálogo, tono) — un dato **sensible**
que requiere permiso. Además, copiar bien la vitrina exige copiar **lo que el usuario ve**, no el HTML
crudo.

## Decisión
El alta de cliente nuevo se hace por el **GENERADOR DE PRESET POR IA**: el cliente da **su red social y/o
su web (+ su OK)** → los agentes **INGESTAN y EXTRAEN** (rubro, identidad/colores/logo/tono,
catálogo/servicios, ofertas, historia, contacto) → **GENERAN el preset** (tenant + subdomain + blueprint
de rubro + branding + datos demo + **probador listo**). Reglas duras:
- **(a) Autorización primero (obligatoria):** sin **OK explícito registrado** del cliente para replicar su
  marca, **NO se genera ni se muestra**.
- **(b) Método "copiar exacto":** se replica leyendo el **RENDER** de la página (lo que ve el usuario),
  **no** el `fetch`/HTML crudo — la copia es de la **vitrina real**.
- **(c) Gate bloqueante:** **generar → auditar** (por la regla de copia exacta, ADR-033) **→ recién ahí
  mostrar** al cliente.

## Consecuencias
- **(+)** Onboarding **en minutos**, **fiel** y **con permiso**; motor de **escala comercial**.
- **(+)** Baja a Fase 1 real la visión self-service de ADR-009/ADR-019 (sin portal público todavía).
- **(−)** Depende de la **calidad de extracción**; exige **registrar** la autorización y un checklist de
  fallbacks.
- **PoC:** Break Point (Instagram → `adosmanos`), Magra (web → `carniceria`).
- **Toca / documentado en:** `docs/metodologia/generador-preset-ia.md`, `checklist-extraccion.md`,
  `material-de-marca-schema.md`, `src/preset/extraction/*`, `registro-casos/`.

## Estado
**Aceptado — método vigente.** Contrato Material de Marca + Preset→Motor en código; las **altas reales
quedan gated** (autorización del cliente + Gate 2 para Neon).
