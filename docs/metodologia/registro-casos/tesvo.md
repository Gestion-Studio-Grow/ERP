# Caso: TESVO Importaciones y Exportaciones

**Fecha:** 2026-10-15 · **Extraído por:** sesión «Desarrollo Tesvo y backoffice Aerobox» (skill `ingenieria-reversa`) · **Rubro (texto libre):** importación y exportación puerta a puerta (China, Miami, Paraguay; aéreo, marítimo, terrestre) para personas y pymes
**Fuentes consultadas:** tesvo.com.ar e Instagram @tesvo.ar (marca, sesión del 07/10) · referentes: aerobox.com.ar, Aerolíneas Argentinas Courier, PuertoBox, BRYX, Correo Argentino, MyUS, Shipito, Aeropost, Flexport, Freightos · normativa: Boletín Oficial (RG 5883/2026), argentina.gob.ar (Dto. 1065/2024), CIRA (Dto. 604/2026, RG 5884/2026)

## 1. Qué se extrajo (resumen)

- **Identidad:** «TESVO · IMPO · EXPO», tipográfico en Poppins 800; hueso `#EDEBE7`, negro, verde `#71B17F`, amarillo `#FFDE59`. Claim: «Traé sin vueltas, del mundo a tu puerta.»
- **Modelo de negocio:** servicio puerta a puerta. El cliente le compra al vendedor y TESVO trae, despacha y entrega; cobra flete, honorario y manejo.
- **Servicios:** 11 publicados (aéreo, marítimo, terrestre, China, EE. UU., exportaciones, puerta a puerta, pymes, consolidación, gestión aduanera, almacenamiento).
- **Incumbente:** no detectado. La operación hoy se infiere manual, por WhatsApp y planilla.

## 2. Completitud

- `demo`: alta. La gestión funciona de punta a punta con datos de ejemplo.
- `prod`: menor a 1.0. Faltan tarifas reales, honorarios, despachante, direcciones de los depósitos, WhatsApp, CUIT y el OK de marca.

## 3. Qué falló durante la extracción

| Muro / problema | Fuente | Cómo se resolvió | Provenance final |
|---|---|---|---|
| El proxy de la sesión no dejó abrir aerobox.com.ar, Trustpilot ni MyUS | WebFetch | Se trabajó con los fragmentos indexados por el buscador sobre páginas oficiales, cada dato con su URL | verificado (fragmento) / inferido |
| El sitio de Aerobox se contradice: almacenaje de 15 o 60 días; manejo de USD 5, 10 o 20 | aerobox.com.ar | Se registran todos los valores; la demo usa uno propio, rotulado de demostración | provisional |
| La «Disposición 954/2025» del plan anterior no existe en ninguna fuente oficial | BO, ARCA | Se dejó de usar como fuente | descartado |
| El desarrollo previo (`frente/tesvo`, 51 commits) está sólo en la PC del dueño, sin pushear | sesión TESVO 06–08/10 | Esta pasada se hizo en `/gestion`, sin pisar esa rama ni el schema | pedido-al-dueno (push) |
| «Aerobox» llegó como «la skill de aerobox» | pedido del dueño | Se interpretó como hacer la RAE sobre Aerobox, el referente del rubro (no existe una skill con ese nombre) | supuesto anotado |

## 4. Qué se corrigió / se pidió al dueño

- OK registrado de TESVO para usar su marca (ADR-034/042), bloqueante antes de mostrar.
- Push de `frente/tesvo` desde la PC.
- Tarifas reales por ruta, honorario, despachante, depósitos y WhatsApp.
- Validación del régimen por un despachante (lista en `docs/tenants/tesvo/REINGENIERIA-AEROBOX.md` §5).
- Alta del negocio `tesvo` y deploy (Gate 1). `Comex.sql` en Neon (Gate 2).

## 5. Heurística nueva

- **Cuando el rubro tiene una norma que cambia seguido (courier, ARCA), el régimen va como DATO con «vigente desde» y edición con PIN, nunca como constante.** Hubo tres cambios en dos años (Dto. 1065/2024, Dto. 604/2026 y RG 5883/2026). Pendiente de promoverse a `heuristicas-aprendidas.md` en la retro.
- **Una eventualidad que aparece en la bandeja de un rol tiene que poder resolverla ese rol.** El recorrido detectó el caso del paquete dañado, que era un callejón sin salida, y se corrigió. Candidata al checklist del QA.

— Elaborado por GSG
