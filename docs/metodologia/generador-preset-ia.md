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

### ENTRADA (lo único que aporta el prospecto)
**El cliente da SOLO su link de RED SOCIAL (Instagram, TikTok, Facebook) y/o su PÁGINA ACTUAL
(web/tienda). Nada más.** Ni formularios, ni fichas, ni catálogos cargados a mano. *Por qué mínima:*
**fricción cero para el prospecto** — pedirle un link es un "sí" fácil; pedirle que llene datos lo
frena. Cuanto más rico el material que ya tiene publicado, mejor el preset; con poco, se generan
provisionales marcados y se piden capturas de lo que esté tras login.

### FLUJO (los agentes, automático — el mismo patrón que ya hicimos a mano)
1. **INGESTAN** esa red/web y **EXTRAEN**: **rubro** · **identidad** (colores, logo, tono/voz) ·
   **catálogo/servicios** · **ofertas/promos** · **historia / "quiénes somos"** · **medios de contacto**
   (WhatsApp, dirección, horarios, redes).
2. **GENERAN la PREVENTA EXPERTA adaptada** = el **preset completo**: tenant + **blueprint del rubro** +
   **branding** (color/logo recreado/tono) + **datos de demo del rubro** + **probador listo**, todo con
   **Auditoría SAP + Sello GSG**.
3. **Queda listo para mostrarle al cliente su producto ya adaptado a su marca** — "así opera TU negocio
   con nosotros", en la primera reunión.

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

**ENTRADA (lo ÚNICO que aporta el prospecto):** su **link de red social** (Instagram/TikTok/Facebook)
**y/o su web/tienda actual**. Nada más (ver "El corazón", arriba). De ahí los agentes **extraen** todo:
rubro · identidad (colores, logo, tono) · catálogo/servicios · ofertas · historia/"quiénes somos" ·
medios de contacto. Lo que esté tras login → se pide como captura. Con poco material → provisionales
marcados.

**PASOS (los ejecuta el agente — sistematizan el playbook manual `docs/preventa/playbook-lectura-redes-a-tenant.md`):**

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
8. **Auditar**: pasar **SAP Fiori (7 ángulos)** + **sello GSG** antes de mostrarlo (Gate de Excelencia).

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

## Auditoría SAP + Sello GSG (obligatorios en cada preset)
Un preset es un entregable → **pasa el Gate de Excelencia** antes de mostrarse:
- **Auditoría SAP Fiori (7 ángulos)** — `docs/metodologia/auditoria-sap-fiori.md`: el probador del
  cliente tiene que ser role-based, coherente, simple, adaptable, delightful, accesible y consistente.
- **Sello GSG** — `docs/metodologia/estandar-marca-gsg.md`: el probador lleva la marca **del cliente**
  visible; **GSG es el sello de calidad detrás** (identidad de calidad + marcador verificable en el
  backoffice/metadatos, sin pisar la marca del cliente).

---

## Cómo lo invoca un sprint (transversal, en minutos)
Cualquier sprint que dé de alta un cliente nuevo **invoca este generador** como su flujo de onboarding:

1. **Reunir entradas** (marca + rubro + referencias digitales del prospecto).
2. **Correr el flujo** (8 pasos) → generar el preset (6 componentes).
3. **Publicar el probador** (FASE 1, sin secretos) con el playbook `demo-publica-costo-cero.md` → URL
   `.vercel.app` gratis del cliente → **mostrar en preventa**.
4. **Si cierra:** FASE 2 — el dueño pega las credenciales, se corre el provisioning real, RLS enforced.
5. **Gate de Excelencia** (SAP + GSG + Arquitectura + Confiabilidad) antes de integrar cualquier código.
6. **Actualizar `docs/ESTADO-ACTUAL.md`** (nuevo tenant/preset) y dejar la receta del cliente en
   `docs/tenants/<slug>/`.

### Checklist del preset (tildá al generarlo)
- [ ] **Ficha** del negocio (modelo de venta, tono, incumbente) escrita.
- [ ] **Rubro → blueprint** resuelto (o comodín justificado) · **slug + subdomain** definidos.
- [ ] **Branding** generado (acento, logo/monograma recreado, wording afinado al tono).
- [ ] **Datos de demo** por rubro sembrados + líneas del negocio, **marcados provisionales**, sin secretos.
- [ ] **Probador** navegable del cliente (FASE 1, `force-static`, sin base ni credenciales).
- [ ] **Auditoría SAP (7 ángulos)** + **sello GSG** pasados.
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

— Elaborado por **Gestión Studio Grow (GSG)**.
