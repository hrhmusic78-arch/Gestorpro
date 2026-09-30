import React from 'react';
import { Package, Database, Plus, AlertTriangle } from 'lucide-react';
import { usePermiso } from '../../../utils/permisos';

interface Props {
  onIngresoStock: () => void;
  onNuevoSKU: () => void;
  onRegistrarMerma: () => void; // <-- AGREGA ESTA LÍNEA
}

export const HeaderInventario: React.FC<Props> = ({ onIngresoStock, onNuevoSKU, onRegistrarMerma }) => {
  // Cada acción aparece solo si el empleado tiene el permiso correspondiente
  const puedeCrearProductos = usePermiso('almacen_crear_editar_productos');
  const puedeIngresarLotes = usePermiso('almacen_ingresar_lotes');
  const puedeRegistrarMermas = usePermiso('almacen_registrar_mermas');
  return (
    <div className="bg-white border-b border-[#E2E8F0] p-4 sm:p-6 lg:p-8 short:py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 rounded-none relative shrink-0">
      <div>
        <h1 className="text-2xl font-black uppercase tracking-tighter text-[#1E293B] flex items-center gap-3">
          <Package size={24} className="text-[#10B981]"/> Control de Stock
        </h1>
        <p className="text-[10px] font-bold text-[#64748B] mt-2 tracking-widest uppercase">
          Gestión de Almacén, Precios y Valorización
        </p>
      </div>
      
      {/* PANEL DE ACCIONES RÁPIDAS */}
      <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-3 sm:gap-4 w-full md:w-auto">
        
        {/* 1. NUEVO PRODUCTO */}
        {puedeCrearProductos && (
        <button 
          onClick={onNuevoSKU}
          className="bg-[#10B981] text-[#1E293B] px-6 py-4 short:py-2.5 border-2 border-[#1E293B] font-black text-xs uppercase tracking-widest flex items-center gap-3 hover:bg-[#1E293B] hover:text-[#10B981] hover:border-[#10B981] transition-all cursor-pointer rounded-none shadow-[4px_4px_0_0_#1E293B] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px]"
        >
          <Plus size={18} /> Nuevo Producto
        </button>
        )}

        {/* 2. INGRESAR LOTE */}
        {puedeIngresarLotes && (
        <button 
          onClick={onIngresoStock}
          className="bg-[#1E293B] text-[#10B981] px-6 py-4 short:py-2.5 border-2 border-[#1E293B] font-black text-xs uppercase tracking-widest flex items-center gap-3 hover:bg-white hover:text-[#1E293B] transition-all cursor-pointer rounded-none shadow-[4px_4px_0_0_#10B981] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px]"
        >
          <Database size={18} /> Ingresar Lote
        </button>
        )}

        {/* 3. REGISTRAR MERMA */}
        {puedeRegistrarMermas && (
        <button 
          onClick={onRegistrarMerma}
          className="bg-white text-[#EF4444] px-6 py-4 short:py-2.5 border-2 border-[#EF4444] font-black text-xs uppercase tracking-widest flex items-center gap-3 hover:bg-[#EF4444] hover:text-white transition-all cursor-pointer rounded-none shadow-[4px_4px_0_0_#EF4444] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px]"
        >
          <AlertTriangle size={18} /> Registrar Merma
        </button>
        )}
      </div>
    </div>
  );
};