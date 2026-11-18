<!-- Borrador del cuerpo del PR (relevo de GSG-MIA-084 a GSG-MIA-093). Falta G4c y el par de G4p. -->
## Qué cambia y por qué

GSG-MIA-084 (brief Factory-GSG `00-ESTADO/BRIEF-MIA-084.md`, criterios del anexo 2 de `certificacion/GSG-MIA-083.md`). Va contra `mia-083/administracion` (PR #191), no contra `main`. Borrador: sin merge ni publicación.

**N8a · los 580.000 (sólo lectura, base local de la demo).** Es el gasto «Flete y armado» del evento #2: neto 580.000, IVA 0, con proveedor, sin pagar y sin cuota. Rentabilidad «Por pagar a proveedores» suma los gastos sin pagar y las cuotas de pago de los eventos ($ 99.020.000 en la demo). Administración «A pagar» suma sólo cuotas, de los eventos y de la empresa ($ 98.440.000). La diferencia es ese gasto.

**N1 · pagar una liquidación ahora mueve la cuenta del banco.** Si el negocio tiene cuentas en pesos, `pagarLiquidacion` (`src/lib/proyectos/acciones-empresa.ts`) pide la cuenta o «Ninguna cuenta del banco». El saldo baja el total exacto con `updateMany`, dentro de `transaccionQueAsienta` y después de `asentarEnCajaTx`: si una de las dos cosas falla, no queda ninguna. Las cuentas en otra moneda o de otro negocio se rechazan con `cuentaParaCuota`, que ahora devuelve también el nombre de la cuenta. La pantalla tiene un formulario nuevo, «Pagar liquidación» (`_controles.tsx` `PagarLiquidacion`), con el medio y la cuenta. **Decisión provisional, a confirmar por el dueño.**

**N8b · los gastos sin pagar se ven aparte, con nombre.** Debajo de los recuadros de Administración aparece el renglón «Gastos cargados sin pagar», con el enlace «Verlos en Proveedores». La cifra de «A pagar» no cambia. Lee de `recuadrosDeCuotas` (`empresa.server.ts`): gastos sin pagar y sin anular del negocio. Se oculta a quien no ve costos. **Decisión provisional, a confirmar por el dueño.**

**G4p · nadie desvincula su propia ficha (tampoco la cuenta OWNER).** Cierra el NO CUMPLE de la certificación de MIA-083 (veredicto en Factory-GSG `00-ESTADO/certificacion/GSG-MIA-083-veredicto.md`). `guardarPersona` (`acciones-gestion.ts:212-216`) rechaza guardar la ficha propia sin `vincular` o pasarla a otra cuenta: «lo propio» ya no se pierde y el sueldo, editar, publicar y pagar lo propio siguen frenados. Otra persona de Dirección sí puede desvincularla. Test `mia084-g4p-desvincular-postgres` (rol `app_rls`, cuenta OWNER, ficha activa e inactiva): rojo en `7ff3406`, verde en `19eee60`. **Corrige lo que dice el PR #191: «las cinco puertas están cerradas» y «no hay excepción» no eran ciertos hasta este cambio.**

Commits:
- `320e471` N1, test rojo.
- `a108b1b` N1, arreglo.
- `394ade9` N8b, test rojo.
- `24f1caa` N8b, arreglo.
- `13c0131` concordancia del texto («1 gasto … no suma»).
- `7ff3406` G4p, test rojo.
- `19eee60` G4p, arreglo.
- `7a5173f` el aviso de cuenta faltante dice que se recargue la página (hallazgo menor del certificador).

`docs/qa/mia-084/registro.md` es el registro del turno. Sin migraciones: `prisma/` sin cambios.

### N1c · liquidaciones pagadas antes de este cambio
- **Localmente:** las bases de la demo y de UAT no tienen liquidaciones.
- **Producción:** no la leí, porque el brief prohíbe Neon. Un rol autorizado puede contarlas con esta lectura: `select count(*) from "ProyectoLiquidacion" where estado = 'PAGADA';`. Todas las pagadas antes de `a108b1b` lo fueron sin mover ninguna cuenta.
- **Saldos viejos:** no se corrigen sin una decisión escrita de ORQ-007.
- **Anular:** «devolver el saldo al anular» no aplica. No hay acción para anular una liquidación pagada, y el libro impide borrar el asiento.

### Deuda anotada
- `ProyectoLiquidacion` no tiene `cuentaId`. La cuenta queda en el historial (`pagada · medio · $ total · cuenta`) y en la auditoría. Agregar la columna es una migración (Gate 2), así que queda para cuando se decida.
- El renglón suma los gastos sin pagar de todos los proyectos, pero `reporteProyectos` toma 500 (`datos.server.ts:165`). Con más de 500 proyectos, la relación entre las dos pantallas no cierra. El tope ya existía para las cuotas.
- **Permiso (decide el dueño):** con Dirección o Administración más `liquidaciones:E` se puede bajar un saldo aunque no tenga `pagos` ni `empresa`. El control de permiso está en `acciones-empresa.ts:514` y la decisión anotada en `_controles.tsx:173-175`. El monto queda limitado al total publicado.
- Menores visuales, señalados por el verificador: la columna «Factura a» se parte en dos renglones a 1280, y en la captura de página completa a 390 la barra fija de abajo queda a mitad de página.

## Cómo se verificó
- **N1:** `mia084-liquidacion-cuenta-postgres.test.ts`, 8 casos.
  - En el commit rojo fallaban 5 de 8 (la cuenta no bajaba, no se pedía la cuenta, la carrera).
  - Verde: 8/8 en 6 corridas.
  - Casos: la cuenta elegida, «ninguna», sin elegir, cuenta en dólares, aislamiento entre negocios, carrera de 5 envíos con dos cuentas en 5 rondas, lo propio frenado, y el día cerrado con `cerrarDia` real (rechaza con el texto del cierre y la cuenta no se mueve).
- **N8b:** `mia084-a-pagar-postgres.test.ts`, con semilla fija y los lectores reales de las dos pantallas.
  - Rojo en `394ade9`, verde después.
  - A pagar 15.013.333,83 · gastos sin pagar 701.000,12 (2) · Rentabilidad 6.534.333,95.
  - Relación al centavo: Rentabilidad = A pagar − cuotas de la empresa + gastos sin pagar.
- **Tests vecinos:** 74/74 en 19eee60 (N1 66/66 y N8 22/22 antes).
- **Suite completa por nombre contra 77f1a6ba:** cabeza 19eee60: 9907 tests, 1 falla; 77f1a6ba: 9896, 2 fallas. La de la cabeza es la misma por nombre (pide `AISLAMIENTO_DATABASE_URL`); ningún test rojo nuevo.
- **tsc y build:** tsc 0 y build 0 en 19eee60.
- **Certificador adversarial (subagente aparte, sobre el diff):** sin bloqueantes.
  - Los dos archivos de tests: 9/9.
  - Sus 4 ataques: 8 pagos a la vez desde una misma cuenta; una falla provocada después de la baja; un total con centavos; valores de cuenta mal escritos.
  - Encontró los tres menores de arriba. Uno ya está arreglado (`7a5173f`).
- **Recorrido clic por clic** (base local, cuenta del puesto Administración de la demo):
  - Liquidaciones › «Pagar liquidación» › Transferencia › «Banco de prueba · Pesos» › Pagar.
  - La liquidación queda «Pagada».
  - En Bancos, Pesos queda en $ 48.400.000 y Dólares en US$ 35.200. El saldo de antes ($ 51.800.000) es el que traía la base de UAT según el recorrido UAT de MIA-083; no hay captura de este turno.
- **Capturas:** 8 en total, fuera de Git; las revisó un verificador visual aparte.
  - N8c: Rentabilidad 1280 y 390; Administración 1280 y 390; Proveedores 1280.
  - N1: formulario abierto, liquidación pagada y Bancos después del pago.

## Core/frente y sector
Proyectos / ERP · Administración (MIA) / Agencia de eventos

---

## 🛡️ Gate de Excelencia
### 1. Auditoría SAP Fiori + ángulo argentino
- [x] Rol-based · coherente · simple · adaptable (responsive + marca del negocio) · delightful/enterprise: el pago pide la cuenta sólo si el negocio tiene cuentas en pesos; el renglón se oculta a quien no ve costos; a 390 nada se corta.
- [x] Accesibilidad: el select de la cuenta tiene `aria-label` y es `required`; los avisos usan el toast existente; navegable con teclado.
- [x] Consistencia: `SelectCuenta` es el mismo selector que usan las cuotas (`ElegirCuenta`).
- [x] 🇦🇷 Criollo claro · transferencia/efectivo · simple para la pyme. N/A ARCA, MP y WhatsApp: no se factura ni se cobra.
### 2. Sello de marca GSG
- [x] Trailer `Generator: Gestión Studio Grow` en los commits. N/A metadata y footer: no se tocan.
### 3. Excelencia Arquitectura
- [x] Todo filtra por `tenantId` (incluida la cuenta dentro de la transacción). El saldo se mueve en la misma transacción Serializable que el asiento. Tests contra Postgres real. Deuda anotada arriba.
### 4. Confiabilidad de Producción
- [x] tsc + build + tests verdes (arriba). El aislamiento entre negocios está probado. Sin cambios de schema.

> Ítems N/A: ARCA, MP y WhatsApp (no se factura ni se cobra); metadata y footer (no se tocan).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01BtqRUJSU5Ka3ehqEZpWAdi
