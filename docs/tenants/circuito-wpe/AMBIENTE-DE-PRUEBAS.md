# WPE · ambiente de pruebas (GSG-PLAT-016)

Orden del dueño (16/11/2026): «Subamoslo a la base y simulemos que es un cliente real», y después «sumemosle la
administración del club». El sitio congelado (`src/tenants/circuito-wpe/sitio/index.html`, wpe.gsgapp.com.ar) **no se
toca**: el ambiente de pruebas es un negocio aparte del ERP.

## Qué es
- Negocio `wpe-pruebas` (nombre y subdominio **provisionales a confirmar** por el dueño al publicar).
- Módulos: `torneo`, `club`, `clients`, `pos`.
- `/admin/torneo`: el torneo en curso del sitio, guardado en la base por negocio. El navegador manda un comando
  (resultado, W.O., borrar, reprogramar) con la versión que vio; el servidor aplica el MISMO motor del sitio (se lee
  del HTML congelado, sin copiarlo) y guarda la foto con la versión nueva. Si otro cambió antes: aviso, no se pisa.
- `/admin/club`: la jornada real del club (la de Break Point, con la foto propia de este negocio). Arranca con
  «Dueño de prueba» (provisional), nunca con los dueños de otro cliente (`dueniosDelClub`).

## Quién hace qué
| Usuario | Rol del ERP | En el torneo |
|---|---|---|
| duenio | OWNER | gestiona todo |
| organizador | RECEPTION | gestiona todo |
| jugador | PROFESSIONAL | sólo mira |
| agente | PROFESSIONAL + excepción `torneo:resultados` | carga resultados y W.O.; no borra ni reprograma |

Cada cambio deja una fila `TorneoMutacion` en la auditoría con quién, qué partido, antes y después.

## Datos (sin migración)
Foto: `AuditLog` con `entity = "TorneoEstado"`, `entityId = tenantId`, comprimida (gzip). Se guardan la vigente, las 10
anteriores y la de generación; está exenta de la purga. Pasar a tabla propia cuando haya un segundo negocio real, la
foto supere 1 MB comprimida o haya choques frecuentes (deuda anotada).

## Alta (Gate: la hace el dueño)
`DATABASE_URL=… node --import tsx scripts/wpe-pruebas-alta.ts --claves <archivo>`: crea el negocio y los 4 usuarios con
contraseñas fuertes que se escriben SÓLO en `<archivo>` (permisos 600), con cambio obligatorio al primer ingreso. Se
entregan por mail aparte a cada titular. `--laboratorio` sólo contra una base local. Mails reales: `--<clave>-email`
(sin eso quedan `<clave>@wpe-pruebas.invalid`, provisional).
