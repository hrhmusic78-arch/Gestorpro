import { supabase } from '../db/supabase';
import type { PermisosUsuario } from '../sections/Configuraciones/types';

// El navegador guarda SOLO el token de la sesión. Los permisos y el estado del
// empleado se leen siempre desde la base (tabla sesiones → empleados), así que
// desactivar a un empleado lo saca del sistema y editar el navegador no da permisos.
const CLAVE_TOKEN = 'gestorpro_sesion';

export interface EmpleadoSesion {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  permisos: Partial<PermisosUsuario>;
}

// Los correos se guardan y comparan en minúsculas; escribir solo "admin" completa @gestorpro.com
export const normalizarEmail = (texto: string) => {
  const limpio = texto.trim().toLowerCase();
  return limpio.includes('@') ? limpio : `${limpio}@gestorpro.com`;
};

const leerToken = () => {
  try { return localStorage.getItem(CLAVE_TOKEN); } catch { return null; }
};

const guardarToken = (token: string | null) => {
  try {
    if (token) localStorage.setItem(CLAVE_TOKEN, token);
    else localStorage.removeItem(CLAVE_TOKEN);
    localStorage.removeItem('empleado_session'); // formato anterior (guardaba los permisos en el navegador)
  } catch { /* sin acceso a localStorage */ }
};

export const iniciarSesion = async (usuario: string, password: string): Promise<EmpleadoSesion | null> => {
  const { data: empleado } = await supabase
    .from('empleados')
    .select('id, nombre, email, rol, permisos')
    .eq('email', normalizarEmail(usuario))
    .eq('password', password)
    .eq('estado', 'ACTIVO')
    .maybeSingle();

  if (!empleado) return null;

  const { data: sesion, error } = await supabase
    .from('sesiones')
    .insert({ empleado_id: empleado.id })
    .select('token')
    .single();

  if (error || !sesion) throw new Error('No se pudo iniciar la sesión. Intenta de nuevo.');

  guardarToken(sesion.token);
  return { ...empleado, permisos: empleado.permisos || {} };
};

// Devuelve el empleado de la sesión guardada, o null si la sesión no existe,
// fue cerrada, o el empleado está inactivo/borrado. Si hay un error de red
// devuelve 'sin-conexion' para no sacar al usuario por un corte momentáneo.
export const validarSesion = async (): Promise<EmpleadoSesion | null | 'sin-conexion'> => {
  const token = leerToken();
  if (!token) {
    guardarToken(null);
    return null;
  }

  const { data, error } = await supabase
    .from('sesiones')
    .select('token, empleado:empleados(id, nombre, email, rol, estado, permisos)')
    .eq('token', token)
    .maybeSingle();

  if (error) return error.code ? null : 'sin-conexion';

  const empleado = (data?.empleado ?? null) as (EmpleadoSesion & { estado: string }) | null;
  if (!empleado || empleado.estado !== 'ACTIVO') {
    await cerrarSesion();
    return null;
  }

  supabase.from('sesiones').update({ ultimo_uso: new Date().toISOString() }).eq('token', token).then(() => {});
  return { id: empleado.id, nombre: empleado.nombre, email: empleado.email, rol: empleado.rol, permisos: empleado.permisos || {} };
};

export const cerrarSesion = async () => {
  const token = leerToken();
  guardarToken(null);
  if (token) await supabase.from('sesiones').delete().eq('token', token);
};
