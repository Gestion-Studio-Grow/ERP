---
id: DX-8
categoria: DX
tipo: leccion
generado: true
tags: [brain/leccion, leccion/dx]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [DX-8] Demo pública en host serverless: un back con estado y tiempo real no corre ahí

**Categoría:** Demo / UX

> 🛡️ **Guardarraíl (la regla verificable):**
> todo back de demo con estado o tiempo real se diseña con **núcleo isomórfico + adaptador local** desde el día 1; el servidor es sólo transporte (HTTP, firma, cookies). Se prueba el modo local en el E2E.

**Lección:** en preventa, "front y back separados" es una decisión de arquitectura **y** de hosting: si la demo pública es serverless, el dominio tiene que poder correr del lado del cliente sin duplicar reglas.

## Detalle

- **Síntoma:** el turnero de Break Point necesita un back con estado en memoria y SSE (tiempo real); la demo pública a
  costo cero vive en un host serverless (Vercel/Next) que no sostiene ni lo uno ni lo otro. Detectado por el plan
  de Fable antes de publicar (15/10/2026).
- **Causa raíz:** se diseña el back para la demo local (Node persistente) y se asume que "el mismo front + back" va a
  andar en la URL gratuita.
- **Fix:** el dominio del turnero quedó **isomórfico** (sin `node:*`, sólo Web Crypto) junto al motor del club en
  `public/…`, y el front trae un **adaptador local** que corre el MISMO núcleo en el navegador con el mismo contrato
  (se activa fuera de localhost o con `?api=local`). E2E: sin pedidos a ninguna API, 47 KB de JS comprimido.
- **Lección:** en preventa, "front y back separados" es una decisión de arquitectura **y** de hosting: si la demo
  pública es serverless, el dominio tiene que poder correr del lado del cliente sin duplicar reglas.
- **Guardarraíl:** todo back de demo con estado o tiempo real se diseña con **núcleo isomórfico + adaptador local**
  desde el día 1; el servidor es sólo transporte (HTTP, firma, cookies). Se prueba el modo local en el E2E.
- **Refs:** `docs/metodologia/demo-publica-costo-cero.md`; `docs/tenants/breakpoint/TURNERO-PLAN.md §13`; TURNERO-QA D12.


---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
