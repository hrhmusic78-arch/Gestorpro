// src/sections/Utilidades/types.ts
export interface MetricaDia {
  fecha: string;
  total: number;
  tickets: number;
}

export interface MetricaProducto {
  id: string;
  nombre: string;
  cantidadVendida: number;
  totalRecaudado: number;
}

export interface MetricaCategoria {
  categoria: string;
  cantidadVendida: number;
  totalRecaudado: number;
}

// TOTALES DEL SUBCONJUNTO ACTUALMENTE FILTRADO EN LA TABLA (búsqueda / categoría / rotación)
export interface StatsFiltro {
  ingresos: number;
  costos: number;
  mermas: number;
  hayFiltros: boolean;
}

// DETALLE DE UNA LÍNEA DE VENTA DE UN PRODUCTO, PARA EL MODAL "VER VENTAS"
export interface VentaProductoDetalle {
  saleId: string;
  fecha: string;
  cantidad: number;
  monto: number; // Lo que corresponde a este producto en esa venta
  esFiado: boolean;
  clienteNombre?: string | null;
  // Los 3 campos de abajo reflejan la deuda de TODA la venta (no solo este producto),
  // porque el abono se paga por venta, no por línea de producto.
  montoAbonado?: number;
  montoRestante?: number;
  fiadoCompleto?: boolean;
}

// NUEVA INTERFAZ PARA EL ANÁLISIS DE RENTABILIDAD
export interface AnalisisProducto {
  id: string;
  nombre: string;
  categoria: string;
  estado: string;
  stockActual?: number;
  tipoControl?: string; // <-- NUEVO: Para saber si es producto de CONSUMO
  unidadesVendidas: number;
  ingresosTotales: number;
  costoTotalVentas: number;
  unidadesMerma: number;
  perdidaMerma: number;
  utilidadReal: number;
  margen: number; // Porcentaje de ganancia
  unidadMedida: string; // 'KG' | 'UND' | 'CONSUMO' — para mostrar junto a las cantidades
  ventasDetalle?: VentaProductoDetalle[];
}