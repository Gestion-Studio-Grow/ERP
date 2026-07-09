---
id: C-004
titulo: Producto
nivel: constitucional
tipo: indice-puntero-inmutable
apunta_a: [docs/FUNDAMENTOS-Y-VISION.md, ADR-058, ADR-059]
---

# C-004 · Producto

> **Índice-puntero INMUTABLE (Nivel 0).** Cristaliza lo no-negociable del **producto**. **No reescribe** los ADR
> — apunta a ellos (los 8 fixes del Challenger de ADR-059, el "definir ≠ construir", viven en el ADR completo,
> R2). Enmienda: Advisory → Challenger (ADR-045) → OK dueño ([README](README.md)).

## Fuente de verdad (leer el cuerpo completo ahí)
- **`docs/FUNDAMENTOS-Y-VISION.md §11`** — el criterio rector de producto (baja la filosofía GROW-AR al día a día).
- **ADR-058** (`filosofia-grow-ar-crece-sin-migrar`) — **fundamento de producto**: un Core, **dos motores**
  (`lite`↔`enterprise`), **crecé sin migrar** (invariante **`enterprise ⊇ lite`**). Es una **promesa comercial**
  (nivel Producto, no Software; H4). Fundamento documentado, no construido (definir ≠ construir).
- **ADR-059** (`reingenieria-de-interfaz-backoffice-grow-ar`) — baja ADR-058 a la UI, **aceptado con los 3 fixes
  bloqueantes del Challenger** (perfil ortogonal, invariante NAV ≠ DATO, candados default OFF, naming Comercio/
  Empresa, tier en canal neutro).

## Lo no-negociable (cristalizado)
1. **Un Core, dos motores** (Comercio/`lite` ↔ Empresa/`enterprise`) sobre el **mismo proceso** — no dos
   productos, no fork.
2. **Crecé sin migrar** — invariante **`enterprise ⊇ lite`**: subir de perfil es **aditivo** (se encienden
   pasos/campos), nunca se quita ni se migra de sistema.
3. **Naming al cliente: "Comercio" / "Empresa"** — `lite`/`enterprise` son nombres de ingeniería, **NUNCA** de
   cara al cliente (ADR-059 D7).
4. **Tier en canal neutro** — el acento/color es **del tenant** (ADR-043); el perfil se señaliza con texto+forma,
   nunca con color.
5. **Activar, no programar** — el valor se entrega encendiendo capacidades del catálogo (ADR-054/055), no a medida.

## Cómo se enmienda
Advisory → Challenger (ADR-045) → OK del dueño → edición **aditiva** ([README](README.md)).

_Enmiendas: (ninguna todavía)._
