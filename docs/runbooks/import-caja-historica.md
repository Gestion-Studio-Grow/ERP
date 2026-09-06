# Runbook — Importar el histórico de caja de un tenant

Carga el CSV consolidado de las planillas de caja de un cliente en `CashMovement`, el
mismo ledger que lee el Libro de Caja (`/admin/caja/libro`) y el arqueo de turno.

- Script: `scripts/import-caja-historica.ts`
- Lógica pura + tests: `src/lib/caja/import-caja.ts`, `src/lib/caja/import-caja.test.ts`
- Criterio de fecha: idéntico a la carga manual — `occurredAt` = 12:00 hora de pared del
  negocio (`businessWallTimeToUtc(fecha, "12:00")`, ver `src/lib/libro-caja-actions.ts`).

## Contrato del CSV

UTF-8 con encabezado; columnas (en cualquier orden, nombres exactos):

```
fecha,detalle,tipo,medio,monto,origen_archivo,origen_hoja,origen_fila,confianza,nota
```

`fecha` `YYYY-MM-DD` · `tipo` `INGRESO|EGRESO` · `medio` `EFECTIVO|MP|TARJETA` · `monto`
positivo con punto decimal y hasta 2 decimales · `confianza` `alta|corregido|dudoso`.
Comillas RFC 4180 (comas, comillas escapadas `""` y saltos de línea dentro del campo).

## Cómo se corre

```bash
# 1. Siempre primero en DRY-RUN (default): no escribe nada, muestra el plan completo.
DATABASE_URL=... npx tsx scripts/import-caja-historica.ts --tenant <slug> --csv <ruta.csv>

# 2. Escribir de verdad.
DATABASE_URL=... npx tsx scripts/import-caja-historica.ts --tenant <slug> --csv <ruta.csv> --write

# 3. Correrlo de nuevo: tiene que decir "insertar 0" y RECONCILIACIÓN OK.
```

Flags:

| Flag | Default | Qué hace |
|---|---|---|
| `--write` | off | Sin esto es dry-run. |
| `--dudoso excluir\|incluir` | `excluir` | Qué hacer con `confianza=dudoso`. La decisión queda en el AuditLog de cierre y en el reporte. |
| `--skip-rejected` | off | Con `--write`, si hay filas inválidas el script se niega (exit 2) salvo que se pase esto: las inválidas se omiten y se listan. |
| `--batch-size N` | 250 | Filas por transacción. |
| `--actor <str>` | `script:import-caja-historica` | Quién corre (va al AuditLog). Conviene `user:<id>` del operador. |
| `--rollback [--write]` | — | Deshace la importación de ESTE archivo (borra por marca). Dry-run sin `--write`. |
| `--report <ruta>` | junto al CSV | Reporte JSON fila a fila (`id` ↔ `origen_archivo/hoja/fila`). |

Códigos de salida: `0` ok · `1` error · `2` filas inválidas sin `--skip-rejected` · `3`
la reconciliación no cierra al centavo.

## Idempotencia — cómo y por qué

No hay ID de origen (es una hoja de cálculo). La clave es el **contenido contable** de la
fila: `(fecha, tipo, medio, monto en centavos, detalle normalizado)`, comparada por
**multiconjunto**: si el CSV trae 2 filas iguales y la base tiene 1, se inserta 1. Es la
misma tupla con la que la pantalla del libro avisa "posible duplicado", así una fila que
alguien ya tipeó a mano **no** se duplica al importar.

Marca de importación (sin tocar el schema): `createdBy = import:caja-historica:<sha8 del CSV>`
y `id = imc<sha8><línea del CSV>`. `createdBy` no se muestra en ninguna pantalla, así
`reason` queda limpio; el id determinístico es una guarda extra a nivel PK y conserva el
orden del CSV dentro del día en el saldo corrido (el libro ordena por `occurredAt, id`).

**Trade-off asumido:** si después se *corrige* una fila del CSV (otro monto o detalle), la
fila vieja queda y la nueva entra. El plan lo avisa como "huérfana con marca" y
`--rollback --write` deshace el archivo entero para volver a cargarlo.

## Qué garantiza en escritura

- Cada lote es una `tenantTransaction` con el tenant explícito + `set_config` del GUC de
  RLS (siempre, no solo con el flag) + `pg_advisory_xact_lock` por tenant. Dentro del
  lote se **relee** la base y se replanifica: una carga manual o una corrida concurrente
  entre el plan y el lote no produce un duplicado.
- `sessionId` siempre NULL: el histórico no pertenece a ningún turno; engancharlo a un
  turno abierto inflaría el efectivo esperado del arqueo.
- Al final relee la base y compara mes × medio × tipo con el CSV al centavo. Si no cierra,
  exit 3, `AuditLog` con `libro.import.cierre.FALLA` y NO se da la caja por cargada.
- AuditLog: una entrada `libro.import` por lote (líneas, fechas, centavos) y una
  `libro.import.cierre` con política de dudosas, rechazos, hash del CSV y reconciliación.

## Antes de correrlo contra producción (Neon)

1. Es una **escritura sobre datos de un cliente real** → autorización explícita del dueño.
2. Correr el dry-run contra prod y leer el plan entero: "ya existentes" tiene que ser lo
   que se espera (si el negocio ya cargó filas a mano, van a aparecer ahí, no duplicadas).
3. Mirar "filas INGRESO/EGRESO ya en la base dentro del rango … (de otras cargas)": si el
   número sorprende, parar.
4. Aviso de turno ABIERTO: no bloquea, pero conviene importar con la caja cerrada.
5. Backup / branch de Neon inmediatamente antes. Si algo sale mal: `--rollback --write`
   con el **mismo archivo** (la marca depende del hash del CSV: si se edita el CSV, cambia
   la marca y el rollback ya no lo encuentra — guardar el CSV importado tal cual).
6. Guardar el reporte JSON junto con el CSV: es el único mapeo `id` ↔ fila de planilla.
