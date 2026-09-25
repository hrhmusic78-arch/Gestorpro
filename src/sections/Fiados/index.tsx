import React, { useState, useEffect } from 'react';
import {  Coins, Plus, BookOpen } from 'lucide-react';
import { supabase } from '../../db/supabase';
import { TablaFiados } from './components/TablaFiados';
import { ModalFiado } from './components/ModalFiado';
import { ModalAbono } from './components/ModalAbono';
import { ModalClientes } from './components/ModalClientes';
import { ModalDetalleFiado } from './components/ModalDetalleFiado';
import { ModalAnularPago } from './components/ModalAnularPago'; // <-- Nuevo modal
import type { Fiado, Cliente, PagoAbono } from './types'; // <-- Importamos PagoAbono
import type { Product } from '../Inventario/types';

export const Fiados: React.FC = () => {
  const [fiados, setFiados] = useState<Fiado[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productosInventario, setProductosInventario] = useState<Product[]>([]);
  
  const [isModalFiadoOpen, setIsModalFiadoOpen] = useState(false);
  const [fiadoAEditar, setFiadoAEditar] = useState<Fiado | null>(null);

  const [isModalAbonoOpen, setIsModalAbonoOpen] = useState(false);
  const [fiadoAAbonar, setFiadoAAbonar] = useState<Fiado | null>(null);

  const [isModalClientesOpen, setIsModalClientesOpen] = useState(false);

  // Estados para el Modal de Ver Detalles
  const [isModalDetalleOpen, setIsModalDetalleOpen] = useState(false);
  const [fiadoAVer, setFiadoAVer] = useState<Fiado | null>(null);

  // Estados para el Modal de Anular Pagos
  const [isModalAnularOpen, setIsModalAnularOpen] = useState(false);
  const [fiadoAAnular, setFiadoAAnular] = useState<Fiado | null>(null);

  // Cargar datos desde Supabase al iniciar
  const cargarDatos = async () => {
      // 🔥 OPTIMIZACIÓN: Lanzamos todas las consultas al mismo tiempo (Paralelo)
      const [
        { data: prods },
        { data: clis },
        { data: fiaData },
        { data: pagosData }
      ] = await Promise.all([
        supabase.from('products').select('*'),
        supabase.from('customers').select('*'),
        // Filtro Ampliado: Descarga también los CANCELADOS para poder visualizarlos en la tabla como 'PAGADOS'
        supabase.from('fiados').select('*').in('status', ['PENDIENTE', 'VENCIDO', 'CANCELADO']),
        supabase.from('debt_payments').select('*')
      ]);

      // 1. Asignar Inventario
      if (prods) setProductosInventario(prods as Product[]);

      // 2. Asignar Clientes
if (clis) {
  const clientesMapeados: Cliente[] = clis.map(c => ({
    id: c.id?.toString() ?? 'ID_NULO', // <-- PROTECCIÓN AQUÍ
    nombre: c.name ?? 'Sin Nombre',
    dni: c.dni ?? '',
    telefono: '' 
  }));
  setClientes(clientesMapeados);
}

// 3. Procesar Fiados y Pagos
if (fiaData) {
  const fiadosMapeados: Fiado[] = fiaData
    .filter(f => f.status !== 'ANULADO') // 🔥 OCULTAR LOS ANULADOS AUTOMÁTICAMENTE
    .map((f, indexFiado) => {
    // <-- PROTECCIÓN EN LA COMPARACIÓN (f.id puede venir nulo)
    const susPagos = (pagosData || []).filter(p => p.fiado_id?.toString() === f.id?.toString());
    
    const historialPagos: PagoAbono[] = susPagos.map((p, indexPago) => ({
      id: p.id ? p.id.toString() : `err-pago-${indexPago}-${Date.now()}`,
      monto: Number(p.amount) || 0,
      metodo: p.payment_type || 'Mixto',
      fecha: p.created_at
    }));

    // 🛡️ CÁLCULO MATEMÁTICO BLINDADO (Ignora errores o retrasos de Base de Datos)
    const montoOriginal = Number(f.amount) || 0;
    const montoPagadoReal = historialPagos.reduce((sum, p) => sum + p.monto, 0);
    const saldoPendienteReal = Math.max(0, montoOriginal - montoPagadoReal);
    
    // 🛡️ ESTADO TÉCNICO: Solo existe PENDIENTE o PAGADO (Tolerancia estricta de 0.05)
    const estadoFinal = saldoPendienteReal <= 0.05 ? 'PAGADO' : 'PENDIENTE';

    return {
      id: f.id ? f.id.toString() : `err-fiado-${indexFiado}-${Date.now()}`,
      sale_id: f.sale_id?.toString(),
      clienteId: f.customer_id?.toString(),
      clienteNombre: f.customer_name || 'Desconocido',
      montoOriginal: montoOriginal,
      saldoPendiente: saldoPendienteReal,
      fechaEmision: f.date_given,
      fechaVencimiento: f.expected_pay_date || f.date_given,
      estado: estadoFinal,
      detalles: [], 
      pagos: historialPagos
    } as any;
  });
  
  // <-- PROTECCIÓN EN EL SORT (Asegura que fechaEmision exista)
  setFiados(fiadosMapeados.sort((a, b) => {
    const timeA = a.fechaEmision ? new Date(a.fechaEmision).getTime() : 0;
    const timeB = b.fechaEmision ? new Date(b.fechaEmision).getTime() : 0;
    return timeB - timeA;
  }));
}
    };

  useEffect(() => {
    cargarDatos();
  }, []);

  const handleSaveFiado = async () => {
    setIsModalFiadoOpen(false);
    // Como el Modal ya hizo todos los cálculos y grabó en la Base de Datos,
    // solo recargamos la tabla limpiamente para mostrar los cambios reales.
    await cargarDatos(); 
  };

  const handleConfirmAbono = async () => {
    // 🚀 CORRECCIÓN: ModalAbono ya guardó todo en la Base de Datos correctamente.
    // Ya no duplicamos el guardado ni borramos el fiado, así aparecerá en tus REPORTES.
    setIsModalAbonoOpen(false);
    await cargarDatos(); // Refresca la tabla con los datos nuevos
  };

  const handleAnularPagoEspecifico = async (pagoId: string, montoRestaurar: number) => {
    if (!fiadoAAnular) return;
    
    if (window.confirm(`⚠️ ANULACIÓN TÉCNICA: ¿Seguro que deseas anular este pago de S/ ${montoRestaurar.toFixed(2)}?`)) {
      try {
        // 0. Traemos la fecha exacta del pago ANTES de borrarlo, para poder ubicar el
        // movimiento de caja correcto (ver paso 2).
        const { data: pagoOriginal } = await supabase.from('debt_payments').select('created_at').eq('id', pagoId).maybeSingle();

        // 1. ELIMINACIÓN MAESTRA: Borra el pago de la deuda
        await supabase.from('debt_payments').delete().eq('id', pagoId);

        // 2. LIMPIEZA DE CAJA: Destruimos el "movimiento fantasma".
        // 🚨 CORRECCIÓN: Antes se buscaba SOLO por monto, lo que borraba el movimiento de OTRO
        // cliente si por casualidad abonó el mismo monto exacto (muy común con montos redondos:
        // había hasta 14 abonos distintos de S/2.50 en la caja). Ahora filtramos también por el
        // "Cliente ID" que ya viene grabado en la descripción del movimiento, y si aun así hay
        // más de un candidato (mismo cliente abonó el mismo monto varias veces), nos quedamos
        // con el más cercano en el tiempo al pago que se está anulando.
        const { data: movs } = await supabase.from('cash_movements').select('id, amount, description, created_at').eq('flujo', 'INGRESO_FIADO');
        const clienteTexto = fiadoAAnular.clienteId ? `Cliente ID: ${fiadoAAnular.clienteId}` : null;
        const candidatosPorMonto = (movs || []).filter(m => Math.abs(Number(m.amount) - Number(montoRestaurar)) < 0.01);
        const candidatos = clienteTexto
          ? candidatosPorMonto.filter(m => (m.description || '').includes(clienteTexto))
          : candidatosPorMonto;
        let exactMov = candidatos[0];
        if (candidatos.length > 1 && pagoOriginal?.created_at) {
          const tRef = new Date(pagoOriginal.created_at).getTime();
          exactMov = candidatos.reduce((mejor, actual) =>
            Math.abs(new Date(actual.created_at).getTime() - tRef) < Math.abs(new Date(mejor.created_at).getTime() - tRef) ? actual : mejor
          );
        }
        if (exactMov) {
          await supabase.from('cash_movements').delete().eq('id', exactMov.id);
        }

        // 3. ACTUALIZAR TABLA FIADOS: Restamos el dinero del "paid_amount" para arreglar Reportes
        const { data: fiadoReal } = await supabase.from('fiados').select('paid_amount, amount').eq('id', fiadoAAnular.id).maybeSingle();
        if (fiadoReal) {
          const nuevoPagado = Math.max(0, Number(fiadoReal.paid_amount || 0) - montoRestaurar);
          const nuevoEstado = (Number(fiadoReal.amount || 0) - nuevoPagado) <= 0.05 ? 'CANCELADO' : 'PENDIENTE';
          await supabase.from('fiados').update({ paid_amount: nuevoPagado, status: nuevoEstado }).eq('id', fiadoAAnular.id);
        }

        // 4. RECARGAR DATOS
        alert("✅ Anulación completada: La deuda se restauró y el ingreso desapareció de Finanzas, Caja y Reportes automáticamente.");
        setIsModalAnularOpen(false);
        await cargarDatos(); 
      } catch (error) {
        console.error("Error al anular pago:", error);
        alert("Fallo de integridad: No se pudo anular el pago.");
      }
    }
  };

  const handleView = async (fiado: any) => {
    setFiadoAVer({ ...fiado, detalles: [] });
    setIsModalDetalleOpen(true);

    if (fiado.sale_id) {
      const { data, error } = await supabase
        .from('sale_details')
        .select('product_id, product_name, quantity, price_at_moment, subtotal')
        .eq('sale_id', fiado.sale_id);

      if (!error && data && data.length > 0) {
        const detallesCompletos = data.map((d: any) => ({
          productoId: d.product_id,
          name: d.product_name,
          qty: Number(d.quantity),
          price: Number(d.price_at_moment),
          subtotal: Number(d.subtotal)
        }));
        setFiadoAVer({ ...fiado, detalles: detallesCompletos });
      }
    }
  };

  // NUEVA FUNCIÓN: Descarga los productos de la BD antes de abrir el modal de Edición
  const handleEditFiado = async (fiado: any) => {
    // 1. Abrimos el modal con la información base de la deuda
    setFiadoAEditar({ ...fiado, detalles: [] });
    setIsModalFiadoOpen(true);

    // 2. Si existe un registro de venta (sale_id), descargamos sus productos
    if (fiado.sale_id) {
      const { data, error } = await supabase
        .from('sale_details')
        .select('product_id, product_name, quantity, price_at_moment, subtotal')
        .eq('sale_id', fiado.sale_id);

      if (!error && data && data.length > 0) {
        const detallesCompletos = data.map((d: any) => ({
          productoId: d.product_id,
          name: d.product_name,
          qty: Number(d.quantity),
          price: Number(d.price_at_moment),
          subtotal: Number(d.subtotal)
        }));
        
        // 3. Inyectamos los productos en el estado de edición
        setFiadoAEditar({ ...fiado, detalles: detallesCompletos });
      }
    }
  };

  // --- FUNCIONES DE CLIENTES CON SUPABASE ---
  const handleSaveCliente = async (cli: Omit<Cliente, 'id'>) => {
    const nuevoId = Date.now().toString(); 
    
    // Guardar en Supabase
    const { error } = await supabase.from('customers').insert([{
      id: nuevoId,
      name: cli.nombre,
      dni: cli.dni,
      created_at: new Date().toISOString(),
      is_synced: '1'
    }]);

    if (error) return alert('Error al guardar cliente: ' + error.message);
    setClientes([...clientes, { ...cli, id: nuevoId }]);
  };

  const handleEditCliente = async (cliModificado: Cliente) => {
    // Actualizar en Supabase
    const { error } = await supabase.from('customers').update({
      name: cliModificado.nombre,
      dni: cliModificado.dni
    }).eq('id', cliModificado.id);

    if (error) return alert('Error al actualizar cliente: ' + error.message);
    setClientes(clientes.map(c => c.id === cliModificado.id ? cliModificado : c));
  };

  const handleDeleteCliente = async (id: string) => {
    if (window.confirm('⚠️ ¿Estás seguro de ELIMINAR a este cliente del directorio?')) {
      // Borrar en Supabase
      const { error } = await supabase.from('customers').delete().eq('id', id);
      
      if (error) return alert('No se puede eliminar porque tiene deudas activas registradas.');
      setClientes(clientes.filter(c => c.id !== id));
    }
  };
  // ------------------------------------

  const totalPorCobrar = fiados.reduce((acc, f) => acc + f.saldoPendiente, 0);
  
  // 🔥 NUEVO: Filtrar los pagos para sumar solo lo recuperado en el día de HOY (Con protección TypeScript)
  const fechaHoyStr = new Date().toLocaleDateString('es-PE');
  const totalRecuperadoHoy = fiados.reduce((totalGlobal, fiado) => {
    // Agregamos (fiado.pagos || []) para evitar el error de 'undefined'
    const pagadoHoy = (fiado.pagos || []).reduce((totalFiado, pago) => {
      const fechaPagoStr = new Date(pago.fecha).toLocaleDateString('es-PE');
      return fechaPagoStr === fechaHoyStr ? totalFiado + pago.monto : totalFiado;
    }, 0);
    return totalGlobal + pagadoHoy;
  }, 0);

  return (
    <div className="h-full flex flex-col gap-4 sm:gap-6 p-0 sm:p-2 lg:p-6 w-full font-mono">
      
      {/* TARJETAS Y CONTROLES */}
      <div className="flex flex-col xl:flex-row justify-between items-stretch xl:items-end gap-4 shrink-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full xl:w-1/2">
          <div className="min-w-0 bg-white border-2 border-[#E2E8F0] shadow-[4px_4px_0_0_#E2E8F0] p-3 sm:p-4 flex gap-3 sm:gap-4 items-center rounded-none">
            <div className="w-12 h-12 bg-[#F8FAFC] border-2 border-[#E2E8F0] flex items-center justify-center rounded-none"><Coins className="text-[#1E293B]" /></div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-[#64748B]">Por Cobrar</p>
              <p className="text-2xl sm:text-4xl font-black text-[#1E293B] tracking-tight">S/ {totalPorCobrar.toFixed(2)}</p>
            </div>
          </div>
          <div className="min-w-0 bg-white border-2 border-[#E2E8F0] shadow-[4px_4px_0_0_#E2E8F0] p-3 sm:p-4 flex gap-3 sm:gap-4 items-center rounded-none">
            <div className="w-12 h-12 bg-[#ECFDF5] border-2 border-[#10B981] flex items-center justify-center rounded-none"><Coins className="text-[#10B981]" /></div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-[#64748B]">Recuperado Hoy</p>
              <p className="text-2xl sm:text-4xl font-black text-[#10B981] tracking-tight">S/ {totalRecuperadoHoy.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* BOTONES PRINCIPALES */}
        <div className="grid grid-cols-2 sm:flex gap-3">
          <button 
            onClick={() => setIsModalClientesOpen(true)}
            className="h-12 bg-white text-[#1E293B] px-3 sm:px-6 justify-center border-2 border-[#1E293B] font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-[#F8FAFC] transition-colors shadow-[4px_4px_0_0_#1E293B] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] cursor-pointer"
          >
            <BookOpen size={16} /> Directorio Clientes
          </button>
          <button 
            onClick={() => { setFiadoAEditar(null); setIsModalFiadoOpen(true); }}
            className="h-12 bg-[#1E293B] text-white px-3 sm:px-6 justify-center border-2 border-[#1E293B] font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-[#F59E0B] hover:text-[#1E293B] transition-colors shadow-[4px_4px_0_0_#1E293B] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] cursor-pointer"
          >
            <Plus size={16} /> Nueva Deuda
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <TablaFiados 
          fiados={fiados} 
          onView={handleView}
          onEdit={handleEditFiado}
          onPay={(f) => { setFiadoAAbonar(f); setIsModalAbonoOpen(true); }}
          onRevertir={(f) => { setFiadoAAnular(f); setIsModalAnularOpen(true); }} // Ahora abre el modal
        />
      </div>

      {/* MODALES */}
      <ModalClientes 
        isOpen={isModalClientesOpen} 
        onClose={() => setIsModalClientesOpen(false)} 
        clientes={clientes} 
        onSaveCliente={handleSaveCliente} 
        onEditCliente={handleEditCliente} // <-- Nueva propiedad enviada
        onDeleteCliente={handleDeleteCliente} // <-- Nueva propiedad enviada
        fiados={fiados} 
      />
      
      <ModalFiado isOpen={isModalFiadoOpen} onClose={() => setIsModalFiadoOpen(false)} onSave={handleSaveFiado} fiadoAEditar={fiadoAEditar} clientes={clientes} productos={productosInventario} />
      <ModalAbono isOpen={isModalAbonoOpen} onClose={() => setIsModalAbonoOpen(false)} onConfirm={handleConfirmAbono} fiado={fiadoAAbonar} />
      
      {/* Nuevo modal flotante de detalles */}
      <ModalDetalleFiado 
        isOpen={isModalDetalleOpen} 
        onClose={() => setIsModalDetalleOpen(false)} 
        fiado={fiadoAVer} 
      />
      
      {/* Nuevo modal para anular pagos específicos */}
      <ModalAnularPago 
        isOpen={isModalAnularOpen}
        onClose={() => setIsModalAnularOpen(false)}
        fiado={fiadoAAnular ? (fiados.find(f => f.id === fiadoAAnular.id) || fiadoAAnular) : null}
        onAnularPago={handleAnularPagoEspecifico}
      />
    </div>
  );
};