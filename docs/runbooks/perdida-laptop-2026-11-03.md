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
