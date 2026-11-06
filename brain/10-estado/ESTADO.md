---
tipo: estado
generado: true
generado_el: 2026-11-04 07:20 UTC
tags: [brain/estado, fase-0]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# 🧠 Estado — la foto derivada del repo

> ⏱️ **Foto tomada el 2026-11-04 07:20 UTC sobre `ee193f1`.**
> No se escribe a mano: sale de `git` + `prisma/migrations/` + `docs/`, así que **al momento
> de generarla no puede estar desactualizada** (es la causa de la lección **MP-12**). Pero una
> vez commiteada envejece como cualquier archivo: **si la estás leyendo en GitHub o en el celular,
> mirá la fecha de arriba**. Para tenerla fresca: `npm run brain`.

## Git

| Campo | Valor |
|---|---|
| Rama actual | `HEAD` |
| HEAD | `ee193f1` (2026-11-02) |
| Árbol | limpio _(sin contar `brain/`)_ |
| Tip de `main` | ee193f1 · 2026-11-02 · MIA: ampliar y eliminar imágenes del Estudio, el agente propone las piezas, y consultas con espera sin respuesta humana, orden por demora, respuesta por otro canal y cliente reutilizado |

**Últimos commits**

- ee193f1 · 2026-11-02 · MIA: ampliar y eliminar imágenes del Estudio, el agente propone las piezas, y consultas con espera sin respuesta humana, orden por demora, respuesta por otro canal y cliente reutilizado
- 597cf94 · 2026-11-02 · MIA: el lote de deploy lista sólo la migración pendiente (las de Proyectos ya están aplicadas)
- 395e959 · 2026-11-02 · MIA: consultas de potenciales clientes: formulario público, bandeja, acuse automático con plantillas, borrador del agente que aprueba una persona, y conversión en lead
- 3d2f50f · 2026-11-02 · MIA: reglas de las consultas de potenciales clientes (clasificar, escalar, controlar borradores, brief con estados), probadas con 30 consultas
- 891e9ad · 2026-11-02 · MIA: al eliminar una maqueta se van sus renglones del presupuesto en borrador; se frena si están en una cotización enviada o ya se contrataron
- a38238d · 2026-11-02 · MIA: se pueden eliminar maquetas, con confirmación, desde la lista y desde el editor
- f902e8f · 2026-11-02 · MIA: deshacer y exportar GLB en el armador; los agentes ven el stand; analista y revisor; tres alternativas comparables
- 22a04cd · 2026-11-02 · MIA: editor de stands más claro: paleta por grupos, lista de piezas, mover de a 25 cm, controles de superposición y altura, pieza nueva en lugar libre y visor fijo
- 8fe419a · 2026-11-02 · MIA: 11 piezas de activación de marca, más detalle en todas las piezas del armador 3D, y mensaje claro cuando Pollinations limita
- 94afee2 · 2026-11-02 · MIA: un agente arma el primer borrador del stand desde el brief (opción nueva, la persona lo ajusta)
- 4727046 · 2026-11-02 · MIA: las imágenes salen por Pollinations (el servicio de Azimut) cuando no hay servicio propio ni Cloudflare
- f24848a · 2026-11-02 · Merge remote-tracking branch 'origin/main' into tenant/mia-producciones

## Migraciones (Prisma)

- **Total en el repo:** 62
- **Últimas 5:** `20261101120000_modulo_proyectos` · `20261101130000_proyecto_gastos` · `20261101140000_proyecto_entregables` · `20261101150000_proyecto_gestion_eventos` · `20261102120000_consultas`

> ⚠️ **Colisión de timestamp** — dos migraciones comparten prefijo, así que el orden de
> aplicación depende del desempate alfabético. Revisar antes de cualquier Gate 2:
> - `20260711140000` → `20260711140000_add_cartera_cliente` + `20260711140000_add_tenant_fiscal_credential`

> **Aplicado en Neon = NO verificable desde el repo.** Este bloque dice qué migraciones *existen*,
> no cuáles corrieron. Confirmar con el dueño (Gate 2, `CLAUDE.md`).

## Corpus de conocimiento

| Fuente | Volumen |
|---|---:|
| Documentos en `docs/` | 392 |
| Palabras en `docs/` | 706.285 |
| ADRs | 87 |
| Nodos en el grafo | 93 _(los 87 ADR + 6 enmiendas)_ |

## Superficies con front propio

- `Magra`
- `Shine`

## Lo que esta foto NO puede cubrir

Se deriva del repo, así que **solo sabe lo que el repo sabe**. Estos ítems de la Fase 0 no son
derivables y siguen viviendo en el documento narrativo — leelos ahí cuando el frente los toque:

- **Tenants vivos y su estado de publicación** → `docs/ESTADO-ACTUAL.md` §1
- **Gates abiertos y decisiones pendientes del dueño** → `docs/ESTADO-ACTUAL.md` (HANDOFF)
- **Bugs conocidos y frentes en curso** → `docs/ESTADO-ACTUAL.md` §7
- **Qué migraciones corrieron REALMENTE en Neon** → solo lo confirma el dueño (Gate 2)

---

**Detalle narrativo:** [ESTADO-ACTUAL.md](../../docs/ESTADO-ACTUAL.md) · **Roadmap:** [ESTADO-Y-ROADMAP.md](../../docs/ESTADO-Y-ROADMAP.md) · **Decisiones:** [índice](../30-decisiones/000-INDICE.md) · **Guardarraíles:** [índice](../20-lecciones/000-INDICE.md)
