# 🏗️ Plan de construcción — completar la suite para go-live

**Pedido del dueño (2026-07-11):** construir lo que falta en Fable, con foco en (1) auto-facturar TODO lo
que entra por Mercado Pago o banco en Comerciante + Facturita, (2) completar el tier Pyme "con la
perfección de un reloj suizo" (ahí destacamos), (3) probar, publicar cada uno con su URL, y entregar un
PDF + manual de uso por producto.

Este doc es el spec para ejecutar apenas se libere el clasificador de permisos del sistema (hoy caído).

---

## Frente 1 — Auto-facturado total desde Mercado Pago + Banco (Comerciante + Facturita)

**Estado hoy:** el importador de extracto bancario está construido (A). La ingesta de Mercado Pago +
conciliación + clasificador existen a nivel dominio (ADR-025) pero con glue SIMULADO (stub), sin OAuth
real por tenant.

**A construir:**
1. OAuth real de Mercado Pago por tenant (`src/plugins/mercadopago/oauth.ts` → cablear el flujo de
   vinculación de cuenta; el token lo pega el dueño, ADR-041).
2. Webhook HTTP real de MP (`notification.ts` + firma `signature.ts`) → cada cobro aprobado entra al
   pipeline `facturarPagoSiCorresponde` y emite factura ARCA automáticamente.
3. Backfill histórico (`sincronizarPagos`) para facturar lo ya cobrado.
4. Unificar la vista: banco + MP en una sola cola/tablero, con dedup cruzado (ya existe la detección
   cruzada banco↔MP).
5. Que Facturita también reciba MP (versión mínima: cobros → factura, sin extracto bancario).

**Definición de terminado:** todo cobro que entra por MP o por banco se convierte en propuesta de factura
sin intervención; el usuario solo revisa las que superan el umbral. Verde + test + runtime.

---

## Frente 2 — Facturita (construir de cero)

Ver spec completo en el prompt de build (ADR-076). Empaquetado de módulos liviano (arca + clients),
signup público `/facturita`, emisión manual en 3 clics, tope 5 facturas/mes con gancho de upgrade,
+ recepción de Mercado Pago (frente 1). Piel Fable claro/oscuro, criollo, sello GSG.

---

## Frente 3 — Tier PYME "reloj suizo" (lo que hoy NO existe)

Es el frente más grande y fiscalmente sensible. Se construye por módulos, cada uno con su Gate:

1. **Nómina** (`src/plugins/nomina` o módulo): alta de empleado, recibo de sueldo, cargas sociales
   (F.931 SUSS: aportes/contribuciones), ART, SAC (aguinaldo), vacaciones, costo laboral en el dashboard.
   Convenio de comercio (CCT 130/75) como tabla de escalas parametrizada (motor de tablas con vigencias,
   nunca hardcode). **Alcance v1 honesto:** recibos + F.931 + ART + SAC/vacaciones + costo visible;
   liquidación por convenio completa = fase 2 (LCT + convenios es un pozo, no prometer "liquidación
   total" en la venta).
2. **Convenio Multilateral / IIBB** (`src/plugins/iibb` o módulo): coeficientes unificados, IIBB por
   jurisdicción, datos fiscales del cliente CM, percepciones AGIP/ARBA en el comprobante. Motor de tablas
   por jurisdicción. Es complejo y volátil → se construye con precisión y se cobra caro (tier CM).
3. **Feed bancario directo** (open banking): evaluar agregador AR (Prometeo/Belvo — spike de viabilidad
   y costo por cuenta ANTES de prometer fecha) vs. seguir con el Excel subido como fallback digno.
   Puerto abstracto para no atarse a un proveedor.
4. **Multi-sucursal / conciliación por local**: punto de venta por sucursal, conciliación e informes por
   local, consolidado. Multi-usuario con roles por sucursal.

**Regla de venta (crítica):** hasta que cada módulo esté construido y pase el Gate, NO se vende como
disponible — va como "en el plan" / tier premium. No prometer lo que no está (lección del gap detectado).

---

## Frente 4 — Pruebas, publicación y entregables

1. Verificación total (prisma validate + tsc + test + build) + recorrido runtime de cada producto.
2. Gate de Excelencia (Opus) + Gate UX/UI (ADR-079) + auditoría fiscal adversarial.
3. Deploy + 3 tenants (CUIT del dueño, homologación) + 3 URLs (comerciante-gsg / contador-gsg /
   facturita-gsg). Runbook: `docs/runbooks/golive-suite-3-productos.md`.
4. Por cada producto: un PDF ejecutivo (qué es, para quién, qué hace) + un MANUAL DE USO paso a paso.

---

## Orden de ejecución sugerido (apenas vuelva el clasificador)

1. Frente 1 (auto-facturado MP+banco) — hace sólidos los productos vendibles YA.
2. Frente 2 (Facturita) — el más chico, sale rápido.
3. Verificar + Gate + deploy + URLs de A, B, C + manuales/PDF de esos tres → **UAT del dueño puede
   arrancar con 3 productos**.
4. Frente 3 (pyme reloj suizo) por módulos, en paralelo/después — es el build grande; nómina y CM son
   fiscalmente profundos y llevan su tiempo hacerlos bien.

---

**Nota de realismo (honesta, PMO):** los frentes 1, 2 y 4-parcial son alcanzables en el corto plazo y
dejan los 3 productos vendibles para el UAT de esta semana. El frente 3 completo (nómina + CM a nivel
"reloj suizo") es un desarrollo mayor y fiscalmente sensible: se construye bien y por etapas, no de un
día para el otro. Vender el tier pyme como "terminado" antes de que esté = riesgo. Se comunica como
premium en construcción y se cierra con los primeros clientes pyme de la mano de su contador.

— Elaborado por GSG (PMO/Arquitecto) · 2026-07-11
