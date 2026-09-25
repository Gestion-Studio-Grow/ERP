---
id: ADR-099
nivel: producto
dominio: producto
depends_on: [ADR-002, ADR-057, ADR-060, ADR-061, ADR-064, ADR-065, ADR-066, ADR-067, ADR-068, ADR-072, ADR-073, ADR-075, ADR-098]
---

# ADR-099 — Rendí: rendición de gastos argentina integrada a SAP, como módulo del motor

> ⚠️ **Reemplazada el 2026-09-25. Este texto queda como archivo.** Después de la validación técnica, el dueño eligió la opción D: Rendí es un producto propio, con núcleo portable y dos anfitriones (app de GSG y variante SAP BTP). El texto vigente del ADR-099 vive en el repo del producto `gsg-rendi`: `docs/adr/ADR-099-rendi-producto-propio-nucleo-portable.md`. Esta rama (`frente/rendiciones`) no se mergea a `main`. El número 099 sigue reservado para Rendí.

**Estado:** Propuesta (2026-09-24). Demo a costo cero en construcción en `frente/rendiciones`. Pasa al Challenger (ADR-045) junto con el RFC-006.

**Depende de:**
- ADR-002: Core y plugins.
- ADR-057: dinero.
- ADR-060 y ADR-061: dos productos, un motor.
- ADR-064: núcleo transaccional.
- ADR-065: fábrica de módulos.
- ADR-066: credenciales por tenant.
- ADR-067: datos reales.
- ADR-068: gates humanos.
- ADR-072 y ADR-073: diseño.
- ADR-075: patrón de bancos.
- ADR-098: apps.

> **Numeración.** Se toma el 099. Medido el 2026-09-24 con `git ls-tree` de `docs/adr` sobre todas las refs remotas: del 099 al 102 no aparecen en ninguna. Si al mergear ya está tomado, se renumera antes de llegar a `main`.

## Contexto

**Qué se pide.** Una empresa grande con SAP S/4HANA Cloud Public pide que quien gasta cargue su rendición desde el teléfono, que alguien la apruebe y que Tesorería deje de tipear cada comprobante. El detalle del cliente ancla vive fuera de este repo (Factory-SAP) y no se copia.

**Qué no resuelve SAP Public** [verificado en help.sap.com 2608.500; páginas citadas en `Factory-GSG/rendiciones/01-plan-y-diseno.md` §10 y Fuentes]:
- No trae app de rendición sin Concur.
- El workflow flexible aprueba por documento, no por legajo.
- No hay API de libro de caja.
- La carga masiva de facturas no acepta proveedor ocasional.

**Qué no tiene nadie en el mercado.** Con evidencia pública al 2026-09-24, nadie junta operación en Argentina, validación contra ARCA e integración con S/4HANA Public.

**Qué pone el motor y qué falta** (medido en `origin/main` 8dcc4af):
- Pone: login, capabilities, RLS, consola de alta con edición `empresa`, plugin ARCA (WSAA/WSFEv1), `src/lib/cuit.ts` y `src/lib/round.ts`.
- **No** tiene: roles de empleado/aprobador/tesorería, jerarquía, motor de aprobación, app instalable ni cámara, almacenamiento de objetos, ningún LLM, WSCDC/wsapoc/padrón, modelo de comprobante recibido con IVA, moneda extranjera ni conector SAP.

## Decisión

1. **Rendí es un módulo del mismo motor, no un repo aparte** (ADR-061). La lógica de negocio va en el Core, las integraciones en plugins (ADR-002):
   - `src/lib/rendiciones/` — dominio **puro**: tipos (contrato), QR de ARCA, motor fiscal, cuadratura y estados, aprobación por legajo, lote contable, conciliación contra IVA Simple, archivo para Haberes;
   - `src/plugins/sap/` — plugin de integración con SAP: primero **modo Archivo** (planillas de carga), después **modo API** (SAP_COM_0057 factura + adjuntos, SAP_COM_0002 asiento + compensación, SAP_COM_0303 partidas abiertas, SAP_COM_0008 proveedores; sin BTP);
   - `src/app/demo/rendiciones/` — la demo a costo cero: pública, sin login, sin secretos y con datos ficticios. **No necesita base**, pero la toca: el layout raíz del ERP es `force-dynamic` y su `generateMetadata` intenta leer la marca del tenant; sin base, cae a la marca por defecto y la página funciona igual. Es deuda heredada, igual que en `/demo` (ver Consecuencias).
2. **Línea Empresa con base propia** cuando haya datos reales: mismo código, otro proyecto de despliegue y otra base (ADR-060 en práctica, **sin migrar ningún tenant existente**). Los roles del módulo van en tabla propia; **no se toca el enum global de roles**, que obligaría a migrar a los cuatro tenants. La moneda va en las tablas del módulo.
3. **Plata en centavos enteros en el dominio.** Es una **excepción declarada a ADR-057 §1**:
   - ADR-057 rechaza los centavos para el contrato **existente** del ERP por su radio de impacto (plugin, IVA del Core, interfaz). Rendí es un módulo nuevo, sin consumidores previos: ese radio de impacto no existe.
   - La conversión vive en los bordes. La interfaz usa el formato de la casa (`fmtMoneyARS`) y las planillas de SAP salen en pesos con dos decimales. Si el módulo persiste, se guarda `Decimal(14,2)`, como pide ADR-057.
   - El redondeo es el único de la casa (`round2`, ADR-057 §2).

   **El diccionario de tipos de gasto es un dato** con versiones y estado ("validado por el contador"). Cada evaluación guarda la versión de la regla que aplicó.
4. **El corte de carriles es configurable.** Por defecto: lo que computa crédito fiscal va como factura de proveedor por comprobante, y lo que no computa va a un asiento por rendición. Es el único corte que funciona en modo Archivo.
5. **Lectura del comprobante: QR primero, IA después, persona siempre.** El QR de ARCA se lee en el teléfono: da 13 campos, sin neto ni IVA. La IA con visión completa el resto sólo cuando hace falta, y su costo se traslada al cliente por comprobante leído. **La IA nunca decide el tratamiento del IVA.** Es una pieza de plataforma: sirve también para cargar facturas de compra en el ERP.
6. **La aprobación por legajo vive en Rendí**, no en el workflow de SAP. Tiene separación de funciones, suplencias con fecha y una bitácora que sólo se agrega.
7. **Ciclo demo → venta → inversión.** Hasta la venta, sólo demo: sin datos reales, sin secretos, sin persistencia. La base paga, el almacenamiento inmutable, las credenciales SAP/ARCA/IA por tenant (ADR-066) y el endurecimiento del outbox en el Core son inversión posterior a la venta, con las firmas de ADR-068.

## Alternativas descartadas

- **Módulo en la base compartida actual:** mete datos fiscales y de empleados de una empresa grande con los cuatro comercios, y el enum de roles es global.
- **Repo aparte:** duplica login, aislamiento y diseño, y contradice ADR-061.
- **Objeto propio dentro de SAP (extensibilidad key user):** no soporta adjuntos ni se le engancha el workflow flexible [help.sap.com 2608].
- **OCR especializado del mercado:** ninguno entiende CUIT, letra A/B/C ni QR de ARCA, y cuesta del mismo orden que la IA con visión.

## Consecuencias

- **La demo se puede mostrar sin gastar un peso ni necesitar una base.** El dominio que la mueve es el mismo que va a producción.
- **Deuda anotada:**
  - unificar el tipo del payload del QR con el del plugin ARCA, que el Core no puede importar;
  - escritor de xlsx, para cuando la planilla real no acepte CSV;
  - encabezados de las planillas SAP [A VALIDAR contra la plantilla del arrendatario];
  - tope de 1 MB de las Server Actions: las fotos van por subida directa firmada;
  - **plataforma:** el layout raíz `force-dynamic` impide prerenderizar las demos y hace que cada visita intente leer la base (pasa igual en `/demo` y `/premium`). Opciones: un layout raíz propio para las demos, o que el layout no consulte la base en `/demo/*`. Es un frente aparte;
  - **la v1 toca piezas del Core que usan los comercios:** el caché del ticket de ARCA (hoy fijo en `wsfe`) y el outbox. Van como cambios aditivos, con tests de no regresión sobre la facturación de los tenants vivos (observación del Challenger);
  - **dos bases con el mismo esquema:** cada migración se aplica dos veces, con su Gate 2 cada vez;
  - **exactitud de la lectura con IA sin medir:** hasta tener un set de comprobantes reales etiquetados, se vende "QR y persona que confirma", con la IA como opcional. También hay que evaluar SAP Document AI (scope item 4N6, licencia aparte) [A VALIDAR para Argentina];
  - **consistencia de la interfaz:** tercera implementación de pestañas (`piezas.tsx`), un encabezado que clona `PageHeader`, colores hex en `page.tsx` y `estilos.tsx`. Pasarlos al toolkit y a tokens con nombre;
  - **accesibilidad del toolkit:** `Field.tsx` no propaga `aria-required` ni `aria-describedby`. Se resuelve en el primitivo, para todos.

## Tests que lo sostienen

`src/lib/rendiciones/*.test.ts`, `src/plugins/sap/**/*.test.ts` y `src/app/demo/rendiciones/escenario.test.ts`. Este último comprueba que el escenario ficticio produce exactamente las validaciones esperadas: cuadratura que falla, factura con leyenda derivada, comida cubierta por convenio, duplicado, CUIT apócrifa y proveedor fuera del maestro.

La síntesis con el Challenger (ADR-045) está en el RFC-006, §6.

— Elaborado por GSG
