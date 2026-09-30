# GestorPro

Sistema de punto de venta e inventario: ventas, fiados, caja, mermas, proveedores, reportes y utilidades. Funciona en celular, tablet, laptop, PC y televisor.

Hecho con React + TypeScript + Vite + Tailwind, con Supabase como base de datos.

## Instalación

1. Instala [Node.js](https://nodejs.org) (versión 20 o superior).
2. Copia `.env.example` como `.env` y completa los datos de tu proyecto de Supabase (**Project Settings → API Keys**):
   ```
   VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
   VITE_SUPABASE_ANON_KEY=TU_CLAVE_PUBLICABLE
   ```
3. En la carpeta del proyecto:
   ```
   npm install
   npm run dev
   ```

## Configuración de Supabase

Crea un proyecto nuevo en [supabase.com](https://supabase.com) y ejecuta estos dos scripts, **en este orden**, una sola vez. Para cada uno: menú izquierdo → **SQL Editor** → **New query** → pega el contenido del archivo → **Run**.

1. [`supabase/estructura.sql`](supabase/estructura.sql): crea las 15 tablas, índices, funciones, vistas de reportes y triggers (descuento de stock, estado de fiados, abonos que entran a caja), más los datos iniciales. La base queda vacía y lista para usar.
2. [`supabase/storage_empresa_logos.sql`](supabase/storage_empresa_logos.sql): crea el espacio de archivos `empresa_logos` (público, máximo 5 MB por imagen) para subir el logo desde **Configuración → Datos de la empresa**. Sin él, al guardar un logo aparece el error `Bucket not found`.

### Primer ingreso

| Usuario | Contraseña |
|---|---|
| `admin` | `cambiar123` |

Cámbiala enseguida en **Configuración → Gestión de usuarios**. Luego, en **Configuración → Datos de la empresa**, pon el nombre, RUC, dirección, teléfono y logo de tu negocio.

## Publicar en internet (Vercel)

1. Sube el proyecto a GitHub e impórtalo en [vercel.com/new](https://vercel.com/new) con el preset **Vite**.
2. En **Environment Variables** agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
3. Pulsa **Deploy**.
