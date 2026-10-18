---
id: DB-5
categoria: DB
tipo: leccion
generado: true
tags: [brain/leccion, leccion/db]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [DB-5] Un camino de plata sin la frontera del cierre: el cobro de turno caía en el día congelado

**Categoría:** Datos / DB

> 🛡️ **Guardarraíl (la regla verificable):**
> todo camino que escribe en el libro de caja recibe la frontera del cierre como **parámetro obligatorio** y su test incluye «con el día ya cerrado». Un negocio vivo sale a producción con su recorrido E2E del día completo (modelo: `test:club-uat`, `test:ch-uat`).

**Lección:** una invariante de plata repartida en N escritores se rompe en el escritor N+1. Un E2E que recorre el día completo (cobrar → cerrar → cobrar de nuevo) encuentra lo que los tests por función no.

## Detalle

- **Síntoma:** en el UAT de CH (18/10), después de cerrar la caja del día, un cobro de turno (seña, parcial o
  saldo al completar) entraba igual al libro **fechado en el día ya cerrado**: el arqueo congelado dejaba de ser
  reproducible. Las ventas del mostrador y las cuentas corrientes sí lo frenaban; los turnos no.
- **Causa raíz:** la regla «el día cerrado no se toca» vivía en cada escritor del libro por separado
  (`fronteraDeVenta`, `decidirAsiento`, `planAnulacion`) y el cobro de turno nunca la incorporó. Nadie lo vio
  porque ningún test recorría «cerrar → cobrar».
- **Fix:** `aplicarCobroTurnoInTx` exige `cerradoHasta` (obligatorio en el tipo: un llamador nuevo no la puede
  olvidar) y rechaza antes de escribir, diciendo qué día registrarlo; los tres llamadores la leen, y un test de
  forma falla si alguno no la pasa. Lo encontró el recorrido E2E (`npm run test:ch-uat`, paso 10.1).
- **Lección:** una invariante de plata repartida en N escritores se rompe en el escritor N+1. Un E2E que recorre
  el día completo (cobrar → cerrar → cobrar de nuevo) encuentra lo que los tests por función no.
- **Guardarraíl:** todo camino que escribe en el libro de caja recibe la frontera del cierre como **parámetro
  obligatorio** y su test incluye «con el día ya cerrado». Un negocio vivo sale a producción con su recorrido E2E
  del día completo (modelo: `test:club-uat`, `test:ch-uat`).
- **Refs:** `src/lib/turnos/cobro-turno-repo.ts`, `docs/tenants/ch/EVENTUALIDADES.md` fila 12, ADR-047.


## Decisiones relacionadas

- [ADR-047](../30-decisiones/ADR-047.md)

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
