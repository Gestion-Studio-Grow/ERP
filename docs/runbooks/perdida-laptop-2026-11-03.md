# Pérdida de la laptop de trabajo: daño, recuperación y cómo seguir (2026-11-03)

**Equipo perdido:** PC Windows del dueño, usuario `mlloveras2`. Corría las sesiones locales (Remote
Control), los worktrees `C:\mia` y `C:\miah`, la carpeta `Documents\Claude` con los 22 worktrees de
`estetica-erp`, y Chrome con «Claude in Chrome».

**Verificado contra GitHub y contra los registros de las sesiones el 2026-11-03.**

## 1. Lo que está a salvo

| Qué | Dónde | Estado |
|---|---|---|
| **Producción** (CH, MIA, todos los tenants) | Vercel + Neon, en la nube | Sigue andando. Sirve `ee193f1e`, que es `origin/main` (02/11 16:34). La laptop no participa en producción. |
| Código del ERP | `Gestion-Studio-Grow/ERP` | `main` al día, más 145 ramas. MIA está entero en `main`: proyectos, stands 3D, consultas, agentes. También CH ronda 4 certificada y M1/S2/P1/P2. |
| Migraciones | `prisma/migrations/` en `main` | Hasta `20261102120000_consultas`. Las de proyectos ya están aplicadas, según la sesión de MIA. |
| Factory-GSG | `Gestion-Studio-Grow/Factory-GSG` | `main` del 28/10, con `20-MEMORIA`, gobierno y agencia de turismo. |
| Secretos | Vercel (variables de entorno) y gestor de contraseñas | **No hay secretos en los repos**: se escanearon los dos y sólo aparecen nombres y ejemplos. |
| Registros de todas las sesiones, también las locales | Servidores de Claude | Se pueden leer desde una sesión en la nube. Es la vía para rescatar trabajo no subido (sección 3). |

## 2. El riesgo principal: seguridad

Lo grave no es lo que se perdió, sino **quién puede usar lo que había en la laptop**. Ahí había:

- Archivos `.env` con las conexiones a Neon (incluida la de dueño, `neondb_owner`), `AUTH_SECRET`,
  `OPERATOR_PASSWORD` y otros.
- Certificados de ARCA.
- Tokens de MP y WhatsApp.
- Credenciales de git y GitHub, y el CLI de Vercel.
- Chrome con sesiones abiertas: Gmail, GitHub, Vercel, Neon, Mercado Pago, claude.ai.
- Remote Control como dispositivo de confianza.

**Si el disco no estaba cifrado con BitLocker, hay que tratar todo como comprometido.**

### Orden de rotación: hoy, de arriba hacia abajo

1. **Cerrar sesiones remotas:**
   - Google: Seguridad → Tus dispositivos → quitar la laptop.
   - claude.ai: cerrar las sesiones y sacar la laptop de Remote Control y de los dispositivos de confianza.
   - GitHub: Settings → Sessions, y revocar tokens y claves SSH de esa máquina.
   - Vercel: Tokens.
   - Neon.
   - Mercado Pago.
2. **Neon:** resetear la contraseña de `neondb_owner` y de los roles de la app. Después actualizar en
   Vercel: `DATABASE_URL`, `MIGRATE_DATABASE_URL` y `OPERATOR_DATABASE_URL`.
3. **Secretos de la app en Vercel:**
   - `AUTH_SECRET` y `OPERATOR_SECRET`: cambiarlos cierra todas las sesiones, que es lo deseado.
   - `OPERATOR_PASSWORD`.
   - `CRON_SECRET`, `MP_WEBHOOK_SECRET`.
   - `EXTERNAL_ORDERS_API_KEY(S)`.
   - Las bootstrap `*_OWNER_BOOTSTRAP_PW`.
4. **Integraciones:**
   - Mercado Pago: regenerar el access token por negocio.
   - WhatsApp: `WHATSAPP_CLOUD_TOKEN` y `WHATSAPP_APP_SECRET`.
   - `RESEND_API_KEY`.
   - Las claves de Anthropic, Cloudflare (R2 e imágenes) y Google OAuth que usa MIA.
5. **ARCA:** si la clave privada del certificado estaba en la laptop, revocar ese certificado en ARCA y
   generar uno nuevo.
6. **Contraseñas OWNER** de los tenants (`/admin`), empezando por CH, que es el cliente vivo.
7. **Redeploy** de `main` en Vercel para que tome las variables nuevas. Es un redeploy del mismo commit,
   sin cambios de código: lo hace el dueño desde el panel.

**Gates:** las rotaciones y el redeploy los hace el dueño, porque tocan secretos y producción. Ningún
agente las ejecuta.

## 3. Lo que se perdió y cómo rescatarlo

| Qué | Commit o ubicación | Gravedad | Cómo se rescata |
|---|---|---|---|
| Kit de redes sociales de GSG: guiones, carruseles, mensajes V1–V3 | `b3627ed`, commiteado sin push | Media | Reconstruir desde el registro de la sesión «Redes sociales GSG con optimización de tokens». Los archivos están en las escrituras de esa sesión. |
| Arreglo C-1: seña de MP facturada dos veces | Rama `fix/c1-rediseno`, `da2b418f`, sin push | **Alta** (plata) | Reconstruir desde los registros de «Rediseño C-1» y «Consola del contador y Facturita». **Hay que volver a certificarlo**: es plata. |
| Ajuste del `/status` (health de CH) | `ff9560f` | Baja | Rehacerlo: es una línea. |
| Cambios en Factory-GSG posteriores al 28/10 (por ejemplo `MIA-PASOS-DEV.txt`) | Locales | Media | `MIA-PASOS-DEV.txt` se reconstruye desde la sesión de Heka. Para el resto, revisar los registros. |
| Memoria local de Claude (`MEMORY.md`, `project_mia_producciones.md`) | `C:\Users\...\.claude` | Baja | Parte está en `Factory-GSG/20-MEMORIA`; el estado real está en el repo. |
| Worktrees con cambios sin commitear | `C:\mia`, `C:\miah`, `Documents\Claude\estetica-erp-*` | Sin medir | No se puede saber qué había. Las sesiones de Heka y MIA terminaron con todo en `main`. |
| `node_modules`, `.next`, copias viejas | Locales | Ninguna | Se regeneran. |

## 4. Cómo seguir trabajando sin la laptop

- **Sesiones en la nube** (claude.ai/code o la app): clonan desde GitHub. Sirven para código, tests,
  `tsc` y build sin la PC, igual que esta sesión.
- **Deploy:** push a `main` = Vercel construye. No hace falta máquina local, con la misma regla de siempre:
  sólo con orden del dueño.
- **Migraciones (Gate 2):** el build de Vercel las aplica si existe `MIGRATE_DATABASE_URL`. Ojo: después de
  rotar Neon hay que actualizarla.
- **Lo que necesita una máquina:**
  - Probar en un navegador con sesión iniciada en producción (Claude in Chrome).
  - Postgres local (EDB) para los ensayos.
  - En la nube hay Chromium y Playwright para el QA de la demo.
- **Ventaja de este cambio:** cumple la regla de `docs/PRACTICA-DE-GUARDADO.md` («nada vive sólo en una
  máquina»). A partir de ahora, el trabajo nuevo se hace en sesiones en la nube y se pushea a su rama al
  cerrar cada hito.

## 5. Lección para el registro

**Síntoma:** trabajo commiteado sin push (`b3627ed`, `da2b418f`, `ff9560f`) y secretos en `.env` dentro
de una sola laptop.

**Regla:**

- Push a la rama de trabajo al cerrar cada hito; un commit sin push no cuenta como guardado.
- Disco cifrado.
- Secretos sólo en Vercel y en el gestor de contraseñas, con la menor cantidad posible en `.env` locales.
- Una lista de rotación lista para usar (este documento, sección 2).

---

## 6. Impacto por cliente (3 agentes, registros de sesiones + GitHub, 2026-11-03)

| Cliente | En producción o en `main` | Perdido (sólo estaba en la laptop) | ¿Se reconstruye? | Impacto |
|---|---|---|---|---|
| **Facturita / Consola del contador** | Lo que ya existía en `src/app/contador` y `src/app/facturita` | Rama `producto/facturin` (C:\fin): `6a2b4d7d`, `1bab399d`, `c09d3753` (certificada), `cae19ffe` (T4 en curso). Incluye el control de la clave temporal (`requireCapability`) | **En parte:** `CONDICIONES-DEL-PASE.md` (Write `f048f6bf`); scripts `ed3/ed4/ed5.cjs` (`2ce8d02e`, `cb3933a6`, `30ac5a50`); tests (`628285cd`, `7453f51a`); faltan las vueltas viejas | **Alto** |
| **CH Estética** (vivo) | `8e35ce19`, ronda 2 certificada; producción intacta | `ch/etapa-2` `b3b70a5e` (cobro único, «Mañana», seña MP, recordatorios); `ch/integra-etapa2` `da82f113`; `ch/recordatorios-auto`; `fix/c1-rediseno` `da2b418f` | C-1: Edit de cobros y bancos (`0207f666`, `7de1f126`, `3937ceee`…). Etapa 2: **no** (la hicieron subagentes). Manual de pruebas completo (`3929351e`) | Medio |
| **Factory-GSG después del 28/10** | Nada posterior a `7157018` | `00-ESTADO` (ORQUESTADOR, EVALUACION-S2), `status-n2.sh`, `MIA-PASOS-DEV.txt`, sección del manual de MIA | `MIA-PASOS-DEV.txt` **completo** (`a15ddbac`); EVALUACION-S2 (`f93f9548`); el resto en parte | Alto (estado interno) |
| **Kit de redes de GSG** | Nada en Git | `redes/`: guiones y mensajes V1–V3, `gsg/formatos.md` | **Casi todo:** ESTUDIO.md (`209a93c8` + 6 Edit), factoque README (`0830f2d6`), video (`5c62d2fb`), cuentas (`fb9e38c6`), perfil.svg (`52c36ab2`…), ficha (`634c48f5`). Guiones y mensajes: no (dependen de docs perdidos) | Medio |
| **Memoria de Claude** | `20-MEMORIA` sincronizada el 04/09 | ~10 notas (MEMORY.md, mia, s2, pases Neon, shine…) | En parte; `project_s2_recortado_aplicado` completa (`6d1c4b18`) | Medio |
| **Magra** | S2 aplicado en Neon el 01/11 (respaldo `respaldo-s2-2026-11-01`) y código en `main` | Scripts de C:\m1caja | No hace falta | Bajo (falta avisarle al encargado de Lotes y Despiece) |
| **Circuito WPE** (vendido) | Sitio en `main`; repo propio con un solo commit (13/07) | Lo hecho en `Documents\Claude\circuito-wpe` después del 13/07 (¿app Expo?) | No: ninguna sesión lo registra. **Preguntarle al dueño** | Medio |
| Break Point | T3C y B4 en `main`; corrieron en la nube | Nada | – | Bajo |
| Matías Consoli | En `main` | Nada | – | Bajo |
| Taller AGR | En `main` (el README que dice «sin push» está desactualizado) | Lo que hubiera sin commitear en C:\agr, desconocido | No | Bajo |
| Inmobiliaria (PDC) | En `main` (`0d60adc4`, `68b43fd4`) | La skill `rae` local | No hace falta | Bajo. **La clave temporal del OWNER de PDC quedó escrita en el registro de la sesión: cambiarla** |
| Supermercado | Todo en `main` | Nada | – | Bajo |
| Buscatufoto | `main` (`5df82081`); la beta y la política de menores están en la rama `ccr-b472eea8-50j9zt` | Nada en la laptop; el cambio a un proyecto de Vercel propio quedó sin commitear en una sesión en la nube | Sí, desde el registro | Bajo |
| Tiendas (Qué Bien Olés, Shine, A Dos Manos) | En `main` | Nada | – | Bajo |
| MIA | Entera en `main` y en producción (`ee193f1e`) | Sólo su guía (`MIA-PASOS-DEV.txt`), recuperable | Sí | Bajo |

### Orden de reconstrucción propuesto (tareas reversibles, en sesiones en la nube)

1. `MIA-PASOS-DEV.txt` y el kit de `redes/`: copia directa desde los registros. Es lo más barato.
2. `producto/facturin`: reconstruir desde los registros, y después **certificar de nuevo** (toca seguridad y plata).
3. C-1 (seña MP facturada dos veces): reconstruir y certificar de nuevo. Antes, el dueño elige una de las 3 opciones.
4. CH etapa 2: **rehacerla** desde su diseño, no desde el registro.
5. `00-ESTADO` y la memoria: reescribir el estado actual desde el repo (`npm run brain`), sin recuperar texto viejo.

### Urgente del dueño, además de la sección 2

- Cambiar la clave del OWNER de PDC.
- Cargar `CANCELACION_ONLINE_HORAS=beauty-spa=24` en Vercel y prender en CH «Diseño nuevo» y «Agenda práctica».
- Avisarle al encargado de Magra.
- Confirmar si había trabajo local de Circuito WPE posterior al 13/07.
- Neon tiene los branches de respaldo en 10/10: liberar lugar antes de la rotación.
