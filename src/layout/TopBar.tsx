// src/layout/TopBar.tsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../db/supabase';
import { LogOut, Activity, AlertTriangle } from 'lucide-react';

interface TopBarProps {
  toggleSidebar: () => void;
  userEmail: string;
  onNavigate: (view: string) => void;
}

export const TopBar: React.FC<TopBarProps> = ({ toggleSidebar, userEmail, onNavigate }) => {
  const [time, setTime] = useState<string>('');
  const [fiadosCount, setFiadosCount] = useState<number>(0);

  useEffect(() => {
    // 1. Reloj
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('es-PE', { hour12: false }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    
    // 2. Función SEGURA para contar fiados
    const fetchFiadosCount = async () => {
      const { data, error } = await supabase
        .from('fiados')
        .select('id') // Traemos solo el ID para que sea súper rápido
        .neq('status', 'CANCELADO') // CANCELADO = ya pagado
        .neq('status', 'ANULADO'); // ANULADO = deuda/venta anulada, no cuenta como pendiente
      
      if (error) {
        console.error("Error al buscar fiados:", error);
      } else if (data) {
        setFiadosCount(data.length); // Contamos directamente cuántos registros llegaron
      }
    };
    
    // Ejecutamos la primera vez que carga la página
    fetchFiadosCount();

    // NOTA DE INGENIERÍA: Se ha eliminado el bloque de "SUSCRIPCIÓN EN TIEMPO REAL"
    // para adaptar el código a nuestra arquitectura de PostgreSQL Puro.

    // Limpieza al salir
    return () => {
      clearInterval(timer);
      // También eliminamos el supabase.removeChannel(channel) de aquí
    };
  }, []);

  return (
    <header className="h-16 border-b border-[#E2E8F0] bg-white flex items-center justify-between gap-2 px-3 sm:px-4 lg:px-6 shrink-0 font-mono relative z-10">
      
      <div className="absolute top-0 left-0 w-full h-[1px] bg-[#10B981]"></div>

      {/* LADO IZQUIERDO: Control y Consola */}
      <div className="flex items-center space-x-4 min-w-0">
        <button
          onClick={toggleSidebar}
          data-menu-toggle
          aria-label="Abrir o cerrar menú"
          className="p-2.5 border border-[#E2E8F0] bg-[#F8FAFC] text-[#1E293B] hover:border-[#10B981] hover:text-[#10B981] hover:bg-white transition-all rounded-none cursor-pointer group"
        >
          <svg className="w-4 h-4 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth="1.5" d="M4 6h16M4 12h16M4 18h7" />
          </svg>
        </button>
        
        <div className="hidden 2xl:flex items-center text-xs font-black text-[#94A3B8] uppercase tracking-[0.2em] bg-[#F8FAFC] px-3 py-1.5 border border-[#E2E8F0]">
          <span className="text-[#10B981] mr-2">root@evicamp:~#</span>
          <span>SYSTEM_ACTIVE</span>
          <span className="w-1.5 h-3 bg-[#10B981] animate-pulse ml-2 inline-block"></span>
        </div>
      </div>

      {/* LADO DERECHO: Telemetría y Alertas */}
      <div className="flex items-center h-full py-3 gap-2 lg:gap-4 min-w-0">
        
        {/* BOTÓN ALERTA DE FIADOS: Solo aparece si hay deudas mayores a 0 */}
        {fiadosCount > 0 && (
          <button 
            onClick={() => onNavigate('fiados')}
            className="flex items-center shrink-0 whitespace-nowrap border-2 border-[#F59E0B] px-2 sm:px-3 py-1.5 bg-[#FFFBEB] text-[9px] font-black uppercase tracking-widest text-[#D97706] hover:bg-[#F59E0B] hover:text-white transition-all cursor-pointer animate-pulse shadow-[2px_2px_0_0_#D97706] hover:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
          >
            <AlertTriangle size={12} className="mr-2" />
            Fiados: {fiadosCount}
          </button>
        )}

        <div className="hidden lg:flex items-center border border-[#E2E8F0] px-4 py-2 bg-white text-xs font-black uppercase tracking-widest text-[#64748B]">
          <Activity size={14} className="text-[#10B981] mr-2" />
          NET: <span className="text-[#10B981] ml-1">SECURE</span>
        </div>

        <div className="hidden sm:flex items-center whitespace-nowrap border border-[#E2E8F0] px-3 lg:px-4 py-2 bg-[#F8FAFC] text-xs font-black uppercase tracking-widest text-[#1E293B]">
          [ {time} ]
        </div>

        <div className="hidden md:flex items-center min-w-0 border border-[#E2E8F0] pl-3 pr-4 lg:pl-4 lg:pr-5 py-2 bg-white">
          <div className="h-2 w-2 bg-[#10B981] animate-pulse mr-2"></div>
          <span className="text-xs font-black text-[#1E293B] uppercase tracking-[0.1em] truncate">
            ID: <span className="text-[#64748B]">{userEmail.split('@')[0]}</span>
          </span>
        </div>
        
        <button 
  onClick={() => {
    localStorage.removeItem('empleado_session'); // Borramos la memoria local
    window.location.reload();                    // Recargamos la página
  }}
  aria-label="Cerrar sesión"
  className="shrink-0 px-3 md:px-5 py-2 border border-[#1E293B] bg-[#1E293B] text-xs font-black uppercase tracking-[0.2em] text-white hover:bg-transparent hover:text-red-600 hover:border-red-600 transition-colors rounded-none cursor-pointer flex items-center gap-2"
>
  <LogOut size={12} />
  <span className="hidden md:inline">SALIDA</span>
</button>

      </div>
    </header>
  );
};