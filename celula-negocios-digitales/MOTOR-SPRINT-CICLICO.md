# MOTOR — Sprint cíclico de la célula

> **PMO · 2026-07-06.** El dueño pidió que la célula funcione como un **sprint cíclico permanente**:
> analizar → entregar → desafiar → (visión del dueño) → repetir, mientras el desarrollo corre en
> paralelo sobre lo validado. **El dueño está en la cúspide: aporta la visión y gatea.** Todo local,
> sin publicar, hasta su OK.

## El ciclo (una vuelta = un sprint)

```
        ┌─────────────────────────── VISIÓN DEL DUEÑO ───────────────────────────┐
        │  (prioriza, marca dirección, gatea qué pasa a dev y qué se publica)     │
        ▼                                                                          │
  ①  GENERAR + ANALIZAR ──▶ ②  DESAFIAR (red-team) ──▶ ③  ENTREGAR al dueño ──────┘
     creativos + analíticos      R1 mercado + R2 plata      resumen ejecutivo con
     (capa horizontal)           intentan matar cada idea    números + recomendación

  En paralelo, siempre:  ④  DESARROLLAR lo que el dueño ya validó (devs, aislado, local)
```

1. **Generar + Analizar (horizontal):** creativos divergen ideas nuevas; analíticos filtran, dimensionan
   y costean con research real y fuentes. Mismo nivel, no apilados.
2. **Desafiar (red-team de 2):** R1 ataca mercado/demanda/moat; R2 ataca plata/ejecución. Solo pasa lo
   que sobrevive.
3. **Entregar al dueño:** resumen ejecutivo con números (build, COGS, precio, margen, break-even) y una
   recomendación clara. **Este es el punto de contacto con el dueño.**
4. **Visión del dueño (la cúspide):** el dueño prioriza, marca dirección para el próximo ciclo, y **gatea**
   qué pasa a desarrollo y qué se publica. Su visión alimenta el ciclo siguiente.
5. **Desarrollar (en paralelo):** los devs construyen los MVP validados, aislados y locales, hasta el
   primer peso. No esperan al próximo ciclo de research.

## Roles
- **🎯 Dueño (cúspide):** visión, prioridad, gates (dev / deploy). No ejecuta; dirige.
- **🎯 PMO:** orquesta el ciclo, integra, es el único que consolida y reporta al dueño.
- **🎨 Creativos + 📊 Analíticos:** la capa horizontal de generación+análisis.
- **⚔️ Red-team (2):** el filtro adversarial antes de cada entrega.
- **🛠️ Desarrolladores:** construyen lo validado, en carpetas aisladas (`productos/<slug>/`).
- **📣 Reportero ejecutivo (NUEVO):** mantiene vivo el tablero `STATUS-NEGOCIOS.md` — la lista
  autocontenida de TODOS los negocios (qué es de cero + estado + números precisos), escrita para que
  alguien sin contexto la entienda. Lo refresca al cierre de cada ciclo y cuando el dueño pide "status".
- **🔎 Scout de mercado (a demanda):** se suma cuando hace falta traer señales nuevas o evitar repetir
  negocios; alimenta a los creativos del ciclo siguiente.
- **📣 Célula de Marketing y Publicidad (2 agentes) — corre ANTES del desafiador:** analiza **TODOS** los
  negocios del ciclo (viabilidad real de adquisición: canal dominante, CAC estimado, si el paid cierra o
  no) y su lectura **entra a la cola como input del desafiador** — porque la distribución es el cuello
  real, el desafiador decide con la realidad comercial sobre la mesa. Después, potencia los que pasan a
  producción. Analiza **qué estrategia PROBADA sirve de verdad**, con **fuentes reales** y **sin sesgo**.
  (1) **Estratega de Growth/Go-to-market:** canal de adquisición, posicionamiento, embudo, retención,
  qué palanca mueve la aguja según casos y datos reales del rubro. (2) **Analista de Performance/
  Publicidad:** medios pagos (Meta/Google/WhatsApp), CAC/ROAS reales, creatividades, medición y qué
  NO hacer. Regla: nada de humo publicitario; cada recomendación con evidencia y aplicable a AR.
  Charter: `marketing/FUNDAMENTO.md`.
- **🚀 Equipo de ejecución (se activa con el GO):** Constructor + Diseño & Marca + Cobro & Fiscal +
  Growth + Operaciones. Pone en marcha end-to-end el negocio que el dueño manda a ejecutar. Runbook y
  roster en `EQUIPO-EJECUCION.md`. Se dispara con **"GO [negocio]"**.
- **🛰️ Célula de Inteligencia de Señales (Noticias → Oportunidades, corre a diario):** sub-célula con
  **PMO experto propio** y roster (Curador de Fuentes, Verificador/Fact-check, Analista de Señales,
  Traductor a Oportunidades). Se informa de noticias **confiables** (globales + locales AR), las verifica
  contra fuente primaria, las analiza y las **transforma en briefs de oportunidad** para los creativos.
  Es el primer eslabón del sprint. Constitución completa en `inteligencia-senales/FUNDAMENTO.md`.
  Entregable: radar diario fechado en `radar/`.
- **🎨 Banca creativa ampliada:** el equipo creativo escala a **varios agentes por ciclo**, cada uno con
  un ángulo distinto (regulatorio, tecnológico, arbitraje local, integración pública/privada), para
  cubrir más oportunidades en paralelo. Vamos con todo.
- **📊 Célula de Ingeniería de Datos (sube el nivel de los análisis):** expertos en datos que le dan
  RIGOR CUANTITATIVO a cada análisis, para que los números dejen de ser corazonadas:
  - **Dimensionamiento con datos reales:** TAM/SAM/SOM desde fuentes duras (censo, AFIP/ARCA, INDEC,
    padrones, Google Trends, volúmenes de búsqueda, datasets públicos), no estimaciones al ojo.
  - **Señales de demanda medibles:** volumen de búsqueda, tendencias, tamaño de padrones/rubros,
    densidad de competidores por zona — para validar o matar una hipótesis con evidencia.
  - **Modelado de unit economics y sensibilidad:** COGS de IA por uso real, curvas de CAC/LTV, break-even
    con escenarios (piso/base/techo), y qué variable mueve la aguja.
  - **Pipelines reproducibles:** dejan el cómo se obtuvo cada número (fuente + método) para que se pueda
    re-correr y auditar. Alimentan a Consultores, Analíticos y al Desafiador con datos, no opiniones.
  - Regla: **fuentes citadas y método explícito**; nada de números sin trazabilidad.

## Entregable permanente para el dueño
- **`STATUS-NEGOCIOS.md`** es el parte de situación estable: se pide con **"status"** y siempre tiene la
  lista completa de negocios, su estado y los números clave (build, COGS, precio, margen, break-even).

## Cadencia
- **1 sprint / semana** por defecto (configurable). Se dispara con un **trigger recurrente** que reabre
  el ciclo, refresca `STATUS-NEGOCIOS.md` y reporta al dueño.
- **El ciclo corre HASTA QUE EL DUEÑO LO FRENE.** Se pausa cuando el dueño dice "frená" (el PMO
  desactiva el trigger); se reanuda cuando dice "seguí".
- Cada ciclo **no repite** negocios ya cubiertos: busca ángulos nuevos o profundiza sobrevivientes.

## Bajadas de línea del dueño (foco permanente del equipo creativo + analítico)

> El dueño fija hacia dónde apuntar en cada ciclo de generación. Estas líneas **mandan** sobre el
> brainstorm: si una idea no encaja con el foco, no se propone.

### Para los CREATIVOS — nutrirse de la actualidad (obligatorio)
- **Alimentarse de NOTICIAS globales + del mercado LOCAL argentino** todos los días: macroeconomía,
  regulación (ARCA/AFIP, ANSES, BCRA), tecnología, IA, movimientos de plataformas, tendencias de consumo.
- **Cazar la oportunidad emergente y usar la tecnología para sacarle rédito rápido.** El que llega
  primero a una oportunidad de mercado gana; la ventana se cierra.
- **Cada idea ata a una señal real y actual** (una noticia, un cambio regulatorio, una tendencia tech),
  no a una intuición abstracta. La señal + su fecha + su fuente van en la propuesta.
- **Revisar BOLETINES OFICIALES y fuentes de NUEVA LEGISLACIÓN/REGULACIÓN** (creativos **y** analíticos):
  Boletín Oficial nacional (BORA), boletines provinciales, InfoLEG, normativa y RG de ARCA/AFIP, BCRA,
  ANSES, ministerios. Una **obligación o un derecho nuevo crea un mercado** el día que se publica →
  cazar el **gap/oportunidad** apenas sale. Llegar primero a la ventana regulatoria es la ventaja.

### Para el DESAFIADOR — rango ampliado (retorno lento/pasivo permitido)
- **Se permiten negocios de retorno LENTO, SUSTENTABLE y de INGRESOS PASIVOS.** No matar una idea solo
  porque tarda en madurar, crece despacio o es de ticket chico: si es **sustentable, de bajo
  mantenimiento y deja margen**, es válida. Horizonte de 12–18 meses es aceptable.
- **Seguí descartando con eficacia, pero por razones REALES:** sin demanda comprobable, sin moat / lo
  comoditiza una plataforma grande, competidor local ya lo tiene resuelto, unit economics negativos, o
  dependencia fatal de una plataforma. **NO** descartar por "es lento", "es pasivo" o "es chico".
- Reabre a revisión lo que se mató antes por lentitud (ej. newsletter con sponsors, comparadores de
  afiliados, directorios): re-evaluarlos con el rango nuevo.
- **Buscamos DOS tipos de ganador, y ambos valen por igual:** (a) el de **gran beneficio / escala** y
  (b) el **pasivo pero SUSTENTABLE** (bajo mantenimiento, ingreso estable en el tiempo). Poné atención a
  los dos: no descartes un pasivo sólido por no ser un cohete, ni un cohete por ser exigente. Etiquetá
  cada negocio con su perfil (💥 alto beneficio / 🌱 pasivo sustentable / ⚖️ mixto).
- **Desafialos con TRIPLE filtro:** (1) **fuentes reales** (competidores, precios, padrones), (2)
  **análisis de Ingeniería de Datos** (TAM/SAM/SOM, demanda medible, unit economics con método), y (3)
  **audacia de calle + olfato de operador** — criterio de alguien que puso plata propia y estuvo en la
  cancha, no teoría de PowerPoint. Cuando los datos y el olfato chocan, explicá por qué y quién gana.
- **PRIORIZÁ lo REALIZABLE YA y de BAJO COSTO de arranque.** Entre dos negocios válidos, va **primero el
  que se puede ejecutar ahora con poca plata y poco tiempo**. El índice y la recomendación deben empujar
  al frente lo *achievable + barato*; los de gran beneficio pero costosos/lentos de arrancar quedan en
  cola detrás (no descartados — encolados). Marcá para cada uno: **realizable ahora (sí/no)** y **costo de
  arranque (bajo/medio/alto)**, y ordená la cola por eso.

### Rueda ya inventada — clonar lo PROBADO y adaptarlo al mercado local (bajada del dueño)
- **Analizar y transformar negocios YA PROBADOS y funcionando afuera** (EE.UU./Europa/Brasil, con
  revenue real y cifras verificables) y **adaptarlos al mercado local real argentino**. No hace falta
  inventar todo de cero: la rueda inventada + localización seria es una fuente de negocios de primera.
- **Método (validado en Wave 14):** (1) evidencia de que factura afuera (fuente + cifra); (2)
  **verificación obligatoria de competencia local** — el hueco AR tiene que ser real, este error ya nos
  mató 6+ negocios; (3) que el poder de compra argentino banque el pricing localizado; (4) **anclaje
  local como moat**: pesos, WhatsApp, Mercado Pago, obras sociales, AFIP/entes públicos, inflación —
  lo que el player global no copia fácil; (5) medir la ventana antes de que el global agregue español.
- Casos de referencia en cartera: Disputa Ganada (Chargeflow), Escriba (Abridge/Freed), Débito
  Devuelto (Adonis), Costo al Plato (MarginEdge), Cómputo Exprés (Handoff), Carga al Día (HappyRobot).

### Para TODOS los agentes — salir del sesgo del modelo
- **Salir del sesgo clásico de los LLM.** No proponer lo primero/obvio que cualquier modelo tiraría
  (otro chatbot, otro wrapper de IA, otro dashboard, otra "agencia de automatización"). Si suena a idea
  genérica de demo, **descartarla**.
- **Ser genuinamente innovador y creativo.** Buscar el ángulo no obvio: combinaciones inusuales,
  pensamiento de segundo orden, contrarian ("qué cree todo el mundo que es verdad y no lo es"),
  arbitrajes locales, integraciones que nadie enchufó todavía.
- **Novedad con sustancia, no rareza por la rareza.** La idea rara tiene que resolver algo real y poder
  cobrarse. Innovar en el ángulo/modelo, no solo en el nombre.
- Aplica a **todos los roles**: creativos (generan distinto), analíticos (no castigan lo nuevo por ser
  desconocido; lo miden bien), red-team (desafían sin matar lo innovador por prejuicio), reporte (lo
  explican simple).

- **Mercado LOCAL argentino primero** — pensar para acá: comportamiento pyme, informalidad, capacidad
  real de pago, WhatsApp, estacionalidad, inflación.
- **Integraciones con entes PÚBLICOS y PRIVADOS como diferencial** — buscar oportunidades que se
  enchufen a organismos públicos (ARCA/AFIP, ANSES, municipios, registros, organismos provinciales) y a
  privados (bancos, billeteras, obras sociales, cámaras, MercadoLibre). Esa integración es un moat que no
  se copia fácil.
- **Vendibles** — con demanda real y alguien que pueda y quiera pagar. Nada de "lindo pero no lo compra
  nadie".
- **Que resuelvan un problema real de la sociedad** — esos son los que remuneran de verdad y sostienen
  el negocio. El impacto social y la plata van juntos, no separados.

## Memoria de la célula (ADR)
La experiencia acumulada —motor, equipos, bajadas de línea y **aprendizajes duros**— vive en
**`adr/ADR-CELULA-001-metodologia-y-aprendizajes.md`**. Es un **doc vivo**: el Reportero lo amplía al
cierre de cada ciclo con lo aprendido, para no volver a recordar de memoria y mejorar cada vuelta.

## Reglas permanentes (aprendidas en los ciclos 1-2)
- **Validar competencia LOCAL antes de puntuar alto** — el "hueco en español" hay que probarlo (así
  murieron 4 negocios en la ronda 2).
- **Todo lo conversacional/voz se cobra por USO**, nunca flat (la voz cuesta 15-30× el texto).
- **Ads sobre tráfico argentino no alcanza** (RPM Tier 3) — hace falta afiliado/producto/sponsor.
- **El costo real no es construir (barato con Claude Code), es DISTRIBUIR/vender.**
- **Local sin publicar** hasta OK explícito del dueño. Gates de deploy/DB siguen vigentes.

## Estado del motor
- **Ciclo 1 (ronda 1):** 12 negocios → portfolio + recomendación.
- **Ciclo 2 (ronda 2):** 23 ideas → 10 finalistas → red-team → 2 sobrevivientes limpios + 2 comodines.
- **Desarrollo activo (kickoff 2026-07-06):** Plantillería, Testigo, Kudos, Fantasma (`productos/`).
- **Próximo ciclo:** disparado por el trigger semanal; el dueño marca la dirección al recibir la entrega.
