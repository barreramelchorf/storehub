# Roles y Permisos — StoreHub

## Roles y sus permisos

| Rol | Permisos |
|-----|----------|
| **administrador** | `sales.create`, `sales.view`, `sales.delete`, `sales.override_price`, `sales.backdate`, `inventory.view`, `inventory.manage`, `inventory.restock`, `analytics.view`, `audit.view`, `settings.manage`, `users.manage`, `documents.manage` |
| **gerente** | `sales.create`, `sales.view`, `sales.delete`, `sales.override_price`, `sales.backdate`, `inventory.view`, `inventory.manage`, `inventory.restock`, `analytics.view`, `audit.view`, `documents.manage` |
| **cajero** | `sales.create`, `sales.delete` |
| **almacenista** | `inventory.view`, `inventory.restock` |
| **cajero_almacenista** | `sales.create`, `inventory.view`, `inventory.restock` |

## Qué puede hacer cada rol

### Cajero
- POS: ver productos, crear ventas, vaciar carrito
- Ventas: ver historial de ventas, solicitar eliminación (va a aprobaciones)
- Perfil: ver su info, cambiar su contraseña
- **NO puede**: backdatear ventas, ver dashboard/analytics, gestionar inventario, gestionar usuarios, ver auditoría, cambiar configuración

### Almacenista
- Inventario: ver productos, reabastecer stock
- Perfil: ver su info, cambiar su contraseña
- **NO puede**: crear ventas, ver ventas, ver analytics, gestionar usuarios

### Cajero + Almacenista
- POS: ver productos, crear ventas
- Inventario: ver productos, reabastecer stock
- Perfil: ver su info, cambiar su contraseña
- **NO puede**: backdatear ventas, eliminar ventas, ver analytics, gestionar usuarios

### Gerente
- Todo lo del cajero + almacenista
- Dashboard y Analytics
- Eliminar ventas directamente (sin aprobación)
- Backdatear ventas
- Override de precios
- Ver auditoría
- Gestionar documentos
- **NO puede**: gestionar usuarios, cambiar configuración

### Administrador
- Todo

## Endpoints y permisos requeridos

| Endpoint | Permiso(s) | Notas |
|----------|-----------|-------|
| `GET /api/admin/products` | `inventory.view` OR `sales.create` | Cajero necesita ver productos para el POS |
| `POST /api/admin/products` | `inventory.manage` | |
| `PUT/DELETE /api/admin/products/:id` | `inventory.manage` | |
| `POST /api/admin/inventory/restock` | `inventory.restock` | |
| `GET /api/admin/sales` | `sales.view` OR `sales.delete` | Cajero puede ver ventas para solicitar eliminación |
| `GET /api/admin/sales/:id` | `sales.view` OR `sales.delete` | |
| `POST /api/admin/sales` | `sales.create` | + `sales.backdate` si saleDate ≠ hoy |
| `DELETE /api/admin/sales/:id` | `sales.delete` + `users.manage` | Solo admin/manager directo |
| `POST /api/admin/sales/:id/request-delete` | `sales.delete` | Cajero → va a aprobaciones |
| `POST /api/admin/sales/:id/approve` | `sales.view` | Admin/manager aprueba/rechaza |
| `GET /api/admin/analytics` | `analytics.view` | |
| `GET /api/admin/analytics/yearly` | `analytics.view` | |
| `GET /api/admin/users` | `users.manage` | |
| `POST/PUT/DELETE /api/admin/users/*` | `users.manage` | |
| `GET /api/admin/roles` | `users.manage` | |
| `GET /api/admin/settings` | `settings.manage` | |
| `PUT /api/admin/settings` | `settings.manage` | |
| `GET /api/admin/audit` | `audit.view` | |
| `GET /api/admin/profile` | (cualquier usuario autenticado) | |
| `PUT /api/admin/profile/password` | (cualquier usuario autenticado) | |
| `GET/POST /api/admin/bulk/*` | `inventory.manage` | |
| `GET /api/public/*` | (sin autenticación) | Info pública del tenant |

## Navegación visible por rol

| Sección | Permiso que la muestra |
|---------|----------------------|
| Dashboard | `analytics.view` |
| Punto de Venta | `sales.create` |
| Ventas | `sales.delete` |
| Inventario | `inventory.view` |
| Analytics | `analytics.view` |
| Aprobaciones | `users.manage` |
| Documentos | `documents.manage` |
| Usuarios | `users.manage` |
| Auditoría | `audit.view` |
| Configuración | `settings.manage` |
| Mi perfil | (siempre visible) |

## Notas importantes

- El POS **no envía `saleDate`** si la fecha es hoy → así no se activa el check de `sales.backdate`
- Solo si el usuario cambia la fecha explícitamente a un día diferente se requiere `sales.backdate`
- Si el usuario NO tiene `sales.backdate` pero cambia la fecha → la venta se crea como `pending_approval` y va a aprobaciones
- Si el usuario SÍ tiene `sales.backdate` → la venta se aprueba directamente
- La eliminación de ventas por cajeros **siempre** pasa por aprobación (admin/manager debe aprobar)
- Admin/manager eliminan directamente sin aprobación
- `/api/public/info` se usa para cargar branding/colores en el layout (no requiere permisos)
