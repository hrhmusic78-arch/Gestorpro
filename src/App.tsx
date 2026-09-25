import React, { useEffect, useState } from 'react';
import { supabase } from './db/supabase';
import { Login } from './sections/Login';
import { TopBar } from './layout/TopBar';
import { SideBar } from './layout/SideBar';

// Importación de Módulos (Secciones)
import { Inventario } from './sections/Inventario';
import { Mermas } from './sections/Mermas';
import { Proveedores } from './sections/Proveedores'; 
import { POS } from './sections/Punto-de-venta'; 
import { Fiados } from './sections/Fiados'; // <--- IMPORTAMOS FIADOS
import { Finanzas } from './sections/Finanzas'; // <--- IMPORTAMOS FINANZAS
import { Reportes } from './sections/Reportes';
import { Utilidades } from './sections/Utilidades';
import Configuraciones from './sections/Configuraciones';
import Resumen from './sections/Resumen'; // <--- IMPORTAMOS EL NUEVO RESUMEN
export const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  
  // --- NUEVOS ESTADOS PARA EMPLEADOS Y PERMISOS ---
  const [empleadoLogueado, setEmpleadoLogueado] = useState(false);
  const [permisos, setPermisos] = useState<any>(null);
  const [emailEmpleado, setEmailEmpleado] = useState<string>(''); // Para mostrar en el TopBar

  const [isLoading, setIsLoading] = useState(true);
  // Escritorio (≥1280px): barra lateral expandida. Tablet horizontal (1024-1279px): contraída a íconos.
  // Tablet vertical/celular (<1024px): oculta como menú deslizable.
  // En PC/laptop se respeta la última elección del usuario (expandida o contraída).
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (window.innerWidth < 1024) return false;
    try {
      const guardado = localStorage.getItem('menu_expandido');
      if (guardado !== null) return guardado === '1';
    } catch { /* sin acceso a localStorage: usar el valor por defecto */ }
    return window.innerWidth >= 1280;
  });

  const toggleSidebar = () => {
    const nuevo = !isSidebarOpen;
    setIsSidebarOpen(nuevo);
    if (window.innerWidth >= 1024) {
      try { localStorage.setItem('menu_expandido', nuevo ? '1' : '0'); } catch { /* ignorar */ }
    }
  };
  
  // Estado para el Enrutador Interno
  const [currentView, setCurrentView] = useState<string>('resumen');

  useEffect(() => {
    // 1. Revisar si hay un empleado guardado en la memoria del navegador (localStorage)
    const empleadoGuardado = localStorage.getItem('empleado_session');
    if (empleadoGuardado) {
      const datos = JSON.parse(empleadoGuardado);
      setPermisos(datos.permisos);
      setEmailEmpleado(datos.email || 'EMPLEADO');
      setEmpleadoLogueado(true);
      setIsLoading(false);
      return; // Si ya hay un empleado logueado, cortamos aquí
    }

    // 2. Si no hay empleado, verificamos si es el Admin Maestro (Supabase Auth)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-[var(--alto-pantalla)] bg-[#FFFFFF] flex items-center justify-center">
        <span className="font-mono text-sm text-[#1E293B] uppercase animate-pulse flex items-center space-x-2">
          <div className="w-2 h-2 bg-[#059669]"></div>
          <span>Inicializando Sistema...</span>
        </span>
      </div>
    );
  }

  // Función para cuando el login es exitoso (sea Admin Maestro o Empleado)
  const handleLoginSuccess = (permisosObtenidos?: any, emailObtenido?: string) => {
    if (permisosObtenidos) {
      setPermisos(permisosObtenidos);
      // Guardar en la memoria del navegador para que no se borre al recargar (F5)
      localStorage.setItem('empleado_session', JSON.stringify({
        permisos: permisosObtenidos,
        email: emailObtenido || 'EMPLEADO'
      }));
      if (emailObtenido) setEmailEmpleado(emailObtenido);
    }
    setEmpleadoLogueado(true);
  };

  // Validamos: Si NO hay sesión oficial Y TAMPOCO hay un empleado logueado, mostramos el Login
  if (!session && !empleadoLogueado) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // Motor de Renderizado Condicional
  const renderCurrentView = () => {
    switch (currentView) {
      case 'inventario':
        return <Inventario onNavigate={setCurrentView} />;
      case 'mermas': 
        return <Mermas />;
      case 'proveedores': 
        return <Proveedores />;
      case 'pos': 
        return <POS />;
      case 'fiados': // <--- CONECTAMOS LA PANTALLA DE FIADOS
        return <Fiados />;
      case 'finanzas': // <--- CONECTAMOS LA PANTALLA DE FINANZAS
        return <Finanzas />;
      case 'utilidades': 
        return <Utilidades />;
      case 'reportes': 
        return <Reportes />;  
      case 'configuracion': // <--- AÑADE ESTO
      return <Configuraciones />;  
      case 'resumen':
        return <Resumen />;
        return (
          <div className="border border-[#E2E8F0] bg-[#FFFFFF] p-6 shadow-none">
            <h2 className="text-[#1E293B] font-mono text-lg uppercase font-bold border-b border-[#E2E8F0] pb-2 mb-4 flex items-center">
              Dashboard Principal
              <span className="ml-3 w-2 h-2 bg-[#059669] animate-pulse"></span>
            </h2>
            <p className="text-[#64748B] text-sm font-mono mb-6">
              Métricas globales en construcción. Navega al módulo de Inventario en la barra lateral.
            </p>
          </div>
        );
      default:
        return (
          <div className="border border-dashed border-[#E2E8F0] p-12 text-center">
            <span className="text-[#64748B] font-mono uppercase text-xs">Módulo [{currentView}] en desarrollo</span>
          </div>
        );
    }
  };

  // En pantallas menores a 1024px (tablet/celular), al elegir un módulo se cierra el menú deslizable
  const handleNavigate = (view: string) => {
    setCurrentView(view);
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
  };

  return (
    <div className="flex h-[var(--alto-pantalla)] w-full bg-[#FFFFFF] overflow-hidden">
      <SideBar
        isOpen={isSidebarOpen}
        currentView={currentView}
        onNavigate={handleNavigate}
        onClose={() => setIsSidebarOpen(false)}
        permisos={permisos}
      />

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden bg-[#F8FAFC]">
        <TopBar
          toggleSidebar={toggleSidebar}
          userEmail={session?.user?.email || emailEmpleado || 'EMPLEADO_AUTENTICADO'}
          onNavigate={handleNavigate}
        />

        <section className="p-3 sm:p-5 lg:p-8 flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
          {renderCurrentView()}
        </section>
      </main>
    </div>
  );
};

export default App;