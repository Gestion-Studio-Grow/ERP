# R1-F5 motor fiscal, porción 1 (2026-09-25)

## Comandos y resultado
- `node --import tsx --test src/lib/fiscal/ficha-fiscal.test.ts` → 17/17 (tests-ficha-fiscal.txt)
- `node --import tsx --test "src/app/admin/(dashboard)/ventas/factura.test.ts"` → 9/9 (tests-factura.txt)
- `node --import tsx --test src/lib/client-actions.test.ts` (Postgres efímero 5433 con app_rls + RLS, Server Action real con sesión, cliente SOAP real contra SimuladorArca) → 5/5, skipped 0 (tests-client-actions-postgres-simulador.txt)
- 13 archivos que tocan factura/fiscal/ficha + handler-decision + iva-por-producto + decidir-comprobante → 287/287, skipped 0 (tests-relacionados.txt)
- `node --import tsx --test src/apps/paridad-menu.test.ts` → 4/4 (tests-paridad-menu.txt)
- `npx tsc --noEmit -p .` → 0 errores en todo el repo (tsc.txt)
- `npx eslint --max-warnings=0` sobre los 8 archivos del frente → exit 0 (eslint.txt)

## Qué prueba el sistema
- Ficha fiscal: CUIT con dígito verificador, condición de la tabla de ARCA, razón social obligatoria con CUIT, nada inventado; auditada con el valor anterior; la ficha de otro negocio da "no existe" y no cambia.
- getFiscalProfile lee Tenant.arcaCondicionIva de la base: RI → perfil RI no asumido. NULL en homologación (CH) → Monotributo asumido y C, igual que antes; NULL en producción → se niega (campo condicionIva). Un negocio cargado como consumidor final no emite.
- Ventas: RI con IVA por producto → A a inscripto, A a monotributista (RG 5003/2021), B a consumidor final. Monotributo → {ok:true} idéntico a antes.
- Camino completo Ventas → createInvoice → outbox → SOAP → simulador: RI a consumidor final, Factura B autorizada (tipo 6).
- Con la clase A común, la ficha guardada en Postgres da A y el despacho (SOAP real contra el simulador) la autoriza como Factura A (tipo 1), para el inscripto y para la monotributista.

## Lo que NO está probado (ver traspaso)
- La A por el camino completo: no hay dónde guardar la clase A (RG 1575) y el despacho la descarta (src/lib/arca-dispatch.ts:168-171).
- order-actions.ts no le pasa todavía a puedeFacturarVenta la ficha, la alícuota ni la fecha: un RI hoy ve "cargá la alícuota de IVA" y no emite.
- No hay en el repo un script "refutador fiscal"; no se corrió.

# R1-F5 motor fiscal, porción 2 (2026-09-25)

## Qué se hizo
- `src/lib/fiscal/impuestos-por-alicuota.ts` (NUEVO, puro, sin Prisma): `calcularImpuestosPorAlicuota(emisor, {total, renglones})`, la tabla `DIVISOR_POR_ALICUOTA` y los motivos. `calcularImpuestos` se movió acá sin cambios; `src/lib/fiscal.ts` la reexporta (los 10 que la importan no cambian).
- `ventas/factura.ts`: `puedeFacturarVenta` recibe `renglones` (lo cobrado por producto con su alícuota) en lugar de `ivaPorProducto`, y usa el mismo cálculo que la emisión: Ventas no promete una factura que no se puede calcular.
- `src/lib/fiscal/ficha-fiscal.ts`: `receptorParaComprobante(decision)`: el comprador de la factura sale de la decisión (documento normalizado, condición resuelta); `null` si la decisión no quedó lista.

## Comandos y resultado
- `node --import tsx --test src/lib/fiscal/impuestos-por-alicuota.test.ts src/lib/fiscal.test.ts` → 24/24 (p2-tests-impuestos-y-fiscal.txt)
- `node --import tsx --test src/lib/fiscal/ficha-fiscal.test.ts` → 20/20 (p2-tests-ficha-fiscal.txt)
- 15 archivos relacionados (fiscal, ficha, impuestos, Ventas, client-actions con Postgres 5433 y simulador ARCA, circuito fiscal, umbral en los seis caminos, redondeo, libros) + `src/apps/paridad-menu.test.ts` → 218/218, skipped 0 (p2-tests-relacionados.txt)
- Navegador (vender-pantalla, caja ×2, inicio, pie pegado) → 77/77, skipped 0 (p2-tests-navegador.txt)
- `npx tsc --noEmit -p .` → 0 errores en todo el repo (p2-tsc.txt, vacío)
- `npx eslint --max-warnings=0` sobre los 10 archivos del frente → exit 0 (p2-eslint.txt, vacío)

## Qué prueba el sistema
- CH (monotributo) y exento: 508 importes × 2 condiciones × 3 juegos de renglones (con exentos y sin alícuota) dan exactamente lo mismo que la regla de HEAD (copia congelada en el test), con `ivaPorProducto` falso: el pedido a ARCA no cambia.
- Inscripto todo al 21 %: 2000 importes, igual que la tasa pareja de antes.
- 3000 ventas al azar de un inscripto (1 a 6 renglones, las 6 alícuotas): todo al centavo, neto = suma de bases, neto + IVA = total = lo cobrado, y el plugin ARCA (`construirComprobante` + `validarComprobante`) las acepta todas.
- No se factura (con el motivo en pantalla): producto sin alícuota, exento o no gravado (ARCA los pide en otros campos que la factura todavía no lleva), código que no es de ARCA, productos que no suman lo cobrado, importes inválidos, venta en cero.
- La tabla de alícuotas del Core es la misma que verifica el plugin.
- El comprador de la factura: inscripto (80), monotributista (80), DNI (96, consumidor final), sin identificar (99 y 0, lo mismo que hoy). Sin decisión lista no hay comprador (CUIT sin condición, A sin su clase, venta grande con posible FCE, consumidor final sin documento sobre la RG 5700). Lo que decide el despacho (`decidirDelEvento`) con la factura armada es lo que decidió Ventas.
- Postgres + simulador: Ventas → `createInvoice` → outbox → SOAP → simulador, con IVA en 21 % y 10,5 % y el comprador de la decisión: Factura B autorizada; Factura A autorizada por el despacho del plugin para la inscripta y la monotributista.

## Lo que NO está probado
- La A por el camino completo (outbox): falta dónde guardar la clase A (migración estacionada) y `src/lib/arca-dispatch.ts:168-171` la descarta.
- `order-actions.ts` e `invoice-from-order.ts` (otros frentes) todavía no pasan los renglones ni la ficha: hoy un inscripto ve "cargá la alícuota" y no emite; CH no cambia.
- No existe un script "refutador fiscal" en el repo: no se corrió.

# R1-F5 motor fiscal, porción 3: corrección del refutador (2026-09-25)

## Qué se corrigió (en archivos del frente)
- (3, 4, 5) `src/lib/fiscal/ficha-fiscal.ts` `queImpideEntregarLaFactura(decision, ficha, gruposDeAlicuota)`: la factura que ARCA autorizaría pero el impreso no puede entregar no se promete. A sin domicilio del comprador (RG 1415, Anexo II); A con más de una alícuota (comprobante-pdf.ts:285); leyenda obligatoria que el impreso no trae (RG 5003/2021 en la A a monotributista; `LEYENDAS_QUE_LLEVA_EL_IMPRESO` = sólo la de la Ley 27.743, comprobante-pdf.ts:562-567). `puedeFacturarVenta` (ventas/factura.ts:145) la llama antes de prometer: no se pide un CAE sin papel.
- (5, raíz) `validarFichaFiscal`: inscripto, monotributista, monotributista social o promovido sin domicilio no se guarda (ficha-fiscal.ts:134).
- (1, parte del frente) `src/lib/fiscal.ts`: `FiscalProfile.regimenFacturaA` (la clase A de la RG 1575, tal cual; null si no es inscripto o no está cargada). Desde la base llega siempre null: no hay columna (ver traspaso).
- (2, parte del frente) `src/lib/fiscal/datos-fiscales-de-venta.ts` (NUEVO): `leerDatosFiscalesDeVenta(tx, orderId)` lee de la venta la ficha del cliente y lo cobrado por producto con su alícuota; `renglonesDeLaVenta` reparte el descuento al centavo (BigInt, mayor resto). Con RLS: la venta de otro negocio da null.
- (2, pantalla) `clientes/[id]/fiscal/page.tsx` + `clientes/[id]/FichaFiscalForm.tsx` (NUEVOS): la dueña carga documento, razón social, condición y domicilio con `guardarFichaFiscal`. Candado: la página sólo existe si el negocio es Responsable Inscripto (CH, con condición vacía, recibe 404). Nadie la enlaza todavía.

## Comandos y resultado (salidas en esta carpeta)
- Tests nuevos ANTES del arreglo: `c1-antes.txt` 30/35, 5 en rojo (A sin domicilio, A con dos alícuotas, A a monotributista, ficha sin domicilio, queImpideEntregarLaFactura). DESPUÉS: `c1-despues.txt` 35/35.
- Clase A en el perfil: `c2-fiscal-antes.txt` 16/17 (1 rojo) → `c2-fiscal-despues.txt` 17/17.
- `src/lib/client-actions.test.ts` (Postgres 5433, app_rls, Server Action con sesión, SOAP contra el simulador): `c3-client-actions.txt` 5/5, skipped 0.
- `src/lib/fiscal/datos-fiscales-de-venta.test.ts` (3000 ventas al azar + Postgres con aislamiento): `c4-datos-de-venta.txt` 4/4, skipped 0.
- Opciones del formulario = lo que la acción acepta: `c5-ficha-opciones.txt` 23/23.
- `npx tsc --noEmit -p .` → exit 0, 0 líneas (`c6-tsc.txt`).
- 36 archivos relacionados (fiscal, ficha, impuestos, decisión, plugin ARCA, dinero, libros, umbral, paridad-menu, consumidores de fiscal.ts): `c7-tests-relacionados.txt` 492/492, skipped 0.
- Navegador (vender-pantalla, caja-renglon, caja-teclado, cifra-de-renglon-celular, pie-pegado): `c8-tests-navegador.txt` 77/77, skipped 0.
- `npx eslint --max-warnings=0` sobre los 14 archivos del frente → exit 0 (`c9-eslint.txt`, vacío).

## Lo que sigue en rojo y por qué (traspaso)
- Criterio 1 por el camino del producto: la A no sale por el outbox. Falta (fuera del frente): columna `Tenant.arcaRegimenFacturaA` (schema.prisma:301 + migración lanzamiento_base:132/549, todavía sin aplicar en Neon), `invoice-core.ts:52` (emisor con regimenFacturaA), `arca-dispatch.ts:168-172` (pasarlo al evento), `invoice-from-order.ts:66-81` (IVA por alícuota y comprador de la ficha, no consumidor final fijo), `order-actions.ts:1181-1191` (perfil con cuit y clase A, y receptor/renglones/hoy de `leerDatosFiscalesDeVenta` + `fechaFiscalDelDia`). Después, en el frente: `fiscal.ts:265` sumar `arcaRegimenFacturaA: true` al select y un test Postgres que facture una A por la Server Action de Ventas.
- A a monotributista: bloqueada hasta que `comprobante-pdf.ts` imprima la leyenda de la RG 5003; después se suma "RG5003_MONOTRIBUTISTA" a `LEYENDAS_QUE_LLEVA_EL_IMPRESO` (ficha-fiscal.ts).
- A con varias alícuotas: bloqueada hasta que Invoice guarde la alícuota de cada renglón.
- La pantalla de datos para facturar no tiene enlace (clientes/[id]/page.tsx es de otro frente) ni test de navegador propio.
