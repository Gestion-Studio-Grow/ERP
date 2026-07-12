---
id: ADR-094
nivel: tactico
dominio: plataforma
depends_on: [ADR-034, ADR-008, ADR-061]
---

# ADR-094 — Generación de imágenes por IA como capacidad compartida (multi-proveedor)

**Estado:** Aceptada / scaffold implementado (rama `feat/imagen-ia`, 2026-07-12) · **Depende de:** ADR-034 (generador de preset por IA · onboarding por ingesta), ADR-008 (economía de tokens/costo), ADR-061 (motor compartido · config sobre código) · **Relacionado:** ADR-073 (personalización por config, assets por tenant).

> Numeración provisional — verificar colisión al mergear (regla de timestamps de CLAUDE.md aplicada a ADRs; otras sesiones podrían haber tomado números 081 en adelante).

## Contexto

El onboarding por preset-IA (ADR-034) y las vidrieras por tenant necesitan **imágenes** (producto, banners, identidad) sin depender de material que el cliente muchas veces no tiene. Generarlas atándose a **un solo proveedor** nos deja rehenes de su precio, su disponibilidad y su necesidad de API key. La economía de costos (ADR-008) pide **empezar por lo gratis** y pagar solo donde hace falta.

## Decisión

1. **Capacidad compartida, no feature de un producto:** vive en `src/lib/imagen/` como módulo del motor común (ADR-061), consumible por preset-IA, vidrieras y backoffice.
2. **Contrato `ImageProvider` único + adaptadores intercambiables.** Proveedores implementados: **`pollinations`** (gratis, **sin key**) — **default**; **`gemini`** (free-tier con key); **`fal`** (FLUX 1.1 pro, key); stubs `replicate` / `bfl`. Elegir proveedor = **config, no fork** (ADR-061).
3. **Key opcional:** el default (`pollinations`) no requiere credenciales → cero fricción, cero gasto para arrancar (ADR-008/030). Las keys (`FAL_KEY`, etc.) van en el env de Vercel, las pega el dueño (ADR-041).
4. **Orquestador `generarImagen()`** con **presets de estilo por rubro** + ratios (4:5 / 5:4) y dimensiones por aspecto. **Tests con proveedor mockeado** (cero red en test).
5. **CLI `scripts/genera-imagen.mjs`** para uso operado + doc `docs/imagen-ia.md` + plantilla de env.

## Consecuencias

**Habilita:** preset-IA con imágenes desde el día uno sin material del cliente; vidrieras con assets propios; empezar **gratis** (pollinations) y escalar calidad por proveedor cuando el negocio lo pague (ADR-030).

**Encaja en el Gate:** las imágenes generadas de cara al cliente pasan por el **Gate bloqueante** del preset-IA (ADR-034) antes de mostrarse, y respetan la **autorización de marca** (ADR-042) cuando replican identidad de un cliente.

**Deuda:** wiring del default listo; falta cablearla en las superficies consumidoras (preset-IA / vidriera) end-to-end. Módulo aislado → **bajo riesgo de conflicto** con el rediseño del core.

— Elaborado por GSG · 2026-07-12
