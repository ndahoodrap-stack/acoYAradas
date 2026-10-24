# Procedimiento para crear el primer administrador

## Modo local (desarrollo/demo)

Los datos de demostración ya incluyen un administrador:

- Email: `admin@acoyaradas.app`
- Contraseña: `Demo1234!`

## Modo producción (Supabase)

1. Registrar un usuario normal desde la app (`/registro`) o vía Supabase Auth.
2. En la base de datos, asignar el rol `admin`:

```sql
update public.profiles set role = 'admin' where email = 'tu-email@dominio.com';
```

3. Si usás auth local, también actualizar `local_users`:

```sql
update public.local_users set role = 'admin' where email = 'tu-email@dominio.com';
```

4. Iniciar sesión. El panel estará en `/admin`.

## Seguridad

- El primer admin debe cambiar la contraseña inicial.
- No compartir credenciales administrativas.
- Registrar todas las acciones sensibles (la auditoría se guarda en `audit_log`).
- Revocar accesos de personal que ya no trabaja en la plataforma.