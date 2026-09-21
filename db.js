const oracledb = require("oracledb");
require("dotenv").config();

// Modo "Thin" por defecto en versiones recientes (no requiere Oracle Instant Client)

async function getConnection() {
  return oracledb.getConnection({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || "", // Soporta contraseñas vacías si no tienes configurada una
    connectString: process.env.DB_CONNECTION_STRING || process.env.DB_CONNECT_STRING,
  });
}

async function query(sql, binds = {}) {
  const conn = await getConnection();
  try {
    const result = await conn.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      autoCommit: true,
    });
    return result.rows;
  } finally {
    await conn.close();
  }
}

module.exports = { getConnection, query, oracledb };