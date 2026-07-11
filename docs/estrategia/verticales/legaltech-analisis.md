> **Procedencia:** recuperado del bundle `_recuperacion_inbox_20260710` (2026-07-10), documento fundacional del dueño. Incorporado sin alterar el contenido original.

---

# GSG Labs — Vertical Legaltech: análisis de oportunidad

**Documento decision-grade** · Preparado para: dueño de GSG · Fecha: 10 de julio de 2026
**Contexto:** un abogado en ejercicio (potencial primer cliente / design partner) usa localmente una app llamada **Judico** para su estudio. El objetivo es entender Judico, evaluar si GSG puede ofrecer algo mejor apalancado en IA/automatización nativa, y definir cómo empaquetarlo para consolidar el producto con ese abogado.

**Nota metodológica.** Las afirmaciones sobre productos provienen de sitios oficiales y prensa sectorial (ver *Fuentes*). Donde no hay dato público verificable, se marca **[SUPUESTO]** y se indica cómo validarlo. Precios en pesos argentinos (ARS) salvo aclaración.

---

## 0. Titular estratégico (leer primero)

El supuesto implícito del encargo —"ofrecer algo *más*, con IA nativa, frente a Judico"— necesita una corrección de base: **Judico ya es un producto IA-nativo, moderno y bien construido.** No es un incumbente viejo al que se le gana con "ponerle IA". Tiene tres asistentes de IA, sincronización con portales judiciales (PJN, MEV, EJE), cálculo de plazos con feriados por provincia, multi-tenancy y precios de mercado. Además, el otro gran player cloud, **MetaJurídico** (~1.400 estudios), también incorporó IA y hasta integración MCP con Claude/ChatGPT.

Conclusión honesta: **la "IA nativa" ya no es un diferencial; es la mesa de entrada.** Si GSG entra, debe hacerlo con una cuña más filosa que "IA mejor". La cuña más defendible hoy es **la obligación de facturación electrónica de honorarios de ARCA (RG 5824/2026), vigente desde el 1 de julio de 2026**, un dolor regulatorio urgente donde Judico se ve débil (ofrece "calculadora de honorarios", no emisión de comprobante con CAE) y donde **GSG ya tiene motor de facturación ARCA**. Ese es el ángulo de reutilización real de la plataforma.

Recomendación adelantada: **entrar sí, pero como vertical sobre la plataforma GSG, nicho-primero (una jurisdicción + un fuero), liderando con cumplimiento ARCA + plazos, y con el abogado como design partner.** No como un "Judico killer" horizontal.

---

## 1. Qué es Judico

**Qué es.** Judico (judico.com.ar) es un sistema SaaS de gestión jurídica con IA para estudios argentinos, "diseñado por abogados, para abogados". Es un producto reciente (© 2025 en su sitio), en la nube, responsive, con arquitectura multi-tenant.

**A quién apunta.** Segmenta explícitamente por tamaño de estudio, desde el abogado independiente hasta grandes estudios:

- **Profesional** — abogado independiente.
- **Profesional + IA** — abogado individual que quiere IA avanzada.
- **Estudio** — estudios con equipo (hasta 10 usuarios).
- **Empresa** — grandes estudios / asesorías (usuarios ilimitados, SLA, gestor de cuenta).

**Funcionalidades.**

- **Gestión de expedientes:** vista lista y tablero por estado (activos, urgentes, para sentencia, etc.), filtros y búsqueda.
- **CRM de clientes:** personas físicas y jurídicas, historial de casos.
- **Control de plazos:** cálculo automático con feriados y alertas previas al vencimiento, adaptado por jurisdicción.
- **Calendario unificado:** plazos, audiencias y tareas en una vista.
- **Finanzas y honorarios:** facturación, gastos y **calculadora de honorarios según ley provincial** (ver debilidad en 1.d).
- **Gestión documental:** almacenamiento organizado por expediente y categoría.
- **Gestión de equipo:** roles y permisos, actividad en tiempo real.
- **Sincronización con portales judiciales:** 2 veces por día con **PJN** (Poder Judicial de la Nación), **MEV** (Buenos Aires) y **EJE** (CABA); timeline visual de actuaciones; **detección de plazos con IA** y clasificación de urgencia; importación de partes.
- **Migración asistida:** importación desde Excel/CSV con mapeo automático por IA.
- **Tres asistentes de IA (diferencial central de Judico):**
  - **Judico Lex** — consultas legales con citas a artículos concretos (Código Civil, Procesal, Laboral, legislación provincial).
  - **Judico Docs** — genera demandas, contestaciones, recursos y contratos usando datos del expediente; exporta a Word/PDF.
  - **Judico Estratega** — analiza el escrito de la contraparte (argumentos, debilidades), sugiere estrategias, busca jurisprudencia y da un *scoring* de probabilidad de éxito.

**Cobertura jurisdiccional.** Activas: Santa Fe, Córdoba, Buenos Aires (provincia), CABA, Chubut, Entre Ríos y Salta. Próximamente: Mendoza y Tucumán. Ofrece desarrollo a medida para otras jurisdicciones.

**Modelo de precio (mensual, sin contrato anual, cancela cuando quiera, 14 días gratis sin tarjeta):**

| Plan | Precio | Incluye (resumen) |
|---|---|---|
| Profesional | $29.990/mes | Hasta 50 expedientes, Judico Docs, plazos, calendario, clientes, 5 GB |
| Profesional + IA | $49.990/mes | Expedientes ilimitados, Judico Lex + Docs + Estratega, sync PJN+MEV+EJE, 1 usuario |
| Estudio | $89.990/mes | Todo lo anterior + finanzas/honorarios, hasta 10 usuarios, roles, 100 GB, soporte prioritario (conexión de portal extra: $19.990/mes) |
| Empresa | Personalizado | Usuarios ilimitados, onboarding, SLA, gestor dedicado |

**Fortalezas.**

1. IA nativa real y bien empaquetada (tres asistentes con propósito claro), no un chatbot pegado encima.
2. Sincronización con los tres portales de mayor volumen (PJN, MEV, EJE) con detección de plazos por IA.
3. UX moderna, cloud, responsive, multi-tenant, onboarding con migración asistida por IA.
4. Precio y empaquetado claros, autoservicio, sin fricción de venta.
5. Cálculo de plazos con feriados configurado por provincia (barrera de dominio ya resuelta en 7 jurisdicciones).

**Debilidades / puntos débiles (mezcla de hechos y supuestos a validar).**

- **(a) Facturación de honorarios débil frente a la obligación ARCA 2026.** El sitio menciona "calculadora de honorarios según ley provincial", pero **no menciona emisión de comprobante electrónico con CAE vía Web Services de ARCA**. Justo cuando la RG 5824/2026 volvió obligatoria la facturación electrónica de honorarios judiciales (1/7/2026). **[SUPUESTO: Judico no emite factura electrónica homologada]** — validar creando cuenta de prueba o preguntando al abogado.
- **(b) Producto joven, sin base instalada probada.** © 2025; no se hallaron reseñas de usuarios en Capterra/Trustpilot ni casos públicos. Riesgo de madurez, soporte y continuidad. **[SUPUESTO]** — validar con el abogado (¿hace cuánto lo usa? ¿problemas?).
- **(c) Sin portal del cliente evidente.** No aparece un portal donde el cliente vea el estado de su causa (sí lo tiene Clio, por ejemplo).
- **(d) Riesgo de alucinación en IA legal.** "Scoring de probabilidad de éxito" y citas automáticas son atractivos pero delicados; sin trazabilidad/verificación fuerte, generan riesgo profesional. Punto sensible para un abogado.
- **(e) Cobertura provincial parcial.** 7 provincias; si el abogado opera en una no cubierta (p. ej. Mendoza/Tucumán aún no activas), la propuesta pierde valor.
- **(f) Dependencia de sincronización 2×/día.** Para plazos críticos, dos sincronizaciones diarias pueden ser insuficientes en momentos sensibles. **[SUPUESTO menor]**

> **Acción de validación clave:** la mayor parte de las "debilidades" son hipótesis. El design partner es la mejor fuente: una entrevista de 45 minutos sobre qué usa, qué le falta y qué lo frustra de Judico convierte estos supuestos en hechos y define la cuña real.

---

## 2. Mercado legaltech en Argentina y la región

**Foto del mercado.** El mercado legaltech regional crece ~11% anual, y en Argentina **cerca del 69% de los abogados todavía gestiona con escritorio, planillas de Excel o papel** — un margen de digitalización enorme. Predominan estudios pequeños y profesionales individuales, con sensibilidad al precio y baja tolerancia a la fricción. La estructura judicial está fragmentada: PJN como repositorio central más sistemas provinciales heterogéneos. El PJN lanzó su propio asistente con IA en febrero de 2025, señal de que la IA jurídica ya es "mainstream" institucional.

**Players principales.**

| Producto | Qué es / cubre | Arquitectura | IA | Facturación ARCA | Nota |
|---|---|---|---|---|---|
| **Lex-Doctor** | El histórico (36+ años), mayor base instalada. Expedientes, escritos, cédulas/oficios, facturación electrónica AFIP | Escritorio | No | Sí (validada AFIP) | Licencia perpetua (sin abono). Se lo critica por caro, UI anticuada y limitaciones funcionales/gráficas |
| **MetaJurídico** | ~1.400 estudios. ERP jurídico: expedientes, procuración con IA, calculadoras, facturación. **La integración judicial más amplia: PJN, MEV, EJE, IOL, IURIX** | Cloud (parte escritorio) | Sí (asistente + MCP con Claude/ChatGPT) | Sí | Desde ~$11.999/mes. El competidor cloud más consolidado |
| **Judico** | Gestión con IA nativa (ver §1) | Cloud | Sí (3 asistentes) | Parcial [SUPUESTO] | Producto 2025, moderno |
| **Clio** | Líder global (400k+ abogados). Gestión integral, portal del cliente, trust accounting, reglas de plazos | Cloud | Sí (Clio Duo / Clio Work) | **No localizado a AR** | Desde USD 49/usuario/mes. Sin PJN/MEV, sin honorarios provinciales ni ARCA |
| **IURIX** | Sistema de gestión **del Poder Judicial** (Catamarca, San Luis, etc.), no producto de estudio. IURIX Mind = IA para jueces | — | Sí (institucional) | — | Es una **fuente de datos a integrar**, no un competidor directo |
| **Otros AR** | RivoLegal, Veredicta, IUSNET, SEJ, Estudio360, Jurix, LegalRun, UbuntuLaw, Legalify | Mayormente cloud | Variable | Variable | Mercado poblado; muchos con IA incipiente |

**Dónde está el hueco (oportunidades reales).**

1. **Cumplimiento ARCA de honorarios como funcionalidad de primera clase.** La RG 5824/2026 (obligatoria desde 1/7/2026) volvió el tema urgente y transversal. Lex-Doctor factura pero es escritorio; Judico parece débil aquí **[SUPUESTO]**; Clio no aplica. **GSG ya tiene el motor ARCA** → ventaja de reutilización directa.
2. **Portal del cliente / transparencia.** Poco explotado localmente (Clio lo tiene, pero no está localizado). El cliente que ve el estado de su causa reduce llamados y mejora retención del estudio.
3. **Automatización agéntica de extremo a extremo**, no solo "asistentes que responden": tareas que se ejecutan solas (armar planilla de honorarios, generar y agendar el escrito, disparar la factura al cobrar). El resto ofrece copilotos; casi nadie ofrece automatización de flujo completo con control humano.
4. **Nichos jurisdiccionales/prácticas desatendidas.** Provincias fuera del top (o fueros específicos: laboral, sucesorio, daños) donde los grandes aún no configuraron plazos/normativa.
5. **Confianza y trazabilidad de la IA legal** (anti-alucinación): salida siempre citada, verificable y auditable. Diferencial de *confianza*, no de features.

---

## 3. Qué "más" puede ofrecer GSG (IA / automatización nativa)

Regla de lectura: como Judico y MetaJurídico ya tienen IA, **una capacidad solo es diferencial si (i) ellos la hacen mal/no la hacen, y (ii) GSG puede hacerla claramente mejor apalancando activos propios (motor ARCA, automatización, config-sobre-código).** A continuación, priorización valor/esfuerzo.

**Leyenda:** Valor = impacto en el dolor del abogado · Esfuerzo = costo de construir dado el stack GSG · ⭐ = diferencial real vs. incumbentes hoy.

| Capacidad | Valor | Esfuerzo | ¿Diferencial? | Comentario |
|---|---|---|---|---|
| **Facturación de honorarios con ARCA (CAE por Web Services)** | Muy alto | **Bajo** (reutiliza motor GSG) | ⭐⭐ Sí | Dolor regulatorio urgente + activo propio. **Mejor apuesta de entrada.** |
| **Cálculo y alerta automática de plazos procesales** | Muy alto | Medio-alto (dominio por jurisdicción) | Paridad | Imprescindible ("higiene"), no diferencial: Judico ya lo tiene. Hay que igualarlo en la jurisdicción del design partner. |
| **Redacción asistida de escritos/contratos** | Alto | Medio (LLM + plantillas) | Paridad | Judico Docs ya lo hace. Diferenciar por **trazabilidad y plantillas propias del estudio**, no por "generar texto". |
| **Portal del cliente** | Alto | Bajo-medio (reutiliza multi-tenant/auth GSG) | ⭐ Sí | Poco presente localmente; alta reutilización de plataforma. |
| **Automatización de tareas repetitivas (agéntica, extremo a extremo)** | Alto | Medio-alto | ⭐ Sí | "Hacer", no solo "sugerir": encadenar plazo→escrito→agenda→factura. Diferencial si se ejecuta con control humano. |
| **Resumen y análisis de expedientes** | Medio-alto | Medio | Paridad | Judico Estratega ya apunta acá. |
| **Búsqueda de jurisprudencia** | Medio | Alto (datos, licencias, calidad) | No (por ahora) | Costoso y comoditizándose; no entrar en el MVP. |
| **Scoring de probabilidad de éxito** | Medio | Alto | No recomendado | Alto riesgo profesional/reputacional; evitar en v1. |

**Síntesis de la sección.** Los diferenciales *reales* de GSG no están en "más IA", sino en **(1) facturación ARCA de honorarios bien resuelta, (2) portal del cliente, y (3) automatización agéntica de extremo a extremo** — las tres, casualmente, apalancan activos que GSG ya tiene (motor ARCA, multi-tenant, orientación a automatización). Plazos y redacción se necesitan para competir, pero son paridad, no ventaja.

---

## 4. ¿Encaja en la plataforma GSG o conviene producto aparte?

**Recomendación honesta: construirlo como un *vertical sobre la plataforma GSG*, no como producto separado — pero sin ilusiones sobre cuánto se reutiliza.**

**Qué se reutiliza bien (la infraestructura horizontal, ~30–40% del producto):**

- Motor multi-tenant y aislamiento de datos (Judico lo tiene; es tabla de entrada, y GSG ya lo resolvió).
- **Facturación ARCA** — el activo más valioso y directamente reutilizable; coincide con la cuña de mercado (§2/§3).
- Autenticación, roles y permisos, almacenamiento documental.
- Filosofía **config-sobre-código**, ideal para la heterogeneidad jurisdiccional (cada provincia = configuración, no un fork de código).

**Qué es dominio nuevo y NO se reutiliza (el 60% duro):**

- **Motor de plazos procesales** por jurisdicción (feriados judiciales, cómputos, tipos de plazo). Es la barrera de dominio central y hay que construirla; Judico ya invirtió en 7 provincias.
- **Conectores a portales judiciales** (PJN, MEV, EJE…): scraping/integración frágil y de mantenimiento continuo.
- **IA legal** con datos y prompts específicos, plantillas de escritos y control anti-alucinación.

**Por qué vertical-sobre-plataforma y no producto aislado:** aislar el producto duplicaría facturación, tenancy y auth sin beneficio, y perdería el activo ARCA justo donde está la cuña. Pero es intelectualmente honesto reconocer que **el legal es un dominio profundo**: la mayor parte del esfuerzo (plazos, portales, IA legal) es específico y no beneficia a otros verticales de GSG. Por eso conviene un **módulo de dominio bien encapsulado** que consuma los servicios compartidos (billing/ARCA, tenancy, auth, storage) por contrato claro, sin contaminar el núcleo con lógica jurídica.

**Regla de decisión:** si el motor de plazos + conectores judiciales pueden vivir como *plugins de configuración/servicios* sobre el núcleo GSG (coherente con config-sobre-código), es vertical. Si obligan a bifurcar el núcleo, replantear. **[SUPUESTO técnico a confirmar con el equipo]**: los conectores judiciales entran como servicios/plugins sin tocar el core.

---

## 5. Cómo empaquetarlo para el abogado (design partner / primer cliente)

**Filosofía.** No competir de frente con Judico feature-por-feature. Resolver **un dolor real, hoy**, en **la jurisdicción y el fuero del abogado**, con GSG operando como socio que construye *con* él. El design partner aporta la validación de dominio que ahorra meses.

**MVP mínimo (lo que le resuelve algo ya):**

1. **Expedientes** — alta, tablero por estado, búsqueda, gestión documental por causa. (Higiene; sin esto no hay producto.)
2. **Plazos procesales de su jurisdicción/fuero** — cálculo con feriados y alertas. Configurar **solo su provincia y fuero primero** (config-sobre-código), no las 24 jurisdicciones.
3. **Asistente de redacción con trazabilidad** — generar borradores de sus escritos más frecuentes a partir del expediente, con las **plantillas propias del estudio** y salida siempre citada/verificable.
4. **Cuña diferencial — Honorarios + factura electrónica ARCA (CAE)** — calcular honorarios según arancel provincial **y emitir el comprobante electrónico homologado** (RG 5824/2026). Aquí GSG gana donde Judico parece flojo, reutilizando su motor ARCA.

*(Fuera del MVP, en backlog: portal del cliente, automatización agéntica extremo a extremo, sincronización con portal judicial, jurisprudencia.)*

**Por qué este recorte.** Cubre el trípode que pidió el encargo (plazos + expedientes + redacción) y le agrega la **cuña de cumplimiento ARCA** que es urgente, defendible y barata de construir para GSG. Es un MVP que un abogado puede usar en su día a día en semanas, no meses.

**Plan de primeros pasos (secuencia sugerida):**

1. **Semana 0 — Entrevista de descubrimiento (45–60 min).** Ver Judico en vivo con el abogado; mapear sus 3 dolores principales, sus 5 escritos más frecuentes, su jurisdicción/fuero y cómo factura hoy sus honorarios. Convierte los **[SUPUESTO]** de §1 en hechos.
2. **Semana 1 — Acuerdo de design partner.** Alcance, expectativas, cadencia (demo quincenal), condición preferencial de precio a cambio de feedback y, si acepta, testimonio/caso. Definir criterios de "éxito del MVP".
3. **Semanas 2–4 — Fundaciones sobre plataforma GSG.** Instanciar tenancy/auth/roles y **conectar el motor ARCA**; modelar expedientes y documentos.
4. **Semanas 4–7 — Módulos de dominio.** Motor de plazos de *su* jurisdicción + asistente de redacción con *sus* plantillas.
5. **Semana 7 — Honorarios + factura ARCA (la cuña).** Cálculo por arancel + emisión de CAE; probar con un caso real suyo.
6. **Semanas 8–10 — Piloto en producción.** El abogado usa el MVP en causas reales; iteración semanal; medir horas ahorradas y comprobantes emitidos sin fricción.
7. **Punto de decisión.** Si el piloto muestra valor claro (adopción diaria + dolor resuelto), se planifica expansión (segunda jurisdicción, portal del cliente, automatización agéntica). Si no, se pivota o se archiva con costo acotado. **Gate honesto: es un mercado competitivo, no un greenfield.**

**Riesgos a vigilar.** (1) Incumbentes maduros (Judico, MetaJurídico, Lex-Doctor) con IA e integración judicial ya en producción. (2) Mantenimiento continuo de conectores judiciales. (3) Responsabilidad profesional por errores de IA → trazabilidad obligatoria. (4) Riesgo de "muestra de uno": no sobreajustar el producto a un solo abogado; validar que su dolor es representativo antes de escalar.

---

## Resumen ejecutivo

1. **Judico no es un blanco fácil:** es un SaaS 2025 IA-nativo, bien construido, con tres asistentes de IA, sincronización con PJN/MEV/EJE, plazos por provincia y precios claros ($29.990–$89.990/mes).
2. Por eso, **"ofrecer más IA" ya no es diferencial**: MetaJurídico (~1.400 estudios) y el propio Judico ya tienen IA; la IA nativa es la mesa de entrada, no la ventaja.
3. **El mercado sí tiene espacio:** ~69% de los abogados aún usa Excel/papel y el sector crece ~11% anual; el problema no es la falta de demanda sino la fuerte competencia por el segmento digitalizado.
4. **La cuña más defendible es regulatoria:** la obligación de facturación electrónica de honorarios de ARCA (RG 5824/2026, vigente desde el 1/7/2026), donde Judico parece débil **[SUPUESTO a validar]** y donde **GSG ya tiene motor ARCA**.
5. **Diferenciales reales de GSG** (no "más IA"): facturación ARCA de honorarios de primera clase, portal del cliente y automatización agéntica de extremo a extremo — las tres apalancan activos existentes de la plataforma.
6. **Plazos y redacción asistida son paridad**, no ventaja: hay que igualarlos en la jurisdicción del abogado para poder competir.
7. **Encaje de plataforma:** construir como **vertical sobre GSG**, reutilizando infraestructura (~30–40%: tenancy, ARCA, auth, config-sobre-código), asumiendo con honestidad que el dominio legal (plazos, conectores judiciales, IA legal) es ~60% de trabajo nuevo y específico.
8. **No producto aislado:** aislarlo duplicaría infraestructura y perdería el activo ARCA; encapsular el dominio legal como módulo sobre servicios compartidos.
9. **MVP recomendado:** expedientes + plazos de *su* jurisdicción + asistente de redacción con *sus* plantillas + **honorarios/factura ARCA** como cuña diferencial.
10. **Camino:** design-partner-led, nicho-primero (una provincia, un fuero), piloto de ~10 semanas con criterios de éxito y un *gate* de decisión honesto.
11. **Riesgo principal:** entrar tarde a un mercado con incumbentes maduros; se mitiga con foco de nicho, cuña regulatoria y co-construcción con el abogado.
12. **Próximo paso concreto:** entrevista de descubrimiento de 45–60 min con el abogado para convertir los supuestos sobre Judico en hechos y confirmar/ajustar la cuña ARCA.

---

## Fuentes

- Judico — sitio oficial (funciones, IA, precios, jurisdicciones): [judico.com.ar](https://www.judico.com.ar/) · [Elegir plan](https://www.judico.com.ar/elegir-plan)
- Lex-Doctor — sitio oficial (trayectoria, licenciamiento, facturación AFIP): [lex-doctor.com](https://www.lex-doctor.com/)
- Foro sobre software jurídico (crítica de precio a Lex-Doctor): [Portal de Abogados](https://portaldeabogados.com/foros/viewtopic.php?t=36298)
- MetaJurídico — sitio oficial y precios: [metajuridico.com](https://metajuridico.com/) · [Planes y precios](https://metajuridico.com/planes-precios/) · [Capterra](https://www.capterra.com/p/10006251/MetaJuridico/)
- Comparativas de mercado AR (players, integraciones, IA): [Veredicta — 8 mejores software 2026](https://veredicta.com.ar/blog/mejor-software-gestion-legal-abogados-argentina) · [Veredicta — software legal con IA](https://veredicta.com.ar/blog/mejor-software-legal-con-ia-argentina) · [Veredicta — integración PJN/MEV](https://veredicta.com.ar/blog/mejor-software-integracion-pjn-mev)
- IURIX (sistema judicial provincial + IURIX Mind): [El Cronista](https://www.cronista.com/infotechnology/it-business/inteligencia-artificial-en-la-justicia-provincia-argentina-adopta-un-nuevo-sistema-de-gestion/)
- Clio — funcionalidades y precios: [clio.com](https://www.clio.com/) · [Clio pricing](https://www.clio.com/pricing/) · [Capterra](https://www.capterra.com/p/105428/Clio/)
- Facturación ARCA de honorarios (RG 5824/2026, obligatoriedad 1/7/2026): [Colegio de Abogados de Córdoba](https://www.abogado.org.ar/cambios-importantes-en-arca-sera-obligatoria-la-facturacion-electronica-de-honorarios-percibidos-por-via-judicial/) · [iProfesional](https://www.iprofesional.com/impuestos/457408-nueva-obligacion-de-arca-de-facturar-honorarios-judiciales-profesionales-piden-prorroga) · [Ámbito](https://www.ambito.com/informacion-general/arca-amplia-la-factura-electronica-quienes-deberan-emitir-comprobantes-julio-2026-n6248554) · [ARCA — Factura electrónica](https://www.afip.gob.ar/fe/)
- API de facturación electrónica ARCA/AFIP (integración Web Services): [TusFacturasAPP — developers](https://developers.tusfacturas.app/)
- Contexto de mercado legaltech AR (adopción, crecimiento, PJN IA): [InnovaciónDigital360](https://www.innovaciondigital360.com/software/software-legaltech-argentina-2026-software-estudios-juridicos-consultoras/) · [Comercio y Justicia](https://comercioyjusticia.info/profesionales/legaltech-en-argentina-los-agentes-de-ia-estan-redefiniendo-el-rol-del-abogado/) · [Veredicta — IA para abogados](https://veredicta.com.ar/blog/inteligencia-artificial-abogados-argentina-guia)
- Facturación electrónica para abogados (Ley 27.799): [Veredicta](https://veredicta.com.ar/blog/facturacion-electronica-abogados-argentina-ley-27799)

*Documento preparado para GSG Labs. Las secciones marcadas [SUPUESTO] requieren validación con el design partner o pruebas directas del producto antes de tomar decisiones de inversión.*
