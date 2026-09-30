import React from 'react';
import { SesionContext } from './permisos';
import type { EmpleadoSesion } from './sesion';

// Pone al empleado de la sesión a disponibilidad de toda la app (usePermiso, useEmpleado)
export const SesionProvider: React.FC<{ empleado: EmpleadoSesion; children: React.ReactNode }> = ({ empleado, children }) => (
  <SesionContext.Provider value={empleado}>{children}</SesionContext.Provider>
);
