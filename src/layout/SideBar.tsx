// src/layout/SideBar.tsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, ShoppingCart, Users, Package, 
  Truck, Trash2, Wallet, 
  FileText, Settings, BarChart3, X
} from 'lucide-react';

// IMPORTAMOS EL LOGO Y SUPABASE
import logoEvicamp from '../assets/logo.png';
import { supabase } from '../db/supabase';
import { puedeVerModulo } from '../utils/permisos';

interface SideBarProps {
  isOpen: boolean;
  currentView: string;
  onNavigate: (view: string) => void;
  onClose: () => void; // Contrae el menú (o cierra el panel deslizable en tablet/celular)
  onToggle: () => void; // Tocar el logo abre o contrae el menú
  permisos?: any; // <--- AÑADIMOS LOS PERMISOS
}

// Tiempo sin usar el menú abierto antes de que se contraiga solo
const AUTO_OCULTAR_MS = 8000;

export const SideBar: React.FC<SideBarProps> = ({ isOpen, currentView, onNavigate, onClose, onToggle, permisos }) => {
  const [empresaData, setEmpresaData] = useState({ nombre: 'EVICAMP', logo: logoEvicamp });

  // === TEMPORIZADOR DE AUTO-OCULTADO ===
  // Mientras el menú está abierto cuenta el tiempo sin actividad; con el mouse encima queda en pausa.
  const [restante, setRestante] = useState(AUTO_OCULTAR_MS);
  const [enPausa, setEnPausa] = useState(false);
  const encima = useRef(false);
  const ultimaActividad = useRef(0);
  const cerrar = useRef(onClose);
  useEffect(() => { cerrar.current = onClose; });

  const marcarActividad = () => {
    ultimaActividad.current = Date.now();
    setRestante(AUTO_OCULTAR_MS);
  };

  useEffect(() => {
    if (!isOpen) return;
    ultimaActividad.current = Date.now();
    const intervalo = setInterval(() => {
      if (encima.current) {
        ultimaActividad.current = Date.now();
        setRestante(AUTO_OCULTAR_MS);
        return;
      }
      const quedan = AUTO_OCULTAR_MS - (Date.now() - ultimaActividad.current);
      if (quedan <= 0) cerrar.current();
      else setRestante(quedan);
    }, 100);
    return () => clearInterval(intervalo);
  }, [isOpen]);

  const alTocarLogo = () => {
    marcarActividad();
    onToggle();
  };

  useEffect(() => {
    const fetchEmpresa = async () => {
      try {
        const { data, error } = await supabase.from('empresa_config').select('nombre_empresa, logo_url').limit(1).single();
        if (data && !error) {
          setEmpresaData({
            nombre: data.nombre_empresa || 'EVICAMP',
            logo: data.logo_url || logoEvicamp
          });
        }
      } catch (error) {
        console.error("Error cargando logo en sidebar", error);
      }
    };
    fetchEmpresa();
  }, []);

  // Qué módulos puede ver: la regla vive en utils/permisos (la misma que usa App para bloquear el acceso)
  const tieneAcceso = (modulo: string) => puedeVerModulo(permisos, modulo);

  // Modulos divididos por Categorías Lógicas con sus Iconos asignados
  const menuGroupsRaw = [
    {
      category: 'Núcleo Operativo',
      items: [
        { id: 'resumen', name: 'Panel de Control', icon: LayoutDashboard },
        { id: 'pos', name: 'Punto de Venta', icon: ShoppingCart },
        { id: 'fiados', name: 'Cuentas por Cobrar', icon: Users },
      ]
    },
    {
      category: 'Cadena de Suministro',
      items: [
        { id: 'inventario', name: 'Control de Stock', icon: Package },
        { id: 'proveedores', name: 'Abastecimiento', icon: Truck },
        { id: 'mermas', name: 'Control de Pérdidas', icon: Trash2 },
      ]
    },
    {
      category: 'Gestión Gerencial',
      items: [
        { id: 'finanzas', name: 'Tesorería', icon: Wallet },
        { id: 'utilidades', name: 'Análisis de Rentabilidad', icon: BarChart3 },
        { id: 'reportes', name: 'Auditoría de Ventas', icon: FileText },
        { id: 'configuracion', name: 'Parámetros del Sistema', icon: Settings },
      ]
    }
  ];

  // Filtramos los items según los permisos. Si una categoría entera (ej. Administración) se queda sin items, se oculta.
  const menuGroups = menuGroupsRaw
    .map(group => ({
      ...group,
      items: group.items.filter(item => tieneAcceso(item.id))
    }))
    .filter(group => group.items.length > 0);

  return (
    <>
    {/* FONDO OSCURO: solo en tablet/celular cuando el menú está abierto; al tocarlo se cierra */}
    {isOpen && (
      <div className="fixed inset-0 bg-[#1E293B]/60 z-30 lg:hidden" onClick={onClose} aria-hidden="true"></div>
    )}

    {/* En tablet/celular el menú es un panel deslizable sobre el contenido; en escritorio es una columna fija que se expande o contrae */}
    <aside
      onMouseEnter={() => { encima.current = true; setEnPausa(true); }}
      onMouseLeave={() => { encima.current = false; setEnPausa(false); marcarActividad(); }}
      onPointerDown={marcarActividad}
      onKeyDown={marcarActividad}
      onFocus={marcarActividad}
      className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] ${isOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-200 ease-out lg:relative lg:max-w-none lg:translate-x-0 lg:z-20 lg:transition-[width] lg:duration-150 ${isOpen ? 'lg:w-64' : 'lg:w-20'} border-r border-[#E2E8F0] bg-white flex flex-col h-full shrink-0 font-mono overflow-hidden`}
    >

      {/* LÍNEA DE TENSIÓN LATERAL VERDE ESTÁTICA */}
      <div className="absolute top-0 left-0 w-1 h-full bg-[#10B981]"></div>

      {/* BRANDING HEADER CON LOGO: tocar el logo abre o contrae el menú */}
      <div className={`h-16 border-b border-[#E2E8F0] flex items-center ${isOpen ? 'justify-between px-4' : 'justify-center'} bg-[#1E293B] ml-1`}>
        {isOpen ? (
          <button
            onClick={alTocarLogo}
            title="Contraer menú"
            aria-label="Contraer menú"
            aria-expanded={true}
            className="flex items-center gap-3 overflow-hidden cursor-pointer group text-left"
          >
            {/* Logo en bloque técnico */}
            <div className="w-8 h-8 bg-white border border-[#10B981] flex items-center justify-center p-0.5 shrink-0 transition-transform group-hover:scale-110">
              <img src={empresaData.logo} alt="Logo Empresa" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-white font-black tracking-[0.2em] text-lg uppercase whitespace-nowrap">
              {empresaData.nombre}<span className="text-[#10B981]">.</span>
            </h1>
          </button>
        ) : (
          /* Logo centrado cuando la barra está colapsada: brilla para indicar que se toca para desplegar */
          <button
            onClick={alTocarLogo}
            title="Toca el logo para desplegar el menú"
            aria-label="Desplegar menú"
            aria-expanded={false}
            className="logo-brillo w-10 h-10 bg-white border border-[#10B981] flex items-center justify-center p-1 shrink-0 cursor-pointer transition-transform hover:scale-110"
          >
            <img src={empresaData.logo} alt="Logo Empresa" className="w-full h-full object-contain" />
          </button>
        )}
        
        {isOpen && <div className="hidden lg:block w-2 h-2 bg-[#10B981] animate-pulse shrink-0 ml-2"></div>}
        {isOpen && (
          <button
            onClick={onClose}
            aria-label="Cerrar menú"
            className="lg:hidden p-2 -mr-1 text-white hover:text-[#10B981] cursor-pointer shrink-0"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* NAVIGATION MENU */}
      <nav className="flex-1 py-4 short:py-2 overflow-y-auto custom-scrollbar bg-white ml-1 overflow-x-hidden">
        
        {menuGroups.map((group, index) => (
          <div key={index} className="mb-8 short:mb-3 last:mb-0">
            
            {/* CATEGORY HEADER CON ACENTO VERDE */}
            <div className={`flex items-center gap-2 mb-3 short:mb-1 ${isOpen ? 'px-6' : 'justify-center'}`}>
              {isOpen ? (
                <>
                  <div className="h-[2px] w-3 bg-[#10B981] shrink-0"></div>
                  <span className="text-xs font-black text-[#1E293B] uppercase tracking-[0.2em] whitespace-nowrap">
                    {group.category}
                  </span>
                </>
              ) : (
                /* Cuando está cerrado, la categoría se vuelve solo una línea separadora */
                <div className="h-[2px] w-6 bg-[#E2E8F0]"></div>
              )}
            </div>

            {/* ITEMS DE LA CATEGORÍA */}
            <div className="space-y-1 px-2">
              {group.items.map((item) => {
                const isActive = currentView === item.id;
                const Icon = item.icon; 
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    title={!isOpen ? item.name : undefined}
                    className={`w-full text-left py-3 short:py-2 text-xs font-black uppercase tracking-wider transition-all border rounded-none flex items-center cursor-pointer ${
                      isOpen ? 'px-4 justify-between' : 'justify-center px-0'
                    } ${
                      isActive 
                        ? 'border-[#1E293B] bg-[#10B981] text-[#1E293B] shadow-[3px_3px_0_0_#1E293B] translate-x-[-2px] translate-y-[-2px]' 
                        : 'border-transparent text-[#64748B] hover:border-[#10B981] hover:text-[#10B981] hover:bg-[#10B981]/5'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <Icon size={18} className="shrink-0" />
                      {isOpen && <span className="whitespace-nowrap">{item.name}</span>}
                    </div>
                    {isOpen && isActive && <div className="w-2 h-2 bg-[#1E293B] shrink-0"></div>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* FOOTER TÉCNICO: con el menú abierto muestra el temporizador de auto-ocultado */}
      <div className={`p-4 border-t border-[#E2E8F0] bg-[#1E293B] ml-1 flex ${isOpen ? 'flex-col gap-2' : 'justify-center'}`}>
        {isOpen ? (
          <>
            <div className="flex justify-between items-center gap-2">
              <span className="text-[12px] font-black text-[#10B981] uppercase tracking-[0.2em] whitespace-nowrap">
                {enPausa ? 'Auto-ocultar: en pausa' : `Auto-ocultar ${Math.ceil(restante / 1000)}s`}
              </span>
              <span className="text-[12px] font-black text-[#64748B] uppercase tracking-[0.2em] whitespace-nowrap">SYS_v2.0</span>
            </div>
            <div className="h-1 w-full bg-[#10B981]/20 overflow-hidden" aria-hidden="true">
              <div
                className="h-full bg-[#10B981] transition-[width] duration-100 ease-linear"
                style={{ width: `${(restante / AUTO_OCULTAR_MS) * 100}%` }}
              ></div>
            </div>
          </>
        ) : (
          <div className="flex gap-1 shrink-0">
             <div className="w-1 h-3 bg-[#10B981]/30"></div>
             <div className="w-1 h-3 bg-[#10B981]/60"></div>
             <div className="w-1 h-3 bg-[#10B981]"></div>
          </div>
        )}
      </div>
    </aside>
    </>
  );
};