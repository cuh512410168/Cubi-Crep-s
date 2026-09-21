const { query } = require('./db');

async function probarConexion() {
  try {
    // Consulta simple para verificar la conexión y la hora de la BD
    const resultado = await query("SELECT TO_CHAR(SYSDATE, 'YYYY-MM-DD HH24:MI:SS') AS fecha_actual FROM DUAL");
    console.log("¡Conexión exitosa a Oracle en Docker! 🚀");
    console.log("Fecha y hora en la base de datos:", resultado[0].FECHA_ACTUAL);
    
    // Opcional: Si quieres ver tus productos de una vez
    const productos = await query("SELECT * FROM productos");
    console.log("Productos encontrados:", productos);
  } catch (error) {
    console.error("❌ Error al conectar a la base de datos:", error);
  }
}

probarConexion();