# Reporte QA — Productos terminados en vivo (4 clientes + demo)

**Fecha:** 2026-07-06
**Equipo:** Calidad / QA (GSG)
**Alcance:** los productos "terminados" que hoy sirven **front+back en la URL de cliente**
(`<cliente>-erp.vercel.app`) + la demo. Los `/previews` estáticos quedaron **deprecados**
(CLAUDE.md · CICLO DEMO→VENTA §1). Este reporte reemplaza al de previews para el estado vivo.
**Método:** solo lectura. Verificación real por **HTTP + navegador (DOM/consola/click)** sobre las
URLs en vivo, cruzada con el código fuente que las genera. Se ejercitó el carrito y el prompt
just-in-time de WhatsApp de verdad (click). No se tocó prod ni se arregló nada.

---

## Semáforo por producto

| Producto | URL | Carga | Catálogo/Carrito | WhatsApp just-in-time | Sello GSG | Veredicto |
|---|---|---|---|---|---|---|
| **CH Estética** | chestetica-erp | ❌ **root → /admin/login** | n/d (no se sirve la vidriera) | n/d | ausente | **🔴 CRÍTICO** |
| Magra | magra-erp | ✅ /tienda | ✅ 14 prod. $/kg, carrito OK | ✅ (compartido) | ausente | **🟠 con reservas de marca** |
| Shine | shinevelas-erp | ✅ /tienda | ✅ 10 prod., carrito OK | ✅ | ausente | **🟢 OK** (mismatch de categorías) |
| A Dos Manos | adosmanos-erp | ✅ /tienda | ✅ 20 prod., carrito **verificado** | ✅ **verificado** | ausente | **🟢 OK** (fotos + wording) |
| Demo | erp-ch/demo | ✅ | ✅ tour | ✅ (guardado) | marca GSG propia | **🟢 OK** |
| Consola Operador | erp-ch/operador | ✅ carga la consola | n/d (super-admin) | n/d | ausente | **🟢 OK estructura** (flujo full requiere `OPERATOR_PASSWORD`) |

**Titular:** 3 de 4 tiendas de cliente andan bien (carrito real + WhatsApp just-in-time sin número
placeholder, verificado con clicks; consola sin errores). **El producto faro, CH Estética, está
roto de cara al público: su dominio no sirve la vidriera de marca, cae en una pantalla de login.**
Es, casi con certeza, el *"no es lo que era"* que sintió el dueño. Aparte, hay **incoherencias de
marca en Magra** y el **sello GSG no está en ninguna app de tenant**.

---

## Checklist / metodología de QA (ACTUALIZADA — método corregido por el dueño)

> **Regla nueva, obligatoria de acá en más:** QA se hace **RECORRIENDO EL VIAJE DE USUARIO
> END-TO-END**, no verificando que las páginas "carguen". Se entra como una persona real, se navega,
> se **intenta entrar al backoffice**, se hace clic en los botones, se agrega al carrito, se dispara
> el WhatsApp, y se reporta **qué EXPERIMENTA el usuario en cada paso** — incluidos los **callejones
> sin salida** (links a cuentas inexistentes, botones que prometen algo y llevan a un muro, pasos sin
> salida clara).

Cada sitio se recorre así:
1. **Entrar** por la raíz como visitante → ¿qué ve primero? ¿es la vidriera de marca o un muro?
2. **Navegar** la vidriera → menú, anclas, secciones. ¿Algún link muerto / a destino equivocado?
3. **Comprar/reservar** → agregar al carrito / abrir reserva, ejercitar `+/−`, ver total.
4. **Disparar WhatsApp** → confirmar prompt just-in-time (nunca número placeholder) o número real.
5. **Intentar entrar al backoffice** → ¿hay punto de entrada visible? ¿demo sin password para mostrar?
   ¿o solo `/admin` con contraseña? ¿la pantalla de login lleva la marca correcta del tenant?
6. **Transversal:** carga sin error · consola limpia · fidelidad de marca · sello GSG · accesibilidad.

---

## Defectos priorizados

### 🔴 CRÍTICO

**C-1 · CH Estética: el dominio público NO sirve la vidriera — cae en /admin/login.**
Navegando a `https://chestetica-erp.vercel.app` (probado en navegador real) la URL termina en
`https://chestetica-erp.vercel.app/admin/login`, mostrando solo *"Beauty & Spa / Ingresar al panel /
Ingresar"*. Un cliente (o el dueño) que entra al link del negocio faro ve **un cajón de login**, no
la landing de CH (hero, servicios, equipo, reservas, el beneficio "vecino/a de La Alameda"). La
landing **existe en el código** (`src/app/(site)/page.tsx`, completa) pero **no se alcanza** en ese
deploy. El middleware (`src/proxy.ts`) sólo matchea `/admin` y `/operador`, y no hay `middleware.ts`
ni redirect de `/` en el repo → **la causa está en el estado del deploy** (host-mapping / CH todavía
sin republicar con su vidriera pública), no en un bug de código. Contraste: magra/shine/adosmanos
sirven su `/tienda` sin problema. **Impacto:** el producto que se muestra como estrella está, en la
práctica, caído hacia afuera. **Acción:** republicar el tenant CH sirviendo la vidriera pública en su
raíz y verificar `TENANT_HOST_MAP` para `chestetica-erp.vercel.app`. **Prioridad máxima.**

### 🟠 MEDIOS

**M-1 · Magra: contradicción de marca — "no es una carnicería" vs. footer "Carnicería premium".**
El hero dice, como identidad de MAGRA, *"Esto no es una carnicería!"* (su posicionamiento real:
boutique de envasados al vacío premium), pero el **footer** de la misma página dice *"Carnicería
premium — cortes seleccionados"* y *"SISTEMA: Vidriera + pedidos + POS integrados"*. El wording
genérico del rubro `carnicería` se filtró al pie y **contradice de frente** la marca del cliente en
su propia vitrina. Evidencia: `magra-erp.vercel.app/tienda` (hero vs. footer). **Acción:** el copy
del footer/tagline debe salir del branding del tenant, no del default del rubro.

**M-2 · Magra: datos de contacto placeholder / handle de Instagram equivocado.**
El footer muestra dirección **"Av. Provisional 1234, Canning"** (placeholder) y el Instagram como
**"@magra.carniceria"**, cuando el handle real de MAGRA es **@tiendamagra** (dirección real:
José Champagnat 4351 – Local 1, Sotavento Point, Canning). En una vitrina de cliente en vivo, una
dirección falsa + un link de IG a una cuenta inexistente son visibles y erosionan la credibilidad.
**Acción:** cargar dirección + IG reales en la config del tenant (o dejarlos ocultos si no hay dato,
nunca un placeholder).

**M-3 · Sello GSG ausente en TODAS las apps de tenant.**
Grep de código: `metadata.generator` no está seteado en `src/app/layout.tsx` y no aparece
"Gestión Studio Grow" en ninguna superficie de tenant (solo en `/demo`, que ES de GSG). El estándar
de marca GSG pide **`metadata.generator="Gestión Studio Grow"` + crédito discreto en el footer del
backoffice** (no en la vidriera del tenant). Que la vidriera NO lo muestre es correcto; que **tampoco
esté el `generator` ni el crédito del backoffice** significa que el sello **no está en ningún lado**.
Es incumplimiento del Gate (bloque 2). **Acción:** setear `generator` en el layout raíz + crédito en
el footer del backoffice.

### 🟡 MENORES

**m-1 · A Dos Manos: wording de otro rubro filtrado en el checkout.** En el formulario de pedido
(carrito) el campo de aclaraciones dice *"ej: cómo lo querés preparado / aclaraciones"* — lenguaje de
**carnicería** ("cómo lo querés preparado") en una **tienda de pádel**. Verificado en vivo
(`adosmanos-erp.vercel.app/tienda`, campo de notas del pedido). El placeholder debería ser genérico
o por rubro.

**m-2 · A Dos Manos (y Shine): productos sin foto real — placeholder de gradiente.** Las 20 fichas de
pádel muestran un recuadro de gradiente con un puntito, sin imagen del producto (screenshot en vivo).
Funciona y es prolijo, pero para venta faltan fotos. Aplica también al catálogo de Shine.

**m-3 · Shine: secciones que prometen categorías sin stock en el catálogo.** La sección "Mundos para
tu casa" y "Aromas de temporada" publicitan **Accesorios** (cortamechas, apagadores, fósforos) y 7
aromas por nombre, pero el catálogo comprable tiene **0 accesorios**, **1 solo** ítem de Decoración y
2 de Aromas. Promesa > góndola. **Acción:** cargar el stock de esas categorías o no anunciarlas.

**m-4 · Prompt just-in-time: copy ambiguo para visitante real.** El modal compartido
(`src/components/whatsapp-cta.tsx`) dice *"Para abrir WhatsApp necesitamos un número"* con label
**"Tu WhatsApp"**. Pensado para que quien muestra la demo cargue el número del negocio, pero en un
link público un cliente podría interpretar que le piden **el suyo** y abrir un chat a sí mismo.
Mitigado si el tenant tiene `BusinessSettings.whatsapp` real cargado (ahí abre directo, sin prompt).
**Acción:** cargar el número real de cada tenant y/o desambiguar el copy.

**m-5 · CH: `/admin` gateado con login, sin entrada de probador.** `chestetica-erp.vercel.app/admin`
pide contraseña (`/admin/login`); no hay sandbox sin-password en ese deploy
(`DEMO_MODE_ENABLED` sólo en un deploy aislado). No se pudo verificar agenda/caja/catálogo en vivo.
No es un bug en sí, pero si el objetivo era mostrar el backoffice, hoy no es accesible.

---

## Consola de Operador (control-plane) — `erp-ch.vercel.app/operador`

**Cómo se probó:** la consola se abrió **completa** en el navegador porque este equipo (el del
dueño) ya tiene una **sesión de operador válida** de cuando el dueño la activó — se entró por esa
sesión, **no** por la contraseña ni por un bypass. El portón está bien puesto: sin cookie válida,
`src/proxy.ts` redirige a `/operador/login` (cookie y secreto propios del control-plane, ADR-021).
**No se ejecutó ninguna acción mutante** (ni "Alta de tenant", ni "Configurar", ni tocar RLS):
verificación de solo lectura.

**Estado:** 🟢 **Carga y estructura OK.** Consola oscura, enterprise, sin errores de consola.
Nav "Control-plane · Tenants · Alta de tenant · Salir"; tarjetas de estado (Tenants 4 · Activos 1 ·
En pruebas 3 · **Gate 2º tenant (RLS): ARMADO** — "Requiere RLS activo (ADR-018)"); tabla de tenants
con Negocio/Estado/Plan/Rubro/Link/Módulos/Actividad.

**Requiere la `OPERATOR_PASSWORD` del dueño para probar a fondo:** el **flujo completo de gestión de
tenants** (alta de tenant, "Configurar", cambios de plan/estado, activar RLS) **no se puede validar
end-to-end sin la contraseña del dueño** (y sin arriesgar mutaciones en prod). Queda **pendiente de
una pasada con el dueño presente** o en un entorno de prueba.

Hallazgos de solo lectura (se suman a los defectos de arriba):

**OP-1 (corrobora C-1) · El tenant faro figura como "Beauty & Spa", genérico y sin rubro.** En la
tabla, CH aparece como **"Beauty & Spa" · `/beauty-spa`** · Plan **base** · Rubro **"—"** (vacío) ·
host `chestetica`. Los otros tres tienen nombre + rubro reales (Magra · Retail·Carnicería boutique,
Shine · Retail·Velas & deco, A Dos Manos · Retail·Tienda de pádel). Es la contracara en el
control-plane de por qué `chestetica-erp` se ve genérico ("Beauty & Spa") y refuerza **C-1**: el
registro del tenant CH está sin marca ("Beauty & Spa", sin rubro), no como "CH Estética". **Acción:**
nombrar/branddear el tenant CH y asignarle su rubro antes de republicar.

**OP-2 · Los contadores de Actividad/Módulos leen 0 aunque haya catálogo vivo.** Todos los tenants
muestran **"0" módulos** y **"0u · 0cat · 0op"** — incluido **Magra, que tiene 14 productos vivos**
en su `/tienda`. O la métrica no está cableada al estado real, o cuenta otra cosa (operadores/users
del backoffice) sin dejarlo claro. Como panel de control del dueño, informar 0 donde hay catálogo
activo es engañoso. **Acción:** cablear los contadores al estado real del tenant o rotular qué miden.

**OP-3 (parte de M-3) · La consola tampoco lleva el sello GSG.** El header dice "◆ Control-plane";
no hay crédito "Gestión Studio Grow" ni `metadata.generator`. Siendo la superficie más interna de
GSG, es donde el sello debería estar sí o sí. Se suma a M-3.

---

## Pasada 2 — Recorrido de usuario END-TO-END (navegador real, click por click)

Recorrí cada sitio como una persona, no solo cargando páginas. Qué **experimenta el usuario** en cada
paso, con los defectos nuevos que aparecen solo al recorrer el viaje (no se ven "cargando la home").

### CH Estética — `chestetica-erp.vercel.app`
1. **Entrar:** el visitante NO llega a ninguna vidriera → la raíz lo **bota a `/admin/login`** y ve un
   cajón "Ingresar al panel · Beauty & Spa". **Callejón sin salida total** para un cliente: no hay
   vidriera, no hay "reservar", y la única acción (Ingresar) pide una contraseña que no tiene. (= C-1)
2–5. No se puede recorrer nada público. El faro está caído de cara al usuario.

### Magra — `magra-erp.vercel.app`
1. **Entrar:** raíz → `/tienda`, carga la vitrina fiel. ✅
2. **Navegar:** links visibles = **Instagram**, "Hacer pedido" (#comprar), "LISTA DE PRECIOS"
   (#comprar). El de **Instagram apunta a `instagram.com/magra.carniceria`** → handle equivocado
   (el real es **@tiendamagra**) = **link muerto/incorrecto**, callejón sin salida. (= M-2)
3. **Comprar:** catálogo de 14 cortes con precio $/kg, carrito `+/−` anda. ✅
4. **WhatsApp:** CTA con prompt just-in-time (sin placeholder). ✅
5. **Backoffice:** **NO hay ningún punto de entrada al backoffice desde el sitio** (confirma el
   hallazgo del dueño). Si el usuario prueba `/admin` a mano → `/admin/login` con contraseña (correcto
   por ser cliente real), **pero la pantalla de login muestra la marca de OTRO tenant: "CH Estética —
   La Alameda, Canning / Beauty & Spa"** en el dominio de Magra. Y **no existe una entrada de
   backoffice-DEMO sin password** para mostrarle el sistema a un prospecto. (= J-1, J-2)

### Shine — `shinevelas-erp.vercel.app`
1–4. Raíz → `/tienda`, vitrina rica, 10 productos con precio, carrito `+/−`, WhatsApp just-in-time,
   consola limpia. ✅
2. **Navegar:** las secciones "Mundos" y "Aromas de temporada" ofrecen **Accesorios** y 7 aromas por
   nombre que **no están en el catálogo comprable** → el usuario que hace clic buscando eso no
   encuentra góndola. (= m-3)
5. **Backoffice:** igual que Magra — sin entrada desde el sitio; `/admin` → login CH-branded. (= J-1, J-2)

### A Dos Manos — `adosmanos-erp.vercel.app`
1. **Entrar:** raíz → `/tienda`, 20 productos. ✅
2. **Navegar:** fichas **sin foto real** (recuadro de gradiente). (= m-2)
3. **Comprar:** **verificado con clicks** — agregué "Pala Adidas Metalbone 3.4" → carrito mostró
   "1 u · $ 329.900,00". El campo de aclaraciones del pedido dice **"ej: cómo lo querés preparado"**
   (lenguaje de carnicería en una tienda de pádel). ✅ carrito / ⚠ wording. (= m-1)
4. **WhatsApp:** **verificado** — el CTA abre el prompt just-in-time ("Tu WhatsApp" + "Continuar por
   WhatsApp" + "Ahora no"), **sin abrir ningún número placeholder**. ✅
5. **Backoffice:** sin entrada desde el sitio; `/admin` → **`/admin/login` CH-branded** (verificado en
   vivo: título "CH Estética" en el dominio de A Dos Manos). (= J-1, J-2)

### Demo — `erp-ch.vercel.app/demo`
1–4. Tour de 6 escenas; **avanza** con Siguiente/Anterior/Pausar (verificado). CTA "Quiero esto para
   mi negocio" (WhatsApp just-in-time) + "Escribinos por mail" + "Saltar al final". ✅
5. **Backoffice:** la demo SÍ ofrece un botón **"Entrá al backoffice real (demo) →"** — pero al
   clickearlo **lleva a `/admin/login?next=/admin/turnos`: un muro de contraseña, NO un backoffice
   demo sin password.** Promesa incumplida / **callejón sin salida**. Es el único lugar que invita a
   ver el backoffice y termina en un login. (= J-3)

---

## Defectos nuevos del recorrido (se suman a los de arriba)

**J-1 (MEDIO · el caso del dueño) · No hay punto de entrada al BACKOFFICE-DEMO (sin password) para
mostrar el sistema.** En ningún sitio de cliente (Magra/Shine/A Dos Manos) hay una forma visible de
entrar al backoffice, y `/admin` — bien — pide contraseña por ser cliente real. **Falta la superficie
de backoffice en MODO DEMO** (sin password, datos ficticios) que permita mostrarle el panel a un
prospecto sin darle credenciales reales. Hoy no existe un enlace ni una ruta clara a eso. **Acción:**
exponer un probador de backoffice-demo (sandbox `DEMO_MODE_ENABLED`, datos ficticios) con acceso claro.

**J-2 (MEDIO) · La pantalla de `/admin/login` no está brandeada por tenant — muestra "CH Estética /
Beauty & Spa" en TODOS los dominios.** Verificado en vivo en magra-erp y adosmanos-erp: el login dice
"CH Estética — La Alameda, Canning". Un empleado de Magra o A Dos Manos que va a entrar ve la marca de
otro negocio. **Acción:** el chrome de login/backoffice debe resolver la marca del tenant activo.

**J-3 (ALTO) · La demo promete "Entrá al backoffice real (demo)" y entrega un muro de login.** El
botón de la `/demo` que invita a ver el backoffice lleva a `/admin/login` (pide contraseña), porque el
deploy `erp-ch` no está en modo sandbox. Es la puerta pensada para mostrar el producto y es un
callejón sin salida. **Acción:** que ese botón abra el backoffice-demo real (sandbox sin password) o,
si no está listo, no ofrecerlo. Se cruza con **J-1**.

---

## Lo que anda bien (verificado en vivo, no romperlo)

- **A Dos Manos:** carrito **funciona** (agregué "Pala Adidas Metalbone 3.4" → cart mostró "1 u ·
  $ 329.900,00"), y el CTA de WhatsApp **dispara el prompt just-in-time** (input "54 9 11…" +
  "Continuar por WhatsApp" + "Ahora no"), **sin abrir ningún número placeholder**. 20 productos con
  precios reales. Consola sin errores.
- **Shine:** vidriera rica y coherente (velas/aromas/deco, ritual, sets de regalo, reviews), 10
  productos con precio, carrito con `+/−`. Consola limpia. Root → `/tienda`.
- **Magra:** réplica fiel del sitio (hero, beneficios, gourmet, envasados, 14 cortes con precio $/kg,
  reviews) sirviéndose del ERP. Consola limpia. (Sus problemas son de datos/wording, arriba.)
- **WhatsApp sin número hardcodeado:** confirmado end-to-end. La lógica quedó en un único componente
  compartido (`whatsapp-cta.tsx` + `lib/whatsapp-cta.ts`): número real del tenant si existe, si no
  prompt just-in-time guardado en localStorage. Se saldó el crítico C-1 del reporte de previews.
- **Demo (`erp-ch/demo`):** `force-static`, aislada de la DB, CTA guardado por just-in-time.

---

## Recomendación de corrección (orden)

1. **C-1** — republicar CH sirviendo su vidriera pública (bloqueante; es lo que mira el dueño).
2. **J-3 / J-1** — que "Entrá al backoffice real (demo)" abra un backoffice-demo sin password, y
   exponer ese probador como el punto de entrada para mostrar el sistema a prospectos.
3. **J-2** — brandear la pantalla de login/backoffice por tenant (hoy muestra CH en todos).
4. **M-1 / M-2** — sacar el wording "carnicería" del footer de Magra y cargar dirección + IG reales.
5. **M-3** — setear el sello GSG (`generator` + footer del backoffice) en todas las apps.
6. Menores (m-1…m-5) — wording por rubro, fotos, stock de categorías de Shine, copy del prompt.

— Elaborado por GSG (Equipo de Calidad)
