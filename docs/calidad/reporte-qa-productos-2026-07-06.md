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

## Checklist de calidad aplicada
Cargan sin error · fidelidad de marca por tenant · catálogo/carrito funcionan · CTAs de WhatsApp con
prompt just-in-time (nunca un número placeholder/falso) · sello GSG · coherencia · accesibilidad
básica · sin errores de consola.

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
2. **M-1 / M-2** — sacar el wording "carnicería" del footer de Magra y cargar dirección + IG reales.
3. **M-3** — setear el sello GSG (`generator` + footer del backoffice) en todas las apps.
4. Menores (m-1…m-5) — wording por rubro, fotos, stock de categorías de Shine, copy del prompt.

— Elaborado por GSG (Equipo de Calidad)
