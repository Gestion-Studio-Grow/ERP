# MIA Producciones — módulo `proyectos` y pase a producción

Rama `tenant/mia-producciones` (worktree `C:\mia`), nacida de `origin/main` `d8f0a614`. **Sin push y sin
tocar Neon.** Este archivo es la guía del pase; nada de lo que dice se ejecutó todavía salvo lo marcado
como medido.

## Qué es

Primer negocio del rubro **productora** (eventos, stands, contenidos). Es un negocio más del motor.

| Pieza | Dónde |
|---|---|
| Rubro y módulos por defecto | `src/blueprints/oficios/rubros.ts`, `src/blueprints/presets-meta.ts` (`productora`) |
| Descriptor del módulo y app del panel | `src/modules/descriptors/proyectos.ts`, `src/apps/catalogo/comercial.ts` |
| Reglas puras + pruebas | `src/lib/proyectos/core.ts`, `stand.ts`, `core.test.ts` |
| Armador 3D | `src/lib/proyectos/stand-escena.ts`, `src/app/admin/(dashboard)/proyectos/[id]/stand/` |
| Panel | `src/app/admin/(dashboard)/proyectos/` |
| Propuesta del cliente (link sin login, sin costos) | `src/app/propuesta/[token]/` |
| Tablas + RLS | `prisma/migrations/20261101120000_modulo_proyectos/` |
| Marca | `src/lib/proyectos/marca.ts`, `public/tenants/mia-producciones/marca/` |
| Demo en esta máquina | `next build` y `node scripts/proyectos/demo-local.mjs --start` → `http://mia-producciones.localhost:3218/admin` |

## El pase

**El orden importa: primero la base, después el código.** `CashMovement` suma una columna que el código
nuevo lee en toda la caja: con el código nuevo y la base vieja se rompería la caja de todos los negocios.
El build de Vercel frena si la base está atrás, así que ese error no llega a publicarse. Al revés no hay
problema: el código actual funciona con la base ya migrada.

**Qué afecta a los demás negocios:** la columna nueva e índice en `CashMovement` (nulos para todos) y el
código compartido que entra con el deploy. El push además publica lo que haya en `main` en ese momento.

| # | Paso | Quién | Se deshace |
|---|---|---|---|
| 1 | Respaldo: Neon → Branches → Create branch desde producción, `respaldo-AAAA-MM-DD-mia`, **Auto-delete: Never** (el plan gratis sólo retiene 6 horas). | Dueño | Sí |
| 2 | Volver a medir: `node scripts/taller/migrar-produccion.mjs` (sólo lectura). Tiene que decir «Listo para migrar». | Agente | No escribe |
| 3 | Migrar: `node scripts/taller/migrar-produccion.mjs --migrar`. Aplica, verifica índices únicos y RLS. | Agente, con OK del dueño | Sí, ver abajo |
| 4 | Traer lo nuevo de `main`, rebasar, repetir pruebas si hubo cambios. Push a `main`: **deploy de producción**. | Agente, con OK del dueño | Sí, Instant Rollback |
| 5 | Esperar *Ready* y `npm run release:smoke -- https://<dominio> --commit <sha>`. | Agente | No escribe |
| 6 | Alta en `/operador/alta`: rubro **Productora** elegido del desplegable, slug `mia-producciones`, estado `TRIAL`. | Dueño | Ver abajo |
| 7 | En la ficha del negocio: controlar que estén los módulos y prender **«Trabaja por apps»**. | Dueño | Sí |
| 8 | Dar de alta a las personas con su mail real (ficha → Personas). Las claves van sólo por chat al dueño. | Dueño | Sí |
| 9 | Cargar los costos reales del armador en Proyectos → Configuración. Los de fábrica son referencia. | MIA | Sí |
| 10 | Recorrido de punta a punta con un proyecto de prueba, en la dirección real. | Agente + dueño | — |

Si el slug termina siendo otro, sumarlo en `src/lib/proyectos/marca.ts` y `src/lib/branding.ts`; si no,
el negocio funciona pero sin su marca. El camino alternativo sin terminal es el SQL de
`docs/runbooks/pase-produccion/` pegado en el SQL Editor de Neon: es el mismo lote.

## Qué lo vuelve difícil de deshacer

- **Base:** la migración no borra ni reinterpreta datos. Si sale bien, no hace falta revertirla: el código
  viejo convive. Restaurar el respaldo es lo único que la deshace y **pierde lo que todos los negocios
  hayan cargado después de esa hora**: es el último recurso, no el primero.
- **Datos reales de MIA:** una vez que carguen proyectos y cobros, volver atrás los perdería.
- **Links enviados:** un cliente de MIA que aprobó por link ya vio esa propuesta; eso no se retira.

## Si algo sale mal

| Qué pasó | Qué se hace |
|---|---|
| El paso 2 frena | No se tocó nada. Lo pendiente cambió: revisar antes de seguir. |
| El paso 3 falla | Puede quedar a medio aplicar (P3009): `docs/runbooks/migracion-caja-neon.md`. No improvisar SQL. |
| Falla el chequeo de la app sobre una tabla nueva | Falta un GRANT: pegar `prisma/rls/0002_app_role.sql` en el SQL Editor (idempotente). |
| El deploy rompe pantallas | Vercel → Instant Rollback (`docs/runbooks/facturacion/rollback.md` §A), y revertir en `main` antes del siguiente push. |

## Qué NO está hecho

1. **El equipo (rol PROFESSIONAL) aterriza en la agenda vacía** y llega a Proyectos sólo por el buscador
   (Ctrl K). Sumarlo al menú rompe `src/apps/paridad-menu.test.ts`.
2. **Factura electrónica:** no se emite desde el módulo; sale de Facturación.
3. **Costos del armador:** provisionales, no son de MIA.
4. **Render:** es la vista 3D del navegador. No hay integración con un programa de render externo.
5. **PDF:** imprimir o guardar desde el navegador.
6. **Archivos:** imágenes achicadas en la base (hasta ~1 MB, 30 por proyecto) y links para lo pesado.
7. **Caja:** cheque y transferencia caen hoy en la columna «Mercado Pago» del reporte de caja.

## Verificación

Hecha con compilación real y base en memoria: alta, armador, cómputo, propuesta, aprobar y rechazar,
versión 2, cobro, caja, anulación, rentabilidad, rol equipo sin plata, celular.

**Sin probar:** subir una imagen por archivo, el PDF impreso y abrir WhatsApp. Los decimales sólo por
prueba unitaria.

**Medido el 01/11/2026 contra producción, sólo lectura:** 58 migraciones en el repo, la única pendiente es
`20261101120000_modulo_proyectos`, y coincide con `prisma/lote-deploy.txt`.

**No ensayada sobre una copia de producción:** la migración corrió sobre base en memoria con todas las
anteriores, no sobre un branch de Neon con datos reales. Para ensayarla: crear un branch `ensayo-lote` y
pegar en su SQL Editor `docs/runbooks/ensayo-neon/1-lote-en-branch.sql` y después
`2-rls-despues-del-lote.sql`.

**Trampa de Windows:** `node scripts/ensayo-lote-neon.mjs` no escribe nada acá (su control de arranque no
reconoce la ruta) y con saltos CRLF en `prisma/lote-deploy.txt` toma los comentarios como migraciones. El
SQL de ensayo se generó desde una copia con saltos LF; la suma de control `9a22cd47…` coincide con la del
archivo de la migración, que está en LF en esta copia y en git.
