# Break Point Pádel: entrega (04/11/2026)

**Criterio de «entregado»** (el README no lo definía; criterio simple, anotado por la sesión móvil):
1. El sitio vive en `https://breakpointpadel.gsgapp.com.ar/` con la versión de `main` (portada, turnero, club).
2. La versión que está en `main` pasó **toda** la verificación automática del frente, en verde, el mismo día.
3. El dueño hizo el recorrido de 3 pasos en su tablet (abajo) y dijo SÍ.

El 1 ya se cumplía: el alta es del 15/10 y desde el 02/11 no hay migraciones pendientes (`prisma/lote-deploy.txt`),
así que cada push a `main` se publica. Lo que faltaba era el 2 y el 3: el último QA (15 y 16/10) es anterior a la
portada nueva del 29/10 («la cancha desde arriba») y al arreglo del paso 5 de la reserva del 01/11.

## Verificación del 04/11 (sobre `main` `ee193f1` + esta rama)

| Qué | Resultado |
|---|---|
| `tsc --noEmit` | 0 errores |
| Tests del frente (`src/tenants/breakpoint/**/*.test.ts` + `src/lib/sitio-estatico.test.ts`) | 223/223 |
| `npm run test:turnero-e2e` (turnero + sitio servido por el manejador del ERP, portada → turnero → reserva → seña, club en otra pestaña) | 138/138 |
| `npm run test:club-uat` (partes 1, 2, 3 y 4.2 del UAT: PIN, bloqueo, los 8 pedidos, registro con celular) | 43/43 |
| `npm run build` | verde («Compiled successfully») |

**Las 3 fallas que aparecieron eran de las pruebas, no del sitio** (se corrigieron las pruebas):
- `sitio.e2e.mjs`: pedía exactamente un link a `/turnero` en la portada. La portada del 29/10 tiene dos («Reservá» en
  el encabezado y en la portada) más las anclas por franja. Ahora pide al menos uno y ninguno a `/club…`.
- `turnero.e2e.mjs`: el tope de 60 KB de JS se medía también en el servidor de desarrollo, que no recorta módulos y
  baja el motor entero del club (42,7 KB). Lo que baja el jugador en el sitio publicado pesa **43,6 KB** y se sigue
  controlando contra 60 KB; en desarrollo el peso queda informativo.
- `uat-b.e2e.mjs`: la demo arma hoy dos turnos de «Martín Ríos» y la prueba abría el de las 11:00 (cerrado). Ahora
  abre el de 4 jugadores.

## Qué ve el cliente

- **Portada** (`/`): la marca y «la cancha desde arriba»; el plano dice «Canchas a confirmar» hasta que el club diga
  cuántas son.
- **Turnero** (`/turnero`): horarios de referencia, sin precios. El jugador elige día, horario y duración y **manda el
  pedido armado por Instagram** (no hay WhatsApp del club cargado). El club le confirma y le pasa el alias de la seña.
- **Gestión del club** (`/club`): la demo de gestión (agenda, buffet, caja, clientes…), con datos de ejemplo.
- `/turnero?demo=1`: la demo completa del turnero (Google simulado, seña simulada), sincronizada con `/club`.

## Recorrido del dueño (tablet, 3 pasos)

1. Abrir `breakpointpadel.gsgapp.com.ar` → se ve la cancha desde arriba con la marca → tocar **Reservá tu cancha**.
2. En el turnero, elegir un día y un horario → **Mandalo por Instagram** → se abre el chat del club con el pedido
   copiado (no hace falta mandarlo).
3. Abrir `breakpointpadel.gsgapp.com.ar/turnero?demo=1` en una pestaña y `/club` en otra (entrar como Lu: el PIN está
   en «¿Probando la demo?») → reservar con **Continuar con Google** → **Simular comprobante (demo)** → la reserva
   aparece en la **Agenda** del club sin recargar.

**Datos del club que faltan para el turnero «real» (provisional a confirmar, no frenan la entrega):** número de WhatsApp,
tarifas, catálogo de la tienda, cuántas canchas y cuáles techadas, y la dirección. Se cargan en
`src/tenants/breakpoint/publico.json` (+ `node src/tenants/breakpoint/empaquetar.mjs`) y viajan con el próximo push.

Pendientes que no frenan la entrega (vienen del UAT, siguen anotados en `UAT-PRODUCCION-RESULTADO.md`): recargar
saltea el bloqueo con PIN (la demo no tiene login), `pagarCuenta`/`cargarEnCuenta`/venta de mostrador sin validar
usuario en el motor, `esbuild` sin declarar en `package.json` (sumar una dependencia es decisión del dueño).

— Elaborado por GSG
