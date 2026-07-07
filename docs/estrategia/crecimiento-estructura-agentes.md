# Crecimiento de la estructura de agentes de GSG — recomendación del Advisory Board (v3)

**Qué es este documento:** la recomendación del **Advisory Board** (ADR-045, tesis) sobre cómo agrandar
el **Roster completo de GSG** (`docs/organizacion/roster-completo-gsg.md`, ADR-051) — qué agentes sumar
más allá de los 9 🆕 ya listados, en qué orden, con qué criterio de "agente vs tarea one-off", y cómo esa
estructura debe escalar con la segmentación LOW/MID/BIG (`docs/estrategia/roadmap-gsg.md`). **Doc-only —
no instancia ningún agente.**

**Historial de versiones:** v1 (Advisory) → v2 (síntesis tras Ronda 1 del Challenger) → v3 (síntesis tras
Ronda 2 del Challenger, `docs/estrategia/challenger-contrapuntos.md`, + 3 posiciones nuevas) →
**v3.1, esta versión** (+ 5 posiciones adicionales pedidas por el dueño, atadas al workstream nuevo
**Catálogo de módulos/Repositorio de plugins** que acaba de entrar al roadmap — §5.4-5.8).

**Criterio del dueño para esta ronda ("ya fundamento GSG"):** *crear generoso, activar en olas* — no ser
parsimonioso al **definir** (charter completo para todo lo que agregue precisión real), reservando la
parsimonia para la **activación** (por señal, en olas — §3). La reutilización del pool/factory cubre
parte de lo que podría pedirse acá; donde el pool ya alcanza, se dice explícitamente en vez de sumar
relleno (§5.9).

---

## Paso 0 · Calibración (ADR-052)

*(corpus leído para v3: `CLAUDE.md`, ADR-032/039/045/046/047/048/049/050/051/052,
`docs/lecciones-aprendidas/registro.md`, `bases-gsg.md`, `roadmap-gsg.md`,
`docs/organizacion/roster-completo-gsg.md`, `docs/estrategia/challenger-contrapuntos.md` — Ronda 1 y
Ronda 2 completas)*

Principios que guían esta síntesis (se agregan 3 a los 9 de v2, sin repetirlos):

10. **El cuello de botella escaso no es la ejecución, es la atención de aprobación del dueño (ADR-049).**
    Corrección de fondo tras la Ronda 2: ADR-052 hace que cada agente se calibre **a sí mismo** — el PMO
    no es quien "hace" la calibración de otro rol. El recurso que de verdad se satura al activar varios
    agentes a la vez es cuántas **decisiones nuevas** le llegan al dueño en la misma ventana, no cuánto
    tarda el PMO en escribir charters.
11. **Un artefacto que promete más cobertura de la que da es peor que reconocer el hueco.** El
    "pre-charter" de v2 vendía un lead-time falso para el 80% de su contenido (SLOs, runbooks, checklist
    legal real) que depende del evento que todavía no pasó. Se corrige llamándolo por lo que es.
12. **Cuando el filtro 4 (¿lo absorbe un rol existente?) no se corre parejo contra todos los candidatos,
    el resultado no es riguroso, es conveniente.** Se corre explícitamente contra Legal/Compliance en
    esta versión (no se había corrido en v2), con el mismo criterio ya aplicado a Release Manager y
    Migración.

---

## 1. Validación/crítica de los 9 🆕 ya listados en el roster

| # | Agente propuesto (roster §4) | Veredicto Advisory (v3) | Por qué |
|---|---|---|---|
| 1 | **Data/DBA** | ✅ **Validado, máxima prioridad — sin cambios en v3** | Ataca el cuello de botella real (Gate 2 trabado). Es la única decisión de instanciación genuinamente nueva y urgente que le pido al dueño en H0 (ver §3). |
| 2 | **Release Manager** | 🟡 **Sin cambios en v3** | Protocolo dentro del Arquitecto hasta que el volumen de releases lo fuerce a separarse (H2). |
| 3 | **FinOps/Costo-Uso** | 🟡 **Sin cambios en v3** | Reporte programado (skill `schedule`), no agente, hasta H2. |
| 4 | **Pricing & Packaging** | ✅ **Sin cambios en v3, alta prioridad** | Resuelve el vacío de modelo comercial que el propio roadmap dejó abierto. |
| 5 | **Soporte/Customer Success** | 🟡 **Sin cambios en v3** | Se activa con el primer contrato MID o con un umbral medido de incidencias, no antes. |
| 6 | **SRE on-call/SLOs** | 🟡 **Sin cambios en v3**, pero ver §2.3 y §4 — se separa de este rol la respuesta a incidentes de exposición de datos, que **no** es lo mismo que disponibilidad. | SRE cubre uptime; la exposición de PII es un riesgo distinto y ya activo hoy (ver Incident Response, §2.3). |
| 7 | **Docs/Índice vivo** | ✅ **Sin cambios en la validación, pero se acota su tarea de "shell" (ver §3)** | Sigue siendo Sonnet puro y mecánico — la Ronda 2 encontró que la versión anterior del "pre-charter" le agregaba diseño de rol (SLOs, runbooks), que no es su misión. Se corrige. |
| 8 | **Advisory Board (roster)** | ⚠️ **Corregido en v3 — no entra como línea propia del roster** | La Ronda 2 lo marcó con razón: "ya opera de facto" + "formalizarlo es poner por escrito lo que ya pasa" es bajo costo **y bajo valor** — se **fusiona como nota dentro del charter de ADR-045** (Advisory+Challenger) en vez de sumar una entrada de roster separada. No se activa nada nuevo por este ítem. |
| 9 | **Legal/Compliance** | ⚠️ **Corregido en v3 — pasa el filtro 4 contra Seguridad, no queda como agente nuevo** | La Ronda 2 probó que nunca se corrió el filtro 4 ("¿lo absorbe un rol existente?") contra Legal, con la misma vara que sí se corrió contra Release Manager y Migración. Corriéndolo: **Seguridad (✅ ya existe, ya en Opus, ya dueña de SEC-1/2/3) es el candidato obvio** para el checklist de PII — misma familia de riesgo (secretos/RLS/webhooks ≈ datos personales expuestos). Ver §4 para el detalle y §4bis para las dos puntas que quedan para el dueño. |

## 2. Agentes adicionales propuestos (no estaban en la lista de 9)

### 2.1 · Migración / Ingesta de datos del cliente
*(sin cambios respecto a v2 — la Ronda 2 no encontró objeciones acá; ver §4 para la aplicación pareja
del filtro 4.)*
- **Misión:** migrar el historial operativo real de un cliente que **ya opera** (Excel/WhatsApp/sistema
  anterior — stock, clientes, catálogo histórico) al tenant nuevo. Distinto del Preset IA (extrae marca/
  catálogo **público** para la preventa, no datos operativos privados).
- **Entradas → salidas:** *in:* export del cliente · *out:* datos poblados y validados, con reporte de
  qué no se pudo migrar.
- **Modelo/división:** Sonnet · Transversal/Delivery.
- **Cuándo:** tarea one-off del Adaptador/Delivery en el primer caso real (H1); se promueve a agente
  separado solo si el volumen lo fuerza en H2 — misma vara que Release Manager.

### 2.2 · Explícitamente NO recomendados como agente nuevo
- **"Ventas consultivas" como agente separado para LOW/GRANDE:** cubierto por Agencia Digital y por el
  dueño (activo SAP). *(Para MID específicamente, ver la posición nueva §5.1 — ahí sí hay un hueco real.)*
- **"Contador/Fiscalista" como agente interno:** responsabilidad legal real → consulta externa puntual,
  no agente de IA. Es el **caso gemelo** que la Ronda 2 usó para destrabar la discusión de Legal (§4bis).

### 2.3 · Respuesta a Incidentes de Exposición de Datos (🆕 NUEVO — encontrado por el Challenger, Ronda 2)
- **Misión:** protocolo de las primeras 24-48hs si PII de un tenant **ya se expuso** — quién lo declara,
  a quién se avisa (cliente afectado, AAIP si corresponde), cómo se contiene. **Distinto de SRE on-call**
  (que cubre disponibilidad/uptime, no exposición de datos) y **distinto de Legal/Compliance** (que
  cubre consentimiento/autorización hacia adelante, no la respuesta a un incidente ya ocurrido).
- **Por qué faltaba:** con PII real circulando de los 4 tenants hoy y la lección **SEC-2** ya registrada
  (un rol de app pudo evadir RLS en el pasado), la pregunta "¿qué hacemos si ya pasó" no tenía dueño en
  ninguno de los 9+1 candidatos anteriores. A diferencia de Soporte/CS o SRE-SLOs, **no depende de que
  llegue un contrato nuevo** — depende de que ya hay datos reales corriendo, hoy.
- **Entradas → salidas:** *in:* señal de exposición (log, reporte, alerta de RLS) · *out:* protocolo de
  contención ejecutado + registro en `docs/lecciones-aprendidas/registro.md` (categoría SEC) + aviso al
  dueño (irreversible, ADR-048, siempre se eleva).
- **Modelo/división:** Opus (alto juicio, mismo tratamiento que Seguridad) · Gobernanza/Seguridad.
- **Filtro 4 corrido:** el candidato natural para absorberlo es **Seguridad**, exactamente por la misma
  lógica que absorbe el checklist de Legal (§4) — misma familia de riesgo, mismo rol ya en Opus. Se
  recomienda que **Seguridad amplíe su mandato** para cubrir esto como **protocolo**, no que se instancie
  un rol nuevo — con la salvedad de que, a diferencia del checklist de PII (preventivo), esto es
  **respuesta a incidente ya ocurrido** y merece su propio protocolo escrito (no solo una nota) dentro
  del charter de Seguridad.
- **Cuándo activar el protocolo:** **ahora** (H0) — no depende de ningún evento de negocio futuro, solo
  de que ya hay datos reales corriendo. Ver §3.

## 3. Secuencia de activación — corregida: dos colas, no un número mágico

*(La v2 sub-secuenciaba H0 en "3 a la vez" y no justificaba ese número; la Ronda 2 probó que además el
modelo del cuello de botella estaba mal — asumía que el PMO era el recurso escaso, cuando ADR-052 hace
que cada agente se calibre solo. Se reemplaza el criterio entero.)*

**Modelo corregido: el recurso escaso es la atención de aprobación del dueño (ADR-049), no la capacidad
de ejecución del PMO.** Por eso la secuencia ya no se ordena por "cuántos charters puede escribir el
PMO a la vez", sino por **cuántas decisiones nuevas de instanciación** le llegan al dueño en la misma
ventana — y se declaran **dos varas explícitas**, no mezcladas en una sola narrativa (Ronda 2, hallazgo 3):

- **Cola de riesgo activo hoy** (no espera evento de negocio — el riesgo ya existe): corre en **paralelo**,
  porque son dominios distintos y no compiten por el mismo recurso.
- **Cola de apalancamiento** (mejora la capacidad de decidir/vender, pero no hay fuego que apagar): corre
  **secuencial**, ordenada de menor a mayor costo de decisión para el dueño.

| Cola | Contenido | Decisión real que le pido al dueño |
|---|---|---|
| **Riesgo activo hoy (paralelo)** | **Data/DBA** (instanciación nueva) · **Seguridad amplía su mandato** para cubrir el checklist de PII (§4bis) + el protocolo de Incident Response (§2.3) | **1 decisión de instanciación nueva** (Data/DBA) + **1 decisión de ampliar un rol que ya existe** (Seguridad) — esta segunda es más liviana: no es un agente nuevo, es extender el mandato de uno ✅ ya operando, coherente con ADR-048 (cambio doc-only/estructura de células = reversible, el Arquitecto lo puede resolver y solo informa al dueño) |
| **Apalancamiento (secuencial)** | 1º **Docs/Índice vivo** + **Documentación Técnica del Catálogo** (§5.7, mismo costo bajo, van juntos) → 2º **Product Owner del Catálogo** (§5.4, ordena el backlog del workstream nuevo) → 3º **Pricing & Packaging** (Opus, plata — mayor costo de decisión, va al final) | **2 decisiones de instanciación de costo bajo-medio** (Documentación+Product Owner del Catálogo) + **1 de costo alto** (Pricing); Docs es tan barato que casi no consume atención — **Advisory Board NO suma una decisión más**: fusionado al charter de ADR-045 (§1, ítem 8) |

**Resultado de la corrección:** en vez de "4 charters simultáneos" (v2), el dueño recibe en H0
**2 decisiones reales de instanciación** (Data/DBA, Pricing) + **1 decisión liviana de ampliar Seguridad**
— la cola de riesgo no espera nada, la cola de apalancamiento se escalona.

| Horizonte | Qué es | Agentes que se activan | Disparador (evento de negocio) |
|---|---|---|---|
| **H1 — primer piloto MID** | Aparece el primer cliente RI mediano real. ⚠️ *Fecha referencial, no comprometida: hereda sin resolver el riesgo de `roadmap-gsg.md` §5 (sin lead real ni Gate 2 destrabado) — etiquetarla "H1" no la vuelve más firme.* | **Release Manager** (protocolo, no agente) · **Migración/Ingesta** (one-off del Adaptador) · **Preventa Técnica/Solutions Engineering** (§5.1) · **Integraciones Externas** (§5.5, justo tras cerrar Gate 2) · **QA de Regresión del Catálogo** (§5.6) · **UX/Consistencia de Backoffice** (§5.8) | El primer **lead MID calificado** (Preventa/Product Analytics); Gate 2 destrabado (Integraciones); la ola de módulos nuevos de MEDIANO empezando en paralelo (QA de Regresión, UX de Backoffice) |
| **H2 — consolidar MID** | MID con varios clientes, release recurrente | Release Manager se separa si el volumen lo pide · Migración se promueve a agente si el volumen lo fuerza · FinOps se promueve de reporte a agente · SRE on-call/SLOs (shell listo desde H0, ver abajo) · **Product Analytics** (§5.2) | Volumen de deploys/gasto sostenido; primer contrato con expectativa de disponibilidad |
| **H3 — primer piloto GRANDE** | Entra dinero real a escala + régimen de información avanzado | Soporte/CS · Legal/Compliance pasa de checklist (en Seguridad) a agente completo si el dueño así lo decide (§4bis) · **Aprendiz/Shadow de Implementación GRANDE** (§5.3, nueva) — obligatorio, no opcional, como entregable del propio piloto 1 | Primer contrato GRANDE firmado + MP/ARCA reales |

**Shell + lista de calibración — corrección del "pre-charter" (Ronda 2, hallazgo 2):** el "pre-charter"
de v2 prometía bajar el lead-time de semanas a días para Release Manager/FinOps/Soporte/SRE, pero solo
es cierto para el **20% administrativo** (misión en 1 línea, entradas/salidas, división, modelo, y la
**lista mínima de lectura de calibración** ADR-052 — qué ADRs y qué entradas del registro de lecciones
tiene que leer ese rol). El **80% sustantivo** (SLOs concretos, runbook, contenido real del checklist)
depende del evento que todavía no pasó y **no se puede pre-escribir de verdad**. Se corrige:
- Se renombra: **"shell + lista de calibración"**, no "charter" ni "pre-charter" — para no vender más
  cobertura de la que da.
- **Docs/Índice vivo** redacta solo el shell (tarea mecánica, dentro de su mandato real — la Ronda 2
  marcó que diseñar SLOs/runbooks es scope creep hacia el PMO; el shell puro no lo es).
- **Regla dura nueva:** todo shell se **re-valida contra el corpus vigente al momento de activarse** —
  nunca se activa "tal cual". Si pasaron 6-12 meses entre redactarlo y activarlo, el corpus cambió
  (nuevos ADRs, nuevas lecciones) y la recalibración real (ADR-052) no se saltea nunca.

**Regla dura de secuencia (con la excepción de la cola de riesgo activo, que no espera evento):** en la
cola de apalancamiento y en H1-H3, ningún agente se activa por fecha en el calendario — se activa contra
el **evento de negocio** que lo justifica.

## 4. Criterios: ¿agente permanente o tarea one-off?

Un candidato se instancia como **agente permanente** (charter + calibración ADR-052) solo si cumple
**2 o más** de estos cuatro filtros; si no, queda como **plantilla/tarea one-off** o **se absorbe en un
rol existente**:

1. **Recurrencia real:** ¿el mismo tipo de decisión se repite al menos una vez por sprint/ciclo?
2. **Costo del error si no está:** ¿un error en esta función es caro o irreversible? Si sí, justifica el
   rol aunque el volumen sea bajo — el costo de NO tenerlo supera el costo de calibrarlo.
3. **Señal de negocio real, no especulativa:** ¿hay un lead calificado, un contrato firmado, o un patrón
   medido que lo pide hoy?
4. **Nadie más lo puede absorber sin diluirse:** ¿otro rol ya existente lo cubriría sin desviarse de su
   propia misión?

*Ejemplo de aplicación — ahora corrido parejo contra TODOS los candidatos, incluido Legal (Ronda 2,
hallazgo pendiente de v2):*

- **Data/DBA:** cumple 1+2+3 → agente ya.
- **Legal/Compliance — filtro 4 corrido por primera vez:** cumple 2 (PII real, hoy) + parcial de 1, pero
  **también cumple el filtro 4 en sentido negativo para instanciarlo como rol nuevo**: Seguridad (✅ ya
  existe, ya en Opus, ya dueña de SEC-1/2/3 — secretos/RLS/webhooks) es, en sustancia, la misma familia
  de riesgo que "datos personales expuestos". Con el filtro 4 corrido parejo, el resultado más probable
  **no es "Legal como agente nuevo"**, es **"Seguridad absorbe el checklist de PII"** — igual que
  Release Manager lo absorbe el Arquitecto y Migración lo absorbe el Adaptador. Esto reduce la pregunta
  para el dueño de "¿checklist o agente completo?" a algo más barato: **"¿lo absorbe Seguridad ya
  (recomendado), o justifica un rol Legal nuevo de todos modos?"** — ver §4bis para las dos puntas
  completas.
- **Respuesta a Incidentes de Exposición (§2.3):** mismo filtro 4 → absorbido por Seguridad como
  protocolo, no agente nuevo.
- **FinOps:** cumple 2 (parcial) → reporte programado, no agente.
- **Migración e Release Manager:** cumplen el filtro 4 con la MISMA vara (absorbidos por Adaptador y
  Arquitecto respectivamente) → ambos one-off hasta que el volumen fuerce lo contrario.

**Referencia SAP (adaptada, no copiada):** SAP solo formaliza un rol dedicado cuando una capacidad se
repite a través de **múltiples** proyectos/clientes — antes de eso, es un consultor puntual. GSG aplica
la misma disciplina: un agente permanente es una capacidad que **ya se repite**, no una apuesta.

## 4bis. Legal/PII — las dos puntas para el dueño (Ronda 2, punto explícitamente pedido)

**El hallazgo que las cruza primero:** la propia v2 ya resolvió un caso gemelo — **Contador/Fiscalista**
(§2.2) — con la regla *"responsabilidad legal real → consulta externa puntual con un profesional
habilitado, NO agente interno de IA"*. Compliance de datos personales (Ley 25.326/AAIP en Argentina)
tiene el mismo perfil: es responsabilidad legal real que ningún agente de IA, sea "checklist" o
"completo", puede sostener legalmente por sí solo. Con eso presente, las dos puntas tal como se plantea
el dilema:

**Punta A — AGENTE COMPLETO YA (Opus, charter propio, no absorbido por Seguridad):**
- La PII no es hipotética: hoy circula de 4 tenants reales. El filtro 3 ("señal de negocio") es la vara
  equivocada acá — el riesgo legal no espera a que entre plata, espera a que exista el dato, y ya existe.
- Un checklist "mínimo" sin dueño de ejecución claro (el hueco que la Ronda 2 encontró en v2) da **falsa
  sensación de cobertura** — peor que reconocer el gap, porque invita a no revisarlo hasta H3.
- El costo de un incidente (denuncia AAIP, reclamo de cliente, reputación justo cuando GSG busca su
  primer contrato MID/GRANDE) es asimétrico e irreversible — el mismo perfil que ya justificó a Data/DBA.

**Punta B — CHECKLIST absorbido por Seguridad (recomendación de este documento, §4):**
- La exposición real hoy es acotada: 4 tenants chicos, datos operativos de bajo volumen, ya bajo un paso
  de autorización explícita (Preset IA) — no es PII a escala de un contrato GRANDE con régimen de
  información.
- Buena parte del riesgo real (¿dónde vive el dato vía Neon? ¿hay opt-in en el WhatsApp CTA? ¿hay forma
  de borrar datos a pedido?) es conocido y acotado — un checklist puntual, ejecutado ya contra esas
  preguntas concretas, cierra la mayor parte de la exposición sin montar una estructura Opus permanente.
- Levantar un agente Legal completo hoy consume presupuesto de juicio caro (ADR-032) en un dominio donde,
  igual que con el Contador, **ninguna estructura interna reemplaza la responsabilidad legal real** — el
  gasto no compra la cobertura que promete.
- Es reversible y escalable: si un incidente real o un prospecto GRANDE exige auditoría de compliance
  (van a preguntar), ahí sí hay señal de negocio (filtro 3) para pasar a agente completo.

**Recomendación de este documento (no reemplaza la decisión del dueño, la enmarca):** un **híbrido** —
checklist ejecutado YA por **Seguridad** (que ya existe, ya en Opus, ya cubre SEC-1/2/3) **+ una consulta
puntual, pagada, con un abogado real** que audite ese checklist una sola vez, exactamente el mismo patrón
que Contador/Fiscalista. Más barato que un agente Opus permanente y más sólido que un checklist sin
respaldo legal real. **Queda para el dueño decidir entre A, B, o el híbrido** — es apetito de riesgo, no
un hueco de consistencia del documento.

## 5. Tres posiciones adicionales (pedido explícito del dueño — fortalecen la estructura más allá de los
9 + Migración + Incident Response)

### 5.1 · Preventa Técnica / Solutions Engineering (MID)
- **Misión (1 línea):** traducir el roadmap de módulos (`roadmap-gsg.md`) en una propuesta técnica
  concreta para un lead MID real — qué módulos aplican, qué falta construir, en qué plazo.
- **División:** Agencia Digital. **Modelo:** Sonnet (propuesta estándar) → Opus si la propuesta toca
  compromiso de alcance/fecha (borde reversible/irreversible, ADR-048).
- **Entradas → salidas:** *in:* lead MID calificado + estado real de módulos · *out:* propuesta técnica
  con alcance/plazo, más un input directo a Pricing & Packaging (§1) sobre qué necesita ese cliente.
- **Cuándo activar:** H1, con el primer lead MID calificado — no antes (sin lead, no hay qué traducir).
- **Por qué agrega valor real (no relleno):** hoy nadie en el roster traduce "tenemos estos módulos" a
  "esto es lo que te resuelve a vos" para un prospecto MID concreto — Consultores/Análisis de mercado
  (Agencia Digital) hacen inteligencia de mercado, no propuesta técnica 1:1; el dueño está reservado
  para GRANDE. Sin este rol, el primer piloto MID depende de que el dueño improvise la propuesta técnica,
  exactamente lo que la estructura debería evitarle (principio 8 de calibración). **Referencia SAP:**
  SAP separa a los **Solution Advisors/Presales** de los Account Executives — la propuesta técnica no la
  arma el vendedor, la arma un especialista de producto.

### 5.2 · Product Analytics / Telemetría de uso
- **Misión (1 línea):** medir qué módulos usan de verdad los tenants clientes (no las cuatro pruebas
  piloto de GSG mismo) — adopción, fricción, señales de abandono — para que Pricing y CS decidan con
  datos, no con supuestos.
- **División:** Transversal/Gobernanza-Producto. **Modelo:** Sonnet (telemetría/reportes) + Opus revisa
  insights de alto impacto (igual patrón que FinOps).
- **Entradas → salidas:** *in:* eventos de uso del backoffice por tenant · *out:* reporte de adopción/
  fricción por módulo, insumo directo para Pricing (unit economics reales) y para Soporte/CS (dónde se
  traban los clientes antes de que se conviertan en ticket).
- **Cuándo activar:** H1 — antes no hay suficiente base de tenants pagando para que el dato sea
  representativo (los 4 actuales son BAJA, volumen bajo); el payoff real llega con el primer MID.
- **Por qué agrega valor real:** es distinto de **Owner Insights** (analytics de los negocios PROPIOS
  del dueño, Agencia Grow) y de **FinOps** (costo de la factory, no uso del producto) — hoy ningún rol
  del roster mide el uso real del producto por los clientes que pagan, que es exactamente el dato que
  Pricing necesita para no seguir con el modelo comercial "dinámico" que el Challenger ya señaló como
  ausencia de hipótesis (roadmap-gsg.md, ronda 1). **Referencia SAP:** SAP Analytics Cloud/embedded
  analytics es una disciplina separada de ventas y de finanzas — mide uso real para informar producto y
  pricing, no para reportar al dueño sobre sus propios negocios.

### 5.3 · Aprendiz/Shadow de Implementación GRANDE
- **Misión (1 línea):** acompañar al dueño en el primer piloto GRANDE con el mandato explícito de
  **codificar su know-how real de SAP** (Public Cloud Finance) en un playbook documentado, para que el
  segundo cliente GRANDE no dependa 100% de una sola persona.
- **División:** Gobernanza/ERP-Grande. **Modelo:** Opus (mismo nivel de juicio que exige acompañar al
  dueño en una implementación enterprise real).
- **Entradas → salidas:** *in:* acceso de shadow al piloto GRANDE 1 (decisiones, reuniones, criterios que
  aplica el dueño) · *out:* **playbook de implementación GRANDE** documentado (análogo a
  `docs/metodologia/generador-preset-ia.md`), capaz de guiar un segundo piloto sin el dueño presente en
  cada paso.
- **Cuándo activar:** H3, atado al primer piloto GRANDE — pero **no es opcional**: se declara **entregable
  obligatorio del piloto 1**, no un rol que se evalúa después. Si el piloto 1 GRANDE termina sin
  playbook, el tier GRANDE sigue siendo, en los hechos, consultoría boutique con marca GSG, no un
  producto escalable — exactamente el riesgo que el Challenger marcó en la Ronda 1 (`bases-gsg.md` §4/§6:
  "activo de fundador, no de compañía").
- **Por qué agrega valor real:** es la única posición de esta lista que resuelve directamente un riesgo
  YA identificado y no atendido (el activo SAP del dueño no escala solo) — no es una función nueva
  aspiracional, es la respuesta pendiente a una alarma que ya sonó. **Referencia SAP:** el modelo de
  partners certificados de SAP existe precisamente para que la implementación no dependa de un único
  consultor — GSG necesita su propia versión chica de esa certificación interna antes de vender un
  segundo GRANDE.

### Contexto de esta ronda: entra al roadmap el workstream "Catálogo de módulos / Repositorio de plugins"

Acaba de sumarse al roadmap un frente nuevo: **sumar módulos y funcionalidades al backoffice, nutriendo
el repo de plugins ANTES de salir a vender** (a diferencia de §5.1-5.3, que asumían un lead/piloto ya en
curso). Esto es, en los hechos, la ejecución concreta de la ambición de "suite completa tipo SAP" que
`roadmap-gsg.md` ya declaraba — y por eso trae consigo necesidades de estructura genuinamente nuevas,
no cubiertas por §5.1-5.3 ni por los 11 agentes de §1-2.3.

**Criterio aplicado para elegir estas 5 (y no más ni menos):** con "crear generoso" como mandato, se
revisaron ~8 candidatos (Product Owner del Catálogo, Desarrolladores de módulos, Integraciones,
QA de regresión, Documentación técnica, Data/Reporting del ERP, UX de backoffice, y variantes). **Se
chartean las 5 que agregan precisión real y no están cubiertas por el pool** (ADR-053) ni por roles ya
definidos; **2 se descartan explícitamente** por redundancia (§5.9), en vez de sumarlas por relleno.

### 5.4 · Product Owner del Catálogo de Módulos/Plugins
- **Misión (1 línea):** dueño único del backlog del catálogo — qué módulo se construye, en qué orden,
  para qué tier (BAJA/MEDIANO/GRANDE), y cuándo un plugin está "vendible" vs. "en obras".
- **División:** Gobernanza/Producto (nueva rama transversal al Core). **Modelo:** Opus (prioriza con
  criterio de negocio, decide qué entra al catálogo — más cerca de autoría de roadmap que de ejecución).
- **Entradas → salidas:** *in:* gaps de `roadmap-gsg.md` (multi-sucursal, inventario avanzado, CRM,
  e-commerce, RRHH, envíos) + demanda real de Preventa Técnica (§5.1) y de Pricing (§1) · *out:* backlog
  priorizado del catálogo + criterio de "listo para vender" (Gate de módulo, distinto del Gate de
  Excelencia por PR).
- **Cuándo activar:** **H0** — el workstream ya entró al roadmap; sin este rol, el catálogo crece por
  iniciativa dispersa de cada célula de dominio (Pagos, Inventario, Fiscal…) sin una sola vara de
  prioridad. Entra en la **cola de apalancamiento** (§3), después de Docs/Índice vivo.
- **Por qué agrega precisión real (no relleno):** ningún rol existente tiene este mandato — el PMO
  autora el plan de **compañía**, no el orden fino del catálogo de módulos; Producto por rubro (✅
  existente) ejecuta features **por tenant**, no decide qué entra al catálogo **compartido**. Sin este
  rol, "suite completa tipo SAP" sigue siendo ambición sin backlog ordenado — el riesgo que el Challenger
  ya marcó en Ronda 1 (`roadmap-gsg.md` — construcción especulativa sin cliente real). **Referencia SAP:**
  el **Product Management por Line-of-Business** en SAP decide qué entra al core S/4HANA vs. qué queda
  como extensión de partner — la disciplina que falta acá.

### 5.5 · Integraciones Externas (framework transversal)
- **Misión (1 línea):** dueño del **patrón** de integrar cualquier tercero (OAuth, retries/backoff,
  verificación de firma de webhook, rotación de secretos) — no reemplaza a Pagos/Fiscal/WhatsApp, les da
  la plomería común para no reinventarla en cada integración nueva.
- **División:** ERP multi-tenant (Plataforma). **Modelo:** Sonnet (implementación de patrón) → Opus si
  toca secretos/dinero (mismo borde que Pagos/Fiscal hoy).
- **Entradas → salidas:** *in:* necesidad de integrar un tercero nuevo (hoy: cerrar MP OAuth real y el
  certificado ARCA; después: envíos Correo Argentino/Andreani, banking para GRANDE) · *out:* módulo de
  integración reusable (auth + reintentos + firma) que la célula de dominio (Pagos/Fiscal/WhatsApp)
  consume, no reconstruye.
- **Cuándo activar:** **H1**, justo después de que Data/DBA destrabe Gate 2 — su primer trabajo real es
  terminar lo que hoy son stubs (MP OAuth, certificado ARCA), y ahí mismo sienta el patrón para la
  próxima integración (envíos) sin que cada una repita la lección **SEC-3** (firma de webhook + rate-
  limit) desde cero.
- **Por qué agrega precisión real:** hoy MP, ARCA y WhatsApp son 3 células que resuelven auth/retries/
  firma cada una por su cuenta — no hay una sola pieza que capture el patrón, y `roadmap-gsg.md` ya
  anuncia una 4ª integración (envíos) en MEDIANO. Sin este rol, cada integración nueva reinventa la
  plomería (riesgo directo de repetir SEC-3). **Referencia SAP:** SAP separa **Integration Suite/BTP**
  (plataforma de integración) de cada LoB específico (Finance, Sales) — la plomería es una disciplina,
  no una tarea de cada módulo.

### 5.6 · QA de Regresión del Catálogo
- **Misión (1 línea):** cubre la matriz **combinatoria** módulo × rubro × tier que crece con cada plugin
  nuevo — distinto de QA/Probador (✅ existente), que prueba **recorridos de un tenant real**, no
  combinaciones cruzadas del catálogo entero.
- **División:** ERP multi-tenant (Calidad). **Modelo:** Sonnet (tests automatizados, matriz de
  regresión) + Opus revisa cuando una regresión toca un módulo de plata/fiscal.
- **Entradas → salidas:** *in:* cada módulo nuevo o cambiado del catálogo · *out:* matriz de regresión
  automatizada (qué combinaciones módulo×rubro×tier se rompieron) + entrada a
  `docs/lecciones-aprendidas/registro.md` cuando encuentra un patrón nuevo de fallo cruzado.
- **Cuándo activar:** **H1**, cuando el catálogo empieza a crecer en serio (multi-sucursal + inventario
  avanzado + CRM llegando en paralelo para MEDIANO) — antes de eso, con 4 rubros y pocos módulos, el
  riesgo combinatorio es bajo y QA/Probador ya alcanza.
- **Por qué agrega precisión real:** la lección **MP-8** ("sin red de tests, la lógica regresiona") hoy
  cubre lógica de dominio puntual; a medida que el catálogo crece, el riesgo deja de ser "¿funciona el
  módulo?" y pasa a ser "¿rompió OTRO módulo en OTRO rubro?" — un tipo de regresión que ningún rol
  existente cubre sistemáticamente. **Referencia SAP:** SAP corre suites de regresión masivas entre
  combinaciones de módulos activados antes de cada release de S/4HANA — la razón por la que un cliente
  puede activar Finance + Retail + HR sin que se rompan entre sí.

### 5.7 · Documentación Técnica del Catálogo de Módulos
- **Misión (1 línea):** documenta **qué hace cada módulo, cómo se configura y de qué depende** — distinto
  de Docs/Índice vivo (✅ ya definido, gobierna TABLERO/ADR-INDEX/ESTADO-ACTUAL, documentación **interna
  de proceso**), esto es documentación **de producto** del catálogo mismo.
- **División:** Transversal/Producto. **Modelo:** Sonnet puro (mecánico, zona estándar-precisa).
- **Entradas → salidas:** *in:* cada módulo que el Product Owner del Catálogo (§5.4) marca "vendible" ·
  *out:* ficha de módulo (qué resuelve, requisitos, dependencias, tier mínimo) que consumen directamente
  **Preventa Técnica** (§5.1, para armar propuestas) y **Adaptador/Delivery** (para configurar clientes).
- **Cuándo activar:** **H0**, junto con Docs/Índice vivo en la cola de apalancamiento — es igual de
  barato (Sonnet, mecánico) y cierra una fricción que **ya existe hoy**: este mismo documento tuvo que
  relevar el estado del catálogo a mano (vía agentes de exploración) cada vez que hizo falta saber qué
  módulo estaba construido, parcial o ausente.
- **Por qué agrega precisión real:** sin esto, Preventa Técnica (§5.1) no tiene de dónde sacar "qué
  módulos aplican" sin re-explorar el código cada vez — es la pieza que le falta a §5.1 para funcionar
  sin fricción. **Referencia SAP:** el **SAP Help Portal / Best Practices Explorer** documenta cada
  capability activable por LoB — ningún vendedor de SAP arma una propuesta leyendo código fuente.

### 5.8 · UX/Consistencia de Backoffice (Catálogo)
- **Misión (1 línea):** garantiza que los módulos nuevos del catálogo compartan **patrones de UI**
  (navegación, estados, componentes) — distinto de la célula **Diseño** (✅ existente, hoy con foco en
  branding/tokens/vidrieras **públicas** por tenant), esto es consistencia **del backoffice interno** a
  medida que se multiplican los módulos.
- **División:** ERP multi-tenant (Diseño/Calidad). **Modelo:** Sonnet (revisión de patrones) → escala a
  Opus solo si una inconsistencia ya rompió el ángulo "consistencia" del Gate de Excelencia en más de un
  módulo (señal de deuda sistémica, no puntual).
- **Entradas → salidas:** *in:* cada módulo nuevo del backoffice (multi-sucursal, inventario avanzado,
  CRM, RRHH…) · *out:* checklist de consistencia de UI (mismo lenguaje visual/interacción que los módulos
  existentes) — insumo directo del ángulo **"consistencia"** del Gate SAP Fiori (`auditoria-sap-fiori.md`),
  no un gate nuevo y paralelo.
- **Cuándo activar:** **H1**, cuando arranca la ola real de módulos nuevos de MEDIANO (multi-sucursal +
  inventario avanzado + CRM en paralelo) — antes de eso, con pocos módulos, el propio Gate por PR ya
  alcanza para sostener consistencia.
- **Por qué agrega precisión real:** el Gate de Excelencia YA exige "consistencia" (ADR-040, ángulo 1),
  pero hoy esa evaluación es puntual por PR — a medida que el catálogo crece en paralelo (varios módulos
  a la vez, posiblemente construidos por distintos agentes prestados del pool, ADR-053), nadie mira el
  patrón **agregado** entre módulos, solo cada PR aislado. **Referencia SAP:** **SAP Fiori Design
  Guidelines** es una disciplina propia, separada de cada equipo de LoB — exactamente el ángulo que GSG
  ya adoptó como parte de su propia auditoría (`ADR-044` Argentinizar SAP) pero todavía sin un rol
  dedicado a sostenerlo cuando el catálogo crezca en volumen.

### 5.9 · Descartados explícitamente (cubiertos por el pool, ADR-053 — no se chartean como rol nuevo)
- **"Desarrolladores de módulos" genérico:** sería puro relleno — las células de dominio ya ✅ existentes
  (Pagos, Inventario/POS, Fiscal, Plataforma, Diseño) **son** quienes construyen cada módulo de su
  dominio; el catálogo no necesita un rol "desarrollador" separado, necesita que esas células **presten**
  capacidad al ritmo que el Product Owner del Catálogo (§5.4) priorice — exactamente el mecanismo de
  préstamo/rotación de ADR-053, no un charter nuevo.
- **"Data/Reporting del ERP":** se solapa en más de la mitad con **Product Analytics/Telemetría de uso**
  (§5.2, ya definido en v3) y con **Owner Insights** (✅ ya existente) — sumarlo como rol aparte sería
  redundancia, no precisión. Si en H2 aparece una necesidad de reportería **avanzada** (ej. dashboards
  custom para GRANDE) que ninguno de los dos cubre, se evalúa entonces con evidencia real, no ahora.

## 6. Cómo escala la estructura LOW → MID → BIG (actualizado)

- **LOW (hoy):** Gobernanza base + células de producto ✅ ya existentes alcanzan. De los 🆕, solo
  **Data/DBA** es indispensable a este volumen (protege lo irreversible); **Seguridad ampliada**
  (checklist PII + incident response), **Docs** y **Pricing** son baratos y ya justificados. Análogo: SAP
  Business One se implementa con equipo chico, sin Centro de Excelencia dedicado.
- **MID:** entra la capa de "protege el crecimiento" — Migración de datos, Release Manager formal,
  FinOps como agente, SRE con SLOs, **más las dos posiciones nuevas que solo tienen sentido con un
  cliente MID real: Preventa Técnica (§5.1) y Product Analytics (§5.2)**. Análogo: cuando SAP entra a
  mid-market aparecen partners/implementadores especializados — Preventa Técnica y Product Analytics
  cumplen ese rol de "traducir producto a cliente" y "medir si el producto sirve", respectivamente.
- **BIG:** se completa la capa de "protege la relación grande" — Soporte/CS formal, Legal/Compliance
  (según lo que decida el dueño en §4bis), SRE con guardia real, **y el Aprendiz/Shadow (§5.3) como
  condición explícita para que GRANDE deje de depender 100% del dueño**. El diferencial competitivo deja
  de ser solo estructura: es el dueño personalmente aplicando su expertise real, pero la estructura ahora
  **captura** ese conocimiento en vez de solo consumirlo.

## 7. Síntesis Ronda 2 — qué se corrigió

| # | Contrapunto de la Ronda 2 | Resolución en v3 |
|---|---|---|
| 1.a | Legal se declaraba "igual de urgente que Data/DBA" pero quedaba 3 olas atrás | Se corre el filtro 4 contra Seguridad (§4) — Legal deja de ser un agente nuevo a secuenciar; se convierte en ampliación de Seguridad, que corre en la **cola de riesgo activo**, en paralelo con Data/DBA (§3) |
| 1.b/1.d | "3 a la vez" sin justificar; el modelo de cuello de botella (capacidad del PMO) estaba mal | Se reemplaza el criterio entero: **dos colas explícitas** (riesgo activo vs. apalancamiento), ordenadas por decisiones de aprobación del dueño, no por capacidad de ejecución del PMO (§3) |
| 1.c | El "pre-charter" le agregaba a Docs/Índice vivo diseño de rol (scope creep) | Se renombra a **"shell + lista de calibración"**, acotado a lo mecánico; el contenido sustantivo (SLOs, runbooks) queda explícitamente fuera hasta el evento real (§3) |
| 1.e | El checklist de Legal no tenía dueño de ejecución declarado | Resuelto de raíz: lo ejecuta **Seguridad**, un rol ✅ ya existente con dueño claro (§4, §4bis) |
| 2 | El pre-charter prometía más lead-time del que da (~80% teatro) | Se corrige la promesa: solo el 20% administrativo se pre-escribe; se agrega regla de re-validación obligatoria contra el corpus vigente al activarse (§3) |
| 3 | Score de riesgo×valor no coincidía con el orden propuesto | Resuelto por el nuevo modelo de dos colas — Legal/riesgo ya no compite con Docs/Pricing por el mismo criterio (§3) |
| 4 | Las dos puntas del dilema Legal/PII no se habían planteado con el caso gemelo Contador | Sección dedicada **§4bis** con las dos puntas + el híbrido recomendado, dejado para decisión del dueño |
| 5 | Faltaba un rol dueño de "qué hacemos si la PII ya se expuso" | Agregado **§2.3 — Respuesta a Incidentes de Exposición de Datos**, absorbido por Seguridad como protocolo, activo desde H0 |

**Punto abierto para el dueño (único, de apetito de riesgo — no de consistencia):** §4bis — Legal/PII:
¿Punta A (agente completo ya), Punta B (checklist por Seguridad, recomendado) o el híbrido
(Seguridad + consulta puntual con abogado externo)?

## 8. Tabla-cuestionario final — para llevar al dueño

Las 19 posiciones en juego (9 originales del roster + Migración + Incident Response + 3 nuevas de v3 +
5 nuevas de esta ronda, atadas al workstream de Catálogo/Plugins), con la recomendación del Advisory y
un campo para la decisión del dueño.

| # | Agente/posición | Recomendación del Advisory | Cuándo | Decisión del dueño |
|---|---|---|---|---|
| 1 | **Data/DBA** | ✅ Instanciar ya | H0 (riesgo activo) | ☐ Sí ☐ No ☐ Otro: _____ |
| 2 | **Release Manager** | 🟡 Protocolo dentro del Arquitecto, no agente | H2 si el volumen lo fuerza | ☐ De acuerdo ☐ Prefiero agente ya ☐ Otro: _____ |
| 3 | **FinOps/Costo-Uso** | 🟡 Reporte programado (skill `schedule`), no agente | H2 si el volumen lo fuerza | ☐ De acuerdo ☐ Prefiero agente ya ☐ Otro: _____ |
| 4 | **Pricing & Packaging** | ✅ Instanciar, prioridad alta | H0 (apalancamiento, 2º) | ☐ Sí ☐ No ☐ Otro: _____ |
| 5 | **Soporte/Customer Success** | 🟡 Esperar señal (primer contrato MID o umbral de incidencias) | H3 | ☐ De acuerdo ☐ Adelantar ☐ Otro: _____ |
| 6 | **SRE on-call/SLOs** | 🟡 Esperar señal (SLA contractual real); shell listo desde H0 | H2 | ☐ De acuerdo ☐ Adelantar ☐ Otro: _____ |
| 7 | **Docs/Índice vivo** | ✅ Instanciar ya, el más barato | H0 (apalancamiento, 1º) | ☐ Sí ☐ No ☐ Otro: _____ |
| 8 | **Advisory Board (roster)** | ⚠️ No instanciar como entrada propia — fusionar al charter de ADR-045 | Ya (sin costo) | ☐ De acuerdo ☐ Prefiero entrada propia ☐ Otro: _____ |
| 9 | **Legal/Compliance** | ⚠️ Ver **§4bis — dos puntas + híbrido** | H0 (si Punta B/híbrido) o H0 (si Punta A) | ☐ Punta A (agente ya) ☐ Punta B (Seguridad, recomendado) ☐ Híbrido ☐ Otro: _____ |
| 10 | **Migración/Ingesta de datos del cliente** | 🟡 One-off del Adaptador | H1 (primer lead MID con datos) | ☐ De acuerdo ☐ Prefiero agente ya ☐ Otro: _____ |
| 11 | **Respuesta a Incidentes de Exposición de Datos** | ✅ Protocolo dentro de Seguridad, activar ya | H0 (riesgo activo, junto con Data/DBA) | ☐ Sí ☐ Prefiero rol separado ☐ Otro: _____ |
| 12 | **Preventa Técnica/Solutions Engineering (MID)** — *nueva* | ✅ Instanciar con el primer lead MID | H1 | ☐ Sí ☐ No ☐ Otro: _____ |
| 13 | **Product Analytics/Telemetría de uso** — *nueva* | ✅ Instanciar con el primer MID activo | H1 | ☐ Sí ☐ No ☐ Otro: _____ |
| 14 | **Aprendiz/Shadow de Implementación GRANDE** | ✅ Obligatorio como entregable del piloto GRANDE 1 | H3 | ☐ Sí ☐ No ☐ Otro: _____ |
| 15 | **Product Owner del Catálogo de Módulos/Plugins** — *nueva (§5.4)* | ✅ Instanciar ya — ordena el workstream que ya entró al roadmap | H0 (apalancamiento) | ☐ Sí ☐ No ☐ Otro: _____ |
| 16 | **Integraciones Externas (framework)** — *nueva (§5.5)* | ✅ Instanciar apenas Data/DBA destrabe Gate 2 | H1 | ☐ Sí ☐ No ☐ Otro: _____ |
| 17 | **QA de Regresión del Catálogo** — *nueva (§5.6)* | ✅ Instanciar con la ola de módulos de MEDIANO | H1 | ☐ Sí ☐ No ☐ Otro: _____ |
| 18 | **Documentación Técnica del Catálogo de Módulos** — *nueva (§5.7)* | ✅ Instanciar ya, junto con Docs/Índice vivo (mismo costo bajo) | H0 (apalancamiento) | ☐ Sí ☐ No ☐ Otro: _____ |
| 19 | **UX/Consistencia de Backoffice (Catálogo)** — *nueva (§5.8)* | ✅ Instanciar con la ola de módulos de MEDIANO | H1 | ☐ Sí ☐ No ☐ Otro: _____ |

*(Descartados con criterio, no por omisión — §5.9: "Desarrolladores de módulos" genérico y "Data/
Reporting del ERP", ambos cubiertos por el pool/ADR-053 o por roles ya definidos.)*

---

**Estado:** v3.1, síntesis del Advisory Board tras la Ronda 2 del Challenger + 3 posiciones nuevas (v3)
+ 5 posiciones nuevas atadas al workstream Catálogo/Plugins (esta ronda, §5.4-5.8). Lista para el **OK
de adopción del dueño** vía la tabla-cuestionario (§8, 19 posiciones). No instancia ningún agente — es
recomendación de estructura, doc-only.
