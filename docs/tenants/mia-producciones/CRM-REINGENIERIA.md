# CRM comercial operado por agentes (ARM) — reingeniería para MIA Producciones

_16/11/2026 · diseño de Fable 5.2 (sesión session_01BtqRUMARmM81G83cj5a6UH) · método: skill `ingenieria-reversa`._
_Etapa comercial: MIA sin firma ni activación → **prueba interna de GSG, datos ficticios, sin envíos a terceros**._
_Versión 2: incorpora el desafío de un agente distinto (§10). La versión 1 no se construye._

**Órdenes del dueño que cubre (citas):**
- 16/11: «enfocarnos solamente en el CRM de MIA Producciones y […] ponerlo en funcionamiento, al menos en prueba para
  nosotros […] Haz ingeniería inversa con CRMs […] el CRM más completo, más dinámico y más efectivo que se pueda. Lo
  deben operar los ARM.»
- 16/11: «Necesitamos que tenga un proceso de prospectado también, o sea que los comerciales reciban leads calificados
  para trabajar. Y eso el proceso MIA hoy lo tiene.»
- 15/11 (`Factory-GSG/00-ESTADO/mia/PEDIDO-DUENO-2026-11-15-charla-ale.md`): el CRM trabaja desde el lead hasta la
  asignación del comercial: obtiene leads, hace el mailing, procesa consultas, pide datos faltantes, arma el brief y
  lo pasa al comercial; y detecta si el pedido es «estandarizado» (MIA Taller) o a medida (MIA Producciones).

## 0. Principios de la pasada
1. **Adaptarse primero, mejorar después.** El recorrido de cinco pasos de MIA (eventos → marcas → quién decide → mail
   → seguimiento) es la columna; los agentes automatizan lo mecánico; se mejora donde hoy depende de la memoria.
2. **El agente prepara, la persona decide lo que sale.** Ningún puesto envía a terceros (Gmail y Microsoft prohíben
   el correo en frío desde una casilla común; Ley 25.326 y Apollo siguen abiertos).
3. **Toda respuesta y todo cambio salen de un dato visto**, con su fuente. Lección de la prueba de WPE del 16/11
   (`docs/tenants/circuito-wpe/agente/TURNO-2026-11-16.md`): el agente falló al contestar un horario que no miró y al
   actuar sin poder comprobar quién le escribía.
4. **El producto no lleva el nombre de MIA**: módulo «CRM comercial», prendido por negocio con un interruptor.
5. De-sesgo doble: motor estándar (reglas, tests); textos en criollo para el comercial y para Dirección.

## 1. Referentes (detalle y URL: `Factory-GSG/20-PRODUCTO/crm-eventos/INGENIERIA-REVERSA-CRMS-2026-11-16.md`)
HubSpot + Breeze (líder) · Salesforce + Agentforce (agente que prospecta) · Pipedrive (embudo y actividades) · Attio
(modelo flexible) · Kommo (WhatsApp-first) · Tripleseat (eventos). Apollo, Mailchimp y ChatGPT, que MIA usa hoy:
`INGENIERIA-REVERSA.md` del 11/11.

**Esencia (los cinco lo hacen igual → va tal cual):** personas y empresas separadas de la oportunidad; embudo con
terminales ganado y perdido; valor ponderado; un dueño por registro; la actividad en una línea de tiempo como
evidencia; lo que manda un agente sale a nombre de una persona.

**Donde son débiles (→ ahí mejoramos):**
| Debilidad del referente | Lo nuestro | Valor |
|---|---|---|
| Campos requeridos por etapa que se esquivan o no existen | El pase de etapa lo valida el **servidor** con evidencia; no hay otro camino | El comercial nunca recibe un lead a medias |
| Motivo de pérdida en texto libre | Catálogo cerrado + nota | Se sabe por qué se pierde |
| El estancamiento es un aviso y no mira la próxima actividad | Toda oportunidad abierta tiene **próximo paso con fecha**; si vence, entra una tarea a la cola del Seguidor | Cero seguimientos olvidados |
| Reparto parejo, sin ponderar | Reparto por **capacidad** de cada comercial (tope semanal) | Nadie se ahoga ni queda ocioso |
| Aprobación todo o nada | Aprobación **por tipo de acción** y por puesto | Se suelta lo que el agente ya hace bien |
| «Dato faltante» no es un estado | Estado propio **Faltan datos**, con la lista de lo que falta y el borrador del pedido | El brief no se traba en silencio |
| Agentes casi sin auditoría propia | Registro por puesto: quién, qué, con qué dato, cuánto costó | El dueño puede evidenciar cada acción |
| El evento no vive en el CRM (salvo Tripleseat) | La oportunidad es **marca × evento** y nace del relevamiento ya publicado | Se prospecta con el dato que justifica el mail |

**Accidente de mercado que se reemplaza:** secuencias de mail automáticas → borradores que manda una persona;
teléfono y mail como único canal → **borrador de WhatsApp** además del de mail; USD fijo → monto en ARS o USD.

## 2. Modelo
**Ya existe en `main`** (`prisma/schema.prisma:4560-4660`, `src/lib/eventos-sponsors/`): `EventoRelevado`,
`MarcaRelevada`, `EventoMarca`, `AccionDelEquipo` (registro por puesto), `PedidoAlEquipo` (cola). Se reusan, **con
columnas nuevas aditivas** porque así como están no alcanzan (desafío, punto 3):
- `AccionDelEquipo`: `eventoClave` pasa a opcional (`schema.prisma:4632`; una consulta entrante no tiene evento) y
  suma oportunidad, usuario del puesto y costo.
- `PedidoAlEquipo`: suma quién lo tomó, cuándo y cómo se cerró. **Tomar un pedido es atómico**: dos sesiones no toman
  el mismo (test de carrera).
- `MarcaRelevada`: suma dominio y CUIT (hoy no los tiene, `schema.prisma:4585-4599`).
- **Permiso nuevo por puesto.** Hoy todo cuelga de `clients:manage` (`src/lib/eventos-sponsors/acciones.ts:46`): con
  eso un agente podría hacer lo mismo que Dirección y E16 pasaría en falso.

**Nuevo (migración aditiva, escrita sin aplicar; nombres provisionales):**
| Objeto | Qué es | Claves |
|---|---|---|
| `ContactoComercial` | Persona de una marca | `origen` obligatorio (lo cargó Dirección o un comercial · consulta entrante). Nunca lo crea un agente solo. **Baja = supresión**: se anonimiza y queda sólo una huella que impide volver a escribirle |
| `Oportunidad` | Entidad central: marca (× evento, opcional) o consulta entrante | etapa, dueño, puntaje, monto, moneda, destino (Agencia · Taller), próximo paso + fecha, fecha límite (licitación), «compra a través de» (agencia intermediaria), despertar el (dormida), motivo de pérdida, proyecto, versión |
| `ActividadComercial` | Línea de tiempo | quién (persona o puesto), tipo, texto, fuente |
| `BriefComercial` | Lo que recibe el comercial | campos fijos + `faltantes[]` |
| `BorradorMensaje` | Mail o WhatsApp preparado | BORRADOR → APROBADO → ENVIADO_POR_PERSONA · RECHAZADO (con motivo); `idempotencia` |

**Ciclo de la oportunidad (etapa 1 de los proyectos de MIA: «donde trabaja el CRM»):**
- **Prospecto** (marca × evento): `DETECTADA → VERIFICADA → SIN_CONTACTO → CONTACTADA → EN_CONVERSACION`
- **Consulta entrante:** `RECIBIDA → EN_CONVERSACION` (recién cuando se comprobó quién escribe)
- **Común:** `EN_CONVERSACION ⇄ FALTAN_DATOS → CALIFICADA → ASIGNADA → GANADA`; `CALIFICADA → FALTAN_DATOS` vale (E6).
- **Pausa:** `DORMIDA`, con fecha de despertar (evento cancelado, «la próxima edición», sin respuesta).
- **Terminales:** `GANADA` · `PERDIDA` · `DESCARTADA` (las dos últimas con motivo de catálogo) · `DERIVADA_AL_TALLER`.
- `SIN_CONTACTO` existe porque ningún agente crea contactos y el Buscador está apagado: el prospecto verificado deja
  una tarea para que una persona cargue a quién escribirle. Sin ese estado, el prospectado se tranca en VERIFICADA.
- `ASIGNADA` crea el proyecto en «Lead / brief» (`src/lib/proyectos/core.ts:19`) con el brief adjunto, y **la
  oportunidad no se congela**: toma el cierre del proyecto. Pasa a `GANADA` cuando el proyecto llega a «Confirmado» y a
  `PERDIDA`, con motivo, si se cae en cotización o propuesta. El enganche va detrás del interruptor y no cambia
  Proyectos para quien no lo tenga prendido.

**Evidencia que exige cada pase (la valida el servidor):**
| Pase a | Exige |
|---|---|
| VERIFICADA | Marca y evento con verificación «confirmado» y URL de la fuente |
| SIN_CONTACTO | Lo mismo que VERIFICADA; deja la tarea «cargar a quién escribirle» |
| CONTACTADA | Un contacto cargado por una persona + un borrador APROBADO y marcado como enviado por una persona |
| EN_CONVERSACION | Prospecto: una actividad de respuesta del cliente. Consulta entrante: identidad comprobada (el dominio del mail coincide con la marca, o una persona lo confirma) |
| CALIFICADA | Brief sin faltantes obligatorios + puntaje ≥ umbral + destino (Agencia o Taller) |
| ASIGNADA | Dirección elige al comercial (en esta versión, a mano) |
| DORMIDA | Fecha de despertar + motivo |
| GANADA | Sólo la pone el cierre del proyecto |
| DESCARTADA / PERDIDA | Motivo de catálogo |

**Vara de «calificado» (provisional a confirmar con Ale; en esta versión vive en un archivo de configuración):** fecha del evento
conocida y a más de N días · tipo de trabajo · presupuesto o rango · quién decide · encaje con lo que MIA vende. Cada
criterio suma puntos y **el puntaje se explica** (qué sumó y qué faltó). El puntaje sale sólo de **campos
estructurados y verificados**, nunca del texto libre de la consulta: así un mensaje no puede inflarlo.

## 3. Roles y puestos
- **Dirección** (Ale): ve todo, aprueba pases y borradores, asigna al comercial.
- **Comercial:** sus oportunidades asignadas y sus borradores.
- **Puestos del ARM** (usuario propio, permiso acotado por puesto; base: los 6 de
  `Factory-GSG/20-PRODUCTO/crm-eventos/EQUIPO-AGENTES-EVENTOS.md`): Descubridor · Identificador de marcas ·
  Verificador · Buscador de contactos (**apagado**) · Redactor · Seguidor · y dos nuevos: **Calificador** (puntaje,
  faltantes, destino Agencia/Taller) y **Armador de brief** (pide los datos que faltan con un borrador y arma el brief).

| Acción | Agente solo | Con aprobación | Nunca |
|---|---|---|---|
| Proponer evento, marca, oportunidad; verificar; puntuar; marcar faltantes | ✔ | | |
| Escribir borradores; crear tareas de seguimiento | ✔ | | |
| Pasar a CALIFICADA, ASIGNADA, DORMIDA, DESCARTADA, PERDIDA, DERIVADA_AL_TALLER | | ✔ | |
| Marcar un borrador como enviado | | | ✘ (lo hace la persona que lo mandó) |
| Enviar a terceros · crear o importar contactos · tocar plata o configuración · ver oportunidades que no le pasaron | | | ✘ |

## 4. Pantallas
1. **Hoy** — la bandeja «qué hago ahora», por urgencia, con la acción en un toque: borradores por aprobar, pases por
   aprobar, seguimientos vencidos, faltantes sin respuesta.
2. **Embudo** — tablero por etapa con monto ponderado; cada tarjeta muestra próximo paso y días sin movimiento.
3. **Ficha de la oportunidad** — línea de tiempo (personas y puestos mezclados, con quién hizo qué), brief con los
   faltantes marcados, puntaje explicado, borradores.
4. **Borradores** — aprobar, editar o rechazar con motivo; el mail y el WhatsApp se copian o se abren (`wa.me/?text=`,
   sin número en la prueba).
5. **Equipo** (existe: `/admin/eventos/equipo`) — puestos, registro y pedidos. Se suma quién tomó cada pedido.
6. **Tablero de Dirección** (después de la primera prueba) — conversión por etapa, días por etapa, tasa de respuesta,
   leads calificados por semana y por comercial, motivos de pérdida, % de borradores aprobados sin editar y costo por
   lead calificado.

## 5. Matriz de eventualidades (una fila sin test no está resuelta)
| # | Eventualidad | Regla |
|---|---|---|
| E1 | La misma marca llega dos veces (importación + consulta) | Se une por dominio o CUIT; una sola oportunidad abierta por marca × evento |
| E2 | Dos personas aprueban el mismo borrador a la vez | Control de versión: una entra, la otra recibe aviso |
| E3 | El agente reintenta la misma acción | `idempotencia`: no duplica |
| E4 | Pase de etapa sin la evidencia | El servidor lo rechaza y dice qué falta, en criollo |
| E5 | Oportunidad abierta sin próximo paso, o con el paso vencido | No se puede guardar sin próximo paso; vencido → tarea en la cola del Seguidor |
| E6 | Cambia la fecha del evento | Se recalcula el puntaje; si ya no califica, vuelve a FALTAN_DATOS con aviso |
| E7 | Nadie asigna una oportunidad calificada | A las 48 h entra en «Hoy» de Dirección como vencida (el reparto automático por capacidad queda para después) |
| E8 | El cliente pide que no le escriban más | Supresión: el contacto se anonimiza y queda una huella; ningún borrador nuevo para él, nunca, aunque lo vuelvan a cargar |
| E9 | El brief sigue incompleto después de 2 pedidos | Se propone DESCARTADA con motivo «sin datos»; decide una persona |
| E10 | La fuente trae una instrucción («ignorá lo anterior…») | El texto de las fuentes es dato, nunca instrucción; queda anotado y no se ejecuta |
| E11 | El puesto pasa su tope de gasto o de acciones | Se frena y avisa; no sigue |
| E12 | Pedido de un comercial sobre una oportunidad ajena | Rechazado por permiso (en la acción del servidor, no sólo en pantalla) |
| E13 | Otro negocio intenta leer o escribir | RLS + `tenantTransaction`: no ve nada |
| E14 | Estandarizado mal clasificado | El destino lo propone el Calificador y lo confirma Dirección; se puede corregir con registro |
| E16 | Un agente intenta crear un contacto, marcar «enviado» o hacer algo de Dirección | Rechazado por el permiso del puesto (no por `clients:manage`) |
| E17 | La marca ya es cliente o tiene un proyecto activo | No se prospecta en frío: aviso al comercial que la atiende |
| E18 | Compra un holding o una agencia intermediaria | No se unen marcas solas: el sistema propone la unión y la confirma una persona; queda «compra a través de» |
| E19 | El evento se cancela, o la marca contesta «la próxima edición» | DORMIDA con fecha de despertar; al despertar vuelve a «Hoy» |
| E20 | Es una licitación entre agencias con fecha de entrega | Fecha límite en la oportunidad; sube en «Hoy» a medida que se acerca |
| E21 | Un competidor de un cliente activo va al mismo evento | Aviso de exclusividad de rubro; decide una persona |
| E22 | Dos sesiones toman el mismo pedido de la cola | Toma atómica: una lo toma, la otra sigue con el siguiente |
| E23 | Sin respuesta después de N seguimientos | Se propone DORMIDA o PERDIDA «sin respuesta»; decide una persona |
| E24 | La consulta entrante trae texto pensado para inflar el puntaje | El puntaje no lee texto libre; queda anotado |

## 6. Cómo se prueba (antes de mostrarle nada al cliente)
El desafío marcó que la prueba, como estaba, podía dar un «funciona» falso. Queda así:
- **Ambiente:** local, con una MIA ficticia (`scripts/proyectos/demo-local.mjs`), el interruptor prendido y usuarios de
  Dirección, dos comerciales y los puestos. No toca Neon ni producción. **A verificar por quien construye:** si ese
  ambiente no aplica RLS, las pruebas de aislamiento (E13) y de carrera (E2, E22) corren en un Postgres efímero.
- **Datos:** 20 leads ficticios (10 consultas entrantes, 10 marca × evento), con trampas: duplicado, dato sin fuente,
  estandarizado, pedido de baja, instrucción escondida, marca que ya es cliente, licitación, evento cancelado.
- **Sin circularidad:** los leads, las respuestas guionadas del «cliente» y la **clave** (qué debería pasar con cada
  lead) los escribe **un agente que no ve la vara ni el diseño**, y quedan en el repo **antes** de la corrida. Los
  **umbrales de aprobación** también se fijan antes (plan de certificación).
- **Quién opera:** los puestos corren como sesiones de GSG con el plan de Claude (regla del dueño, 14/11) y toman los
  pedidos de la cola. **La corrida no la conduce quien diseñó ni quien construyó.**
- **Quién aprueba:** el dueño, que es quien prueba. Un borrador aprobado por otra sesión de GSG no cuenta.
- **Qué se mide:** leads calificados entregados; **falsos positivos** (calificó lo que no debía) y **falsos negativos**
  (descartó o no vio lo que sí) contra la clave; aciertos del destino Agencia/Taller; borradores aprobados sin editar
  por el dueño; acciones rechazadas por permiso; trampas detectadas; tiempo y costo por lead calificado.
- **Línea base:** hoy no hay número de cómo rinde el proceso manual de MIA. Hasta tenerlo, la prueba dice «el sistema
  hace lo que el diseño promete», no «es mejor que lo de hoy». Es una pregunta para Ale.
- **Quién revisa:** un verificador distinto, sobre capturas y registro; certificación Fable contra
  `Factory-GSG/00-ESTADO/certificacion/GSG-CRM-010.md`.

## 7. Tandas
| Tanda | Qué | Sesión |
|---|---|---|
| T1 | Motor puro + tests de la matriz + modelo y acciones del servidor + permiso por puesto + tomar y cerrar pedidos | GSG-CRM-010 |
| T2 | Pantallas 1 a 5, con capturas | GSG-CRM-011 |
| T0 (en paralelo a T1) | Leads, respuestas guionadas y clave, escritos a ciegas | agente aparte |
| T3 | Corrida del ARM con los 20 leads, con el dueño aprobando | sesión distinta de la que diseñó y de la que construyó |
| Después | Reparto por capacidad, aprobaciones configurables, vara editable en pantalla, tablero de Dirección, costo por puesto, reabrir una perdida | — |

## 8. Camino a producción (lo decide el dueño)
Reversible: todo el código, detrás del interruptor apagado. Gate 2: la migración (aditiva). Gasto: la clave de la API,
cuando el equipo real de MIA use datos reales. Legal, antes del primer mail real: consulta al abogado (Ley 25.326) y
respuesta de Apollo. Deuda anotada: converger con el buzón de agentes de la rama `agentes/tanda-1` (A8).

## 9. Provisional a confirmar
La vara de «calificado» y su umbral · cómo reparte hoy MIA los leads · cuántos leads por semana trabaja un comercial ·
qué es «estandarizado» (lo define Ale) · catálogo de motivos de pérdida · nombres de los puestos frente al cliente ·
cuántos leads calificados por semana saca hoy MIA a mano (la línea base).

## 10. Desafío (challenger, Opus alto, 16/11/2026) — veredicto sobre la v1: «no se construye T1 así»
| # | Hallazgo | Gravedad | Qué se cambió |
|---|---|---|---|
| 1 | El prospecto en frío no podía avanzar: nadie crea el contacto | ALTA | Estado `SIN_CONTACTO` con tarea para una persona (§2) |
| 2 | La consulta entrante entraba sin comprobar quién escribe | ALTA | Nace en `RECIBIDA`; identidad comprobada para avanzar (§2) |
| 3 | Lo publicado no alcanzaba: registro atado a un evento, cola sin dueño, permiso único | ALTA | Columnas aditivas, toma atómica, permiso por puesto (§2) |
| 4 | No había GANADA y la oportunidad se congelaba al asignar | ALTA | La oportunidad toma el cierre del proyecto (§2) |
| 5 | Cinco eventualidades de una agencia sin cubrir | MEDIA | E17 a E21 (§5) |
| 6 | Pases que faltaban o se contradecían | MEDIA | `CALIFICADA → FALTAN_DATOS`, E7 y E23 (§2, §5) |
| 7 | Baja sin supresión; el texto de la consulta podía inflar el puntaje | MEDIA | Supresión con huella; puntaje sólo de campos verificados (§2, E8, E24) |
| 8 | Sobraba para una primera prueba | BAJA | Reparto por capacidad, aprobaciones configurables, tablero y costo pasan a «Después» (§7) |
| 9 | La prueba podía dar un «funciona» falso | — | Clave a ciegas y previa, respuestas guionadas, falsos positivos y negativos, aprueba el dueño, otro conduce (§6) |

No aceptado: nada. Queda abierto: la línea base de MIA (§6).

— Elaborado por GSG
