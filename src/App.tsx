import React, { useEffect, useState } from 'react';
import { Login } from './sections/Login';
import { TopBar } from './layout/TopBar';
import { SideBar } from './layout/SideBar';
import { validarSesion, type EmpleadoSesion } from './utils/sesion';
import { puedeVerModulo } from './utils/permisos';
import { SesionProvider } from './utils/SesionProvider';

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

// Cada cuánto se vuelve a leer el estado y los permisos del empleado desde la base
const REVALIDAR_CADA_MS = 60_000;

export const App: React.FC = () => {
  // Empleado de la sesión actual (con permisos leídos de la base, nunca del navegador)
  const [empleado, setEmpleado] = useState<EmpleadoSesion | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  // El menú lateral arranca contraído: en PC/laptop muestra solo íconos y se despliega tocando
  // el logo (que brilla para indicarlo); en tablet vertical/celular es un panel deslizable (botón ☰).
  // Una vez abierto se contrae solo tras unos segundos sin usarlo (temporizador en SideBar).
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => setIsSidebarOpen((abierto) => !abierto);

  // Estado para el Enrutador Interno
  const [currentView, setCurrentView] = useState<string>('resumen');

  // Valida la sesión al abrir la app, cada minuto y al volver a la pestaña.
  // Si el empleado fue desactivado o borrado, o le cambiaron los permisos, se aplica enseguida.
  useEffect(() => {
    let activo = true;
    const revisar = async () => {
      const resultado = await validarSesion();
      if (!activo || resultado === 'sin-conexion') return; // un corte de internet no cierra la sesión
      setEmpleado(resultado);
      setIsLoading(false);
    };
    revisar();
    const intervalo = setInterval(revisar, REVALIDAR_CADA_MS);
    const alVolver = () => { if (document.visibilityState === 'visible') revisar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      activo = false;
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alVolver);
    };
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

  if (!empleado) {
    return <Login onLoginSuccess={(nuevo) => { setCurrentView('resumen'); setEmpleado(nuevo); }} />;
  }

  // Si le quitaron el permiso del módulo que tenía abierto, se muestra el Resumen
  const vista = puedeVerModulo(empleado.permisos, currentView) ? currentView : 'resumen';

  // Motor de Renderizado Condicional
  const renderCurrentView = () => {
    switch (vista) {
      case 'inventario':
        return <Inventario onNavigate={handleNavigate} />;
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
      default:
        return (
          <div className="border border-dashed border-[#E2E8F0] p-12 text-center">
            <span className="text-[#64748B] font-mono uppercase text-xs">Módulo [{currentView}] en desarrollo</span>
          </div>
        );
    }
  };

  // En pantallas menores a 1024px (tablet/celular), al elegir un módulo se cierra el menú deslizable
  function handleNavigate(view: string) {
    if (!puedeVerModulo(empleado?.permisos, view)) return;
    setCurrentView(view);
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
  }

  return (
    <SesionProvider empleado={empleado}>
    <div className="flex h-[var(--alto-pantalla)] w-full bg-[#FFFFFF] overflow-hidden">
      <SideBar
        isOpen={isSidebarOpen}
        currentView={vista}
        onNavigate={handleNavigate}
        onClose={() => setIsSidebarOpen(false)}
        onToggle={toggleSidebar}
        permisos={empleado.permisos}
      />

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden bg-[#F8FAFC]">
        <TopBar
          toggleSidebar={toggleSidebar}
          ocultoEnEscritorio={!isSidebarOpen}
          userEmail={empleado.email}
          onNavigate={handleNavigate}
        />

        <section className="p-3 sm:p-5 lg:p-8 flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
          {renderCurrentView()}
        </section>
      </main>
    </div>
    </SesionProvider>
  );
};

export default App;
