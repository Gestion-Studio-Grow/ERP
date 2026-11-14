# Tarjeta D-9 · Dos usuarios de base para soporte (clic por clic)

Decisión del dueño, 14/11/2026: «a) Dos usuarios nuevos». Diseño: `DISENO-MANT-001.md` §7.2–7.6.
Migración: `prisma/pending-gate2/MANT_roles_soporte.sql` (**Gate 2**: sólo con el OK del dueño).

**Regla de oro: ninguna clave pasa por el chat, ni por un mail, ni por un commit.** Se genera en Neon, se pega
directo en Vercel y no se guarda en ningún otro lado (si querés un respaldo, tu gestor de contraseñas).

## Antes (lo hace la orquestadora, no vos)

1. Respaldo de Neon en `old-frost-91078346` (rotación de 4: se borra el `respaldo-*` más viejo antes).
2. Ensayo en una rama de Neon creada desde ese respaldo: se aplica el `.sql` ahí, se prueba la consola
   apuntada a esa rama y se borra la rama. Si algo falla, se para acá.

## Paso 1 · Aplicar la migración (Gate 2, 5 minutos)

1. Entrá a console.neon.tech → proyecto del ERP → rama **main** → **SQL Editor**, base `neondb`.
2. Abrí `prisma/pending-gate2/MANT_roles_soporte.sql` en GitHub, copiá todo y pegalo en el editor.
3. **Run.** Va todo junto (BEGIN…COMMIT): si sale un error, no quedó nada aplicado y se avisa a la orquestadora.
   El bloque final se fija solo que ningún usuario saltee la seguridad y que CH quede bloqueado.

Los dos usuarios (`gsg_operador`, `gsg_agente`) nacen **sin clave**: no pueden entrar hasta el paso 2.

## Paso 2 · Ponerles clave (2 minutos)

1. Neon → rama **main** → **Roles** (Roles & Databases).
2. Buscá `gsg_operador` → **Reset password** → Neon muestra la clave una sola vez. **No la copies todavía.**
   Si el rol no aparece en la lista, avisá a la orquestadora (provisional a confirmar: Neon lista los roles
   creados por SQL; si no, se arma otro camino sin que la clave pase por el editor).
3. Con la ventana abierta, seguí al paso 3 y usá **Connect** para copiar la cadena completa.

## Paso 3 · Cargar las variables en Vercel (3 minutos)

1. Neon → **Connect** → Role: `gsg_operador`, conexión **pooled** → copiá la cadena de conexión.
2. vercel.com → proyecto **erp-ch** → **Settings** → **Environment Variables** → **Add**:
   nombre `OPERATOR_DATABASE_URL`, valor = lo copiado, entorno **Production** → **Save**.
3. Repetí 2.2 a 3.2 con `gsg_agente` y la variable `AGENTE_DATABASE_URL`. (Hoy nadie la usa: queda lista
   para cuando los agentes tengan su conexión, tanda T-E.)
4. La variable entra en el próximo deploy. **Redeploy = producción**: hacelo cuando lo digas vos.

## Paso 4 · Verificar (2 minutos)

- Entrá a la consola de operador → Soporte: tiene que listar los tickets como antes.
- Si algo no anda: Vercel → borrar `OPERATOR_DATABASE_URL` → redeploy. La consola vuelve al usuario de
  siempre y los usuarios nuevos quedan inertes. La reversa del `.sql` está al pie del archivo.

## Qué cambia

- La consola entra con `gsg_operador` (hoy, los mismos permisos que la app menos borrar o cambiar el
  registro de auditoría; se angosta tabla por tabla después del ensayo).
- Los agentes, con `gsg_agente`: sólo tickets y su registro, **nunca CH** (bloqueado en la base), nunca plata,
  usuarios ni claves, y sólo de negocios cuyo titular tildó el permiso (D-4).
