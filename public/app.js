const API = "/api";
let productos = [];
let ticket = [];
let filtroCat = "todos";
let metodoPago = "efectivo";

const $ = (id) => document.getElementById(id);
const money = (n) => "$" + parseFloat(n || 0).toFixed(2);
const emoji = (nombre) => (nombre || "").toUpperCase().includes("FRAPPE") ? "🥤" : "🥞";

// ================= TOASTS =================
function toast(msg, tipo = "") {
  const t = document.createElement("div");
  t.className = "toast " + tipo;
  t.innerHTML = (tipo === "ok" ? "✓ " : tipo === "error" ? "✕ " : "• ") + msg;
  $("toasts").appendChild(t);
  setTimeout(() => { t.classList.add("saliendo"); setTimeout(() => t.remove(), 300); }, 2800);
}

// ================= NAVEGACIÓN =================
const titulos = { pos: "Nueva venta", inventario: "Inventario", productos: "Catálogo de productos", ventas: "Historial de ventas" };
document.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("activo"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("activo"));
    btn.classList.add("activo");
    $(btn.dataset.tab).classList.add("activo");
    $("tituloSeccion").textContent = titulos[btn.dataset.tab];
    cargarTodo();
  });
});

$("fechaHoy").textContent = new Date().toLocaleDateString("es-MX", {
  weekday: "long", day: "numeric", month: "long", year: "numeric"
});

async function cargarTodo() {
  await cargarProductos();
  renderMenu();
  renderTablaProductos();
  await cargarInventario();
  await cargarVentas();
  await cargarResumen();
}

// ================= PRODUCTOS =================
async function cargarProductos() {
  const r = await fetch(`${API}/productos`);
  productos = await r.json();
}

function renderMenu() {
  const q = $("buscar").value.toLowerCase();
  const div = $("menu");
  div.innerHTML = "";
  const filtrados = productos.filter(p => {
    const cat = p.nombre.toUpperCase().includes("FRAPPE") ? "frappe" : "crepa";
    return (filtroCat === "todos" || cat === filtroCat) && p.nombre.toLowerCase().includes(q);
  });
  if (!filtrados.length) {
    div.innerHTML = `<div style="grid-column:1/-1;color:var(--muted);text-align:center;padding:30px">Sin resultados</div>`;
    return;
  }
  filtrados.forEach(p => {
    const bajo = p.stock > 0 && p.stock <= 5;
    const t = document.createElement("div");
    t.className = "prod" + (p.stock <= 0 ? " sin-stock" : "");
    t.innerHTML = `
      <span class="prod-stock ${bajo ? "bajo" : ""}">${p.stock <= 0 ? "Agotado" : p.stock + " uds"}</span>
      <div class="prod-emoji">${emoji(p.nombre)}</div>
      <h4>${p.nombre}</h4>
      <div class="prod-precio">${money(p.precio)}</div>`;
    t.onclick = () => agregar(p);
    div.appendChild(t);
  });
}

$("buscar").addEventListener("input", renderMenu);
document.querySelectorAll(".chip").forEach(c => c.addEventListener("click", () => {
  document.querySelectorAll(".chip").forEach(x => x.classList.remove("activo"));
  c.classList.add("activo");
  filtroCat = c.dataset.cat;
  renderMenu();
}));

function renderTablaProductos() {
  const tb = $("tablaProductos");
  tb.innerHTML = "";
  productos.forEach(p => {
    tb.innerHTML += `<tr>
      <td><div class="prod-cell"><span class="mini-emoji">${emoji(p.nombre)}</span></div></td>
      <td><b>${p.nombre}</b></td>
      <td class="num">${money(p.precio)}</td>
      <td><span class="pill ${p.stock <= 5 ? "bajo" : "ok"}">${p.stock} uds</span></td>
      <td class="num"><button class="btn-mini danger" data-del="${p.id}">Eliminar</button></td>
    </tr>`;
  });
}

$("formProducto").addEventListener("submit", async e => {
  e.preventDefault();
  const r = await fetch(`${API}/productos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nombre: $("p_nombre").value.trim(),
      precio: parseFloat($("p_precio").value),
      stock: +$("p_stock").value || 0,
    }),
  });
  if (r.ok) { toast("Producto agregado al catálogo", "ok"); e.target.reset(); cargarTodo(); }
  else { const e2 = await r.json(); toast("Error: " + e2.error, "error"); }
});

document.addEventListener("click", async e => {
  const btn = e.target.closest("[data-del]");
  if (!btn) return;
  if (!confirm("¿Eliminar este producto? También se borrarán sus precios y ventas asociadas.")) return;
  const r = await fetch(`${API}/productos/${btn.dataset.del}`, { method: "DELETE" });
  r.ok ? (toast("Producto eliminado", "ok"), cargarTodo())
       : toast("No se pudo eliminar", "error");
});

// ================= TICKET =================
function agregar(p) {
  const item = ticket.find(i => i.producto_id === p.id);
  const enTicket = item ? item.cantidad : 0;
  if (enTicket + 1 > p.stock) return toast(`Solo hay ${p.stock} de "${p.nombre}"`, "error");
  item ? item.cantidad++ : ticket.push({ producto_id: p.id, nombre: p.nombre, precio: +p.precio, cantidad: 1 });
  renderTicket();
}

function cambiarCant(id, delta) {
  const item = ticket.find(i => i.producto_id === id);
  const prod = productos.find(p => p.id === id);
  if (!item) return;
  if (delta > 0 && item.cantidad + 1 > prod.stock)
    return toast(`Solo hay ${prod.stock} disponibles`, "error");
  item.cantidad += delta;
  if (item.cantidad <= 0) ticket = ticket.filter(i => i.producto_id !== id);
  renderTicket();
}

function quitar(id) {
  ticket = ticket.filter(i => i.producto_id !== id);
  renderTicket();
}

$("btnVaciar").addEventListener("click", () => { ticket = []; renderTicket(); });

function renderTicket() {
  const div = $("ticket");
  const total = ticket.reduce((s, i) => s + i.precio * i.cantidad, 0);
  if (!ticket.length) {
    div.className = "ticket-vacio";
    div.innerHTML = `<div class="ticket-ico">🧾</div><p>El ticket está vacío<br/><span>Toca un producto para agregarlo</span></p>`;
  } else {
    div.className = "";
    div.innerHTML = ticket.map(i => `
      <div class="t-item">
        <div class="t-info">
          <div class="t-nombre">${i.nombre}</div>
          <div class="t-precio">${money(i.precio)} c/u</div>
        </div>
        <div class="t-cant">
          <button data-dec="${i.producto_id}">−</button>
          <span>${i.cantidad}</span>
          <button data-inc="${i.producto_id}">+</button>
        </div>
        <div class="t-total">${money(i.precio * i.cantidad)}</div>
      </div>`).join("");
  }
  $("total").textContent = money(total);
  $("btnCobrar").disabled = !ticket.length;
}

$("ticket").addEventListener("click", e => {
  const inc = e.target.closest("[data-inc]");
  const dec = e.target.closest("[data-dec]");
  if (inc) cambiarCant(+inc.dataset.inc, 1);
  if (dec) cambiarCant(+dec.dataset.dec, -1);
});

// ================= COBRO =================
$("btnCobrar").addEventListener("click", () => {
  $("mTotal").textContent = $("total").textContent;
  $("modalPago").classList.add("abierto");
});
$("btnCancelarPago").addEventListener("click", () => $("modalPago").classList.remove("abierto"));
document.querySelectorAll(".metodo").forEach(m => m.addEventListener("click", () => {
  document.querySelectorAll(".metodo").forEach(x => x.classList.remove("activo"));
  m.classList.add("activo");
  metodoPago = m.dataset.pago;
}));

$("btnConfirmarPago").addEventListener("click", async () => {
  const btn = $("btnConfirmarPago");
  btn.disabled = true; btn.textContent = "Procesando...";
  const r = await fetch(`${API}/ventas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      metodo_pago: metodoPago,
      items: ticket.map(i => ({ producto_id: i.producto_id, cantidad: i.cantidad })),
    }),
  });
  btn.disabled = false; btn.textContent = "Confirmar venta";
  if (r.ok) {
    $("modalPago").classList.remove("abierto");
    toast("Venta registrada correctamente", "ok");
    ticket = [];
    renderTicket();
    cargarTodo();
  } else {
    const e = await r.json();
    $("modalPago").classList.remove("abierto");
    toast("Error: " + e.error, "error");
  }
});

// ================= INVENTARIO =================
async function cargarInventario() {
  const r = await fetch(`${API}/inventario`);
  const data = await r.json();
  const bajos = data.filter(i => i.cantidad <= 5).length;
  $("badgeBajos").textContent = bajos ? `${bajos} con stock bajo` : "Todo en orden";
  $("badgeBajos").className = "badge" + (bajos ? "" : " ok");
  $("tablaInventario").innerHTML = data.map(i => `
    <tr>
      <td><div class="prod-cell"><span class="mini-emoji">${emoji(i.nombre)}</span><b>${i.nombre}</b></div></td>
      <td><b>${i.cantidad}</b> uds</td>
      <td><span class="pill ${i.cantidad <= 5 ? "bajo" : "ok"}">${i.cantidad <= 5 ? "Stock bajo" : "Disponible"}</span></td>
      <td class="num"><button class="btn-mini" data-stock="${i.producto_id}" data-nombre="${i.nombre}" data-cant="${i.cantidad}">Ajustar</button></td>
    </tr>`).join("");
}

let stockEditando = null;
document.addEventListener("click", e => {
  const b = e.target.closest("[data-stock]");
  if (!b) return;
  stockEditando = b.dataset.stock;
  $("stockTitulo").textContent = `Stock · ${b.dataset.nombre}`;
  $("stockInput").value = b.dataset.cant;
  $("modalStock").classList.add("abierto");
});
$("btnCancelarStock").addEventListener("click", () => $("modalStock").classList.remove("abierto"));
$("btnGuardarStock").addEventListener("click", async () => {
  const r = await fetch(`${API}/inventario/${stockEditando}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cantidad: +$("stockInput").value }),
  });
  $("modalStock").classList.remove("abierto");
  r.ok ? (toast("Stock actualizado", "ok"), cargarTodo())
       : toast("Error al actualizar", "error");
});

// ================= VENTAS =================
async function cargarVentas() {
  const r = await fetch(`${API}/ventas`);
  const data = await r.json();
  $("tablaVentas").innerHTML = data.length ? data.map(v => `
    <tr>
      <td><b>#${v.id}</b></td>
      <td>${new Date(v.fecha).toLocaleString("es-MX", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
      <td>${v.items.map(i => `${i.cantidad}× ${i.producto}`).join(", ")}</td>
      <td><span class="pill pago">${v.metodo_pago}</span></td>
      <td class="num">${money(v.total)}</td>
    </tr>`).join("")
    : `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:30px">Aún no hay ventas registradas</td></tr>`;
}

// ================= RESUMEN =================
async function cargarResumen() {
  const r = await fetch(`${API}/resumen`);
  const d = await r.json();
  $("sVentas").textContent = money(d.ventas_hoy);
  $("sTrans").textContent = d.ventas_hoy_count;
  $("sBajos").textContent = d.productos_bajos;
}

// Cerrar modales al hacer clic fuera
document.querySelectorAll(".modal-fondo").forEach(m =>
  m.addEventListener("click", e => { if (e.target === m) m.classList.remove("abierto"); })
);

cargarTodo();