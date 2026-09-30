import { createContext, useContext } from 'react';
import type { PermisosUsuario } from '../sections/Configuraciones/types';
import type { EmpleadoSesion } from './sesion';

export type ClavePermiso = keyof PermisosUsuario;

export const tienePermiso = (permisos: Partial<PermisosUsuario> | null | undefined, clave: ClavePermiso) =>
  !!permisos && (permisos.sistema_acceso_total === true || permisos[clave] === true);

// Qué permiso abre cada módulo del menú (uno basta)
const PERMISOS_POR_MODULO: Record<string, ClavePermiso[]> = {
  resumen: [], // siempre visible; las cifras de dinero se ocultan sin "Ver utilidades"
  pos: ['caja_realizar_ventas'],
  fiados: ['caja_ver_fiados'],
  inventario: ['almacen_ver_stock'],
  proveedores: ['almacen_gestionar_proveedores'],
  mermas: ['almacen_registrar_mermas'],
  finanzas: ['caja_abrir_cerrar_turno', 'caja_ingresos_egresos'],
  utilidades: ['gerencia_ver_utilidades'],
  reportes: ['reportes_ver_historial_ventas', 'reportes_ver_globales'],
  configuracion: ['gerencia_configuracion_sistema', 'gerencia_gestionar_usuarios'],
};

export const puedeVerModulo = (permisos: Partial<PermisosUsuario> | null | undefined, modulo: string) => {
  const requeridos = PERMISOS_POR_MODULO[modulo];
  if (!requeridos) return false;
  if (requeridos.length === 0) return !!permisos;
  return requeridos.some((clave) => tienePermiso(permisos, clave));
};

// El empleado de la sesión actual, disponible en toda la app sin pasar props (lo llena SesionProvider)
export const SesionContext = createContext<EmpleadoSesion | null>(null);

export const useEmpleado = () => useContext(SesionContext);

// Uso: const puedeEliminar = usePermiso('almacen_eliminar_productos');
export const usePermiso = (clave: ClavePermiso) => tienePermiso(useContext(SesionContext)?.permisos, clave);
