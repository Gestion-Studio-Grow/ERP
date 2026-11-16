# Prueba del CRM comercial — cómo se levanta y cómo se opera

_GSG-CRM-011 parte 3 · diseño `docs/tenants/mia-producciones/CRM-REINGENIERIA.md` §6. Datos ficticios; nada se envía a terceros._

## 1. Ambiente local (no toca Neon ni producción)
```
npm run crm:prueba-local                  # base en memoria + migraciones + seed + CRM + carga + app
node scripts/crm-comercial/prueba-local.mjs --solo-base   # igual, sin app: sólo para operar por comandos
node scripts/crm-comercial/prueba-local.mjs --sin-app     # prepara, informa lo cargado y sale
```
- App: `http://mia-producciones.localhost:3219/admin/crm` · base para operar: `postgresql://postgres:postgres@127.0.0.1:54339/postgres`.
- Interruptor «crm-comercial» prendido. Carga: 3 clientes activos (GANADA, con comercial) y los 20 leads de
  `docs/tenants/mia-producciones/crm-prueba/leads.json` (consulta → RECIBIDA, prospecto → DETECTADA; lo que el motor
  frena o une queda anotado con el motivo). Cada oportunidad nueva deja su primera tarea (Verificador o Calificador).
- PGlite corre sin RLS: aislamiento y carreras se prueban en Postgres real (`src/lib/crm-comercial/*-postgres.test.ts`).

## 2. Usuarios locales (clave de DEMO local `crm-prueba-local-2026`, o `CRM_PRUEBA_CLAVE`)
| Usuario | Rol en el CRM |
|---|---|
| `direccion@crm-prueba.example` | Dirección (dueña del negocio en el ERP) |
| `comercial1@…`, `comercial2@…` (dominio `crm-prueba.example`) | Comercial |
| `puesto-<puesto>@crm-prueba.example` | Puesto: descubridor, identificador, verificador, contactos (apagado), redactor, seguidor, calificador, armador-brief |

Entran por el login del ERP del negocio. Un puesto sólo ve lo que creó o la tarea que tomó.

## 3. Operar como un puesto por comandos (SÓLO LOCAL)
```
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54339/postgres
npm run crm:operar -- ayuda                                       # lista de comandos y sus datos
npm run crm:operar -- --como puesto-verificador@crm-prueba.example tomar-tarea
npm run crm:operar -- --como puesto-verificador@crm-prueba.example ficha '{"id":"<oportunidad>"}'
npm run crm:operar -- --como puesto-calificador@crm-prueba.example proponer-pase '{"id":"…","destino":"CALIFICADA"}'
```
- `--negocio` (por defecto `mia-producciones`) y `--como <email>` identifican negocio y usuario; datos en JSON o `@archivo.json`.
- Comprueba el usuario y el interruptor y llama a las MISMAS funciones del repo que las acciones del servidor: el
  permiso por puesto, los topes y el registro de cada rechazo los pone el repo. Salida JSON; código 1 si rechaza.
- Se niega a correr contra una base que no sea de esta máquina (y contra Neon).

## 4. Carga y limpieza en otra base
`npm run crm:cargar-prueba -- --negocio <slug>` (idempotente) · `npm run crm:limpiar-prueba -- --negocio <slug>`
(simulacro: cifras reales, nada borrado) · igual con `--aplicar` para borrar. Todo queda anotado en `FilaDePruebaCrm`;
la limpieza borra SÓLO lo anotado de ESE negocio y lo que cuelga de sus oportunidades; lo que usa algo ajeno a la
prueba se queda y se informa; los proyectos nacidos al ASIGNAR se borran desde Proyectos. Neon se rechaza siempre,
salvo las dos llaves del §5 (`src/lib/crm-comercial/guarda-base.ts`).

## 5. Dejar la prueba lista en PRODUCCIÓN (en orden; cada paso, quien corresponde)
1. **Migraciones (Gate 2, las aplica el rol autorizado, no quien construye):** `20261116150000_crm_comercial`,
   `…160000_crm_comercial_pronostico`, `…170000_crm_comercial_filas_de_prueba`. Sin ellas el CRM dice «falta un paso».
2. **Interruptor:** consola del operador → ficha del negocio → «CRM comercial» → encender. Apagado = 404 y toda acción rechaza.
3. **Usuarios:** en `/admin/usuarios` del negocio, un usuario por persona y uno propio por puesto (rol Recepción,
   contraseña provisoria con `mustChangePassword`, por mail aparte al titular; nunca en informes ni commits).
4. **Miembros:** la dueña entra a `/admin/crm` y se da de alta en Dirección (sólo si no hay nadie); después, en
   `/admin/crm/miembros`, da a cada usuario su papel (Comercial o el puesto, con topes por día si quiere).
5. **Carga** (con la `DATABASE_URL` de la app publicada; nunca se imprime):
   `CRM_PRUEBA_CONFIRMO_NEGOCIO=<slug> npm run crm:cargar-prueba -- --negocio <slug> --produccion`
   Sin `--produccion`, o con la variable vacía o de otro negocio, corta antes de conectar.
6. **Deshacer:** misma variable y `npm run crm:limpiar-prueba -- --negocio <slug> --produccion` (simulacro) → revisar
   cifras → repetir con `--aplicar`. Después, apagar el interruptor si la prueba terminó.
Las sesiones de puesto entran por el login del negocio con su usuario y operan en `/admin/crm`; la interfaz de
comandos (§3) no corre contra producción.
