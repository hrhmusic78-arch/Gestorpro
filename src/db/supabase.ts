import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'public-anon-key';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('ALERTA DE SISTEMA: Credenciales de Supabase no detectadas.');
}

// ----------------------------------------------------------------------
// EL INTERCEPTOR MAESTRO (Optimizado para Nginx)
// ----------------------------------------------------------------------
const customFetch = (url: string | URL | Request, options?: RequestInit) => {
  const urlString = url.toString();
  
  // NOTA DE INGENIERÍA: 
  // Ya NO borramos el '/rest/v1/'. Ahora Nginx necesita ver esa ruta 
  // para saber que debe redirigir el tráfico a PostgREST (puerto 3000).

  // 1. Clonamos la petición
  const fetchOptions = { ...options };
  const headers = new Headers(fetchOptions.headers);
  
  // 2. ¡TU MAGIA INTACTA!: Borramos el token de autorización.
  // Así PostgREST usa automáticamente el rol 'anon' de PostgreSQL.
  headers.delete('Authorization');
  fetchOptions.headers = headers;

  return fetch(urlString, fetchOptions);
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  },
  global: {
    headers: { 
      'Accept-Profile': 'public'
    },
    fetch: customFetch 
  }
});