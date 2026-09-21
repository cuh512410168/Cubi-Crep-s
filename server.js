const express = require("express");
const { getConnection, query, oracledb } = require("./db");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PAGO = { efectivo: 1, tarjeta: 2, transferencia: 2 };
const PAGO_NOMBRE = { 1: "efectivo", 2: "tarjeta" };
const TAMANO = "3"; // tu catálogo usa tamaño 3 (los que tienen precio)
let columnasTamano;

async function obtenerColumnasTamano() {
  if (columnasTamano) return columnasTamano;
  const columnas = await query(
    `SELECT TABLE_NAME, COLUMN_NAME
     FROM USER_TAB_COLUMNS
     WHERE TABLE_NAME IN ('PRECIOS', 'DETALLE_VENTAS')`
  );
  const existe = (tabla, columna) => columnas.some(
    c => c.TABLE_NAME === tabla && c.COLUMN_NAME === columna
  );
  columnasTamano = {
    precios: existe("PRECIOS", "TAMAÑO_PRODCUTO") ? '"TAMAÑO_PRODCUTO"' : 'ID_TAMANO',
    detalle: existe("DETALLE_VENTAS", "ID_TAMAÑO") ? '"ID_TAMAÑO"' : 'ID_TAMANO',
  };
  return columnasTamano;
}

// ---------- PRODUCTOS (con precio del tamaño 3) ----------
app.get("/api/productos", async (req, res) => {
  try {
    const { precios: columnaTamano } = await obtenerColumnasTamano();
    const rows = await query(
      `SELECT p.ID_PRODUCTO AS "id", p.NOMBRE_PRODCUTO AS "nombre",
              pr.PRECIO AS "precio", p.STOCK AS "stock"
       FROM PRODUCTOS p
       JOIN PRECIOS pr ON pr.ID_PRODUCTO = p.ID_PRODUCTO
      WHERE pr.${columnaTamano} = :t`,
      { t: TAMANO }
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/productos", async (req, res) => {
  const { nombre, precio, stock } = req.body;
  const conn = await getConnection();
  try {
    const { precios: columnaTamano } = await obtenerColumnasTamano();
    const r = await conn.execute(
      `INSERT INTO PRODUCTOS (ID_PRODUCTO, NOMBRE_PRODCUTO, STOCK)
       VALUES (SEQ_PRODUCTOS.NEXTVAL, :nombre, :stock)
       RETURNING ID_PRODUCTO INTO :id`,
      {
        nombre, stock: stock || 0,
        id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
      },
      { autoCommit: false }
    );
    const id = r.outBinds.id[0];
    await conn.execute(
      `INSERT INTO PRECIOS (ID_PRECIO, ID_PRODUCTO, ${columnaTamano}, PRECIO)
       VALUES (SEQ_PRECIOS.NEXTVAL, :id, :t, :precio)`,
      { id, t: TAMANO, precio }
    );
    await conn.commit();
    res.status(201).json({ id, nombre, precio, stock });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally { await conn.close(); }
});

app.delete("/api/productos/:id", async (req, res) => {
  const id = req.params.id;
  try {
    await query("DELETE FROM DETALLE_VENTAS WHERE ID_PRODUCTO = :id", { id });
    await query("DELETE FROM PRECIOS WHERE ID_PRODUCTO = :id", { id });
    await query("DELETE FROM PRODUCTOS WHERE ID_PRODUCTO = :id", { id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- INVENTARIO (columna STOCK de PRODUCTOS) ----------
app.get("/api/inventario", async (req, res) => {
  try {
    const rows = await query(
      `SELECT ID_PRODUCTO AS "producto_id", NOMBRE_PRODCUTO AS "nombre",
              STOCK AS "cantidad", 5 AS "stock_minimo"
       FROM PRODUCTOS ORDER BY NOMBRE_PRODCUTO`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/inventario/:id", async (req, res) => {
  try {
    await query(
      "UPDATE PRODUCTOS SET STOCK = :c WHERE ID_PRODUCTO = :id",
      { c: req.body.cantidad, id: req.params.id }
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- VENTAS ----------
app.post("/api/ventas", async (req, res) => {
  const { metodo_pago, items } = req.body;
  if (!items || !items.length)
    return res.status(400).json({ error: "La venta no tiene productos" });

  const idPago = PAGO[metodo_pago] || 1;
  const conn = await getConnection();
  try {
    const { precios: columnaPrecios, detalle: columnaDetalle } = await obtenerColumnasTamano();
    const r = await conn.execute(
      `INSERT INTO VENTAS (NUM_VENTA, FECHA_VENTA, ID_PAGO)
       VALUES (SEQ_VENTAS.NEXTVAL, SYSDATE, :pago)
       RETURNING NUM_VENTA INTO :num`,
      { pago: idPago, num: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT } },
      { autoCommit: false }
    );
    const numVenta = r.outBinds.num[0];

    for (const it of items) {
      const precios = await conn.execute(
        `SELECT ID_PRECIO, PRECIO FROM PRECIOS
        WHERE ID_PRODUCTO = :id AND ${columnaPrecios} = :t`,
        { id: it.producto_id, t: TAMANO },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      if (!precios.rows.length)
        throw new Error("Producto sin precio: " + it.producto_id);
      const { ID_PRECIO, PRECIO } = precios.rows[0];

      await conn.execute(
        `INSERT INTO DETALLE_VENTAS
           (NUM_VENTA, ID_PRODUCTO, ${columnaDetalle}, ID_PRECIO, TOTAL, CANTIDAD)
         VALUES (:num, :prod, :tam, :prec, :total, :cant)`,
        {
          num: numVenta, prod: it.producto_id, tam: 3, prec: ID_PRECIO,
          total: PRECIO * it.cantidad, cant: it.cantidad,
        }
      );
      await conn.execute(
        "UPDATE PRODUCTOS SET STOCK = STOCK - :c WHERE ID_PRODUCTO = :id",
        { c: it.cantidad, id: it.producto_id }
      );
    }
    await conn.commit();
    res.status(201).json({ num_venta: numVenta, total: items.length });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally { await conn.close(); }
});

app.get("/api/ventas", async (req, res) => {
  try {
    const ventas = await query(
      `SELECT v.NUM_VENTA AS "id", v.FECHA_VENTA AS "fecha",
              v.ID_PAGO AS "id_pago",
              (SELECT NVL(SUM(d.TOTAL),0) FROM DETALLE_VENTAS d
                WHERE d.NUM_VENTA = v.NUM_VENTA) AS "total"
       FROM VENTAS v ORDER BY v.NUM_VENTA DESC`
    );
    for (const v of ventas) {
      v.items = await query(
        `SELECT d.CANTIDAD AS "cantidad", p.NOMBRE_PRODCUTO AS "producto",
                d.TOTAL AS "total_linea"
         FROM DETALLE_VENTAS d
         JOIN PRODUCTOS p ON p.ID_PRODUCTO = d.ID_PRODUCTO
         WHERE d.NUM_VENTA = :n`,
        { n: v.id }
      );
      v.metodo_pago = PAGO_NOMBRE[v.id_pago] || "efectivo";
    }
    res.json(ventas);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- RESUMEN ----------
app.get("/api/resumen", async (req, res) => {
  try {
    const hoy = await query(
      `SELECT NVL(SUM(d.TOTAL),0) AS "total", COUNT(DISTINCT v.NUM_VENTA) AS "n"
       FROM VENTAS v JOIN DETALLE_VENTAS d ON d.NUM_VENTA = v.NUM_VENTA
       WHERE TRUNC(v.FECHA_VENTA) = TRUNC(SYSDATE)`
    );
    const bajos = await query(
      `SELECT COUNT(*) AS "n" FROM PRODUCTOS WHERE STOCK <= 5`
    );
    res.json({
      ventas_hoy: hoy[0].total,
      ventas_hoy_count: hoy[0].n,
      productos_bajos: bajos[0].n,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`CUBICREP'S (Oracle) corriendo en http://localhost:${PORT}`)
);