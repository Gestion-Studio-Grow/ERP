# 🤖 Fundamento — GENERADOR DE PRESET POR IA (preventa/onboarding en minutos)

**Qué es:** la metodología **transversal** que eleva la adaptación manual de preventa (la que hicimos a
mano con Magra: leer sus redes → armar tenant + blueprint) a un **flujo donde la IA GENERA el preset del
cliente de una**: identidad, ruteo, marca, datos de demo y la **instancia del probador lista para
mostrar**. Es el motor de escala de la venta: **dar de alta un cliente nuevo en minutos, no en días.**

**Estado honesto:** hoy el "generador" **son los agentes** ejecutando este flujo de forma sistematizada
(la IA lee, decide y arma), apoyados en los playbooks manuales ya probados. La automatización mayor (un
comando/pantalla "1-clic") es el norte; esta metodología es el estándar que la hace repetible y
mejorable mientras tanto. **Coordina con Célula 3** (motor del probador): el preset es lo que **alimenta**
ese motor.

> **Es un PASO OBLIGATORIO del onboarding.** Todo alta de cliente nuevo se hace generando su preset con
> este método — no se improvisa un tenant a mano por fuera. Registrado en `docs/METODOLOGIA-SPRINT.md`,
> `.claude/commands/sprint.md` y `CLAUDE.md`.

---

## 🎯 EL CORAZÓN — "el cliente da su red/web → los agentes arman la preventa experta"

Toda la metodología se resume en una frase. Lo demás es el detalle de cómo se cumple.

### ENTRADA (dos cosas del prospecto: su material + su OK)
1. **Su link de RED SOCIAL (Instagram, TikTok, Facebook) y/o su PÁGINA ACTUAL (web/tienda).** Nada más
   de datos: ni formularios, ni fichas, ni catálogos a mano. *Por qué mínima:* **fricción cero** —
   pedir un link es un "sí" fácil; pedir que llene datos lo frena. Cuanto más rico el material publicado,
   mejor el preset; con poco → provisionales marcados + se piden capturas de lo que esté tras login.
2. **Su AUTORIZACIÓN EXPLÍCITA** para que repliquemos su marca/contenido/imágenes en la preventa/demo
   (ver "Paso de autorización", abajo). **Es obligatoria y se registra.**

> **🔒 SIN AUTORIZACIÓN REGISTRADA, NO SE GENERA NI SE MUESTRA EL PRESET.** El OK del cliente es una
> **precondición dura del flujo**, antes de ingerir/replicar nada (no "lo pedimos después").

### FLUJO (los agentes, automático — el mismo patrón que ya hicimos a mano)
1. **INGESTAN** esa red/web y **EXTRAEN**: **rubro** · **identidad** (colores, logo, tono/voz) ·
   **catálogo/servicios** · **ofertas/promos** · **historia / "quiénes somos"** · **medios de contacto**
   (WhatsApp, dirección, horarios, redes).
2. **GENERAN la PREVENTA EXPERTA adaptada** = el **preset completo**: tenant + **blueprint del rubro** +
   **branding** (color/logo recreado/tono) + **datos de demo del rubro** + **probador listo**.
3. **AUDITAN por TODA la metodología (Gate de Excelencia completo) — paso BLOQUEANTE:** Auditoría SAP
   Fiori (5 principios + accesibilidad + consistencia) **+** Sello de Marca GSG **+** Arquitectura **+**
   Confiabilidad. **No es opcional ni "se revisa después".**
4. **Recién si pasó el Gate**, queda listo para **mostrarle al cliente su producto adaptado a su marca**.

> ## 🚫 REGLA NO NEGOCIABLE — el preset NO se muestra si no pasó el Gate
> **Todo preset/preventa que genere la IA pasa por la METODOLOGÍA COMPLETA antes de mostrarse al
> cliente.** El orden es **generar → auditar (SAP + GSG + Arquitectura + Confiabilidad) → recién ahí
> mostrar**. Un preset que no tilda los **4 bloques del Gate de Excelencia** (con SAP y GSG **sí o sí**)
> **NO se entrega ni se muestra**: vuelve al agente hasta que pase. La auditoría es parte del acto de
> generar, no un trámite posterior. *Por qué:* lo que sale con nuestra cara es la carta de presentación
> — un preset sin auditar puede tener un defecto de UX/accesibilidad/marca que quema la venta y la
> reputación GSG. El nivel se garantiza ANTES de que el cliente lo vea, no después.

### Prueba de concepto (ya lo hicimos a mano — ahora se formaliza y automatiza)
Esto no es teoría: es el **mismo patrón que ya ejecutamos manual**, ahora convertido en método repetible.
- **Break Point Pádel — desde su INSTAGRAM.** Leímos su red (club de pádel, tono "club de amigos y
  amigas", identidad, servicios) y armamos su preventa/probador (`docs/artefactos/breakpoint-preventa.html`)
  → se materializó en el tenant **`adosmanos`** (blueprint `servicios`/turnos). *Entrada: un Instagram.*
- **Magra — desde su WEB.** Leímos su web (boutique premium de carnes envasadas al vacío, delivery +
  WhatsApp, incumbente Bistrosoft) y armamos el tenant **`magra`** (blueprint `carniceria`) con su catálogo
  y tono (ver `docs/preventa/analisis-redes-magra.md` + `docs/tenants/magra/`). *Entrada: una web.*
- También **Shine Velas** (`docs/artefactos/shinevelas-preview.html`) siguió el patrón (rubro `velas`).

**La tarea de esta metodología es que ese patrón lo repita CUALQUIER sprint, con nivel GSG, sin
re-descubrirlo.** Los pasos de abajo son la versión sistematizada de lo que hicimos con Break Point y Magra.

---

## 🔒 PASO DE AUTORIZACIÓN DEL CLIENTE — obligatorio, ANTES de generar

**Regla dura:** antes de **replicar o usar la marca, el contenido o las imágenes** de un cliente, hay que
**pedirle y REGISTRAR su autorización explícita**. **Sin esa autorización registrada, no se genera ni se
muestra el preset.** No es un trámite posterior: es una **precondición** del flujo (paso 0), igual que
hicimos con Magra.

### Qué se pide (y qué se registra)
- **Consentimiento explícito** del cliente para que **repliquemos su identidad** (marca, colores, logo,
  copy, catálogo, fotos) en una **preventa/demo** nuestra. Idealmente también confirmación de que el
  cliente es **dueño del material** (o del estudio que hizo su web/redes).
- **Se registra en el recipe del tenant** (`docs/tenants/<slug>/…`): quién autorizó, qué alcance (¿su
  web?, ¿sus fotos?, ¿su catálogo?), y de dónde salió el material. Precedente: `docs/tenants/magra/replica-web-demo.md`
  ("el dueño confirmó que el estudio (@noctiluma) es suyo → autorización total") y la regla
  "Autorización primero" de `docs/preventa/playbook-replica-web-a-tenant.md`.
- **Alcance limitado:** si el cliente autoriza solo parte (p. ej. su catálogo sí, sus fotos no), el
  preset respeta ese límite → lo no autorizado se reemplaza por **placeholder de marca GSG** o se omite.

### Por qué (no es burocracia)
- **Respeto de marca y derechos.** La identidad, el copy y las fotos son **propiedad del cliente** (o de
  terceros que se los hicieron). Replicarlos sin permiso es un problema legal y de reputación. Pedir el
  OK es lo correcto y nos cubre.
- **Confianza comercial.** Pedir permiso **antes** de tocar su marca arranca la relación con respeto —
  el cliente ve que cuidamos lo suyo. Un prospecto que descubre que copiamos su web sin avisar
  desconfía; uno al que le pedimos permiso, se siente tratado en serio. La autorización **es parte de la
  venta**, no un obstáculo.

---

## Por qué (el fundamento comercial)

1. **ESCALA.** A mano, cada cliente es un proyecto artesanal (horas de lectura + armado). Un generador
   convierte eso en un flujo de **minutos** → podemos captar y mostrar muchos prospectos sin cuello de
   botella humano. La venta deja de estar limitada por cuánta gente arma tenants.
2. **CONSISTENCIA.** Un método único (con auditoría SAP + sello GSG) garantiza que **todo preset sale con
   el mismo nivel**, sin depender de quién lo arme. Es la diferencia entre "una demo linda porque la hizo
   Fulano" y "todas nuestras demos son de nivel GSG".
3. **ÉXITO COMERCIAL.** El prospecto ve **su** negocio funcionando —su marca, su catálogo, su tono— en un
   probador navegable, en la primera reunión. Eso convierte: no vendés un ERP abstracto, mostrás *"así
   opera TU negocio con nosotros"*. El preset es la herramienta de cierre.

---

## Definición formal de PRESET

Un **preset** es el **paquete completo, generado a partir de los datos de un cliente nuevo** (marca,
rubro, referencias, su Instagram/web), que deja al cliente listo para **verse y probarse**. Tiene **6
componentes**, todos derivados de la lectura del prospecto:

| # | Componente | Qué es | De dónde sale |
|---|---|---|---|
| 1 | **Ficha del negocio** | Modelo de venta, rubro, tono, posicionamiento, sistema incumbente a reemplazar | Lectura de redes/web (método, abajo) |
| 2 | **Ruteo + estructura** | `slug` + `subdomain` + **blueprint del rubro** correcto (o comodín `generico`) | Ficha → `resolveBlueprint()` / `--blueprint` |
| 3 | **Identidad / branding** | Acento/color, **logo/monograma recreado**, tema claro/oscuro, wording del rubro afinado al tono del negocio | Marca y tono leídos → `branding.ts` + wording |
| 4 | **Datos de demo por rubro** | Catálogo/servicios de ejemplo sembrados por el blueprint + líneas específicas del negocio, **marcados provisionales**. **Sin transaccionar, sin passwords.** | Blueprint del rubro + catálogo real leído |
| 5 | **Instancia del PROBADOR** | El preset renderizado en el motor de Célula 3: un sandbox navegable del negocio, listo para preventa | Componentes 1–4 → motor del probador (Célula 3) |
| 6 | **Sello de calidad** | Auditoría **SAP Fiori** (7 ángulos) + **sello GSG** aplicados al preset | Gate de Excelencia (obligatorio) |

> **Un preset NO incluye:** credenciales, `DATABASE_URL`, contraseñas, ni datos reales de clientes. Eso
> es de la **FASE 2** (datos reales) y lo carga el dueño. El preset vive entero en la **FASE 1 (probador
> público, cero secretos)** — ver `docs/metodologia/demo-publica-costo-cero.md`.

---

## El flujo del generador (entradas → pasos IA → salidas)

**ENTRADA:** (a) su **link de red social** (Instagram/TikTok/Facebook) **y/o su web/tienda actual**; y
(b) su **AUTORIZACIÓN explícita** para replicar su identidad (ver "Paso de autorización", arriba). De
(a) los agentes **extraen** todo: rubro · identidad (colores, logo, tono) · catálogo/servicios · ofertas
· historia/"quiénes somos" · medios de contacto. Lo que esté tras login → captura. Con poco material →
provisionales marcados.

**PASOS (los ejecuta el agente — sistematizan el playbook manual `docs/preventa/playbook-lectura-redes-a-tenant.md`):**

0. **🔒 AUTORIZACIÓN (precondición BLOQUEANTE)** → pedir y **registrar** el consentimiento explícito del
   cliente (en `docs/tenants/<slug>/`). **Sin esto no se ingiere ni se genera nada.** (Ver la sección
   "Paso de autorización".)
1. **Leer la presencia digital** → mapear web/IG/Linktree/Google. La web y el Linktree suelen ser la
   fuente de oro; lo que está tras login se pide como captura.
2. **Leer el MODELO de venta** (no solo qué vende: *cómo*) → mostrador vs envasado, presencial vs
   delivery, canal de pedido (local/web/WhatsApp). *Este insight reorienta el preset entero* (ej. Magra:
   boutique premium envasada + delivery, no carnicería de mostrador).
3. **Resolver rubro → blueprint** (`resolveBlueprint()`; comodín `generico` si no matchea). *Por qué:*
   fija catálogo/flujo/módulos base sin escribir código (config, no fork).
4. **Extraer catálogo + operación** → productos/servicios, proveedores (dan nivel), delivery/zonas,
   medios de pago. Lo genérico va al **rubro**; lo específico del negocio, al **tenant** (regla que no se
   negocia: config por rubro ≠ config por tenant).
5. **Generar identidad/branding** → acento/color del negocio, **logo/monograma recreado**, tema, y
   **afinar el wording** del rubro al tono real (formal vs descontracturado, tagline).
6. **Sembrar datos de demo** por rubro (seed idempotente del blueprint) + las líneas específicas leídas,
   **todo marcado provisional**, sin transaccionar.
7. **Materializar la instancia del probador** (motor de Célula 3) con los componentes 1–6 → un sandbox
   navegable del negocio.
8. **Auditar (BLOQUEANTE) por toda la metodología — Gate de Excelencia completo**: SAP Fiori (5
   principios + accesibilidad + consistencia) **+** sello GSG **+** Arquitectura **+** Confiabilidad.
   **El preset NO se muestra si no pasó.** Recién con el Gate en verde se entrega (ver la regla no
   negociable en "El corazón").

**SALIDAS:** el **preset** (los 6 componentes) → (a) el **probador vivo** para preventa (FASE 1, sin
secretos, URL `.vercel.app` gratis por cliente, ver el playbook de demo a costo cero); y (b) la **receta
de provisioning** lista para el alta real (FASE 2) cuando el cliente cierra — `scripts/provision-tenant.ts`
+ `scripts/set-tenant-subdomain.ts`, con las credenciales que **pega el dueño**.

---

## Coordinación con Célula 3 (motor del probador)

**División de responsabilidades — el preset es el CONTRATO entre ambos:**
- **Este método (preventa/onboarding)** *genera el contenido del preset*: ficha, ruteo, branding,
  catálogo demo por cliente.
- **Célula 3** *diseña y mantiene el MOTOR del probador* (`src/app/demo/`, hoy `force-static`, genérico
  "Estudio Aura"): la mecánica del tour/sandbox, animaciones, CTA, aislamiento de prod.
- **El preset ALIMENTA el motor:** el objetivo compartido es que el motor pase de un demo genérico a uno
  **parametrizado por preset** (branding + catálogo + wording del cliente), manteniendo su garantía dura
  (`force-static`, **sin tocar base/credenciales/`process.env`**, sin datos reales). El preset le entrega
  ese contenido como **datos de ejemplo** (estilo `demo-content.ts`), nunca como conexión a la DB.

> **Acuerdo de interfaz (a cerrar con Célula 3):** el preset expone su contenido como un objeto de datos
> de ejemplo (marca, catálogo, wording, escenas) que el motor consume. Mientras el motor sea genérico, el
> preset se muestra igual vía el probador base + la URL del tenant; cuando el motor acepte parámetros, el
> preset los llena. Ver `docs/demo/README.md` (Célula 3).

---

## 🛡️ GATE DE ENTREGA del preset — BLOQUEANTE, no negociable
Un preset es un entregable de cara al cliente → **pasa el Gate de Excelencia COMPLETO (4 bloques) antes
de mostrarse.** El preset **NO se entrega/muestra si no pasó el Gate**; vuelve al agente hasta que pase.
Detalle del Gate en `docs/METODOLOGIA-SPRINT.md → "GATE DE EXCELENCIA"`.

1. **🔎 Auditoría SAP Fiori — completa (5 principios + accesibilidad + consistencia)** —
   `docs/metodologia/auditoria-sap-fiori.md`. El probador del cliente tiene que ser role-based, coherente,
   simple, adaptable, delightful/enterprise, **accesible** y **consistente**. **Sí o sí.**
2. **🏷️ Sello de Marca GSG** — `docs/metodologia/estandar-marca-gsg.md`. El probador lleva la marca **del
   cliente** visible; **GSG es el sello de calidad detrás** (identidad de calidad + marcador verificable
   en backoffice/metadatos, sin pisar la marca del cliente). **Sí o sí.**
3. **Arquitectura** — capas/límites, testabilidad, multi-tenant (`tenantId`), no evade RLS, deuda anotada.
4. **Confiabilidad** — `tsc`+`build`+`test` verdes, aislamiento por tenant, manejo de errores, no rompe prod.

> **El orden es parte de la regla:** *generar → auditar (los 4 bloques) → recién ahí mostrar.* La
> auditoría es parte del acto de generar, **nunca** un "lo revisamos después de mostrárselo al cliente".

---

## Cómo lo invoca un sprint (transversal, en minutos)
Cualquier sprint que dé de alta un cliente nuevo **invoca este generador** como su flujo de onboarding:

1. **🔒 Autorización primero** → pedir y **registrar** el OK explícito del cliente para replicar su marca
   (en `docs/tenants/<slug>/`). **Sin autorización registrada, NO se arranca.**
2. **Reunir la entrada** (su red social y/o web) + **correr el flujo** → generar el preset (6 componentes).
3. **🛡️ AUDITAR por toda la metodología (Gate de Excelencia completo) — BLOQUEANTE:** SAP (5 principios +
   a11y + consistencia) + Sello GSG + Arquitectura + Confiabilidad. **Si no pasa, NO se muestra:** vuelve
   al agente. *(Este paso va ANTES de mostrar, siempre.)*
4. **Recién si pasó el Gate → publicar el probador** (FASE 1, sin secretos) con el playbook
   `demo-publica-costo-cero.md` → URL `.vercel.app` gratis del cliente → **mostrar en preventa**.
5. **Si cierra:** FASE 2 — el dueño pega las credenciales, se corre el provisioning real, RLS enforced
   (y todo código que se integre vuelve a pasar el Gate).
6. **Actualizar `docs/ESTADO-ACTUAL.md`** (nuevo tenant/preset) y dejar la receta del cliente en
   `docs/tenants/<slug>/`.

### Checklist del preset (tildá al generarlo — el Gate es condición para mostrar)
- [ ] **🔒 Autorización del cliente PEDIDA y REGISTRADA** (en `docs/tenants/<slug>/`), con su alcance.
      **Sin esto no se genera ni se muestra.**
- [ ] **Ficha** del negocio (modelo de venta, tono, incumbente) escrita.
- [ ] **Rubro → blueprint** resuelto (o comodín justificado) · **slug + subdomain** definidos.
- [ ] **Branding** generado (acento, logo/monograma recreado, wording afinado al tono).
- [ ] **Datos de demo** por rubro sembrados + líneas del negocio, **marcados provisionales**, sin secretos.
- [ ] **Probador** navegable del cliente (FASE 1, `force-static`, sin base ni credenciales).
- [ ] **🛡️ GATE DE ENTREGA pasado (BLOQUEANTE):** Auditoría SAP (5 principios + a11y + consistencia) +
      Sello GSG + Arquitectura + Confiabilidad. **Sin esto NO se muestra al cliente.**
- [ ] Receta de provisioning lista para FASE 2 (alta real la dispara el dueño con sus credenciales).

---

## Entrenamiento de los agentes (repetir y mejorar)
Este método **entrena a los agentes de preventa/onboarding** para repetirlo con nivel. La base de
conocimiento que sistematiza (leer y no re-descubrir):
- `docs/preventa/playbook-lectura-redes-a-tenant.md` — los 7 pasos manuales (fuente del flujo).
- `docs/preventa/playbook-replica-web-a-tenant.md` — replicar una web como tenant.
- `docs/MODELO-ADAPTACION-PREVENTA.md` — los tres ejes (rubro × situación × profundidad).
- `docs/blueprints/presets-por-rubro.md` — los presets por rubro y sus archetipos.
- `docs/ONBOARDING-TENANT.md` — tiers y selector de blueprint.

**Mejora continua:** cada preset nuevo que revela un patrón (un rubro no modelado, un tono recurrente,
un incumbente frecuente) se **devuelve** a estos docs y a los blueprints — así el generador es **más
preciso en cada iteración**. Un rubro nuevo se modela como config (`src/blueprints/…`), nunca como fork.

---

## 📥 Fase de INGESTA/EXTRACCIÓN — el "Material de Marca" (contrato estándar)

> Esta sección formaliza la **primera fase del flujo** (los pasos 1–4 de "El flujo del generador"): la
> lectura del prospecto ahora produce una **salida estándar, estructurada y máquina-chequeable** —el
> **Material de Marca**— en vez de un `.md` distinto por caso. Es la forma verificable de la **Ficha del
> negocio** (componente 1) + los insumos de identidad/branding (componente 3) y catálogo demo
> (componente 4). Endurece la disciplina "no inventar" y le da a la fase de Adaptación un contrato claro.

**Contrato en código:** `src/preset/extraction/material-de-marca.ts` (tipos + validación + tests). Es
lógica pura, sin dependencias de servidor. API: `emptyMaterial()`, `field()`, `validateMaterial()`,
`completenessScore()`, `toProvisionHandoff()`.

**Regla de oro hecha chequeable.** Cada dato lleva `provenance`: `verificado` (visto en fuente pública,
exige `source`) · `provisional` (estimación marcada, con `note`) · `pedido-al-dueno` (no accesible, valor
nulo permitido). `validateMaterial()` bloquea las incoherencias (verificado sin fuente, "sin valor pero
verificado"). `completenessScore()` da el **gate** demo/prod: qué campos faltan para una demo creíble y
qué más pide producción. `toProvisionHandoff()` traduce a los flags del alta **sin inventar** (sólo emite
valores presentes; arrastra provisionales y bloqueantes marcados).

**Checklist de extracción con fallbacks** (`docs/metodologia/checklist-extraccion.md`): orden de barrido
fuente por fuente + qué hacer ante cada muro conocido —**Instagram login-gated**, **web/tienda que carga
por JS** (revela el incumbente), **marca sin logo/hex descargable** (acento provisional + logo recreado
en CSS/SVG para demo)—. Encapsula las lecciones de Magra y Break Point para que ningún agente las
redescubra.

**Schema legible** (para coordinar con Adaptación/Calidad sin leer el código):
`docs/metodologia/material-de-marca-schema.md` — campo por campo + el contrato de interfaz entre fases.

### Entrenamiento constante — registro de casos
El mecanismo que el dueño pidió para que el equipo **aprenda caso a caso**: cada extracción real deja una
entrada en `docs/metodologia/registro-casos/` (qué se extrajo, qué falló, qué se corrigió), y de ahí
salen heurísticas que se promueven al rollup (`registro-casos/heuristicas-aprendidas.md`) y a la
checklist. Casos semilla: `magra`, `breakpoint`. Es la versión con evidencia de la sección "Entrenamiento
de los agentes" de arriba: no sólo "devolvemos patrones a los docs", sino que **registramos cada caso y
medimos la mejora**.

---

— Elaborado por **Gestión Studio Grow (GSG)**.
