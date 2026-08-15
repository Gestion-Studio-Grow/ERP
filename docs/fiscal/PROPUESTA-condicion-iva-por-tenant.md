# Propuesta: condición de IVA del emisor por tenant (`Tenant.arcaCondicionIva`)

**Estado:** propuesta. **Migración NO escrita como archivo y NO aplicada — Gate 2 es del dueño.**
**Origen:** análisis de cobertura funcional del 11/08/2026 para la migración de CH Estética; cierre del
rojo fiscal de `getFiscalProfile` (15/08/2026).

---

## 1. El hueco

`getFiscalProfile` devolvía un perfil fiscal hardcodeado, ignorando el tenant. Ya se corrigió el CUIT y
el punto de venta: salen de `Tenant.arcaCuit` / `Tenant.arcaPuntoVenta`, y si no están cargados la
emisión **lanza** en vez de inventar el dato (`src/lib/fiscal.ts`).

**Falta el tercer campo: la condición del emisor frente al IVA.** No existe columna en `Tenant`, así que
hoy se sigue asumiendo `MONOTRIBUTO`.

## 2. Por qué no es un detalle de forma

La condición del emisor **decide el tipo de comprobante y si se discrimina IVA** — no es metadata:

| Condición asumida | Comprobante | IVA sobre $121.000 |
|---|---|---|
| `MONOTRIBUTO` (lo que se asume hoy) | Factura C | $0 — neto = total = $121.000 |
| `RESPONSABLE_INSCRIPTO` (lo que podría corresponder) | Factura A/B | $21.000 — neto $100.000 |

Está cubierto por test en `src/lib/fiscal.test.ts` ("Monotributo asumido sobre un Responsable Inscripto
pierde el IVA"). Si el emisor real es Responsable Inscripto y se emite Factura C, el comprobante está mal
por partida doble (tipo equivocado + IVA no discriminado) y **no se borra: se anula con nota de crédito**.

**[A VALIDAR] CH Estética facturó ~$42M anualizados** (fuente: análisis de cobertura funcional del
11/08/2026, dato del dueño; no verificado contra la contabilidad del cliente). Si ese volumen está por
encima del tope de la categoría más alta de Monotributo vigente, el emisor **no puede** ser monotributista
y todo lo que emita como Factura C está mal.

**No se afirma acá cuál es el tope vigente**: los topes se actualizan por resolución de ARCA y no hay
fuente oficial en este repo.
**Modo de cierre:** el contador del cliente confirma condición y categoría contra la **constancia de
inscripción de ARCA** del CUIT del emisor. Ese es el dato que va a la columna. Vale para cada tenant, no
solo para CH: Magra, Shine Velas y A Dos Manos tienen su propia condición.

## 3. Qué hace el código MIENTRAS TANTO (ya implementado)

`construirPerfilFiscal` (`src/lib/fiscal.ts`) parte el comportamiento según el ambiente del tenant:

| `Tenant.arcaHomologacion` | Sin condición cargada |
|---|---|
| `true` (homologación / testing ARCA) | asume `CONDICION_IVA_DEFAULT` = `MONOTRIBUTO`, marca `condicionIvaAsumida: true` en el perfil y emite un `logger.warn`. Se puede probar el circuito sin frenarlo. |
| `false` (**producción**) | **lanza `PerfilFiscalIncompletoError`** con `campo: "condicionIva"`. En producción no se asume nada. |

Es decir: el circuito de pruebas sigue corriendo, y el camino que produce comprobantes con consecuencia
fiscal queda cerrado hasta que el dato exista.

El tipo `RegistroFiscalTenant` ya declara `arcaCondicionIva?: string | null` (schema-ahead a propósito).
Si viene cargado, gana; si viene con un valor desconocido, lanza en vez de caer al default.

## 4. El cambio propuesto

### 4.a Schema (`prisma/schema.prisma`, modelo `Tenant`, junto a los otros `arca*`)

```prisma
  // Condición del emisor frente al IVA. Decide el TIPO de comprobante (C vs A/B) y
  // si se discrimina IVA — no es metadata. Aditivo/nullable, sin backfill: mientras
  // sea NULL, `construirPerfilFiscal` asume Monotributo SOLO en homologación y
  // BLOQUEA la emisión en producción (src/lib/fiscal.ts).
  // Valores: RESPONSABLE_INSCRIPTO | MONOTRIBUTO | EXENTO | CONSUMIDOR_FINAL
  arcaCondicionIva String?
```

**String, no enum de Postgres**, por consistencia con cómo el resto del circuito ya guarda la condición
(el payload del outbox la lleva como texto y `arca-dispatch.ts` la castea al enum del plugin). Un enum de
DB obligaría a una migración adicional cada vez que ARCA agregue una condición.

### 4.b SQL de la migración (para cuando el dueño abra el Gate 2)

```sql
ALTER TABLE "Tenant" ADD COLUMN "arcaCondicionIva" TEXT;
```

Aditiva, nullable, sin backfill, sin default: **no toca ninguna fila existente y es reversible con un
`DROP COLUMN`**. Se aplica con `prisma migrate deploy` (nunca `migrate dev`: falla contra el pooler).

### 4.c Los dos renglones de código que se tocan después de aplicarla

1. `src/lib/fiscal.ts` → `leerRegistroFiscalPrisma`: agregar `arcaCondicionIva: true` al `select`.
   La lógica de `construirPerfilFiscal` **no cambia**: ya sabe qué hacer con el campo.
2. Alta/edición del dato: hoy no hay pantalla que escriba `arcaCuit`, `arcaPuntoVenta` ni
   `arcaHomologacion` (solo se **leen**, ver §5). Sea cual sea la superficie que se elija (pantalla de
   configuración fiscal o script de provisioning), la condición de IVA va en el mismo lugar que las otras
   tres.

## 5. Dependencia que hay que resolver igual (no es parte de esta propuesta, pero la bloquea en la práctica)

**[VERIFICADO]** No existe en el repo ninguna escritura de `arcaCuit` / `arcaPuntoVenta` /
`arcaHomologacion`: `grep -rn "arcaCuit"` sobre `src/` y `scripts/` devuelve **solo lecturas**
(`arca-dispatch.ts`, `arca-pruebas-actions.ts`, `bancos-actions.ts`, `bancos-glue.ts`,
`facturacion-actions.ts`, `fiscal.ts`). La pantalla de facturación **muestra** el estado fiscal
(`facturacion-actions.ts:117`) pero no lo edita.

Consecuencia directa: con el fix aplicado, **ningún tenant puede facturar hasta que alguien cargue el CUIT
y el punto de venta en la base**. Eso es deliberado y es lo correcto — pero significa que hace falta una
superficie de carga (pantalla de configuración fiscal, o el script de provisioning) antes de encender
`ARCA_INVOICING_ENABLED`. Es trabajo aparte de esta propuesta.

---

— Elaborado por GSG
