-- ============================================================================
-- Anulación de tickets atómica (Reportes -> ANULAR)
--  A. fn_annul_sale: devuelve el stock a los MISMOS lotes que consumió la venta
--     (según los movimientos VENTA 'Ticket #<id>' que escribe fn_reduce_stock_from_sales),
--     deja products.quantity consistente, registra movimientos DEVOLUCION completos,
--     marca la venta y el fiado como ANULADO y escribe los contraasientos DEVOLUCION
--     en la caja abierta (mismo formato "#<últimos 6>" que usa Finanzas).
--  B. Si el fiado ya tenía abonos (debt_payments), también devuelve ese dinero con
--     egresos DEVOLUCION por método. Su descripción NO termina en "#xxxxxx" a propósito:
--     Finanzas sigue sumando el INGRESO_FIADO del abono, así que el egreso sí debe restarse
--     (si no, la caja quedaría con dinero de una venta que ya no existe).
--  C. update_fiado_status conserva el estado 'ANULADO'.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_annul_sale(p_sale_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_sale        record;
    v_short       text := right(p_sale_id::text, 6);
    v_ticket      text := 'Ticket #' || p_sale_id::text;
    v_reason      text := 'Anulación de Ticket #' || p_sale_id::text;
    v_session_id  text;
    v_item        record;
    v_mov         record;
    v_batch_id    bigint;
    v_prod_qty    numeric;
    v_restante    numeric;
    v_devolver    numeric;
    v_dp          record;
    v_split       numeric;
    v_resto       numeric;
    v_stock_rows  int := 0;
    v_cash_rows   int := 0;
    v_abonos      numeric := 0;
BEGIN
    SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El ticket % no existe', p_sale_id;
    END IF;
    IF v_sale.sunat_status = 'ANULADO' THEN
        RAISE EXCEPTION 'El ticket % ya está anulado', p_sale_id;
    END IF;

    -- 1. Venta anulada
    UPDATE public.sales SET sunat_status = 'ANULADO' WHERE id = p_sale_id;

    -- 2. Devolución de stock (por producto; se omiten los de CONSUMO igual que el trigger de venta)
    FOR v_item IN
        SELECT d.product_id, MAX(d.product_name) AS product_name, SUM(ABS(COALESCE(d.quantity, 0))) AS qty
        FROM public.sale_details d
        JOIN public.products p ON p.id = d.product_id
        WHERE d.sale_id = p_sale_id
          AND NOT (COALESCE(p.unit, '') = 'CONSUMO' OR COALESCE(p.control_type, '') = 'CONSUMPTION')
        GROUP BY d.product_id
        HAVING SUM(ABS(COALESCE(d.quantity, 0))) > 0
    LOOP
        -- Stock total del producto antes de devolver (bloqueado)
        SELECT COALESCE(quantity, 0) INTO v_prod_qty FROM public.products WHERE id = v_item.product_id FOR UPDATE;
        v_restante := v_item.qty;

        -- 2a. A cada lote, lo que la venta le quitó
        FOR v_mov IN
            SELECT m.batch_id, SUM(-m.change_amount) AS consumido
            FROM public.inventory_movements m
            WHERE m.operation_type = 'VENTA' AND m.notes = v_ticket
              AND m.product_id = v_item.product_id AND m.batch_id IS NOT NULL
            GROUP BY m.batch_id
            ORDER BY m.batch_id
        LOOP
            v_devolver := LEAST(GREATEST(v_mov.consumido, 0), v_restante);
            IF v_devolver <= 0 THEN CONTINUE; END IF;

            -- Si el lote ya no existe o fue retirado, va al lote activo más reciente del producto
            SELECT id INTO v_batch_id FROM public.batches
            WHERE id = v_mov.batch_id AND COALESCE(is_active, 1) = 1;
            IF v_batch_id IS NULL THEN
                SELECT id INTO v_batch_id FROM public.batches
                WHERE product_id = v_item.product_id AND COALESCE(is_active, 1) = 1
                ORDER BY created_at DESC, id DESC LIMIT 1;
            END IF;
            IF v_batch_id IS NULL THEN CONTINUE; END IF; -- sin lotes: se devuelve solo al producto (abajo)

            UPDATE public.batches SET quantity = COALESCE(quantity, 0) + v_devolver WHERE id = v_batch_id;
            UPDATE public.products SET quantity = COALESCE(quantity, 0) + v_devolver WHERE id = v_item.product_id;

            INSERT INTO public.inventory_movements (
                batch_id, product_id, product_name, change_amount,
                previous_quantity, new_quantity, operation_type, reason, notes, created_at, "user", is_synced
            ) VALUES (
                v_batch_id, v_item.product_id, v_item.product_name, v_devolver,
                v_prod_qty, v_prod_qty + v_devolver, 'DEVOLUCION', v_reason, v_ticket, NOW(), 'Sistema', 1
            );
            v_prod_qty := v_prod_qty + v_devolver;
            v_restante := v_restante - v_devolver;
            v_stock_rows := v_stock_rows + 1;
        END LOOP;

        -- 2b. Lo que la venta descontó del producto sin salir de ningún lote (stock negativo,
        --     o venta sin lotes): se devuelve solo al producto, igual que se descontó.
        IF v_restante > 0 THEN
            UPDATE public.products SET quantity = COALESCE(quantity, 0) + v_restante WHERE id = v_item.product_id;
            INSERT INTO public.inventory_movements (
                batch_id, product_id, product_name, change_amount,
                previous_quantity, new_quantity, operation_type, reason, notes, created_at, "user", is_synced
            ) VALUES (
                NULL, v_item.product_id, v_item.product_name, v_restante,
                v_prod_qty, v_prod_qty + v_restante, 'DEVOLUCION', v_reason, v_ticket, NOW(), 'Sistema', 1
            );
            v_stock_rows := v_stock_rows + 1;
        END IF;
    END LOOP;

    -- 3. Caja abierta (si no hay, no se registran contraasientos, como antes)
    SELECT id::text INTO v_session_id FROM public.cash_sessions
    WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1;

    -- 3a. Contraasiento de lo cobrado en la venta (formato que Finanzas reconoce: termina en "#xxxxxx)")
    IF v_session_id IS NOT NULL THEN
        IF COALESCE(v_sale.amount_cash, 0) > 0 THEN
            INSERT INTO public.cash_movements (session_id, type, amount, description, payment_type, created_at, is_synced, flujo)
            VALUES (v_session_id, 'EGRESO', v_sale.amount_cash, 'DEVOLUCIÓN EFECTIVO (ANULA TICKET #' || v_short || ')', 'efectivo', NOW(), 1, 'DEVOLUCION');
            v_cash_rows := v_cash_rows + 1;
        END IF;
        IF COALESCE(v_sale.amount_yape, 0) > 0 THEN
            INSERT INTO public.cash_movements (session_id, type, amount, description, payment_type, created_at, is_synced, flujo)
            VALUES (v_session_id, 'EGRESO', v_sale.amount_yape, 'DEVOLUCIÓN YAPE/PLIN (ANULA TICKET #' || v_short || ')', 'yape', NOW(), 1, 'DEVOLUCION');
            v_cash_rows := v_cash_rows + 1;
        END IF;
        IF COALESCE(v_sale.amount_card, 0) > 0 THEN
            INSERT INTO public.cash_movements (session_id, type, amount, description, payment_type, created_at, is_synced, flujo)
            VALUES (v_session_id, 'EGRESO', v_sale.amount_card, 'DEVOLUCIÓN TARJETA (ANULA TICKET #' || v_short || ')', 'tarjeta', NOW(), 1, 'DEVOLUCION');
            v_cash_rows := v_cash_rows + 1;
        END IF;
        IF COALESCE(v_sale.amount_transfer, 0) > 0 THEN
            INSERT INTO public.cash_movements (session_id, type, amount, description, payment_type, created_at, is_synced, flujo)
            VALUES (v_session_id, 'EGRESO', v_sale.amount_transfer, 'DEVOLUCIÓN TRANSFERENCIA (ANULA TICKET #' || v_short || ')', 'transferencia', NOW(), 1, 'DEVOLUCION');
            v_cash_rows := v_cash_rows + 1;
        END IF;
    END IF;

    -- 3b. Abonos ya pagados del fiado: se devuelven por el mismo método con que entraron
    --     (mismo desglose que fn_register_fiado_payment_in_cash). La descripción termina en
    --     "Pago N" (sin '#') para que Finanzas SÍ lo reste: el INGRESO_FIADO sigue contando.
    FOR v_dp IN
        SELECT dp.* FROM public.debt_payments dp
        JOIN public.fiados f ON f.id = dp.fiado_id
        WHERE f.sale_id = p_sale_id AND COALESCE(f.status, '') <> 'ANULADO'
        ORDER BY dp.id
    LOOP
        v_abonos := v_abonos + COALESCE(v_dp.amount, 0);
        IF v_session_id IS NULL THEN CONTINUE; END IF;

        v_split := GREATEST(COALESCE(v_dp.amount_cash, 0), 0) + GREATEST(COALESCE(v_dp.amount_yape, 0), 0)
                 + GREATEST(COALESCE(v_dp.amount_card, 0), 0) + GREATEST(COALESCE(v_dp.amount_transfer, 0), 0);

        IF COALESCE(v_dp.amount_cash, 0) > 0 THEN
            INSERT INTO public.cash_movements (session_id, type, amount, description, payment_type, created_at, is_synced, flujo)
            VALUES (v_session_id, 'EGRESO', v_dp.amount_cash, 'DEVOLUCIÓN ABONO EFECTIVO (ANULA TICKET #' || v_short || ') / Pago ' || v_dp.id, 'efectivo', NOW(), 1, 'DEVOLUCION');
            v_cash_rows := v_cash_rows + 1;
        END IF;
        IF COALESCE(v_dp.amount_yape, 0) > 0 THEN
            INSERT INTO public.cash_movements (session_id, type, amount, description, payment_type, created_at, is_synced, flujo)
            VALUES (v_session_id, 'EGRESO', v_dp.amount_yape, 'DEVOLUCIÓN ABONO YAPE/PLIN (ANULA TICKET #' || v_short || ') / Pago ' || v_dp.id, 'yape', NOW(), 1, 'DEVOLUCION');
            v_cash_rows := v_cash_rows + 1;
        END IF;
        IF COALESCE(v_dp.amount_card, 0) > 0 THEN
            INSERT INTO public.cash_movements (session_id, type, amount, description, payment_type, created_at, is_synced, flujo)
            VALUES (v_session_id, 'EGRESO', v_dp.amount_card, 'DEVOLUCIÓN ABONO TARJETA (ANULA TICKET #' || v_short || ') / Pago ' || v_dp.id, 'tarjeta', NOW(), 1, 'DEVOLUCION');
            v_cash_rows := v_cash_rows + 1;
        END IF;
        IF COALESCE(v_dp.amount_transfer, 0) > 0 THEN
            INSERT INTO public.cash_movements (session_id, type, amount, description, payment_type, created_at, is_synced, flujo)
            VALUES (v_session_id, 'EGRESO', v_dp.amount_transfer, 'DEVOLUCIÓN ABONO TRANSFERENCIA (ANULA TICKET #' || v_short || ') / Pago ' || v_dp.id, 'transferencia', NOW(), 1, 'DEVOLUCION');
            v_cash_rows := v_cash_rows + 1;
        END IF;

        -- Pagos sin desglose o con desglose incompleto: el resto con su payment_type
        v_resto := ROUND(COALESCE(v_dp.amount, 0) - v_split, 2);
        IF v_resto > 0.009 THEN
            INSERT INTO public.cash_movements (session_id, type, amount, description, payment_type, created_at, is_synced, flujo)
            VALUES (v_session_id, 'EGRESO', v_resto, 'DEVOLUCIÓN ABONO (ANULA TICKET #' || v_short || ') / Pago ' || v_dp.id, COALESCE(v_dp.payment_type, 'efectivo'), NOW(), 1, 'DEVOLUCION');
            v_cash_rows := v_cash_rows + 1;
        END IF;
    END LOOP;

    -- 4. Deuda fiada anulada
    UPDATE public.fiados SET status = 'ANULADO' WHERE sale_id = p_sale_id;

    RETURN jsonb_build_object(
        'sale_id', p_sale_id,
        'caja_abierta', v_session_id IS NOT NULL,
        'movimientos_stock', v_stock_rows,
        'movimientos_caja', v_cash_rows,
        'abonos_devueltos', v_abonos
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_fiado_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_fiado_id BIGINT;
    v_total_paid NUMERIC;
    v_amount NUMERIC;
BEGIN
    v_fiado_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.fiado_id ELSE NEW.fiado_id END;

    -- Pago no enlazado a un crédito: entra a caja sin tocar fiados.
    IF v_fiado_id IS NULL THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
    FROM public.debt_payments
    WHERE fiado_id = v_fiado_id;

    SELECT amount INTO v_amount
    FROM public.fiados
    WHERE id = v_fiado_id;

    IF v_amount IS NOT NULL THEN
        UPDATE public.fiados
        SET
            paid_amount = v_total_paid,
            -- Un fiado ANULADO (ticket anulado) se queda ANULADO aunque cambien sus abonos
            status = CASE
                WHEN status = 'ANULADO' THEN 'ANULADO'
                WHEN v_total_paid >= (v_amount - 0.05) THEN 'CANCELADO'
                ELSE 'PENDIENTE'
            END,
            date_paid = CASE
                WHEN status = 'ANULADO' THEN date_paid
                WHEN v_total_paid >= (v_amount - 0.05) THEN NOW()::text
                ELSE NULL
            END
        WHERE id = v_fiado_id;
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;
