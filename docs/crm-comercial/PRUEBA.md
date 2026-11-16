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

## 4. Carga y limpieza en otra base (nunca Neon desde un script)
```
npm run crm:cargar-prueba -- --negocio <slug>           # idempotente: dos veces no duplica
npm run crm:limpiar-prueba -- --negocio <slug>          # simulacro (por defecto): cifras reales, nada borrado
npm run crm:limpiar-prueba -- --negocio <slug> --aplicar
```
Todo lo cargado queda anotado en `FilaDePruebaCrm` (migración `20261116170000_crm_comercial_filas_de_prueba`). La
limpieza borra SÓLO lo anotado de ESE negocio y lo que cuelga de sus oportunidades; lo que usa algo que no es de la
prueba se queda y se informa. Los proyectos nacidos al ASIGNAR se informan y se borran desde Proyectos.

## 5. En la app PUBLICADA
Sin credenciales de base y sin la interfaz de comandos: cada sesión de puesto entra por el login del ERP del negocio
con su usuario propio (alta por Dirección en Equipo, con `mustChangePassword`) y opera en `/admin/crm`. Las claves
provisorias van por mail aparte al titular, nunca en informes ni commits.
