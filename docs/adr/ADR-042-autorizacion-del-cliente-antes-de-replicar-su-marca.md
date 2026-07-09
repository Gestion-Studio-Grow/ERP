---
id: ADR-042
nivel: evolutiva
dominio: [UX, Seguridad]
depends_on: [ADR-034]
---
# ADR-042: Autorización del cliente antes de replicar su marca (consentimiento registrado, paso obligatorio)

**Estado:** Aceptado — vigente y no salteable
**Fecha:** 2026-07-06
**Depende de:** ADR-034 (generador de preset por IA — lo aplica)
**Relacionado:** ADR-043 (sello GSG no pisa la marca del cliente), ADR-033 (copia exacta), ADR-028 (modelo de entrega)
**Fuente viva (detalle):** `docs/metodologia/generador-preset-ia.md`

---

## Contexto
El generador de preset (ADR-034) **replica la marca/identidad del cliente** —colores, logo, tono,
catálogo, fotos, contenido— para mostrarle "así se ve TU negocio". Eso es **material de un tercero**:
replicarlo o publicarlo **sin permiso** es un problema **legal, ético y de confianza**, aunque el fin sea
comercial y a favor del cliente.

## Decisión
**Antes de replicar marca/contenido/imágenes de un cliente hay que PEDIR y REGISTRAR su OK explícito.**
Regla dura, paso **obligatorio** del onboarding:
- **Sin autorización registrada, NO se genera ni se muestra** el preset/demo del cliente.
- La autorización se **registra** (queda constancia de que el cliente consintió replicar su marca), como se
  hizo con Magra.
- El permiso es **previo** a la ingesta/extracción y a cualquier publicación, no posterior.

## Consecuencias
- **(+)** Protege al **cliente** (su marca no se usa sin permiso) y a **GSG** (consentimiento trazable,
  base de confianza comercial).
- **(−)** Agrega un **gate de permiso** antes de poder mostrar la demo — no se puede sorprender al cliente
  con su sitio ya replicado sin haberle pedido antes.
- **Aplicado por:** ADR-034 (el flujo del preset lo exige como primer paso). Complementa la **no-colisión**
  del sello (ADR-043): ni se replica sin permiso, ni el sello GSG pisa la marca del cliente.

## Estado
**Aceptado — vigente, no salteable.** Documentado como "autorización primero" en el playbook del generador
de preset y en `CLAUDE.md`.
