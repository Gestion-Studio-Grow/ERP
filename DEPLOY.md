# Guía de deploy

## 1. Base de datos (Postgres)

El proyecto ya está migrado de SQLite a Postgres (necesario porque en Vercel el
disco no persiste entre requests). Recomendado: **Neon** (gratis, se integra
directo con Vercel).

1. Andá a https://neon.tech y creá una cuenta / proyecto (o desde el propio
   dashboard de Vercel: Storage → Create Database → Neon).
2. Copiá la **connection string** (empieza con `postgresql://...`).
3. Pegámela acá en el chat o cargala vos mismo en `.env` como `DATABASE_URL`
   para correr la migración inicial.

## 2. Variables de entorno necesarias en Vercel

Configurar en el proyecto de Vercel → Settings → Environment Variables:

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | Connection string de Postgres (Neon) |
| `ADMIN_PASSWORD` | Sí | Contraseña real del panel — **cambiar la de desarrollo** |
| `AUTH_SECRET` | Sí | Secreto random para firmar la sesión (generar uno nuevo para producción, no reusar el de dev) |
| `RESEND_API_KEY` | No | Para que los recordatorios por email salgan de verdad |
| `RESEND_FROM_EMAIL` | No | Remitente de esos emails |
| `CRON_SECRET` | Recomendada | Protege `/api/cron/reminders` de llamadas externas |

## 3. Deploy

**Opción A — Netlify** (usada por límite de proyectos en Vercel Hobby):

1. Entrar a [netlify.com](https://netlify.com), loguearse con GitHub.
2. "Add new site" → "Import an existing project" → elegir el repo `ERP`.
3. Netlify detecta Next.js automáticamente (usa `netlify.toml` del repo).
4. Cargar las variables de entorno de la tabla de arriba en Site settings → Environment variables.
5. Deploy.

⚠️ El cron de recordatorios (`vercel.json`) es específico de Vercel. En Netlify
hay que migrarlo a una [Scheduled Function](https://docs.netlify.com/functions/scheduled-functions/)
— pendiente en el backlog, no bloquea el resto del sistema.

**Opción B — Vercel** (si más adelante liberás un proyecto o pasás a Pro):

1. Import Project → seleccionar el repo.
2. Cargar las variables de entorno de la tabla de arriba.
3. Deploy.

## 4. Primera migración + datos de ejemplo

Con `DATABASE_URL` apuntando a la base de producción:

```bash
npx prisma migrate deploy   # crea las tablas
npm run seed                # opcional: carga datos de ejemplo para mostrar
```

## 5. Después del primer deploy

- Entrar a `/admin/login` con la contraseña real y confirmar que funciona.
- Reemplazar los placeholders de marca (`[Tu marca]`, `[Acá va...]`) por los
  datos reales del cliente en `src/app/(site)/layout.tsx` y `page.tsx`.
- Revisar `vercel.json` — ya tiene configurado el cron de recordatorios cada hora.
