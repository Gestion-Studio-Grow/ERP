# Método de scope items GSG — Finanzas y Control

> **Qué es:** cómo GSG toma el método de SAP S/4HANA Cloud Public Edition (procesos de mejor práctica que se
> **activan y se parametrizan**, no se programan a medida) y lo vuelve un método propio, argentino, para pymes.
> **Orden del dueño:** 11/11/2026. **Primer cliente:** MIA Producciones. **Base:** ADR-058 (GROW-AR), ADR-044,
> ADR-054/055, `docs/estrategia/mapa-cobertura-scope-items.md`, skill `ingenieria-reversa`.
> **Documentos hermanos:** `CATALOGO-FINANZAS-CONTROL.md` (los scope items) y `PLAN-TANDAS.md` (cómo se construye).

## 0. Frontera de honestidad de esta pasada

- Las fuentes de SAP son **públicas** (help.sap.com, learning.sap.com, community.sap.com, notas públicas). En
  esta sesión la red **no dejó abrir** esos dominios: lo que se cita salió de **extractos del buscador** sobre la
  URL indicada. Por eso cada dato lleva una marca: **[E]** visto en extracto de una fuente, **[I]** inferido
  (conocimiento general, sin fuente abierta), **[AV]** a validar. Nada figura como «verificado de primera mano».
  Tarea pendiente: releer con los dominios habilitados (ver `PLAN-TANDAS.md`, T0).
- De SAP se toma la **idea de método y la regla de negocio**. No se copia texto, pantallas, marca ni contenido de
  configuración. Los códigos SAP (J58, J59…) se usan sólo como **referencia de trazabilidad**.
- Las reglas fiscales argentinas de este arco (alícuotas, mínimos, regímenes, fechas) son **parámetros
  provisionales a confirmar con el estudio contable del cliente**. El ERP no reemplaza al contador: le entrega
  la información ordenada.

## 1. Lo que se toma de SAP y lo que se cambia

| En SAP Public Cloud | Marca | En GSG |
|---|---|---|
| Un scope item trae diagrama del proceso, guion de prueba (roles, prerrequisitos, datos maestros, pasos), roles de negocio hechos de catálogos | [E] learning.sap.com (navegación de procesos en Signavio Process Navigator) | Un scope item GSG trae las **7 piezas** del §2 |
| El alcance se define antes de configurar: sector, país y paquete; después se eligen scope items. Una lista dice de qué depende cada uno y en qué países existe | [E] learning.sap.com «Defining scope and localizations» | Alcance por **rubro (Blueprint) + perfil (lite/enterprise) + país fijo Argentina**; dependencias declaradas en el catálogo |
| SAP Activate: Discover, Prepare, Explore (talleres *Fit-to-Standard* sobre un sistema de arranque), Realize, Deploy, Run | [E] learning.sap.com «Describing the methodology structure» | Ciclo **Preventa → Ajuste al estándar → Parametrizar → Probar con datos reales → Salir** (§4), atado a DEMO → VENTA → INVERSIÓN |
| Plan de cuentas modelo único (YCOA) que el cliente no debería modificar; puede sumar el suyo | [E] blog de miembro + nota pública | Plan modelo por rubro (`src/lib/contabilidad/plan-modelo.ts:348`), el cliente **agrega hojas**, no rompe la estructura |
| El estándar no se toca: lo que falta se pide como extensión | [I] | Guardrail de `FUNDAMENTOS §2`: si lo puede reusar otro tenant, sube al catálogo; si es exclusivo, proyecto aparte |
| Argentina en Public Edition: IIBB provincial fuera del procedimiento estándar; factura electrónica por partners; el contenido de retenciones lo mantiene el cliente | [E] notas públicas 3615035, 3754940; páginas de partners | **Acá está el diferencial:** lo argentino es parte del estándar GSG, no una extensión |

**Lo que se reemplaza (accidente de mercado, skill `ingenieria-reversa` paso 3):** multi-sociedad, ledgers
paralelos, moneda de grupo, consolidación, costeo industrial, bancos por conectividad corporativa. Quedan en la
**reserva** del mapa de cobertura. **Lo que se conserva (esencia):** documento balanceado, subledger que resume en
una cuenta de control, nada se borra (se contraasienta), período que se cierra, impuesto decidido por un indicador
en la línea, dimensiones de gestión en el mismo asiento.

## 2. Anatomía de un scope item GSG (7 piezas)

| # | Pieza | Qué contiene | Dónde vive |
|---|---|---|---|
| 1 | **Proceso estándar** | Pasos numerados, quién hace cada uno, qué documento nace y qué asiento genera. Un solo camino feliz y sus desvíos | Catálogo (docs) → descriptor del módulo |
| 2 | **Reglas Argentina** | Impuestos, comprobantes, plazos, medios de pago, moneda. Cada regla dice si es **ley** (igual para todos) o **parámetro** (cambia por cliente o por año) | Tablas versionadas en código (`tabla-vencimientos-2026.ts` es el patrón) |
| 3 | **Parámetros de adaptación** | Lo único que cambia entre clientes: valores, interruptores, plantillas. Con valor por defecto y rango permitido | Configuración por tenant (hoy `ConfigContable.capacidades`, JSON) |
| 4 | **Datos maestros** | Qué objetos se crean una vez (cuenta, cliente, proveedor, banco, jurisdicción) y con qué campos mínimos (ADR-055: objeto + asignación) | Modelos de Prisma existentes; lo nuevo, migración aditiva |
| 5 | **Guion de prueba** | Pasos clic por clic con dato de entrada y resultado esperado, incluida la **aritmética** (el asiento que debe quedar). Es el criterio de aceptación de la tanda | `docs/finanzas-control/guiones/<código>.md` (se escribe en cada tanda) |
| 6 | **Perfil lite / enterprise** | Qué pasos y controles lleva cada perfil. Invariante `enterprise ⊇ lite` (ADR-058 P3): subir es encender, nunca migrar | Descriptor del scope item |
| 7 | **Roles** | Quién ve y quién aprueba (administración, dirección, productor, estudio externo de sólo lectura) | RBAC existente |

**Código del scope item:** `FC-nn` (Finanzas y Control) con el código SAP de referencia al lado. El código GSG es
el que manda; el de SAP es trazabilidad.

**Estado real del soporte en el código (para no prometer de más):** hoy `ScopeItem` es sólo `{label, ruta}`
dentro del descriptor de un módulo (`src/modules/contract.ts:76`, `:169`) y lo que se enciende por negocio es el
**módulo entero** (`toggleTenantModule`, `src/lib/operator-actions.ts:730`). El método **no exige** cambiar ese
mecanismo: los scope items de este arco se agrupan en módulos y se gradúan con **parámetros** (pieza 3). Ampliar
el descriptor (código, perfil, dependencias, guion) es la primera tarea de la tanda T1 y es reversible.

## 3. Las tres capas de un scope item (qué se adapta y qué no)

1. **Estándar (no se toca por cliente).** El motor: validación del asiento, determinación de cuentas, cálculo
   del impuesto a partir del indicador, estados del documento. Vale para todos los tenants. Se prueba con tests.
2. **Parámetros (se adapta sin programar).** Valores por tenant: plan de cuentas (hojas), qué rol apunta a qué
   cuenta, regla de cobro (por ejemplo el porcentaje de anticipo), jurisdicciones de IIBB y coeficientes,
   regímenes de retención habilitados, monedas, quién aprueba. Lo carga administración o el implementador.
3. **Extensión (se evita).** Sólo si el proceso del cliente no entra con parámetros. Pasa por el guardrail de
   reuso y por Advisory + Challenger antes de entrar al catálogo.

**Regla de oro del ajuste:** *primero se intenta que el cliente adopte el proceso estándar; después, parámetro;
al final, extensión.* Una adaptación que pide extensión se anota como brecha, con su costo.

## 4. Cómo se adapta a un cliente desde la preventa

| Etapa | Qué se hace | Entregable | Compuerta |
|---|---|---|---|
| **1. Relevamiento** (preventa) | Planilla estándar por scope item: perfil fiscal, operación, medios, bancos, quién hace qué, qué entrega al estudio. Sin datos personales en Git | `BRIEF-<cliente>-REQUERIMIENTOS.md` (caso MIA: ya existe) | Autorización del cliente registrada para usar su marca |
| **2. Alcance** | Se marcan los scope items que aplican y el perfil de cada uno. Lo que no aplica: N/A + por qué | Columna «Adaptación <cliente>» del catálogo | — |
| **3. Ajuste al estándar** | Taller corto: se muestra el proceso estándar funcionando con datos de demostración y se anota cada diferencia como **adopta / parámetro / brecha** | Lista de diferencias con decisión | Las brechas pasan por Challenger |
| **4. Parametrización** | Se cargan los parámetros y los datos maestros (padrones, plan de cuentas, saldos iniciales) | Tenant configurado en rama de prueba | Datos reales sólo en rama de prueba de Neon, nunca en Git |
| **5. Prueba con datos reales** | Se corre el guion de cada scope item con un mes real del cliente y se compara contra lo que el cliente y su estudio ya tienen (planillas, declaraciones) | Acta de prueba por scope item (n/n) | Certificación adversarial en plata e impuestos |
| **6. Salida** | Migraciones, saldos de apertura, usuarios y capacitación | Runbook de salida | **Gate 2** (migraciones) y deploy: orden del dueño |
| **7. Operación** | Cierre mensual acompañado el primer mes; lo aprendido vuelve al catálogo como parámetro nuevo o regla | Retro (ADR-047) | — |

**Cómo decide el relevamiento el perfil:** `lite` si el cliente sólo necesita operar y entregar al estudio
(cobra, paga, factura, exporta); `enterprise` si además lleva contabilidad propia, retiene como agente, opera en
más de una moneda o controla por proyecto. El nivel ya existe en el código como `PYME`/`CORPORATIVO`
(`src/lib/contabilidad/config.ts:17`); se mapea `lite → PYME`, `enterprise → CORPORATIVO`. **El perfil se decide
por scope item, no por cliente entero**, y se cierra por escrito en el alcance (etapa 2) antes de construir.

**Cómo se sostiene `enterprise ⊇ lite` con el libro (corrección del challenger):** el motor de contabilización
corre **siempre**, también en `lite`, en modo sombra: genera los asientos y `lite` simplemente no muestra el
libro ni exige cerrarlo. Así subir de perfil es encender pantallas, no contabilizar historia hacia atrás. Para
un negocio que operó **antes** de que existiera el motor, el ascenso no es «encender»: es una **apertura al
corte** (saldos y partidas abiertas a una fecha), y se dice así en la propuesta.

**Lo que la etapa 6 (Salida) tiene que traer sí o sí:** fecha de corte; saldos de apertura y **partidas
abiertas** (anticipos de eventos futuros, cheques en cartera, cuentas corrientes de clientes y proveedores);
un mes en paralelo con las planillas; reversa en masa del lote de carga si sale mal; capacitación por rol;
canal de soporte; y la salida de datos si el cliente se va. Tiene su tanda propia (`PLAN-TANDAS.md`, TS).

**Datos del cliente:** además de la autorización de marca, hace falta el **consentimiento registrado del
cliente para tratar sus datos** en la prueba (Ley 25.326), con quién accede y cuándo se borran.

## 5. Principios de diseño del arco (decisiones de arquitectura, reversibles)

1. **Un solo libro.** Todo hecho de plata termina en un `Asiento` generado por un **motor de contabilización**
   desde el documento de origen, con clave de origen única (no se contabiliza dos veces). Hoy la contabilidad no
   está conectada a nada: ningún archivo fuera de `src/lib/contabilidad` la importa.
2. **La cuenta de control es un rol.** El equivalente de la «cuenta de reconciliación» de SAP ya existe:
   `CuentaRol` (`prisma/schema.prisma:4424`) con 53 roles (`src/lib/contabilidad/roles.ts:22`). El motor nunca
   escribe un código de cuenta: pide el rol.
3. **Nada se borra.** Corregir es contraasentar (`contraAsiento`, `src/lib/contabilidad/asiento.ts:228`).
4. **Plata en centavos enteros** en el libro (`AsientoLinea`, BigInt). Los módulos que hoy guardan en `Float`
   (Proyecto*, `CommissionPayout`) **no se migran en este arco**: el motor convierte al contabilizar con una regla
   de redondeo única y un test de cuadre. La deuda queda anotada.
5. **Moneda de la operación al lado del peso.** El libro se lleva en ARS; cada línea guarda además moneda,
   importe de origen y tipo de cambio (campos nuevos, opcionales). El tipo de cambio tiene historia por día.
6. **Dimensiones de gestión en el asiento** (proyecto, productor, rubro): la rentabilidad sale del mismo libro
   que el balance, no de una planilla paralela.
7. **El impuesto lo decide un indicador**, no la persona que carga: elige el indicador y el sistema calcula,
   separa y manda a la cuenta del rol.
8. **No se crea una tercera tesorería.** Hoy hay dos (extractos del núcleo para proponer facturas; cuentas de
   banco de Proyectos). Se unen por la **cuenta contable** de rol BANCO, no con un modelo nuevo.
9. **Migraciones aditivas, escritas sin aplicar, y el código tolera su ausencia** (ya es el patrón:
   `migracionContableAplicada`, `src/lib/contabilidad/modulo.server.ts:40`). **Límite de ese patrón:** sólo
   sirve para **tablas nuevas**. Una columna nueva en un modelo que ya se usa rompe las pantallas actuales si la
   migración no está aplicada (Prisma pide todas las columnas). Por eso, hasta el Gate 2, lo nuevo va en tablas
   nuevas con una sonda por migración, y las tandas se integran a una **rama del arco**, no a `main`.

## 6. Glosario mínimo (para que no se mezclen palabras)

- **Asiento:** registro contable de partida doble (`Asiento`/`AsientoLinea`). El «asiento» de
  `src/lib/settlement/asiento-libro.ts` es un **movimiento de caja**, no un asiento contable: no se renombra
  ahora; en pantallas se le dice «movimiento».
- **Documento de origen:** factura, cobro, pago, extracto, liquidación. Es lo que la gente carga.
- **Indicador de impuesto:** código corto que define tipo de impuesto, alícuota, base y rol de cuenta.
- **Cierre de mes operativo** (`src/lib/cierre-mes/cierre-mes.ts:18`) ≠ **cierre de período contable** (FC-03).

— Elaborado por GSG
