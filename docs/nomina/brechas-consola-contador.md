# Brechas de la consola del contador para un servicio contable completo

Fecha: 2026-11-06 · Rol: contador público (ARCA / IIBB / LCT) · Alcance: sólo análisis, sin cambios de código.

**Base:** el mapa de lo existente que dio el dueño. Hoy la consola cubre facturación, recibidos, libro IVA ventas, monitor de monotributo, cierre del mes, extractos que proponen facturas y retenciones con listado SIRCREB. Lo que falta son las **obligaciones recurrentes del cliente RI/PyME** y la **contabilidad**.

## Tabla priorizada (top 12)

Escalas: **valor** = A (alto) / M (medio) / B (bajo). **Esfuerzo**: S ≤1 sem, M 2–4 sem, L 1–2 meses, XL >2 meses. **Orden** = secuencia recomendada desde el punto de vista contable. La nómina ya fue elegida por el dueño y se indica aparte.

| # | Brecha | Valor y por qué | Esfuerzo | Dependencias | Orden |
|---|---|---|---|---|---|
| 1 | **Calendario de vencimientos por CUIT** (IVA, IIBB, SICOSS/F.931, autónomos/monotributo, Ganancias/BP anticipos, CM05), con semáforo por cliente | **A**: es mensual y toca a toda la cartera. Evita intereses resarcitorios y multas formales (art. 38 Ley 11.683). Es la base de todo lo demás y el estudio lo percibe como «control». | S–M | Terminación de CUIT. Tabla anual de vencimientos ARCA y de cada jurisdicción IIBB (hay que cargarla cada año). Régimen y jurisdicciones por cliente. Reusa «mes del estudio». | 1 |
| 2 | **Libro IVA Compras + Libro IVA Digital completo** (ventas y compras, alícuotas, archivo de importación ARCA) | **A**: mensual y obligatorio para todo RI. El estudio hoy lo arma afuera con un CSV. Ya existe el 70 % (recibidos y libro ventas). | M | Recibidos con desglose por alícuota, tipo de comprobante y CUIT válido. Libro ventas existente (`src/lib/libros/libro-iva.ts`). Formato ARCA vigente. | 2 |
| 3 | **Papel de trabajo de liquidación de IVA (F.2002)**: débito, crédito, retenciones y percepciones sufridas, saldo técnico y de libre disponibilidad, prorrateo | **A**: mensual por cada RI y muy cobrable dentro del abono. Evita errores en saldos arrastrados, que en ARCA son difíciles de rectificar. | M | #2. Retenciones y percepciones sufridas (existe el listado). Saldos del período anterior: guardar por período. | 3 |
| 4 | **IIBB**: régimen local (ARBA/AGIP) y Convenio Multilateral (CM03 mensual, CM05 anual con coeficientes). SIRCREB y percepciones como pago a cuenta | **A**: mensual. Los créditos SIRCREB sin computar son plata del cliente. Los coeficientes de CM mal calculados generan ajustes entre jurisdicciones. | L | #1. Ventas por jurisdicción (domicilio de entrega o prestación). Gastos por jurisdicción para CM05. Alícuotas por actividad (NAES). Padrones. Listado SIRCREB existente. | 4 |
| 5 | **Nómina: Libro de Sueldos Digital + F.931/SICOSS**, recibos, SAC, vacaciones, liquidación final (LCT) | **A**: mensual, se cobra por empleado y fideliza mucho. Evita multas por registración deficiente (leyes 24.013 y 25.323) y ajustes de la seguridad social. **Elegida por el dueño como primera pieza grande.** Desde lo contable conviene que vaya después de #1–#3, porque estos son baratos y reusan lo que ya existe. La nómina no reusa casi nada. | XL | Legajos. CCT y escalas, que cambian con cada paritaria. ART y obra social. Conceptos del LSD con su parametrización en ARCA. Calendario (#1) para el F.931. | 5 (elegida 1.ª) |
| 6 | **Gestión de documentación del cliente** (checklist mensual de lo que falta, pedido y recepción, vencimiento de pedido) | **A/M**: es mensual y es el principal cuello de botella del estudio. No evita multas por sí sola, pero hace que lleguen a tiempo #2–#5. | M | #1. Storage de archivos. Notificaciones al cliente. | 6 |
| 7 | **Conciliación bancaria contable** (extracto contra cobros, pagos y comprobantes, con partidas pendientes) | **M**: es mensual. Detecta ventas no facturadas y gastos sin respaldo, con riesgo de presunción por depósitos bancarios. Hoy el extracto sólo propone facturas. | M | Importación de extractos existente. Registro de cobros y pagos. Opcional: #9 para generar el asiento. | 7 |
| 8 | **Papeles de trabajo y evidencia de presentación** (por obligación y período: borrador, revisado, presentado, acuse/VEP adjunto) | **M**: sirve de defensa del estudio ante reclamos (responsabilidad profesional) y para trabajar en equipo. Es poco visible para el cliente. | S–M | #1. Paquete de cierre (`src/lib/cierre-mes`). | 8 |
| 9 | **Contabilidad**: plan de cuentas, asientos automáticos desde comprobantes, mayor, sumas y saldos, balance | **A** para SRL/SA/SAS, que están obligadas a llevar libros y presentar EECC. **B** para monotributo. El valor está en el cierre anual, que es caro y cobrable aparte. | XL | #2, #7, nómina (#5) para los asientos de sueldos. Decisión de alcance: hacerla propia o exportar a un sistema externo. | 9 |
| 10 | **Ganancias 4.ª categoría de empleados** (SIRADIG, F.1357, retenciones SICORE) | **M**: mensual pero sólo para sueldos altos. Una mala retención compromete al empleador como agente. | L | #5 nómina. Escalas y deducciones vigentes (se actualizan en el año). | 10 |
| 11 | **Ganancias y Bienes Personales de personas humanas y sociedades** (DDJJ anuales, anticipos) | **M**: estacional (mayo/junio), cobrable como honorario extra y con alto ticket. Los anticipos entran en el calendario. | L | #1, #9 (para sociedades), patrimonio del cliente, cotizaciones al 31/12. | 11 |
| 12 | **Monotributo ampliado**: control de topes y parámetros de exclusión (precio unitario, superficie, energía), alerta de paso a RI, VEP/estado de deuda | **M/B**: el monitor ya cubre categoría y recategorización. Esto agrega la exclusión de pleno derecho, que es un riesgo caro para el cliente porque vuelve retroactivamente al régimen general. | S | Monitor existente. Datos físicos del cliente. Topes vigentes. | 12 |

### Orden recomendado (lectura rápida)

1. **Quick wins que reusan lo existente** (≈6–8 semanas): #1 calendario → #2 Libro IVA Digital → #3 liquidación IVA. Con esto la consola cubre el ciclo mensual completo de un RI.
2. **Nómina (#5)**, decidida por el dueño. Se puede arrancar en paralelo, pero conviene tener #1 antes para que el F.931 tenga vencimiento y semáforo.
3. **IIBB (#4)** y **documentación (#6)**.
4. **Conciliación (#7) y papeles (#8)**, después **contabilidad (#9)**, que habilita EECC y sociedades.
5. **Anuales y derivados**: #10 (depende de nómina), #11 y #12.

## Riesgos normativos

- **Formatos ARCA cambiantes**: el Libro IVA Digital, el LSD y el F.931/SICOSS cambian diseños de registro y conceptos por RG con poco preaviso. Cada uno necesita versionado del formato y un responsable de seguimiento.
- **Nómina y LCT**: escalas por CCT y paritarias, sumas no remunerativas, topes de base imponible y cambios por la reforma laboral en curso. Un error se traslada a todos los empleados del cliente y genera diferencias de aportes, multas (leyes 24.013 y 25.323) y reclamos laborales.
- **IIBB y Convenio Multilateral**: cada jurisdicción tiene sus alícuotas, padrones, regímenes de percepción y retención y su calendario. El CM05 y los coeficientes tienen reglas propias (art. 2 y regímenes especiales). Conviene empezar por ARBA, AGIP y CM, y no prometer las 24 jurisdicciones.
- **Responsabilidad profesional**: la consola debe **proponer y documentar**. La presentación con clave fiscal y la firma son del contador. Hay que dejar trazabilidad de quién revisó y presentó, para no trasladar al software (ni al dueño del ERP) una responsabilidad que es del matriculado.
- **Parámetros anuales y datos personales**: topes de monotributo, escalas de Ganancias y Bienes Personales y tablas de vencimientos cambian una o dos veces por año (o más con inflación) y hay que cargarlos a tiempo. Además, la nómina y la documentación manejan datos sensibles (Ley 25.326), lo que exige control de acceso por cliente.
