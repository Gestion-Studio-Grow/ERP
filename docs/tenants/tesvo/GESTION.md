# TESVO — la gestión interna en tesvo.gsgapp.com.ar/gestion

**Qué es:** la demo de la gestión de TESVO Importaciones y Exportaciones (prospecto en preventa): cotizar, depósito,
embarques, aduana, cobros, clientes, caja y tablero del dueño, con un motor de reglas testeado. **Demo a costo cero:**
datos de ejemplo, sin persistencia ni credenciales (ciclo DEMO → VENTA → INVERSIÓN). Análisis, referentes y reglas:
[`REINGENIERIA-AEROBOX.md`](REINGENIERIA-AEROBOX.md).

Mismo mecanismo que Circuito WPE y Break Point (`src/lib/sitio-estatico.ts`): **sin cambios de schema**. A diferencia de
ellos, TESVO **conserva su raíz y su `/tienda`** para la vidriera de React de la rama `frente/tesvo`
(`reemplazaTienda: false`): el sitio estático sólo suma `/gestion`.

| Pieza | Archivo |
|---|---|
| Fuente de la demo (la que se edita) | `public/previews/tesvo/gestion/{index.html, app.mjs, motor.mjs}` |
| Lo que sirve el ERP (generado, no se edita) | `src/tenants/tesvo/sitio/gestion.html` (un solo archivo) |
| Empaquetador | `node src/tenants/tesvo/empaquetar.mjs` |
| Registro del sitio (slug `tesvo`, subdominio `tesvo`, ruta `gestion`) | `src/lib/sitio-estatico.ts` |
| Tests (matriz de eventualidades, empaquetado al día, registro del sitio) | `src/tenants/tesvo/motor-gestion.test.ts` · `src/lib/sitio-estatico.test.ts` |
| QA de recorrido (Playwright: tres roles, celular claro/oscuro, teclado) | `node src/tenants/tesvo/qa-recorrido.e2e.mjs` (si el Chromium instalado no es el de Playwright: `CHROMIUM_PATH=…`) |

En `tesvo.<dominio>/gestion` se reescribe a `/sitio-estatico/gestion` (sólo en ese host) y el manejador sirve el archivo
**sólo si el host resuelve al negocio `tesvo`**. Sin ese negocio en la base responde 404 (falla cerrado): el código puede
estar publicado antes del alta sin exponer nada.

## Cómo se usa la demo

- Arriba a la derecha, **«Usa»**: Sole · Atención, Nico · Depósito o Dueño. Cada rol ve sus pestañas.
- **Hoy** abre con cada eventualidad a la vista: aduana que observó, paquete dañado, diferencia de peso, saldo por cobrar,
  almacenaje por empezar, cotización por vencer, paquete sin dueño, producto prohibido, contenedor demorado y una seña a
  devolver. Cada una con su botón y su WhatsApp listo (sin número: en la demo elegís el contacto).
- PIN del dueño en la demo: **9999** (devolver seña, bonificar, cambiar el régimen).
- Recargar la página vuelve a la demo de cero: no se guarda nada.

## QA de recorrido (15/10/2026)

Recorrido en Chromium con Playwright, sobre la fuente y sobre el archivo empaquetado, con el mismo resultado: todo verde.

- **Escritorio 1366:** cobrar un saldo desde la bandeja; aplicar una diferencia de peso; resolver un daño; filtrar y buscar envíos; abrir la ficha.
- **Cotizador:** cotizar dos productos en vivo, con el foco conservado mientras se escribe; partir para ahorrar; aviso de tope; guardar y confirmar.
- **Depósito:** recibir un paquete y asignarlo por casilla; asignar uno sin dueño; devolver un prohibido.
- **Embarques:** abrir, subir y despachar con avisos; cargar una demora con avisos por cliente; arribo; liberar en aduana.
- **Dueño:** PIN incorrecto rechazado; devolver la seña con PIN; cambiar el dólar y el régimen; alta de cliente con casilla.
- **Celular 390 px, claro y oscuro:** sin scroll horizontal en ninguna pestaña de los tres roles ni en la ficha.
- **Teclado:** el primer Tab va a «Saltar al contenido».
- **Consola:** cero errores. Las fuentes de Google se bloquearon a propósito para medir.

Defecto encontrado y corregido en el recorrido: el paquete dañado aparecía en la bandeja de Atención, pero sólo Depósito
podía resolverlo, y Depósito no lo veía. Era un callejón sin salida. Ahora lo carga quien habló con el cliente.

## Para que quede en vivo (pasos del dueño)

1. **OK registrado de TESVO** para usar su marca (ADR-034/042). Sin eso no se le muestra a nadie fuera de GSG.
2. **Publicar** (Gate 1): merge a `main` y deploy del proyecto `erp-ch`.
3. **Alta en producción** del negocio `tesvo` con subdominio `tesvo` (consola: Soporte → Alta de negocio).

— Elaborado por GSG
