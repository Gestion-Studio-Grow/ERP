# Agencia Grow — espacio propio del sector (semilla del repo `agencia-grow`)

> **Qué es esto:** la **semilla lista para push** del repo/espacio propio del sector **Agencia Grow**
> (ADR-028 §2 · charter §7.2 · ADR-030). Vive **transitoriamente** dentro de `estetica-erp` porque la
> creación del repo `Gestion-Studio-Grow/agencia-grow` quedó **bloqueada por permisos del GitHub App**
> (403 — ver `COMO-CREAR-EL-REPO.md`). En cuanto el repo exista, este árbol se pushea tal cual y se
> **saca de acá** (no debe quedar operación de servicios en el repo del ERP — guardrail anti-consultora,
> `FUNDAMENTOS §2`).

## Por qué un repo aparte
El ERP es **Core-producto** con deploy único + DB de producción (Neon) + RLS + gate de deploy. La
**operación de servicios** de la Agencia (assets de campañas, entregables por cliente) **no** entra ahí:
distinto eje de cambio, distinto blast-radius, y material **no reutilizable** que contaminaría el Core.
Decidido en **ADR-028** (gobierno único, repos separados, puente productizado).

## Qué va en este repo (operación de servicios)
- `frentes/` — trabajo por disciplina del sector (creativo, performance/ads, contenido, front/consola).
- `clientes/` — entregables **por cliente** (delivery; regla 4 de la metodología).
- `productos/` — punteros a los productos de software del sector (viven como plugin del Core **o** su
  propio repo; acá solo su ficha/estado, no su código).
- `TABLERO-AGENCIA.md` — el tablero del sector (análogo a `docs/ESTADO-FRENTES.md` del ERP).

## Qué NO va acá
- Código del Core del ERP (vive en `estetica-erp`).
- Un cliente que necesita ERP/tienda → se resuelve dando de **alta un tenant**, no forkeando (puente ADR-028).

## Gobierno e identidad
- **Misión:** hacer **escalar el patrimonio de los dueños** con **negocios automatizados** (online/físico).
- **Método:** el mismo del ERP (Fase 0, ADRs, sprint, backup al cierre). Mismo PMO por encima de ambos sectores.
- **Fundamento completo:** `estetica-erp` → `docs/sectores/agencia-grow/FUNDAMENTO.md` + ADR-028/029/030.
