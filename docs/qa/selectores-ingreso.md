# Selectores del ingreso por puesto (MIA-259)

Ayudante: `scripts/proyectos/ingreso-por-puesto.mjs` (sólo demo local). Selectores leídos del código:

| Paso | Ruta | Selector | Fuente |
|---|---|---|---|
| Clave | `/admin/login` | `#login-email`, `#login-password`, Enter | `src/app/admin/login/LoginRenglon.tsx:74-82` |
| TOTP, activar | `/admin/login/segundo-paso` | clic en «No puedo escanear», secreto en `[data-secreto]` (base32), código en `#codigo` | `segundo-paso/page.tsx`, `_formulario.tsx:32` |
| TOTP, después | idem | enlace «Ya los guardé, entrar» o «Entrar» | `segundo-paso/_formulario.tsx:20,25` |
| Cambio de clave | `/admin/cambiar-password` | `#cp-current`, `#cp-new`, `#cp-confirm` | `cambiar-password/ChangePasswordForm.tsx:49-97` |
| Código de equipo (lo genera Dirección) | `/admin/proyectos/equipo` | botón «Generar código de ingreso para <nombre>»; código en `getByRole("status")` → `p.font-mono` (su `aria-label` es «Código 1 2 3…», con espacios: no leerlo de ahí) | `proyectos/equipo/CodigoParaPasar.tsx:15-27` |
| Código, quien entra | `/admin/login/pin` | `#codigo` | `login/pin/_formulario.tsx:19` |
| Definir PIN | `/admin/definir-pin` | `#pin`, `#confirmacion`; o enlace «Ahora no» | `definir-pin/_formulario.tsx:30-41` |

Tope: 5 códigos cada 15 min por persona (`src/lib/rendiciones/pin.server.ts`, `generarPinParaPasar`). El ayudante pide uno por puesto y después reusa `.ingreso-por-puesto/<puesto>.json`.

## Corrida de MIA-260 (demo local, 20/11)
Corrió para direccion, administracion, produccion, comercial y campo. Tres arreglos del ayudante (la app estaba bien):
- Errores: `[role="alert"]:not(#__next-route-announcer__)`. El anunciador de rutas de Next también es `role="alert"` y lee el título («Verificación en dos pasos»): parecía un TOTP rechazado.
- TOTP ya activo: la acción redirige sola (`segundo-paso/acciones.ts:32`), no muestra «Entrar»; se espera el cambio de URL.
- Puestos con PIN: al entrar con la clave, `/admin/login/pin` ya pidió un código por mail; el de Equipo espera el minuto entre códigos (`pin-core.ts:89`) y reintenta una vez. Son 2 códigos por puesto, debajo del tope de 5.
- «Ahora no» en definir PIN: se sigue el `href` (con clic, el enlace a veces quedaba suelto).
Sin el navegador de su Playwright, usa `/opt/pw-browsers/chromium` (o `PW_CHROMIUM`). `CAPTURAS=1` saca el inicio también al reusar la sesión.
