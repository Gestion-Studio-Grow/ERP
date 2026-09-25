# Rendí — motor de rendiciones (Core, puro)

Motor de la rendición de gastos argentina integrada a SAP: lee el QR de ARCA, decide el tratamiento fiscal de cada comprobante, cuadra la rendición contra el anticipo, resuelve quién aprueba, arma el lote contable para SAP, concilia contra la precarga de IVA Simple y resume lo que va a Haberes.

- **Contrato de funciones:** [`CONTRATO.md`](./CONTRATO.md). **Contrato de tipos:** [`tipos.ts`](./tipos.ts) (congelado).
- **Diseño y fuentes normativas:** `Factory-GSG/rendiciones/01-plan-y-diseno.md` (§6 circuitos, §7 reglas, §10 SAP).
- **Superficie pública:** `index.ts`. Las pantallas importan sólo de `@/lib/rendiciones` y de `@/plugins/sap`.

| Módulo | Qué hace |
|---|---|
| `dinero.ts` | Centavos: `pesos`, `formatearPesos`, `ivaDeLinea`, `sumar` |
| `qr-arca.ts` | `leerQrArca`, `urlQrArca`, tipos ARCA ↔ clase (node y navegador) |
| `motor-fiscal.ts` | `evaluarComprobante`: tratamiento, carril, validaciones, importes |
| `rendicion.ts` | `calcularCuadratura`, `aplicarAccion` (reducer con guardias), `totalRendicion` |
| `aprobacion.ts` | `nivelesDeAprobacion`, `puedeAprobar` |
| `lote-contable.ts` | `armarLoteContable` (facturas, asientos, cancelaciones, altas, derivaciones) |
| `conciliacion.ts` | `conciliarConPrecarga` |
| `haberes.ts` | `resumenParaHaberes` |

## Reglas de la casa que respeta

- **Puro:** sin Prisma, red, React, `Date.now()` ni `new Date()`. La fecha "hoy" entra por parámetro.
- **Plata en centavos enteros.** Único redondeo: `Math.round` sobre centavos (EPSILON-safe, ADR-057).
- **ADR-002:** el Core no importa plugins; el plugin SAP consume `LoteContable` por tipado estructural.
- **ADR-046:** mensajes en criollo para quien rinde; la norma va en `Validacion.fuente`, para el contador.
- **La herramienta no adivina el IVA:** lo decide el tipo de gasto (dato del contador); el comprobante degrada, nunca mejora.

## Decisiones donde el contrato no alcanzaba

- **Pertenencia:** una línea es de la rendición si está en `comprobanteIds` (una línea que pasó a Cuentas a Pagar sigue cargada, pero ya no es de la rendición).
- **Duplicados (V6):** el primero que se cargó es el bueno; `otrosComprobantes` va en orden de carga.
- **"Clase A"** = factura A, tique factura A y tique de peaje. V2 bloquea también el CUIT que falta; V9 exige número al tique de peaje; V8 corre siempre en las clases que discriminan IVA.
- **Separación de funciones:** devolver o rechazar exige ser aprobador del nivel; nadie controla, contabiliza ni cierra lo propio. Nivel vacío: sube por la cadena de jefes.
- **Lote:** el bloqueo R3 es la derivación (va a `derivadosCxP`); cualquier otro bloqueo saca al comprobante. Las percepciones que no computan van al gasto con el indicador no computable.
- **Conciliación:** uno a uno; se ignoran las líneas que emitió la propia empresa.
- **Haberes:** cuenta lo rendido en rendiciones enviadas y no rechazadas (un borrador no es una rendición).
- **USD:** topes e importes de la evaluación en pesos, con la cotización del comprobante.

## Tests

```
node --import tsx --test "src/lib/rendiciones/**/*.test.ts"
```

Los datos de prueba compartidos están en `rendiciones.fixture.ts` (no dependen del escenario de la demo).
