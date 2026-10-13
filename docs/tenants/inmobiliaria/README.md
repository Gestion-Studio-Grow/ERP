# Inmobiliaria — módulo `inmobiliaria`

Rama `tenant/inmobiliaria-pdc` (worktree `C:\inmo`), nacida de `origin/main` el 13/10/2026. **Sin push.**

Hoy la rama tiene un solo commit propio (rubro, módulo, tablas, reglas y acciones). El sitio público,
el panel, los componentes, `marca.ts` y `sitio.server.ts` están en la carpeta de trabajo **sin
commitear todavía**.

## Qué es

Primer negocio del rubro **inmobiliaria**: venta, alquiler y administración de alquileres. Es un
negocio más del motor (no una app aparte): rubro `inmobiliaria` dentro de la familia oficios + módulo
`inmobiliaria`, que se asigna sólo a inmobiliarias.

Lo que hace hoy: cartera de propiedades con ficha, fotos y control de calidad antes de publicar;
sitio público con buscador; consultas con reloj de primera respuesta; contratos de alquiler con
ajuste por ICL, IPC, Casa Propia o porcentaje fijo; cuotas, cobros y mora; liquidación al
propietario; y dos links sin login, uno para el inquilino y otro para el propietario.

| Pieza | Dónde |
|---|---|
| Rubro (servicios de ejemplo, textos) | `src/blueprints/oficios/rubros.ts` (id `inmobiliaria`) |
| Módulos por defecto del rubro | `src/blueprints/presets-meta.ts` (`inmobiliaria`: inmobiliaria, agenda, catalog, clients, reminders, reports, arca) |
| Descriptor del módulo | `src/modules/descriptors/inmobiliaria.ts`, registrado en `src/modules/catalog.ts` |
| App del panel (una, con sus pantallas) | `src/apps/catalogo/comercial.ts` (id `inmobiliaria`, ruta `/admin/inmobiliaria`) y `src/apps/espacios.ts` |
| Reglas puras + pruebas | `src/lib/inmobiliaria/core.ts`, `core.test.ts` |
| Lecturas / escrituras | `src/lib/inmobiliaria/datos.server.ts`, `acciones.ts` |
| Marca por negocio | `src/lib/inmobiliaria/marca.ts` (hoy sólo la demo; sin fila, sale con el nombre en letras y colores neutros) |
| Datos comunes de las páginas públicas | `src/lib/inmobiliaria/sitio.server.ts` |
| Panel | `src/app/admin/(dashboard)/inmobiliaria/` (hoy, propiedades, consultas, alquileres, liquidaciones, config) |
| Portada pública | `src/app/inmobiliaria/page.tsx` (la raíz `/` de una inmobiliaria redirige acá) |
| Buscador y ficha pública | `src/app/propiedades/page.tsx`, `src/app/propiedades/[slug]/` |
| Fotos guardadas en la base | `src/app/propiedades/foto/[id]/route.ts` (las sirve como imagen, con caché) |
| Link del inquilino (sin login) | `src/app/alquiler/[token]/` |
| Link del propietario (sin login) | `src/app/liquidacion/[token]/` |
| Componentes del sitio | `src/components/inmobiliaria/` (`Sitio.tsx`, `piezas.tsx`, `sitio.module.css`) |
| Tablas + RLS | `prisma/schema.prisma` (modelos `Inmo*`, diez tablas) y `prisma/migrations/20261013120000_modulo_inmobiliaria/` |
| Datos de ejemplo | `prisma/seed-inmobiliaria-demo.ts` (sólo base local: corta si la base no es de esta máquina) |
| Imágenes de ejemplo | `public/demo-inmo/` (18 ilustraciones propias), generadas con `scripts/inmobiliaria/generar-fotos-demo.mjs` |
| Demo en esta máquina | `node scripts/inmobiliaria/demo-local.mjs` → `http://inmo-demo.localhost:3218` |

**La demo.** El comando levanta una base en memoria, aplica todas las migraciones, carga la
"Inmobiliaria Demo" y arranca la app. Al cerrarlo no queda nada instalado y no toca Neon ni
producción. El panel está en `http://inmo-demo.localhost:3218/admin`; los ingresos de prueba (dueño
y agente) están en el encabezado de `prisma/seed-inmobiliaria-demo.ts`.

**La plata.** Todos los importes se guardan como `numeric(14,2)` (número exacto con dos decimales),
como pide el ADR-100. Es distinto del módulo taller, que nació con `Float`. Los contratos
administrados van **sólo en pesos**: la migración lo obliga con una regla en la base (`CHECK` sobre
`InmoContrato.moneda`). El precio de cartel de una propiedad sí puede estar en pesos o en dólares.
Los porcentajes (comisión, mora, ajuste fijo) y los valores de los índices no son plata y se guardan
como número común.

**Un cambio fuera del módulo, que pide el OK del dueño.** Se agregaron dos líneas en
`src/app/(site)/page.tsx` y las mismas dos en su copia de control
`src/app/(site)/__fixtures__/page-head.tsx.txt`: si el negocio es del rubro `inmobiliaria`, la raíz
`/` redirige a `/inmobiliaria`. Esa copia de control existe para cuidar la portada del negocio que
está en producción: cualquier cambio en esa página obliga a tocarla a propósito. El cambio sólo
alcanza a negocios del rubro inmobiliaria, pero **necesita el visto bueno del dueño antes de pasar a
`main`**.

## Marca — autorización registrada

**PDC Propiedades** (slug `pdcinmobiliaria`, sitio `pdcinmobiliaria.gsgapp.com.ar`). El dueño de GSG
confirmó el **13/10/2026** en la sesión de trabajo que el cliente autorizó usar su marca. Ese día se
tomó de su sitio público (www.pdcpropiedades.com.ar, hoy sobre Mapaprop):

- Logo: `public/tenants/pdcinmobiliaria/marca/logo.png` (el suyo, PNG 3152×1686) e `isologo.svg`.
- Colores: rojo `#e42528`, gris `#545456`, tinta `#2b2b2d`, fondo blanco. Su tipografía es Archivo /
  Montserrat; acá sale con Hanken Grotesk, que el motor ya hospeda (sumar una fuente toca el layout
  raíz, que es de todos los negocios).
- Textos: "Tu próxima propiedad en Monte Grande", "Venta, alquiler y tasaciones en Esteban
  Echeverría y zona sur", "desde 2009". Matrícula: Ariel Eduardo Pericullo, Mat. 3721 CPMCLZ.
- Contacto: Ramón Santamarina 1128, Monte Grande · 11 5306-5098 · info@pdcpropiedades.com.ar ·
  Instagram, Facebook y YouTube de su sitio.

**Lo que NO se tomó:** sus propiedades y sus fotos (103 publicadas en Mapaprop). El negocio salió
con la cartera de MUESTRA del seed (fichas inventadas, ilustraciones propias). Migrar la cartera
real es el paso siguiente y pide decidir dónde se guardan las fotos.

Antes de eso existía sólo "Inmobiliaria Demo" (`inmo-demo`), marca inventada para la demo local.

## Permisos

Cada acción vuelve a pedir el permiso del lado del servidor; esconder un botón no alcanza.

| Rol del motor | En la inmobiliaria | Qué puede |
|---|---|---|
| OWNER | Dueño | Todo, incluida la configuración (comisión, IVA de la comisión, mora, datos de cobro, matrícula, plantillas de mensajes). |
| RECEPTION | Administrativo | La plata: contratos, ajustes, cobros, mora, liquidaciones y carga de índices. También propiedades y todas las consultas. Sin configuración. |
| PROFESSIONAL | Agente | Propiedades (fichas, fotos, publicar) y las consultas suyas o sin asignar. No entra a alquileres ni a liquidaciones, ni a la configuración. |

Cómo está armado en el código: fichas y consultas piden `agenda:read`; la plata pide
`agenda:manage`; la configuración pide `users:manage`. La única escritura pública es el formulario
de consulta del sitio.

## A validar antes de usarlo con plata real

Está marcado en el código (`src/lib/inmobiliaria/core.ts`) como **A VALIDAR con el contador y con la
cláusula de cada contrato**:

1. **Ajuste por IPC:** qué meses compara. Hoy toma el nivel del mes anterior al ajuste contra el del
   mes anterior al ajuste previo.
2. **Mora:** interés simple por día corrido sobre lo que falta pagar.
3. **Base de la comisión de administración:** hoy se calcula sobre el alquiler cobrado (no sobre
   expensas, otros cargos ni mora).

Además, la **escala de comisión de la provincia de Buenos Aires** (Ley 10.973, art. 54: del 3 % al
10 %, a cargo del propietario). El sistema avisa si el porcentaje queda afuera, pero no frena la
carga. A validar con el colegio de martilleros que corresponda.

## Qué NO está hecho (dicho de frente)

1. **La migración no está aplicada en Neon** y **no está listada en `prisma/lote-deploy.txt`**.
   Sumar una migración a `main` sin listarla ahí frena el build de producción: cuándo se hace lo
   decide el dueño.
2. **Publicación en Zonaprop, Argenprop y MercadoLibre.** No existe. Hace falta conseguir las
   credenciales de integrador por el canal comercial de cada portal.
3. **Migración de la cartera de PDC.** No se trajo ninguna propiedad desde Mapaprop.
4. **Almacenamiento de archivos para las fotos.** Hoy la foto se achica en el navegador (JPEG) y se
   guarda en la base, hasta 20 por propiedad; la otra opción es pegar un link `https`.
5. **Los cobros de alquiler no entran a la Caja del motor.** Quedan en el módulo; el libro de caja
   no se entera.
6. **Factura de ARCA** de la comisión, y factura por cuenta y orden del propietario: no están.
7. **Contratos en dólares:** no. Sólo pesos (ver "La plata").
8. **Avisos automáticos por mail o WhatsApp:** no. Hoy se abre WhatsApp con el mensaje ya escrito y
   lo manda una persona.
9. **Descarga automática de índices:** el botón baja ICL (Banco Central) e IPC (datos.gob.ar). El
   índice Casa Propia se puede elegir en un contrato, pero sus valores se cargan a mano.
10. **Sitemap** (el listado de páginas para los buscadores): no hay. Las páginas sí tienen título,
    descripción y datos estructurados.
11. **App para el celular:** no hay.
12. **Red entre inmobiliarias** (compartir propiedades con colegas): no hay.
13. **Tasador con comparables:** no hay. El sitio recibe pedidos de tasación como consulta.
14. **Excellence Gate:** las vallas visuales con Playwright no se corrieron.
15. **Norma en movimiento:** el DNU 70/2023 puede ser rechazado por el Congreso (sesión del
    15/10/2026). Por eso las reglas de ajuste viven en cada contrato y no en una regla general: si
    cambia la ley, los contratos ya firmados siguen con lo suyo.

El detalle de la competencia y de las fuentes está en `benchmark-2026-10-13.md`, en esta carpeta.

## Defectos de la revisión del 13/10/2026: qué se cerró y qué queda

Una revisión independiente del código encontró ocho puntos de plata. Siete se cerraron el mismo
día en una segunda pasada (migración `20261013180000_inmobiliaria_ajustes`, aditiva, listada en
`prisma/lote-deploy.txt` **sin aplicar en Neon**). Queda uno, que no es un error del código sino
una convención que define el contador.

1. **Reparto de una liquidación parcial — cerrado.** La cuota guarda lo liquidado por rubro
   (`liquidadoAlquiler`, `liquidadoExtras`, `liquidadoPunitorios`; `liquidado` sigue como total).
   Lo que se suma después a una cuota ya liquidada en parte entra en su rubro
   (`pendienteDeLiquidar` en `core.ts`) y la comisión sale sólo sobre el alquiler. Las cuotas
   liquidadas antes de estas columnas (total sin rubros) se reparten con la regla de imputación de
   siempre (`repartoLiquidado`). Emitir una liquidación comprueba que cada cuota siga exactamente
   como se la leyó (cobrado, alquiler, mora, liquidado y última escritura); anularla devuelve rubro
   por rubro.
2. **Actualización aplicada tarde sobre cuotas ya cobradas — decidido y documentado.** La
   diferencia queda **en la misma cuota**: pasa a "pago parcial", se reclama y se cobra como saldo,
   y al liquidar entra como alquiler de ese período. No se abre un concepto aparte (mezclaría
   alquiler con extras y rompería la comisión). El freno que ya existía se afinó: el monto nuevo no
   puede ser menor al **alquiler** ya cobrado por una cuota del tramo, sin contar expensas ni mora
   (`alquilerCobrado`). Con prueba.
3. **Perdonar la mora — cerrado.** Marca `moraPerdonada` en la cuota: cargar 0 la prende, cargar
   un monto la apaga. Con la marca, el panel no vuelve a sugerir mora y un cobro "con mora" no
   asienta nada. El saldo y el estado de la cuota no cambian.
4. **Unificar clientes — cerrado.** `src/lib/crm/unificar-en-tx.ts` mueve también las cinco claves
   de la inmobiliaria (dueño de la ficha, inquilino y propietario del contrato, propietario de la
   liquidación, interesado de la consulta), en la misma transacción y con el negocio en cada
   `where`. Queda en la auditoría qué se movió. Con prueba.
5. **Fotos en la base — cerrado en su mitad que no depende del almacenamiento.** `InmoFoto.esData`
   marca las fotos pesadas; los listados, la ficha pública y la ficha del panel leen sólo id y marca
   y arman el link a `/propiedades/foto/[id]`; la columna `url` se lee en una consulta aparte sólo
   para las fotos que son un link. La migración marca las ya guardadas. El almacenamiento de
   archivos sigue pendiente (ítem 4 de "Qué NO está hecho").
6. **Contratos que empiezan a mitad de mes — A CONFIRMAR CON EL CONTADOR.** El tramo arranca el
   mismo día del mes que el contrato (firmado el 15, ajusta el 15), pero la cuota vence el día de
   vencimiento (el 10): la primera cuota de un tramo nuevo puede vencer unos días antes del índice
   que la ajusta. Las dos convenciones existen (ajustar desde la cuota cuyo período contiene la
   fecha, o desde la siguiente). Está explicado en `planDeCuotas` (`core.ts`); cuando se defina,
   cambia sólo `tramoDe`. Mientras tanto, el monto se puede cargar a mano.
7. **Deudas de contratos cerrados — cerrado.** "Hoy" muestra también las cuotas vencidas sin pagar
   de contratos finalizados o rescindidos, con la etiqueta "contrato finalizado/rescindido"
   (`PorCobrar.contratoEstado`).
8. **Expensas y mora sin candado — cerrado.** Sumar o quitar un concepto y cargar la mora van en
   transacción serializable, como los cobros. Quitar un concepto se hace por concepto y monto (lo
   que la pantalla mostró), no por la posición en la lista.

## Verificación hecha (13/10/2026)

- `tsc` y `eslint` de lo nuevo: limpios. `next build`: OK (las 16 rutas nuevas compilan).
- Pruebas del módulo: 25 de 25. Suite completa del motor contra la línea de base de `origin/main`
  en esta misma máquina: **ninguna falla nueva** (la base trae 41 fallas propias, casi todas de
  navegador porque acá no está Playwright).
- `prisma/rls/check-coverage.mjs`: OK (las 10 tablas nacen con RLS). La migración se aplicó entera
  sobre una base en memoria junto con las 49 anteriores.
- Recorrido en el navegador contra la demo local, a 1280 px: portada → búsqueda con filtros →
  búsqueda sin resultados → ficha → envío de una consulta → la consulta aparece en "Hoy" → ingreso
  al panel → alta de una ficha (nace borrador, con su control de calidad) → contrato → aplicar la
  actualización por ICL → registrar un cobro → emitir una liquidación → link del propietario y link
  del inquilino → bajar los índices oficiales (entraron 404 valores del ICL y 36 del IPC).
- Revisión independiente del código: sin fugas entre negocios. Se corrigieron en el día: cobros
  simultáneos (transacción serializable), la consulta pública (sólo inmobiliarias, freno por
  conexión, campos validados), el ajuste con un índice de otro día, la búsqueda que delataba una
  dirección oculta, ids no validados, la cuenta de cuotas a fin de mes, el borrado en cascada de
  cobros y la liquidación que cambiaba entre que se veía y se emitía.
- **No corrido:** las dos vallas visuales del Gate (Playwright), el recorrido a 375 px, la subida
  de fotos desde un teléfono, el alta de un contrato nuevo desde el formulario y el ingreso como
  agente. La app arrancó en modo desarrollo, no con el build de producción.

### Segunda pasada (cierre de defectos, mismo día)

- `tsc --noEmit` y `eslint` (módulo, CRM y páginas tocadas): limpios.
- Pruebas: 85 de 85 (`src/lib/inmobiliaria/*.test.ts` + `src/lib/crm/*.test.ts`); 29 del núcleo
  de la inmobiliaria (4 nuevas) y 6 de unificar fichas (1 nueva).
- `prisma validate` OK; `prisma migrate diff` entre el esquema de `HEAD` y el nuevo da exactamente
  las seis columnas de la migración (más el backfill de `esData`, escrito a mano).
- Las 51 migraciones aplican de corrido sobre una base en memoria (PGlite) y el seed de la demo
  corre entero sobre ellas. `check-coverage.mjs`: OK.
- **No corrido:** el recorrido en el navegador de la segunda pasada (liquidar en dos veces, perdonar
  la mora, unificar un propietario) y `next build`.

— Elaborado por GSG
