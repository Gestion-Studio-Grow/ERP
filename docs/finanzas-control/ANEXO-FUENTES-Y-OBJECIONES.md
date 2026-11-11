# Anexos del arco Finanzas y Control

> Acompaña a `METODO-SCOPE-ITEMS.md`, `CATALOGO-FINANZAS-CONTROL.md` y `PLAN-TANDAS.md`. Fecha: 11/11/2026.

## Anexo A · Fuentes públicas de SAP

**Cómo se leyeron:** la red de la sesión no resolvió `help.sap.com`, `learning.sap.com`, `community.sap.com`,
`me.sap.com` ni `userapps.support.sap.com`. Ninguna página se abrió entera. Cada dato salió del **extracto del
buscador** sobre la URL indicada ([E]) o es conocimiento general sin fuente abierta ([I]). Lo dudoso va como
[AV]. Antes de usar un código SAP en material comercial hay que releer con esos dominios habilitados
(`PLAN-TANDAS.md`, T0-5).

### A.1 Método

| # | Tema | Fuente | Marca |
|---|---|---|---|
| 1 | Qué trae un scope item (diagrama, guion de prueba con roles, prerrequisitos, datos maestros y pasos; rol = catálogos de negocio) | learning.sap.com/courses/exploring-sap-cloud-erp/navigating-the-sap-best-practice-solution-processes-via-sap-signavio-process-navigator · learning.sap.com/learning-journeys/implement-sap-s-4hana-cloud-public-edition-for-service/finding-the-required-business-roles-and-business-catalogs-for-a-solution-process_f5cdee81-2981-484c-b6d2-c60b43a424f4 | [E] |
| 2 | SAP Activate, seis fases y talleres de ajuste al estándar | learning.sap.com/courses/discovering-sap-activate-implementation-tools-and-methodology/describing-the-methodology-structure (el detalle por fase vino de blogs de terceros) | [E] |
| 3 | Alcance: sector, país y paquete antes de elegir scope items; lista de disponibilidad y dependencias | learning.sap.com/courses/implementing-sap-s-4hana-cloud-public-edition/defining-scope-and-localizations · nota pública 3556559 | [E] |
| 4 | Plan de cuentas modelo único (YCOA), no se recomienda modificarlo | blog de miembro en blogs.sap.com (23/04/2023) + nota pública | [E] |
| 5 | Cuentas de reconciliación de clientes y proveedores | nota pública 3651627 (existencia); la mecánica auxiliar → mayor | [E] / [I] |
| 6 | Reversa con el mismo tipo de documento desde CE2002 | nota pública (extracto); tratamiento en el diario: nota 2573628, no leída | [E] |
| 7 | Tipos de documento, claves de contabilización, diario universal con dimensiones, ledgers paralelos, monedas, variante de período | sin fuente abierta. Para confirmar: help.sap.com «General Ledger Accounting» de Public Edition | [I] |

### A.2 Scope items citados

| Código | Nombre según el extracto | Fuente | Marca |
|---|---|---|---|
| J58 | Accounting and Financial Close (incluye líneas del mayor, diario de auditoría, balance de sumas y saldos) | guion J58 publicado por un tercero (SlideShare) | [E] |
| J59 | Accounts Receivable | extracto de un flujo de proceso de SAP | [E] |
| J60 | Accounts Payable (incluye retención estándar y salida de cheques, con 1LQ) | notas públicas 3707972, 3786468, 3037953 | [E] |
| BFA | Basic Bank Account Management | descripción de proceso publicada por un tercero | [E] |
| BFB | Basic Cash Operations (procesa el extracto bancario) | flujo publicado por un tercero | [E] |
| 1EG | Bank Integration with File Interface | blog de SAP «R2R series blog 15» | [E] |
| 16R | Bank Integration with SAP Multi-Bank Connectivity | mismo blog | [E] |
| J78 | Advanced Cash Operations (licencia aparte) | nota pública (extracto) | [E] |
| BKJ | Sales Order Processing with Customer Down Payment | learning.sap.com (extracto) | [E] |
| 4E9 | Project Billing – Project-Based Services | community.sap.com/t5/enterprise-resource-planning-blog-posts-by-sap/project-billing-for-customer-projects-in-sap-s-4hana-cloud-public-edition/ba-p/13491626 | [E] |
| J11 | Customer Project Management | learning.sap.com/courses/exploring-fundamentals-of-sap-s-4hana-cloud-public-edition-professional-services/introducing-customer-project-management-for-professional-services | [E] |
| 1NT | Project Control – Finance | learning.sap.com/courses/implementing-project-control-in-sap-s-4hana-cloud-public-edition/ | [E] |
| J54 | Overhead Cost Accounting | flujo publicado por un tercero | [E] |
| J55 | Margin Analysis | blog.sap-press.com (tercero) | [E] |
| J62 | Asset Accounting | información de versión publicada por un tercero | [E] |
| 1QM | Advanced Credit Management | flujo publicado por un tercero | [E] |
| 1J2 | Advanced Compliance Reporting (nombre vigente sin confirmar; también aparece 5XU) | documento de instalación publicado por un tercero | [AV] |
| 1YB | Carga de datos de plan financiero (nombre oficial sin confirmar) | nota pública 3387377 | [AV] |
| 1W0, 2F3, 16T, 19M, BNA, 1M1, 4RC | **sin resultados**: no usar hasta confirmarlos | — | [AV] |

### A.3 Argentina

| Tema | Fuente | Marca |
|---|---|---|
| Versión local de Argentina en Public Edition: adopción temprana en 2302; disponibilidad general «planificada» para 2308 | community.sap.com/t5/enterprise-resource-planning-blog-posts-by-sap/sap-s-4hana-cloud-public-edition-2302-localization-identity-and-access/ba-p/13550835 | [E]; la disponibilidad general [AV] |
| Impuestos provinciales fuera del procedimiento estándar; se resuelven por extensión | nota pública 3615035 | [E] |
| Retención ampliada: tipos separados para factura y para pago, certificados numerados | notas públicas 3796564, 3621457 | [E] |
| Desde 2608 el contenido de retenciones lo mantiene el cliente | nota pública 3754940 | [E] |
| Reportes argentinos de retenciones y percepciones; libro IVA compras | notas públicas 3698934, 3775307, 3807513 | [E] |
| Guía de retenciones de Argentina | nota pública 2463545 | [E] |
| Factura electrónica argentina por medio de partners | páginas de partners en sap.com | [E] |
| Tablero de reportes legales (vencimiento, estados, envío manual) | blog de un tercero (pikon.com) y blog de miembro de la comunidad | [E] |
| Convenio Multilateral, regímenes provinciales de recaudación, libro IVA digital, letra y punto de venta en Public Edition | **sin fuente encontrada** | [AV] |
| Comisiones y rendición de gastos como productos aparte | sin fuente | [I] |

### A.4 Lo que este anexo no cubre

Las **normas argentinas** (ARCA, Comisión Arbitral, organismos provinciales, normas contables profesionales)
no se relevaron como fuente en esta pasada: el catálogo las trata como **parámetros provisionales** que confirma
el estudio del cliente. Relevarlas con fuente es tarea de T0 (un `gsg-investigador`, un impuesto por brief).

## Anexo B · Objeciones de los challengers

Dos revisiones adversariales (agente `challenger`, Opus esfuerzo alto) sobre el borrador del commit `958980a`.
**Estado:** INC = incorporada · PAR = incorporada en parte · ANOT = queda anotada, la decide el dueño o el estudio.

### B.1 Challenger de método, arquitectura y plan

| # | Gravedad | Objeción | Estado y qué se hizo |
|---|---|---|---|
| M1 | ALTA | «El código tolera la migración ausente» no aguanta **columnas nuevas** en modelos en uso (Prisma pide todas las columnas: error en pantallas que hoy andan). La sonda cubre sólo 4 tablas. Y un push a `main` con `MIGRATE_DATABASE_URL` aplica solo | **INC.** Sólo tablas nuevas (tabla lateral en vez de columna), una sonda por migración, rama del arco en vez de `main`. Método §5.9 y Plan, reglas comunes |
| M2 | ALTA | Según la regla del método MIA sería `lite`, y el plan le construye todo lo `enterprise`: desarrollo a medida con nombre de estándar | **PAR.** El perfil se decide **por scope item** y se cierra en T0-7. Propuesta: `enterprise` donde MIA cumple el criterio (agente de retención, dos monedas, control por proyecto) y `lite` en contabilidad general y presupuesto de empresa. La objeción de fondo (¿quién más lo va a usar?) queda **ANOT** para el dueño |
| M3 | ALTA | `enterprise ⊇ lite` no se sostiene para el libro: con el interruptor apagado, subir obliga a contabilizar historia o a un asiento de apertura | **INC.** El motor corre siempre, en sombra; `lite` no muestra el libro. Para historia previa al motor se dice «apertura al corte», no «encender». Método §4 |
| M4 | ALTA | `Asiento` no tiene único por origen; uno simple choca con el contraasiento; la numeración correlativa es punto de contención | **INC.** Tabla de clave `(tenantId, origenTipo, origenId, evento)`, numeración con bloqueo y test de concurrencia. Plan T2a |
| M5 | ALTA | Diez tandas sin venta registrada: se invierte antes de vender. Mínimo vendible: cobrar + pagar + bancos + rentabilidad por productor, con el motor en sombra | **INC.** Plan, «Etapas»: etapa 1 mínima y etapa 2 con venta firmada; T0-7 exige la venta o la decisión expresa del dueño |
| M6 | MEDIA | T2 ‖ T3 chocan en `schema.prisma` y en lógica; el diagrama ponía bancos sin el motor | **INC.** Schema en serie, orden en fila, timestamps reservados |
| M7 | MEDIA | T2 y T5 demasiado grandes | **INC.** T2a/T2b y T5-A/T5-B en serie; T10-A/T10-B |
| M8 | MEDIA | I2 compara `Float` con centavos: sumar y redondear después deriva | **INC.** Redondeo por documento y la misma regla para I2. Plan T2a |
| M9 | MEDIA | Criterios no comprobables («lo da por bueno», «explicado al 100 %») | **INC.** Diferencia de 0 centavos o diferencias clasificadas; acta con fecha y firma |
| M10 | ALTA | La rama de Neon copia todos los negocios; los montos reales terminan en el contexto de los agentes; no hay consentimiento de datos (Ley 25.326); compite con la rotación de respaldos | **INC** en el plan (anonimizar otros tenants, corrida por script sin importes, borrar al cerrar, consentimiento en T0-8). El consentimiento en sí es del dueño: **ANOT** |
| M11 | ALTA | Falta la salida: saldos de apertura y partidas abiertas, corte, paralelo, reversa en masa, capacitación, soporte, salida de datos | **INC.** Tanda TS y Método §4 |

### B.2 Challenger contable y fiscal argentino

Lo fiscal es en su mayoría **inferido** por el challenger; las normas que cita no se abrieron en esta sesión.
Todo se confirma con el estudio antes de construir.

| # | Gravedad | Objeción | Estado y qué se hizo |
|---|---|---|---|
| F1 | ALTA | A4 ataba el ingreso a «Finalizado» (cobrado entero): viola el devengado. A3 acreditaba ventas antes del evento | **INC.** El ingreso se reconoce con el evento hecho; A3 va a anticipos si el evento no ocurrió. Catálogo §1.3 |
| F2 | ALTA | El IVA del anticipo no es pregunta abierta (Ley de IVA, art. 5 inc. b); las bases de IVA e IIBB salen de los comprobantes, no de la cuenta de ventas | **INC.** «Tres relojes» en §1.3; FC-09 y FC-10 desde facturación |
| F3 | ALTA | Un solo saldo a favor de IVA: hay que separar técnico y de libre disponibilidad. Presentación vigente «IVA Simple» (RG 5705/2025) | **INC** la separación (A11, FC-10). El formato vigente queda **ANOT** a confirmar |
| F4 | ALTA | A8 mezclaba factura en USD cobrada en USD (diferencia financiera, sin IVA) con cobrada en pesos (nota de débito o crédito con IVA e IIBB) | **INC.** A8 y A8b |
| F5 | ALTA | Falta la Factura de Crédito Electrónica MiPyME (Ley 27.440) | **INC** como brecha de FC-04; si aplica a MIA: **ANOT** |
| F6 | ALTA | Responde el agente (el cliente), solidariamente; no depositar es delito. El brief dice que retiene el estudio y el catálogo decía que el ERP calcula y certifica. Archivos: IVA por SIRE (RG 5921/2026), Ganancias por SICORE | **INC.** Modo propuesta con aprobación del estudio, tablas firmadas, límite contractual, no venderlo como cálculo. FC-08 y §3.6. Régimen por impuesto: **ANOT** |
| F7 | MEDIA | Monotributistas, no inscriptos, factura M; designación de MIA como agente de IVA | **INC** el padrón con condición fiscal (FC-05); la designación: **ANOT** |
| F8 | MEDIA | Roles de IIBB sin jurisdicción; recaudación bancaria; saldo a favor por jurisdicción; padrones; evento en otra provincia; cliente del exterior | **INC.** A12, FC-09, FC-04 |
| F9 | MEDIA | Falta el impuesto a los débitos y créditos (parte computable, parte gasto) y los roles de Ganancias | **INC.** A13 y roles nuevos |
| F10 | MEDIA | Si los productores son empleados, la comisión es sueldo; falta el asiento de sueldos | **PAR.** A14 como asiento resumen; la naturaleza de la comisión: **ANOT** para el cliente y el estudio |
| F11 | MEDIA | Notas de crédito por cancelación o postergación; seña retenida como penalidad | **INC.** FC-04 y eventualidad E1 |
| F12 | MEDIA | El estudio lleva los libros en su sistema: el ERP sería contabilidad paralela; con ajuste por inflación el margen no coincide con el balance | **INC.** El libro del ERP es de gestión e histórico; la salida principal son comprobantes importables. FC-12 y FC-13. Refuerza dejar FC-03 en `lite` para MIA |
| F13 | BAJA | Falta un indicador de bien de uso | **INC.** FC-07 |

Fuentes que citó el challenger (no abiertas en esta sesión): ARCA, novedad sobre RG 5705/2025
(`servicioscf.afip.gob.ar/publico/sitio/contenido/novedad/ver.aspx?id=4889`); texto de la Ley 23.349
(`argentina.gob.ar/normativa/nacional/norma-271/actualizacion`); notas de terceros sobre IVA Simple y sobre SIRE.

### B.3 Lo que los challengers dejan abierto para el dueño

1. ¿Se invierte en la etapa 1 antes de la venta firmada? (M5)
2. ¿Qué scope items de este arco tienen un segundo cliente probable? Si la respuesta es «ninguno» para
   retenciones practicadas o Convenio Multilateral, pasan a proyecto del cliente y no al catálogo. (M2)
3. ¿El ERP lleva un libro propio para MIA o sólo operación y salidas al estudio? (F12)
4. ¿GSG acepta el riesgo de proponer retenciones, aun en modo propuesta? (F6)
