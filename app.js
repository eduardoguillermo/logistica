// =======================================================
// VSS LOGÍSTICA — app.js
// Storage: vss-log (independiente del CRM vss4)
// =======================================================
const SKEY = 'vss-log';

function defData(){
  return {
    nid: 1,
    componentes: [],
    movimientos: [],
    ordenes: [],
    proveedores: [],
    config: {
      empresa: 'Viking Security Systems',
      email: '',
      tel: '',
      tipoCambio: 1,
      motivosSalida: ['Merma / descarte','Uso interno / prototipo','Garantia cliente','Reposicion a cliente','Prueba de calidad','Devolucion a proveedor','Rotura / dano'],
      origenesEntrada: ['Compra','Devolucion','Otro'],
      razonesPausa: ['Espera material','Espera presupuesto','Espera MO']
    },
    proyectos: [],
    proyNid: 1,
    operarios: []
  };
}

let DB;
try {
  DB = JSON.parse(localStorage.getItem(SKEY));
  if(!DB || !DB.componentes) DB = defData();
} catch(e) { DB = defData(); }

if(!DB.componentes)  DB.componentes  = [];
if(!DB.movimientos)  DB.movimientos  = [];
if(!DB.ordenes)      DB.ordenes      = [];
if(!DB.proveedores)  DB.proveedores  = [];
if(!DB.config)       DB.config       = defData().config;
if(!DB.config.motivosSalida)  DB.config.motivosSalida  = defData().config.motivosSalida;
if(!DB.config.origenesEntrada) DB.config.origenesEntrada = defData().config.origenesEntrada;
if(!DB.config.razonesPausa) DB.config.razonesPausa = defData().config.razonesPausa;
if(!DB.proyectos) DB.proyectos=[];
if(!DB.proyNid) DB.proyNid=1;
if(!DB.movimientosArchivados) DB.movimientosArchivados=[];
if(!DB.operarios) DB.operarios=[];
if(!DB.config.usuarios) DB.config.usuarios=[
  {nombre:'admin',password:'admin123',rol:'Administrador'},
  {nombre:'operador',password:'op123',rol:'Operador'}
];
if(DB.config.loginDeshabilitado===undefined) DB.config.loginDeshabilitado=false;

DB.ordenes.forEach(function(o,i){
  if(!o.numero) o.numero = 'OC-'+( o.fecha?o.fecha.slice(0,4):new Date().getFullYear())+'-'+String(i+1).padStart(4,'0');
});
DB.componentes.forEach(function(c){ if(!c.area) c.area='Fabrica'; });

// Stock cache
var _stockCache = null;
var _compMap = null;

function _buildCompMap(){
  _compMap = {};
  (DB.componentes||[]).forEach(function(c){ _compMap[c.id] = c; });
}
function compById(id){ if(!_compMap) _buildCompMap(); return _compMap[id]||{desc:'?',unidad:'',costo:0,codigo:''}; }
function invalidarCompMap(){ _compMap = null; }

function _buildStockCache(){
  _stockCache = {};
  var todos=(DB.movimientosArchivados||[]).concat(DB.movimientos);
  todos.forEach(function(m){
    var cid = m.cid||m.compId;
    if(!cid) return;
    if(!_stockCache[cid]) _stockCache[cid] = 0;
    // Reserva descuenta stock fisico igual que una salida
    _stockCache[cid] += m.tipo==='Entrada' ? (parseFloat(m.cant)||0) : -(parseFloat(m.cant)||0);
  });
}
function stockActual(cid){ if(!_stockCache) _buildStockCache(); return _stockCache[cid]||0; }
// Calcula cuanto hay reservado en depositos transitorios (proyectos Planificados)
function stockReservado(cid){
  var total=0;
  (DB.proyectos||[]).forEach(function(p){
    if(p.estado!=='Planificado') return;
    (p.materiales||[]).forEach(function(m){
      if((m.cid||m.compId)===cid && m.reservado) total+=parseFloat(m.cant)||0;
    });
  });
  return total;
}
function invalidarStockCache(){ _stockCache = null; }
var _tareaEstadoCache = null;
function invalidarTareaEstadoCache(){ _tareaEstadoCache = null; }
function tareaEstadoCached(t){
  if(!_tareaEstadoCache) _tareaEstadoCache = {};
  // clave: proyId+idx no disponible, usar desc+fecha como clave proxy
  var key = (t.estadoManual||'')+'|'+(t.fechaCumplimiento||'');
  if(_tareaEstadoCache[key]!==undefined) return _tareaEstadoCache[key];
  var v = tareaEstado(t);
  _tareaEstadoCache[key] = v;
  return v;
}
function save(){ invalidarStockCache(); invalidarCompMap(); invalidarTareaEstadoCache(); localStorage.setItem(SKEY, JSON.stringify(DB)); }

// =======================================================
// HELPERS
// =======================================================
function today(){
  var d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function fbox(l,v,mono){ return '<div class="fbox"><div class="fl">'+l+'</div><div class="fv'+(mono?' mono':'')+'">'+( v||'--')+'</div></div>'; }

// =======================================================
// NAV
// =======================================================
const PANELS = ['dashboard','stock','catalogo','movimientos','proyectos','dashproy','ordenes','proveedores','operarios','reportes','config','backup'];

// ============================================================
// CONTROL DE ACCESO
// ============================================================
var _usuarioActual = null; // {nombre, rol}

function intentarLogin(){
  // Si login deshabilitado, entrar directo como admin
  if(DB.config.loginDeshabilitado){
    _usuarioActual={nombre:'dev',rol:'Administrador'};
    _iniciarApp();
    return;
  }
  var user=(document.getElementById('login-user')?document.getElementById('login-user').value.trim():'');
  var pass=(document.getElementById('login-pass')?document.getElementById('login-pass').value:'');
  var errEl=document.getElementById('login-error');
  if(!user||!pass){if(errEl)errEl.textContent='Ingresa usuario y contraseña.';return;}
  var found=(DB.config.usuarios||[]).find(function(u){return u.nombre===user&&u.password===pass;});
  if(!found){
    if(errEl)errEl.textContent='Usuario o contraseña incorrectos.';
    var loginPass=document.getElementById('login-pass');
    if(loginPass){loginPass.value='';loginPass.focus();}
    var loginBox=document.getElementById('login-box');
    if(loginBox){loginBox.style.animation='none';void loginBox.offsetWidth;loginBox.style.animation='shake .4s ease';}
    return;
  }
  _usuarioActual={nombre:found.nombre,rol:found.rol};
  var loginScreen=document.getElementById('login-screen');
  if(loginScreen) loginScreen.classList.add('hidden');
  _iniciarApp();
}

var _appYaIniciada = false;

function _iniciarApp(){
  // Mostrar usuario en nav
  var navUser=document.getElementById('nav-usuario');
  if(navUser&&_usuarioActual) navUser.innerHTML='<strong style="color:var(--text)">'+_usuarioActual.nombre+'</strong><br><span style="color:'+(esAdmin()?'var(--primary)':'var(--amber)')+'">'+_usuarioActual.rol+'</span>';
  // Aplicar restricciones de nav para operador
  _aplicarRestriccionesNav();
  // Splash e ir al dashboard
  if(!_appYaIniciada){
    _appYaIniciada=true;
    if(typeof iniciarSplash==='function') iniciarSplash();
    setTimeout(function(){goTo('dashboard');alertaTareasProximas();},7800);
  } else {
    goTo('dashboard');
  }
}

function cerrarSesion(){
  if(!confirm('Cerrar sesión?')) return;
  _usuarioActual=null;
  // Si login deshabilitado, volver a entrar directo
  if(DB.config.loginDeshabilitado){
    _usuarioActual={nombre:'dev',rol:'Administrador'};
    _iniciarApp();
    return;
  }
  var loginScreen=document.getElementById('login-screen');
  if(loginScreen){
    loginScreen.classList.remove('hidden');
    var u=document.getElementById('login-user');
    var p=document.getElementById('login-pass');
    var e=document.getElementById('login-error');
    if(u) u.value='';if(p) p.value='';if(e) e.textContent='';
    if(u) u.focus();
  }
}

function esAdmin(){return _usuarioActual&&_usuarioActual.rol==='Administrador';}
function esOperador(){return _usuarioActual&&_usuarioActual.rol==='Operador';}

function operarioDelUsuario(){
  if(!_usuarioActual||esAdmin()) return null;
  var u=(DB.config.usuarios||[]).find(function(x){return x.nombre===_usuarioActual.nombre;});
  if(!u||!u.operarioId) return null;
  return (DB.operarios||[]).find(function(o){return o.id===u.operarioId;})||null;
}

function proyectosDelOperario(){
  var op=operarioDelUsuario();
  if(!op) return DB.proyectos||[];
  // Solo proyectos donde el operario tiene al menos una tarea asignada
  return (DB.proyectos||[]).filter(function(p){
    return (p.tareas||[]).some(function(t){return t.operario===op.id;});
  });
}

function _aplicarRestriccionesNav(){
  var restringidos=['nav-config','nav-backup'];
  if(esAdmin()){
    // Restaurar todo para admin
    restringidos.forEach(function(id){
      var el=document.getElementById(id);
      if(el) el.style.display='';
    });
    return;
  }
  // Ocultar para operador
  restringidos.forEach(function(id){
    var el=document.getElementById(id);
    if(el) el.style.display='none';
  });
}

// Verificar permiso antes de ejecutar acción restringida
function requireAdmin(fn){
  if(!esAdmin()){alert('Acción no permitida para el rol Operador.');return;}
  fn();
}

// Agregar shake animation al CSS dinámicamente
(function(){
  var style=document.createElement('style');
  style.textContent='@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}';
  document.head.appendChild(style);
})();

// Arrancar: mostrar login o ir directo si está deshabilitado
(function(){
  if(DB.config.loginDeshabilitado){
    _usuarioActual={nombre:'dev',rol:'Administrador'};
    _iniciarApp();
  } else {
    // Mostrar pantalla de login
    var ls=document.getElementById('login-screen');
    if(ls) ls.classList.remove('hidden');
    setTimeout(function(){var u=document.getElementById('login-user');if(u)u.focus();},100);
  }
})();

function goTo(p){
  PANELS.forEach(function(x){
    var panel = document.getElementById('panel-'+x);
    if(panel) panel.classList.toggle('on', x===p);
    var n = document.getElementById('nav-'+x);
    if(n) n.classList.toggle('on', x===p);
  });
  var titles = {dashboard:'Dashboard',stock:'Stock actual',catalogo:'Catalogo',movimientos:'Movimientos de stock',proyectos:'Proyectos',dashproy:'Dashboard de proyectos',ordenes:'Ordenes de compra',proveedores:'Proveedores',operarios:'Operarios',reportes:'Reportes',config:'Configuracion',backup:'Backup / Migrar'};
  document.getElementById('ptitle').textContent = titles[p]||p;
  var pa = document.getElementById('pacts'); pa.innerHTML = '';
  if(p!=='stock') _stockSoloCritico=false;
  if(p==='stock')       renderStock();
  if(p==='catalogo')    renderCatalogo();
  if(p==='movimientos') renderMovimientos();
  if(p==='dashboard')   renderDashboard();
  if(p==='proyectos'){cerrarFichaProyecto();renderProyectos();}
  if(p==='ordenes')     renderOrdenes();
  if(p==='proveedores') renderProveedores();
  if(p==='reportes')    cerrarReporte();
  if(p==='config')      renderConfig();
  if(p==='backup')      renderBackupInfo();
  if(p==='operarios')   renderOperarios();
  if(p==='dashproy')    renderDashProy();
}

// =======================================================
// MODAL
// =======================================================
function openModal(title, body, onSave, soloVista){
  var footer = soloVista
    ? '<button class="btn" onclick="cerrarModal()">Cerrar</button>'
    : '<button class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn btn-p" id="msave">Guardar</button>';
  document.getElementById('mbox').innerHTML =
    '<div class="moverlay" onclick="if(event.target===this)cerrarModal()">'+
    '<div class="modal">'+
    '<div class="mhead"><h3>'+title+'</h3><button class="btn btn-sm" onclick="cerrarModal()">X</button></div>'+
    '<div class="mbody">'+body+'</div>'+
    '<div class="mfoot">'+footer+'</div>'+
    '</div></div>';
  if(!soloVista && onSave){
    document.getElementById('msave').onclick = function(){ if(onSave()!==false) cerrarModal(); };
  }
}
function cerrarModal(){ document.getElementById('mbox').innerHTML = ''; }

// =======================================================
// STOCK
// =======================================================
var _stockSort = {col:'desc', dir:1};
var _stockSoloCritico = false;


function cajonBadge(ubicacion, nroCajon){
  if(!ubicacion && !nroCajon) return '<span style="color:var(--text3);font-size:11px">--</span>';
  var paleta=['#1565C0','#2E7D32','#6A1B9A','#E65100','#00695C','#AD1457','#4527A0','#558B2F'];
  var hash=0; var s=(ubicacion||nroCajon||'').toUpperCase();
  for(var i=0;i<s.length;i++) hash=(hash*31+s.charCodeAt(i))&0xff;
  var color=paleta[hash%paleta.length];
  if(ubicacion && nroCajon){
    return '<span style="display:inline-flex;align-items:center;gap:0;border-radius:5px;overflow:hidden;font-weight:700;white-space:nowrap">'+
      '<span style="background:'+color+'22;color:'+color+';padding:2px 7px;font-size:10px;border:1px solid '+color+'44;border-right:none;border-radius:5px 0 0 5px">'+ubicacion+'</span>'+
      '<span style="background:'+color+';color:#fff;padding:2px 9px;font-size:14px;border-radius:0 5px 5px 0">'+nroCajon+'</span>'+
    '</span>';
  }
  if(nroCajon){
    return '<span style="background:'+color+';color:#fff;padding:2px 10px;border-radius:5px;font-size:14px;font-weight:700">'+nroCajon+'</span>';
  }
  return '<span style="background:'+color+'22;color:'+color+';padding:2px 9px;border-radius:5px;font-size:11px;font-weight:700;border:1px solid '+color+'44">'+ubicacion+'</span>';
}

function toggleStockCritico(){
  _stockSoloCritico = !_stockSoloCritico;
  var btn = document.getElementById('btn-critico');
  if(btn){
    btn.style.background = _stockSoloCritico ? 'var(--primary)' : '';
    btn.style.color = _stockSoloCritico ? '#fff' : '';
    btn.style.borderColor = _stockSoloCritico ? 'var(--primary)' : '';
  }
  renderStock();
}

function fillCatFilter(selId){
  var cats = [...new Set(DB.componentes.map(function(c){return c.categoria;}))].filter(Boolean).sort();
  var sel = document.getElementById(selId);
  if(!sel) return;
  var cur = sel.value;
  sel.innerHTML = '<option value="">Todas las categorias</option>'+cats.map(function(c){return '<option'+(c===cur?' selected':'')+'>'+c+'</option>';}).join('');
}

function sortStock(col){
  if(_stockSort.col===col) _stockSort.dir*=-1;
  else { _stockSort.col=col; _stockSort.dir=1; }
  renderStock();
}

function renderStock(){
  var tc = parseFloat((DB.config&&DB.config.tipoCambio)||1);
  fillCatFilter('stock-cat-filter');
  var fcat  = document.getElementById('stock-cat-filter')  ? document.getElementById('stock-cat-filter').value  : '';
  var farea = document.getElementById('stock-area-filter') ? document.getElementById('stock-area-filter').value : '';
  var qs    = (document.getElementById('q-stock') ? document.getElementById('q-stock').value||'' : '').toLowerCase();

  var list = DB.componentes.filter(function(c){
    return (!fcat||c.categoria===fcat) &&
           (!farea||c.area===farea||c.area==='Ambas') &&
           (!qs||(c.codigo+c.desc+(c.ubicacion||'')+(c.proveedor||'')).toLowerCase().includes(qs));
  });
  if(_stockSoloCritico) list = list.filter(function(c){var qty=stockActual(c.id);return qty<=(parseFloat(c.min)||0);});

  // Sincronizar boton critico
  var btnCritico=document.getElementById('btn-critico');
  if(btnCritico){btnCritico.style.background=_stockSoloCritico?'var(--primary)':'';btnCritico.style.color=_stockSoloCritico?'#fff':'';}

  list.sort(function(a,b){
    var va='',vb='';
    if(_stockSort.col==='desc'){va=a.desc||'';vb=b.desc||'';}
    else if(_stockSort.col==='codigo'){va=a.codigo||'';vb=b.codigo||'';}
    else if(_stockSort.col==='categoria'){va=a.categoria||'';vb=b.categoria||'';}
    else if(_stockSort.col==='area'){va=a.area||'';vb=b.area||'';}
    else if(_stockSort.col==='ubicacion'){va=a.ubicacion||'';vb=b.ubicacion||'';}
    else if(_stockSort.col==='cant'){va=stockActual(a.id);vb=stockActual(b.id);return _stockSort.dir*(va-vb);}
    else if(_stockSort.col==='valor'){va=stockActual(a.id)*(parseFloat(a.costo)||0);vb=stockActual(b.id)*(parseFloat(b.costo)||0);return _stockSort.dir*(va-vb);}
    return _stockSort.dir*va.localeCompare(vb);
  });

  var total = DB.componentes.length;
  var criticos = DB.componentes.filter(function(c){return stockActual(c.id)<=(parseFloat(c.min)||0)&&(parseFloat(c.min)||0)>0;}).length;
  var sinStock = DB.componentes.filter(function(c){return stockActual(c.id)<=0;}).length;
  var valorTotal = DB.componentes.reduce(function(a,c){return a+stockActual(c.id)*(parseFloat(c.costo)||0);},0);
  var valorUSD   = DB.componentes.reduce(function(a,c){
    var cu=parseFloat(c.costo_usd||c.costoUSD)||(tc>1?(parseFloat(c.costo)||0)/tc:0);
    return a+stockActual(c.id)*cu;
  },0);

  document.getElementById('stock-stats').innerHTML =
    '<div class="stat"><div class="stat-n">'+total+'</div><div class="stat-l">Componentes</div></div>'+
    '<div class="stat"><div class="stat-n red">'+sinStock+'</div><div class="stat-l">Sin stock</div></div>'+
    '<div class="stat"><div class="stat-n amber">'+criticos+'</div><div class="stat-l">Stock critico</div></div>'+
    '<div class="stat"><div class="stat-n blue">$'+Math.round(valorTotal).toLocaleString('es-AR')+'</div><div class="stat-l">Valor $</div></div>'+
    '<div class="stat"><div class="stat-n blue">U$S '+Math.round(valorUSD).toLocaleString('es-AR')+'</div><div class="stat-l">Valor U$S</div></div>';

  var scols = {codigo:'Codigo',desc:'Descripcion',categoria:'Categoria',cant:'Cantidad',area:'Area',ubicacion:'Cajonera / Cajon',valor:'Valor total'};
  Object.keys(scols).forEach(function(col){
    var th = document.getElementById('sth-'+col);
    if(!th) return;
    th.innerHTML = scols[col]+(col===_stockSort.col?(_stockSort.dir===1?' A':' D'):'');
  });

  var tb = document.getElementById('tbody-stock');
  if(!list.length){tb.innerHTML='<tr><td colspan="13" class="empty">Sin componentes.</td></tr>';return;}
  tb.innerHTML = list.map(function(c){
    var cant = stockActual(c.id);
    var min  = parseFloat(c.min)||0;
    var eMat = c.estadoMat==='R'?'<span class="pill p-a">R</span>':'<span class="pill p-g">N</span>';
    var ubic = cajonBadge(c.ubicacion, c.nroCajon);
    var costo = parseFloat(c.costo)||0;
    var valorTotal = cant * costo;
    return '<tr>'+
      '<td class="mono" style="font-size:11px">'+c.codigo+'</td>'+
      '<td><strong>'+c.desc+'</strong></td>'+
      '<td>'+c.categoria+'</td>'+
      '<td style="font-weight:700;font-size:13px;color:'+(cant<=0?'var(--red)':cant<=min?'var(--amber)':'var(--green)')+'">'+cant+' '+(c.unidad||'')+'</td>'+
      '<td>'+(min||0)+' '+(c.unidad||'')+'</td>'+
      '<td>'+ubic+'</td>'+
      '<td>'+(c.proveedor||'--')+'</td>'+
      '<td>'+(c.area||'--')+'</td>'+
      '<td style="text-align:center">'+eMat+'</td>'+
      '<td style="text-align:right;font-size:11px">'+(costo?'$'+Math.round(costo).toLocaleString('es-AR'):'--')+'</td>'+
      '<td style="text-align:right;font-size:11px">'+((c.costo_usd||c.costoUSD)?'U$S '+parseFloat(c.costo_usd||c.costoUSD).toFixed(1):(costo&&tc>1?'U$S '+Math.round(costo/tc):'--'))+'</td>'+
      '<td style="text-align:right;font-size:11px;font-weight:700;color:'+(valorTotal>0?'var(--text)':'var(--text3)')+'">'+
        (valorTotal>0?'$'+Math.round(valorTotal).toLocaleString('es-AR'):'--')+
      '</td>'+
      '<td></td>'+
    '</tr>';
  }).join('');
}

function pdfStock(){
  var tc = parseFloat((DB.config&&DB.config.tipoCambio)||1);
  var empresa = (DB.config&&DB.config.empresa)||'Viking Security Systems';
  var list = DB.componentes.slice().sort(function(a,b){return (a.desc||'').localeCompare(b.desc||'','es');});
  var totalVal=0;
  var rows = list.map(function(c){
    var qty=stockActual(c.id);
    var val=qty*(parseFloat(c.costo)||0);
    totalVal+=val;
    var critico=qty<=(parseFloat(c.min)||0)&&(parseFloat(c.min)||0)>0;
    var ubic = cajonBadge(c.ubicacion, c.nroCajon);
    return '<tr style="'+(critico?'background:#FFF3E0':'')+'">'+
      '<td>'+c.codigo+'</td><td>'+c.desc+'</td><td>'+(c.categoria||'--')+'</td>'+
      '<td>'+(c.area||'--')+'</td><td>'+ubic+'</td>'+
      '<td style="text-align:center;font-weight:700;color:'+(critico?'#B71C1C':'#222')+'">'+qty+' '+(c.unidad||'')+'</td>'+
      '<td style="text-align:center">'+(c.min||0)+'</td>'+
      '<td style="text-align:right">$'+Math.round(parseFloat(c.costo)||0).toLocaleString('es-AR')+'</td>'+
      '<td style="text-align:right">$'+Math.round(val).toLocaleString('es-AR')+'</td></tr>';
  }).join('');
  var css='*{box-sizing:border-box;margin:0;padding:0}body{font-family:Segoe UI,Arial,sans-serif;padding:20px;font-size:11px}h1{font-size:15px;color:#B71C1C;margin-bottom:4px}.meta{color:#666;font-size:10px;margin-bottom:12px}table{width:100%;border-collapse:collapse}th{background:#B71C1C;color:#fff;padding:6px 8px;font-size:10px;text-align:left}td{padding:5px 8px;border-bottom:1px solid #eee}tfoot td{background:#f5f5f5;font-weight:700}.btn{position:fixed;top:12px;right:12px;background:#B71C1C;color:#fff;border:none;padding:6px 14px;border-radius:5px;cursor:pointer}@media print{.btn{display:none}}';
  var w=window.open('','_blank');
  w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Stock</title><style>'+css+'</style></head><body>'+
    '<button class="btn" onclick="window.print()">Imprimir</button>'+
    '<h1>INVENTARIO DE STOCK</h1><div class="meta">'+empresa+' - '+today()+'</div>'+
    '<table><thead><tr><th>Codigo</th><th>Descripcion</th><th>Categoria</th><th>Area</th><th>Cajonera/Cajon</th><th style="text-align:center">Stock</th><th style="text-align:center">Min.</th><th style="text-align:right">Costo</th><th style="text-align:right">Valor</th></tr></thead>'+
    '<tbody>'+rows+'</tbody><tfoot><tr><td colspan="8" style="text-align:right;padding:7px 8px">VALOR TOTAL</td><td style="text-align:right;padding:7px 8px;color:#B71C1C">$'+Math.round(totalVal).toLocaleString('es-AR')+'</td></tr></tfoot></table></body></html>');
  w.document.close();
}

// =======================================================
// CATALOGO
// =======================================================
var _catSort = {col:'codigo', dir:1};

function fillProvFilter(){
  var sel = document.getElementById('cat-prov-filter');
  if(!sel) return;
  var cur = sel.value;
  var provs = [...new Set(DB.componentes.map(function(c){return (c.proveedor||'').trim();}).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">Todos los proveedores</option>'+provs.map(function(p){return '<option value="'+p+'"'+(p===cur?' selected':'')+'>'+p+'</option>';}).join('');
}

function fillCajonerFilter(selId){
  var sel=document.getElementById(selId);
  if(!sel) return;
  var cur=sel.value;
  var cajs=[...new Set(DB.componentes.map(function(c){return (c.ubicacion||'').trim();}).filter(Boolean))].sort();
  sel.innerHTML='<option value="">Todas las cajoneras</option>'+cajs.map(function(c){return '<option'+(c===cur?' selected':'')+'>'+c+'</option>';}).join('');
}

function sortCatalogo(col){
  if(_catSort.col===col) _catSort.dir*=-1;
  else { _catSort.col=col; _catSort.dir=1; }
  renderCatalogo();
}

function renderCatalogo(){
  fillCatFilter('cat-filter');
  fillProvFilter();
  fillCajonerFilter('cat-cajon-filter');
  var q      = (document.getElementById('q-cat').value||'').toLowerCase();
  var fc     = document.getElementById('cat-filter').value;
  var fprov  = document.getElementById('cat-prov-filter')?document.getElementById('cat-prov-filter').value:'';
  var fcajon = document.getElementById('cat-cajon-filter')?document.getElementById('cat-cajon-filter').value:'';
  var list  = DB.componentes.filter(function(c){
    return (!q||(c.codigo+c.desc+(c.proveedor||'')+(c.ubicacion||'')+(c.categoria||'')).toLowerCase().includes(q))
      &&(!fc||c.categoria===fc)
      &&(!fprov||(c.proveedor||'').trim()===fprov)
      &&(!fcajon||(c.ubicacion||'').trim()===fcajon);
  });
  list.sort(function(a,b){
    var va='',vb='';
    if(_catSort.col==='desc'){va=a.desc||'';vb=b.desc||'';}
    else if(_catSort.col==='codigo'){va=a.codigo||'';vb=b.codigo||'';}
    else if(_catSort.col==='categoria'){va=a.categoria||'';vb=b.categoria||'';}
    else if(_catSort.col==='area'){va=a.area||'';vb=b.area||'';}
    else if(_catSort.col==='ubicacion'){va=a.ubicacion||'';vb=b.ubicacion||'';}
    else if(_catSort.col==='stock'){va=stockActual(a.id);vb=stockActual(b.id);return _catSort.dir*(va-vb);}
    return _catSort.dir*va.localeCompare(vb);
  });

  var catCount = document.getElementById('cat-count');
  if(catCount) catCount.textContent = list.length===DB.componentes.length?DB.componentes.length+' items':list.length+' de '+DB.componentes.length+' items';

  var cols = {codigo:'Codigo',desc:'Descripcion',categoria:'Categoria',stock:'Stock',area:'Area',ubicacion:'Cajonera / Cajon'};
  Object.keys(cols).forEach(function(col){
    var th = document.getElementById('th-'+col);
    if(!th) return;
    th.innerHTML = cols[col]+(col===_catSort.col?(_catSort.dir===1?' A':' D'):'');
  });

  var tb = document.getElementById('tbody-cat');
  if(!list.length){tb.innerHTML='<tr><td colspan="11" class="empty">Sin componentes.</td></tr>';return;}
  tb.innerHTML = list.map(function(c){
    var qty = stockActual(c.id);
    var min = parseFloat(c.min)||0;
    var sc  = qty<=0?'var(--red)':qty<=min?'#E65100':'var(--green)';
    var si  = qty<=0?'red':qty<=min?'amber':'green';
    var ubic = cajonBadge(c.ubicacion, c.nroCajon);
    return '<tr>'+
      '<td class="mono" style="font-size:11px">'+c.codigo+'</td>'+
      '<td>'+c.desc+'</td>'+
      '<td>'+(c.categoria||'--')+'</td>'+
      '<td>'+(c.unidad||'--')+'</td>'+
      '<td>'+(c.min||0)+'</td>'+
      '<td style="font-weight:700;color:'+sc+'">'+qty+'</td>'+
      '<td><span class="pill '+(c.area==='Mantenimiento'?'p-b':c.area==='Instalacion'?'p-a':'p-g')+'">'+(c.area||'Fabrica')+'</span></td>'+
      '<td>'+ubic+'</td>'+
      '<td>'+(c.proveedor||'--')+'</td>'+
      '<td style="text-align:center">'+(c.estadoMat==='R'?'<span class="pill p-a">R</span>':'<span class="pill p-g">N</span>')+'</td>'+
      '<td style="display:flex;gap:3px">'+
        '<button class="btn btn-sm" onclick="modalComponente('+c.id+')">Editar</button>'+
        '<button class="btn btn-sm" onclick="duplicarComponente('+c.id+')">Dupl.</button>'+
        '<button class="btn btn-sm" style="color:var(--red)" onclick="eliminarComponente('+c.id+')">X</button>'+
      '</td>'+
    '</tr>';
  }).join('');
}

function pdfCatalogo(){
  var empresa=(DB.config&&DB.config.empresa)||'Viking Security Systems';
  var list=DB.componentes.slice().sort(function(a,b){return (a.desc||'').localeCompare(b.desc||'','es');});
  var rows=list.map(function(c){
    var qty=stockActual(c.id);
    var min=parseFloat(c.min)||0;
    var critico=qty<=min&&min>0;
    var ubic=cajonBadge(c.ubicacion,c.nroCajon);
    return '<tr style="'+(critico?'background:#FFF3E0':'')+'">'+
      '<td>'+c.codigo+'</td><td>'+c.desc+'</td><td>'+(c.categoria||'--')+'</td>'+
      '<td>'+(c.area||'--')+'</td><td>'+ubic+'</td>'+
      '<td style="text-align:center;font-weight:700;color:'+(critico?'#B71C1C':'#222')+'">'+qty+'</td>'+
      '<td style="text-align:center">'+(c.min||0)+'</td>'+
      '<td>'+(c.proveedor||'--')+'</td>'+
      '<td style="text-align:right">$'+Math.round(parseFloat(c.costo)||0).toLocaleString('es-AR')+'</td></tr>';
  }).join('');
  var css='*{box-sizing:border-box;margin:0;padding:0}body{font-family:Segoe UI,Arial,sans-serif;padding:20px;font-size:11px}h1{font-size:15px;color:#B71C1C;margin-bottom:2px}.meta{color:#666;font-size:10px;margin-bottom:12px}table{width:100%;border-collapse:collapse}th{background:#B71C1C;color:#fff;padding:6px 8px;font-size:10px;text-align:left}td{padding:5px 8px;border-bottom:1px solid #eee}.btn{position:fixed;top:12px;right:12px;background:#B71C1C;color:#fff;border:none;padding:6px 14px;border-radius:5px;cursor:pointer}@media print{.btn{display:none}}';
  var w=window.open('','_blank');
  w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Catalogo</title><style>'+css+'</style></head><body>'+
    '<button class="btn" onclick="window.print()">Imprimir</button><h1>CATALOGO DE COMPONENTES</h1><div class="meta">'+empresa+' - '+today()+'</div>'+
    '<table><thead><tr><th>Codigo</th><th>Descripcion</th><th>Categoria</th><th>Area</th><th>Cajonera/Cajon</th><th style="text-align:center">Stock</th><th style="text-align:center">Min.</th><th>Proveedor</th><th style="text-align:right">Costo</th></tr></thead><tbody>'+rows+'</tbody></table></body></html>');
  w.document.close();
}

function calcPreciosComp(){
  var tc=(DB.config&&DB.config.tipoCambio)||1;
  var v=parseFloat(document.getElementById('cp-costo').value)||0;
  var el=document.getElementById('cp-costo-usd');
  if(el&&tc>0) el.value=(v/tc).toFixed(2);
}
function calcPreciosCompUSD(){
  var tc=(DB.config&&DB.config.tipoCambio)||1;
  var v=parseFloat(document.getElementById('cp-costo-usd').value)||0;
  var el=document.getElementById('cp-costo');
  if(el) el.value=Math.round(v*tc);
}

function modalComponente(id){
  if(esOperador()){alert("Accion no permitida para Operador.");return;}
  var c = id!=null ? DB.componentes.find(function(x){return x.id===id;}) : null;
  var cats=[...new Set(DB.componentes.map(function(x){return x.categoria;}))].filter(Boolean);
  var catOpts=cats.map(function(x){return '<option'+(c&&c.categoria===x?' selected':'')+'>'+x+'</option>';}).join('');
  var tc=(DB.config&&DB.config.tipoCambio)||1;
  openModal(c?'Editar componente':'Nuevo componente',
    '<div class="fg2">'+
      '<div class="fg"><label>Codigo *</label><input id="cp-cod" value="'+(c?c.codigo:'')+'" placeholder="Ej: ESP32-D0WD"></div>'+
      '<div class="fg"><label>Descripcion *</label><input id="cp-desc" value="'+(c?c.desc:'')+'" placeholder="Descripcion del componente"></div>'+
      '<div class="fg"><label>Categoria *</label><input id="cp-cat" value="'+(c?c.categoria:'')+'" placeholder="Ej: Electronica" list="cats-list"><datalist id="cats-list">'+catOpts+'</datalist></div>'+
      '<div class="fg"><label>Unidad</label><select id="cp-uni" style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;background:var(--surface2);color:var(--text)">'+
        ['u','m','ml','kg','g','par','juego'].map(function(u){return '<option'+(c&&c.unidad===u?' selected':'')+'>'+u+'</option>';}).join('')+'</select></div>'+
      '<div class="fg"><label>Stock minimo</label><input id="cp-min" type="number" min="0" value="'+(c?c.min||0:0)+'"></div>'+
      '<div class="fg"><label>Costo ($)</label><input id="cp-costo" type="number" min="0" value="'+(c?c.costo||c.precio||0:0)+'" oninput="calcPreciosComp()"></div>'+
      '<div class="fg"><label>Costo (U$S)</label><input id="cp-costo-usd" type="number" min="0" step="0.01" value="'+(c&&tc?((c.costo||c.precio||0)/tc).toFixed(2):0)+'" oninput="calcPreciosCompUSD()"></div>'+
      '<div class="fg"><label>Proveedor</label><input id="cp-prov" value="'+(c?c.proveedor||'':'')+'" list="dl-cp-prov">'+
        '<datalist id="dl-cp-prov">'+DB.proveedores.map(function(p){return '<option value="'+p.empresa+'">'+p.empresa+'</option>';}).join('')+'</datalist></div>'+
      '<div class="fg"><label>Area</label><select id="cp-area" style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;background:var(--surface2);color:var(--text)">'+
        ['Fabrica','Mantenimiento','Instalacion'].map(function(a){return '<option'+(c&&c.area===a?' selected':'')+'>'+a+'</option>';}).join('')+'</select></div>'+
      '<div class="fg"><label>Cajonera</label><input id="cp-ubic" value="'+(c?c.ubicacion||'':'')+'" placeholder="Ej: Cajonera A" list="dl-cp-ubic">'+
        '<datalist id="dl-cp-ubic">'+[...new Set(DB.componentes.filter(function(x){return x.ubicacion;}).map(function(x){return x.ubicacion;}))].map(function(u){return '<option value="'+u+'">'+u+'</option>';}).join('')+'</datalist></div>'+
      '<div class="fg"><label>Nro Cajon</label><input id="cp-nrocajon" value="'+(c?c.nroCajon||'':'')+'" placeholder="Ej: 3"></div>'+
      '<div class="fg"><label>Estado material</label><select id="cp-emat" style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;background:var(--surface2);color:var(--text)">'+
        '<option value="N"'+(c&&c.estadoMat==='N'?' selected':(!c?' selected':''))+'>N -- Nuevo</option>'+
        '<option value="R"'+(c&&c.estadoMat==='R'?' selected':'')+'>R -- Recuperado</option></select></div>'+
      '<div class="fg full"><label>Notas</label><textarea id="cp-notas" rows="2" style="width:100%;padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;background:var(--surface2);color:var(--text);resize:vertical;font-family:inherit">'+(c?c.notas||'':'')+'</textarea></div>'+
      (!c?
        '<div class="fg"><label>Stock inicial</label><input id="cp-stock-ini" type="number" min="0" value="0"></div>'+
        '<div class="fg"><label>Motivo</label><input id="cp-stock-mot" value="Stock inicial"></div>':'')+
      (c&&c.logPrecios&&c.logPrecios.length?
        '<div style="grid-column:1/-1;background:var(--surface2);border-radius:var(--r);padding:8px 10px;margin-top:4px">'+
          '<div style="font-size:10px;color:var(--text2);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Historial de precios</div>'+
          '<table style="width:100%;border-collapse:collapse">'+
            c.logPrecios.slice().reverse().slice(0,10).map(function(l){
              var subio=l.nuevo>l.anterior;
              return '<tr style="border-bottom:1px solid var(--border)">'+
                '<td style="padding:3px 6px;font-size:10px;color:var(--text2)">'+l.fecha+'</td>'+
                '<td style="padding:3px 6px;font-size:10px">'+l.campo+'</td>'+
                '<td style="padding:3px 6px;font-size:10px;color:var(--text2);text-decoration:line-through">'+l.anterior+'</td>'+
                '<td style="padding:3px 6px;font-size:10px;font-weight:700;color:'+(subio?'var(--red)':'var(--green)')+'">'+l.nuevo+' '+(subio?'▲':'▼')+'</td>'+
              '</tr>';
            }).join('')+
          '</table>'+
        '</div>':'')+
    '</div>',
    function(){
      var cod=document.getElementById('cp-cod').value.trim();
      var desc=document.getElementById('cp-desc').value.trim();
      var cat=document.getElementById('cp-cat').value.trim();
      if(!cod||!desc||!cat){alert('Codigo, descripcion y categoria son obligatorios.');return false;}
      if(c){
        c.codigo=cod;c.desc=desc;c.categoria=cat;
        c.unidad=document.getElementById('cp-uni').value;
        c.min=parseFloat(document.getElementById('cp-min').value)||0;
        var nuevoCosto=parseFloat(document.getElementById('cp-costo').value)||0;
        var nuevoCostoUSD=parseFloat(document.getElementById('cp-costo-usd').value)||0;
        // Log de cambio de precio si cambia
        if(!c.logPrecios) c.logPrecios=[];
        if(nuevoCosto!==parseFloat(c.costo||0)){
          c.logPrecios.push({fecha:today(),campo:'Costo $',anterior:parseFloat(c.costo||0),nuevo:nuevoCosto});
        }
        if(Math.abs(nuevoCostoUSD-(parseFloat(c.costo_usd||0)))>0.01){
          c.logPrecios.push({fecha:today(),campo:'Costo U$S',anterior:parseFloat(c.costo_usd||0),nuevo:nuevoCostoUSD});
        }
        c.costo=nuevoCosto;
        c.precio=c.costo;
        c.costo_usd=nuevoCostoUSD;
        c.area=document.getElementById('cp-area').value;
        c.proveedor=document.getElementById('cp-prov').value;
        c.ubicacion=document.getElementById('cp-ubic').value;
        c.nroCajon=document.getElementById('cp-nrocajon').value;
        c.estadoMat=document.getElementById('cp-emat').value;
        c.notas=document.getElementById('cp-notas').value.trim();
      } else {
        var newCosto=parseFloat(document.getElementById('cp-costo').value)||0;
        var newId=DB.nid++;
        DB.componentes.push({
          id:newId,codigo:cod,desc:desc,categoria:cat,
          unidad:document.getElementById('cp-uni').value,
          min:parseFloat(document.getElementById('cp-min').value)||0,
          costo:newCosto,precio:newCosto,
          costo_usd:parseFloat(document.getElementById('cp-costo-usd').value)||0,
          area:document.getElementById('cp-area').value,
          proveedor:document.getElementById('cp-prov').value,
          ubicacion:document.getElementById('cp-ubic').value,
          nroCajon:document.getElementById('cp-nrocajon').value,
          estadoMat:document.getElementById('cp-emat').value,
          notas:document.getElementById('cp-notas').value.trim()
        });
        var stockIni=parseFloat(document.getElementById('cp-stock-ini').value)||0;
        if(stockIni>0){
          var motIni=(document.getElementById('cp-stock-mot').value||'Stock inicial').trim();
          DB.movimientos.push({id:DB.nid++,cid:newId,tipo:'Entrada',cant:stockIni,fecha:today(),ref:'',lote:'',precio:newCosto,nota:motIni,origen:'Compra'});
        }
      }
      save();renderCatalogo();renderStock();return true;
    });
}

function duplicarComponente(id){
  var c=DB.componentes.find(function(x){return x.id===id;});
  if(!c) return;
  var nuevo=Object.assign({},c,{id:DB.nid++,codigo:c.codigo+'-2',desc:'Copia de '+c.desc});
  DB.componentes.push(nuevo);
  save();renderCatalogo();modalComponente(nuevo.id);
}

function eliminarComponente(id){
  if(esOperador()){alert("Accion no permitida para Operador.");return;}
  if(!confirm('Eliminar este componente? Se perderan sus movimientos.')) return;
  DB.componentes=DB.componentes.filter(function(x){return x.id!==id;});
  DB.movimientos=DB.movimientos.filter(function(x){return x.cid!==id;});
  save();renderCatalogo();renderStock();
}

// =======================================================
// MOVIMIENTOS
// =======================================================
function movTipoPill(t){
  var mp={'Entrada':'p-g','Salida manual':'p-r','Salida instalacion':'p-b'};
  return '<span class="pill '+(mp[t]||'p-x')+'">'+t+'</span>';
}

function renderMovimientos(){
  var q  = (document.getElementById('q-mov').value||'').toLowerCase();
  var ft = document.getElementById('mov-tipo-filter').value;
  var fm = document.getElementById('mov-motivo-filter')?document.getElementById('mov-motivo-filter').value:'';
  var fo = document.getElementById('mov-origen-filter')?document.getElementById('mov-origen-filter').value:'';

  var selMot=document.getElementById('mov-motivo-filter');
  if(selMot){
    var motivosUsados=[...new Set(DB.movimientos.filter(function(m){return m.tipo==='Salida manual'&&m.nota;}).map(function(m){return m.nota.trim();}))].sort();
    var curVal=selMot.value;
    selMot.innerHTML='<option value="">Todos los motivos</option>'+motivosUsados.map(function(mot){return '<option value="'+mot+'"'+(mot===curVal?' selected':'')+'>'+mot+'</option>';}).join('');
  }
  var selOri=document.getElementById('mov-origen-filter');
  if(selOri){
    var origenesUsados=[...new Set(DB.movimientos.filter(function(m){return m.tipo==='Entrada'&&m.origen;}).map(function(m){return m.origen.trim();}))].sort();
    var curOri=selOri.value;
    selOri.innerHTML='<option value="">Todos los origenes</option>'+origenesUsados.map(function(ori){return '<option value="'+ori+'"'+(ori===curOri?' selected':'')+'>'+ori+'</option>';}).join('');
  }

  var list=DB.movimientos.filter(function(m){
    var comp=DB.componentes.find(function(c){return c.id===(m.cid||m.compId);})||{desc:'--',codigo:'',unidad:''};
    var matchQ=!q||(comp.desc+comp.codigo+(m.ref||'')+(m.nota||'')+(m.origen||'')).toLowerCase().includes(q);
    var matchT=!ft||m.tipo===ft;
    var matchM=!fm||(m.nota||'').trim()===fm;
    var matchO=!fo||(m.origen||'').trim()===fo;
    return matchQ&&matchT&&matchM&&matchO;
  }).sort(function(a,b){return (b.fecha||'').localeCompare(a.fecha||'');});

  var tc=(DB.config&&DB.config.tipoCambio)||1;
  var tb=document.getElementById('tbody-mov');
  if(!list.length){tb.innerHTML='<tr><td colspan="12" class="empty">Sin movimientos.</td></tr>';return;}
  tb.innerHTML=list.map(function(m){
    var comp=DB.componentes.find(function(c){return c.id===(m.cid||m.compId);})||{desc:'--',codigo:'--',unidad:''};
    var precioUSD=m.precio&&tc>0?'U$S '+(parseFloat(m.precio)/tc).toFixed(2):'--';
    var eMat=m.estadoMat==='R'?'<span class="pill p-a">R</span>':'<span class="pill p-g">N</span>';
    return '<tr>'+
      '<td>'+m.fecha+'</td>'+
      '<td>'+movTipoPill(m.tipo)+'</td>'+
      '<td class="mono" style="font-size:11px">'+comp.codigo+'</td>'+
      '<td>'+comp.desc+'</td>'+
      '<td style="font-weight:600">'+(m.tipo==='Entrada'?'+':'-')+(m.cant||0)+' '+comp.unidad+'</td>'+
      '<td style="text-align:center">'+eMat+'</td>'+
      '<td>'+(m.precio?'$'+parseFloat(m.precio).toLocaleString('es-AR'):'--')+'</td>'+
      '<td>'+precioUSD+'</td>'+
      '<td>'+(m.ref||'--')+'</td>'+
      '<td style="font-size:11px">'+(m.nota||'--')+'</td>'+
      '<td style="font-size:11px">'+(m.origen||'--')+'</td>'+
      '<td style="display:flex;gap:3px">'+
        '<button class="btn btn-sm" onclick="editarMovimiento('+m.id+')">Ed.</button>'+
        '<button class="btn btn-sm" style="color:var(--red)" onclick="borrarMovimiento('+m.id+')">X</button>'+
      '</td>'+
    '</tr>';
  }).join('');
}

function toggleMotivoOtro(){
  var sel=document.getElementById('mv-motivo-sel');
  var wrap=document.getElementById('mv-motivo-otro-wrap');
  if(!sel||!wrap) return;
  wrap.style.display=sel.value==='__otro__'?'':'none';
}
function toggleOrigenOtro(){
  var sel=document.getElementById('mv-origen-sel');
  var wrap=document.getElementById('mv-origen-otro-wrap');
  if(!sel||!wrap) return;
  wrap.style.display=sel.value==='__otro__'?'':'none';
}

function stockDatalist(id, categoria, mode){
  if(mode==='ubicaciones'){
    var ubics=[...new Set(DB.componentes.map(function(c){return c.ubicacion;}).filter(Boolean))];
    return '<datalist id="dl-'+id+'">'+ubics.map(function(u){return '<option value="'+u+'"></option>';}).join('')+'</datalist>';
  }
  return '<datalist id="dl-'+id+'">'+DB.componentes.map(function(c){return '<option value="'+c.desc+'">'+c.codigo+'</option>';}).join('')+'</datalist>';
}

function mostrarPrecioComp(){
  var el=document.getElementById('mv-precio-display');
  if(!el) return;
  var cid=parseInt(document.getElementById('mv-cid').value)||0;
  if(!cid){el.textContent='-- seleccionar componente --';return;}
  var comp=DB.componentes.find(function(c){return c.id===cid;});
  if(!comp){el.textContent='--';return;}
  var tc=parseFloat((DB.config&&DB.config.tipoCambio)||1);
  var pesos=comp.costo?'$'+Math.round(parseFloat(comp.costo)).toLocaleString('es-AR'):'--';
  var usd=(comp.costo_usd||comp.costoUSD)?'U$S '+parseFloat(comp.costo_usd||comp.costoUSD).toFixed(2):(comp.costo&&tc>1?'U$S '+Math.round(parseFloat(comp.costo)/tc):'--');
  el.textContent=pesos+' / '+usd;
}

function modalMovimiento(tipo, preselCid){
  var compOpts=[...DB.componentes].sort(function(a,b){return (a.desc||'').localeCompare(b.desc||'','es');}).map(function(c){
    return '<option value="'+c.id+'"'+(preselCid===c.id?' selected':'')+'>'+c.codigo+' -- '+c.desc+'</option>';
  }).join('');
  var esInstalacion=tipo==='Salida instalacion';
  openModal(tipo,
    '<div class="fg2">'+
      '<div class="fg"><label>Componente *</label>'+
        '<select id="mv-cid" onchange="mostrarPrecioComp()" style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;width:100%;background:var(--surface2);color:var(--text)">'+
          '<option value="">-- seleccionar --</option>'+compOpts+
        '</select></div>'+
      '<div class="fg"><label>Cantidad *</label><input id="mv-cant" type="number" min="1" value="1"></div>'+
      '<div class="fg"><label>Fecha</label><input id="mv-fecha" type="date" value="'+today()+'"></div>'+
      (tipo==='Entrada'?
        '<div class="fg"><label>Precio catalogo</label><div id="mv-precio-display" style="padding:7px 9px;font-size:12px;color:var(--text2)">-- seleccionar componente --</div></div>'+
        '<div class="fg"><label>Remito / Factura ref.</label><input id="mv-ref" placeholder="Ej: FAC-00123"></div>'+
        '<div class="fg"><label>Lote / N de serie</label><input id="mv-lote" placeholder="Opcional"></div>'+
        '<div class="fg"><label>Origen *</label>'+
          '<select id="mv-origen-sel" onchange="toggleOrigenOtro()" style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;width:100%;background:var(--surface2);color:var(--text)">'+
            (DB.config.origenesEntrada||[]).map(function(o){return '<option value="'+o+'">'+o+'</option>';}).join('')+
            '<option value="__otro__">Otro...</option>'+
          '</select></div>'+
        '<div class="fg" id="mv-origen-otro-wrap" style="display:none"><label>Especificar origen</label><input id="mv-origen-otro" placeholder="Describe el origen..."></div>'+
        '<div class="fg"><label>Estado material *</label>'+
          '<select id="mv-emat" style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;width:100%;background:var(--surface2);color:var(--text)">'+
            '<option value="N" selected>N -- Nuevo</option><option value="R">R -- Recuperado</option></select></div>'
      :
        '<div class="fg"><label>Ubicacion</label><input id="mv-ubic" list="dl-mv-ubic" placeholder="Ej: Cajonera A">'+stockDatalist("mv-ubic","",'ubicaciones')+'</div>'+
        '<div class="fg"><label>Motivo *</label>'+
          '<select id="mv-motivo-sel" onchange="toggleMotivoOtro()" style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;width:100%;background:var(--surface2);color:var(--text)">'+
            (DB.config.motivosSalida||[]).map(function(m){return '<option value="'+m+'">'+m+'</option>';}).join('')+
            '<option value="__otro__">Otro...</option>'+
          '</select></div>'+
        '<div class="fg" id="mv-motivo-otro-wrap" style="display:none"><label>Especificar motivo</label><input id="mv-motivo-otro" placeholder="Describe el motivo..."></div>'+
        '<div class="fg"><label>Estado material</label>'+
          '<select id="mv-emat" style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;width:100%;background:var(--surface2);color:var(--text)">'+
            '<option value="N" selected>N -- Nuevo</option><option value="R">R -- Recuperado</option></select></div>'
      )+
    '</div>',
    function(){
      var cid=parseInt(document.getElementById('mv-cid').value);
      var cant=parseFloat(document.getElementById('mv-cant').value)||0;
      if(!cid||cant<=0){alert('Selecciona un componente e ingresa la cantidad.');return false;}
      var mov={id:DB.nid++,cid:cid,tipo:tipo,cant:cant,fecha:document.getElementById('mv-fecha').value};
      if(tipo==='Entrada'){
        var compCat=DB.componentes.find(function(c){return c.id===cid;});
        mov.precio=compCat?parseFloat(compCat.costo)||0:0;
        mov.ref=document.getElementById('mv-ref').value;
        mov.lote=document.getElementById('mv-lote').value;
        mov.estadoMat=document.getElementById('mv-emat')?document.getElementById('mv-emat').value:'N';
        var origenSel=document.getElementById('mv-origen-sel');
        var origenVal=origenSel?origenSel.value:'Compra';
        if(origenVal==='__otro__'){
          origenVal=document.getElementById('mv-origen-otro')?document.getElementById('mv-origen-otro').value.trim():'';
          if(origenVal&&DB.config.origenesEntrada&&DB.config.origenesEntrada.indexOf(origenVal)===-1) DB.config.origenesEntrada.push(origenVal);
        }
        mov.origen=origenVal;
      } else {
        var motivoSel=document.getElementById('mv-motivo-sel');
        var motivoVal=motivoSel?motivoSel.value:'';
        if(motivoVal==='__otro__'){
          motivoVal=document.getElementById('mv-motivo-otro')?document.getElementById('mv-motivo-otro').value.trim():'';
          if(motivoVal&&DB.config.motivosSalida&&DB.config.motivosSalida.indexOf(motivoVal)===-1) DB.config.motivosSalida.push(motivoVal);
        }
        mov.nota=motivoVal;
        mov.estadoMat=document.getElementById('mv-emat')?document.getElementById('mv-emat').value:'N';
      }
      DB.movimientos.push(mov);
      save();renderMovimientos();renderStock();return true;
    });
}

function borrarMovimiento(id){
  var m=DB.movimientos.find(function(x){return x.id===id;});
  if(!m) return;
  var comp=DB.componentes.find(function(c){return c.id===(m.cid||m.compId);})||{};
  if(!confirm('Eliminar movimiento de '+m.tipo.toLowerCase()+' de "'+( comp.desc||'?')+'"?')) return;
  DB.movimientos=DB.movimientos.filter(function(x){return x.id!==id;});
  save();renderMovimientos();renderStock();
}

function editarMovimiento(id){
  var m=DB.movimientos.find(function(x){return x.id===id;});
  if(!m) return;
  var comp=(compById(m.cid)||{desc:'?'});
  var tc=(DB.config&&DB.config.tipoCambio)||1;
  openModal('Editar movimiento -- '+comp.desc,
    '<div class="fg2">'+
      '<div class="fg"><label>Fecha</label><input id="em-fecha" type="date" value="'+(m.fecha||today())+'"></div>'+
      '<div class="fg"><label>Precio unitario ($)</label><input id="em-precio" type="number" min="0" value="'+(m.precio||0)+'"></div>'+
      '<div class="fg"><label>Referencia</label><input id="em-ref" value="'+(m.ref||'')+'"></div>'+
      '<div class="fg"><label>Lote</label><input id="em-lote" value="'+(m.lote||'')+'"></div>'+
      '<div class="fg"><label>Nota / Motivo</label><input id="em-nota" value="'+(m.nota||'')+'"></div>'+
      '<div class="fg"><label>Origen</label><input id="em-origen" value="'+(m.origen||'')+'"></div>'+
      '<div class="fg"><label>Estado material</label>'+
        '<select id="em-emat" style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;width:100%;background:var(--surface2);color:var(--text)">'+
          '<option value="N"'+(m.estadoMat!=='R'?' selected':'')+'>N -- Nuevo</option>'+
          '<option value="R"'+(m.estadoMat==='R'?' selected':'')+'>R -- Recuperado</option>'+
        '</select></div>'+
    '</div>',
    function(){
      m.fecha=document.getElementById('em-fecha').value;
      m.precio=parseFloat(document.getElementById('em-precio').value)||0;
      m.ref=document.getElementById('em-ref').value;
      m.lote=document.getElementById('em-lote').value;
      m.nota=document.getElementById('em-nota').value;
      m.origen=document.getElementById('em-origen').value;
      m.estadoMat=document.getElementById('em-emat')?document.getElementById('em-emat').value:'N';
      save();renderMovimientos();return true;
    });
}


// =======================================================
// PROYECTOS
// =======================================================
var PROJ_ESTADOS = ['Planificado','En curso','Pausado','Finalizado','Cancelado'];

function tareaEstadoCached(t){
  if(t.estadoManual==='OK') return 'OK';
  if(t.estadoManual==='Cancelado') return 'Cancelado';
  if(t.estadoManual==='Pendiente confirmacion') return 'Pendiente confirmacion';
  if(t.fechaCumplimiento && t.fechaCumplimiento < today()) return 'Atrasado';
  return 'En curso';
}

function tareaPill(estado){
  var map={
    'En curso':              {bg:'var(--blue)',   label:'En curso'},
    'OK':                    {bg:'var(--green)',  label:'OK'},
    'Atrasado':              {bg:'var(--red)',    label:'Atrasado'},
    'Cancelado':             {bg:'var(--text3)', label:'Cancelado'},
    'Pendiente confirmacion':{bg:'#6a1b9a',      label:'Pend. confirm.'}
  };
  var s=map[estado]||map['En curso'];
  return '<span style="background:'+s.bg+';color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">'+s.label+'</span>';
}

function getNumProj(){
  var max=0;
  (DB.proyectos||[]).forEach(function(p){
    if(!p.numero) return;
    // Soporta PRY-XXX y PROJ-YYYY-XXXX (legacy)
    var n=0;
    if(p.numero.startsWith('PRY-')){
      n=parseInt(p.numero.replace('PRY-',''))||0;
    } else if(p.numero.startsWith('PROJ-')){
      var parts=p.numero.split('-');
      n=parseInt(parts[parts.length-1])||0;
    }
    if(n>max) max=n;
  });
  return 'PRY-'+String(max+1).padStart(3,'0');
}

function proyEstadoPill(e){
  var mp={Planificado:'p-a','En curso':'p-b',Pausado:'p-x',Finalizado:'p-g',Cancelado:'p-r'};
  return '<span class="pill '+(mp[e]||'p-x')+'">'+e+'</span>';
}

var _vistaProyectos = 'activos';
function setVistaProyectos(v){
  _vistaProyectos = v;
  var btns = {activos:'vbtn-activos', finalizados:'vbtn-finalizados', todos:'vbtn-todos'};
  Object.keys(btns).forEach(function(k){
    var el = document.getElementById(btns[k]);
    if(!el) return;
    if(k === v){
      el.style.background = 'var(--primary)'; el.style.color = '#fff'; el.style.fontWeight = '700';
    } else {
      el.style.background = 'var(--surface2)'; el.style.color = 'var(--text2)'; el.style.fontWeight = 'normal';
    }
  });
  renderProyectos();
}

function renderProyectos(){
  // Toggle Lista / Dashboard
  var toggleEl=document.getElementById('proy-body-toggle');
  if(toggleEl) toggleEl.innerHTML=
    '<div style="display:flex;border:1px solid var(--border);border-radius:var(--r);overflow:hidden;margin-bottom:12px;width:fit-content">'+
      '<button onclick="cerrarFichaProyecto();renderProyectos()" style="padding:6px 16px;font-size:12px;border:none;cursor:pointer;background:var(--primary);color:#fff;font-weight:700">☰ Lista</button>'+
      '<button onclick="goTo(\'dashproy\')" style="padding:6px 16px;font-size:12px;border:none;border-left:1px solid var(--border);cursor:pointer;background:var(--surface2);color:var(--text2)">📊 Dashboard</button>'+
    '</div>';

  var q=(document.getElementById('q-proj')?document.getElementById('q-proj').value||'':'').toLowerCase();
  var estadosActivos=['Planificado','En curso','Pausado'];
  var estadosHist=['Finalizado','Cancelado'];

  // Filtro por operario si es operador vinculado
  var baseProyectos=proyectosDelOperario();

  var todosList=baseProyectos.filter(function(p){
    return !q||((p.numero||'')+(p.nombre||'')).toLowerCase().includes(q);
  }).sort(function(a,b){return (b.numero||'').localeCompare(a.numero||'');});

  var listActivos=todosList.filter(function(p){return estadosActivos.indexOf(p.estado)>-1;});
  var listHist=todosList.filter(function(p){return estadosHist.indexOf(p.estado)>-1;});
  var list = _vistaProyectos==='activos' ? listActivos :
             _vistaProyectos==='finalizados' ? listHist : todosList;

  var activos=(DB.proyectos||[]).filter(function(p){return p.estado==='En curso';}).length;
  var planif=(DB.proyectos||[]).filter(function(p){return p.estado==='Planificado';}).length;
  var fin=(DB.proyectos||[]).filter(function(p){return p.estado==='Finalizado';}).length;
  var valorActivo=(DB.proyectos||[]).filter(function(p){return p.estado!=='Cancelado'&&p.estado!=='Finalizado';}).reduce(function(a,p){
    return a+(p.materiales||[]).reduce(function(b,m){
      var comp=(compById(m.compId)||{});
      return b+(parseFloat(m.cant)||0)*(parseFloat(comp.costo)||0);
    },0);
  },0);
  var valorHistorico=(DB.proyectos||[]).filter(function(p){return p.estado!=='Cancelado';}).reduce(function(a,p){
    return a+(p.materiales||[]).reduce(function(b,m){
      var comp=(compById(m.compId)||{});
      return b+(parseFloat(m.cant)||0)*(parseFloat(comp.costo)||0);
    },0);
  },0);

  document.getElementById('proj-stats').innerHTML=
    '<div class="stat"><div class="stat-n amber">'+planif+'</div><div class="stat-l">Planificados</div></div>'+
    '<div class="stat"><div class="stat-n blue">'+activos+'</div><div class="stat-l">En curso</div></div>'+
    '<div class="stat"><div class="stat-n green">'+fin+'</div><div class="stat-l">Finalizados</div></div>'+
    '<div class="stat"><div class="stat-n">$'+Math.round(valorActivo).toLocaleString('es-AR')+'</div><div class="stat-l">Comprometido activo</div></div>'+
    '<div class="stat"><div class="stat-n blue">$'+Math.round(valorHistorico).toLocaleString('es-AR')+'</div><div class="stat-l">Historico total</div></div>';

  var tb=document.getElementById('tbody-proj');
  if(!list.length){tb.innerHTML='<tr><td colspan="8" class="empty">Sin proyectos registrados.</td></tr>';return;}

  var esHist = function(p){ return p.estado==='Finalizado'||p.estado==='Cancelado'; };

  var rows = '';
  if(_vistaProyectos==='todos'){
    if(listActivos.length){
      rows += '<tr><td colspan="8" style="background:#0a1a0a;color:#66bb6a;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:5px 10px;border-bottom:1px solid #1a3a1a">▶ Activos ('+listActivos.length+')</td></tr>';
      rows += listActivos.map(function(p){ return filaProyecto(p, false); }).join('');
    }
    if(listHist.length){
      rows += '<tr><td colspan="8" style="background:#1a0a00;color:#ffb74d;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:5px 10px;border-bottom:1px solid #3a2000;border-top:2px solid #3a2000">📁 Historial -- Finalizados y Cancelados ('+listHist.length+')</td></tr>';
      rows += listHist.map(function(p){ return filaProyecto(p, true); }).join('');
    }
  } else {
    rows = list.map(function(p){ return filaProyecto(p, esHist(p)); }).join('');
  }
  tb.innerHTML = rows;

  function filaProyecto(p, hist){
    var nMat=(p.materiales||[]).length;
    var valor=(p.materiales||[]).reduce(function(a,m){
      var comp=(compById(m.compId)||{});
      return a+(parseFloat(m.cant)||0)*(parseFloat(comp.costo)||0);
    },0);
    var sobrantes=(p.materiales||[]).filter(function(m){return (parseFloat(m.cant)||0)>(parseFloat(m.devuelto)||0);}).length;
    var op = hist ? 'opacity:.75' : '';
    var numColor = hist ? 'color:var(--text2)' : 'color:var(--primary)';
    var nombreColor = hist ? 'color:var(--text2)' : '';
    var fechaFin = hist && p.fechaFinReal ? '<span style="color:#66bb6a">'+p.fechaFinReal+'</span>' : (p.fechaEstFin||'--');
    return '<tr style="border-bottom:1px solid var(--border);'+op+'">'+
      '<td class="mono" style="font-size:11px;'+numColor+'">'+p.numero+'</td>'+
      '<td><strong style="'+nombreColor+'">'+p.nombre+'</strong>'+(p.descripcion?'<br><span style="font-size:10px;color:var(--text2)">'+p.descripcion.slice(0,50)+(p.descripcion.length>50?'...':'')+'</span>':'')+'</td>'+
      '<td>'+proyEstadoPill(p.estado)+'</td>'+
      '<td style="font-size:11px;'+(hist?'color:var(--text2)':'')+'">'+(p.fechaInicio||'--')+'</td>'+
      '<td style="font-size:11px">'+fechaFin+'</td>'+
      '<td style="text-align:center;'+(hist?'color:var(--text2)':'')+'">'+nMat+(sobrantes>0&&p.estado==='Finalizado'?'<br><span style="font-size:10px;color:var(--amber)">'+sobrantes+' c/sobrante</span>':'')+'</td>'+
      '<td style="text-align:right;font-size:12px;font-weight:700;white-space:nowrap;'+(hist?'color:var(--text2)':'')+'">'+(valor>0?'$'+Math.round(valor).toLocaleString('es-AR'):'--')+'</td>'+
      '<td style="display:flex;gap:3px">'+
        '<button class="btn btn-sm '+(hist?'':'btn-p')+'" onclick="abrirProyecto('+p.id+')">Ver</button>'+
        '<button class="btn btn-sm" style="color:var(--red)" onclick="borrarProyecto('+p.id+')">X</button>'+
      '</td>'+
    '</tr>';
  }
}

function modalNuevoProyecto(){
  if(esOperador()){alert("Accion no permitida para Operador.");return;}
  var num=getNumProj();
  openModal('Nuevo proyecto',
    '<div class="fg2">'+
      '<div class="fg"><label>N\u00b0 Proyecto</label><div style="padding:7px 9px;font-family:monospace;font-weight:700;color:var(--primary)">'+num+'</div></div>'+
      '<div class="fg"><label>Estado inicial</label><div style="padding:7px 9px;font-size:12px;color:var(--text2)">Planificado</div></div>'+
      '<div class="fg full"><label>Nombre *</label><input id="np-nombre" placeholder="Nombre del proyecto"></div>'+
      '<div class="fg"><label>Prioridad</label>'+
        '<select id="np-prioridad" style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;background:var(--surface2);color:var(--text)">'+
          '<option value="Media">Media</option>'+
          '<option value="Alta">Alta</option>'+
          '<option value="Baja">Baja</option>'+
        '</select></div>'+
      '<div class="fg full" style="background:var(--surface2);border-radius:var(--r);padding:10px 12px;border:1px solid var(--border)">'+
        '<div style="font-size:10px;color:var(--primary);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Alcance del proyecto</div>'+
        '<div class="fg full"><label>Objetivo</label><textarea id="np-objetivo" rows="2" placeholder="Que se quiere lograr con este proyecto?"></textarea></div>'+
        '<div class="fg full"><label>Que incluye</label><textarea id="np-incluye" rows="2" placeholder="Trabajos, entregas y responsabilidades incluidas..."></textarea></div>'+
        '<div class="fg full"><label>Que NO incluye</label><textarea id="np-noincluye" rows="2" placeholder="Exclusiones explicitas del alcance..."></textarea></div>'+
      '</div>'+
      '<div class="fg full"><label>Descripcion</label><textarea id="np-desc" rows="2" placeholder="Descripcion general del proyecto..."></textarea></div>'+
      '<div class="fg"><label>Fecha inicio</label><input id="np-finicio" type="date" value="'+today()+'"></div>'+
      '<div class="fg"><label>Fecha estimada fin</label><input id="np-festfin" type="date"></div>'+
      '<div class="fg"><label>Presupuesto total ($)</label><input id="np-presupuesto" type="number" min="0" value="0" placeholder="0"></div>'+
      '<div class="fg full"><label>OneDrive -- link carpeta de fotos/docs</label>'+
        '<input id="np-onedrive" placeholder="https://onedrive.live.com/..." type="url"></div>'+
    '</div>',
    function(){
      var nombre=document.getElementById('np-nombre').value.trim();
      if(!nombre){alert('El nombre es obligatorio.');return false;}
      var fIni=document.getElementById('np-finicio')?document.getElementById('np-finicio').value:'';
      var fFin=document.getElementById('np-festfin')?document.getElementById('np-festfin').value:'';
      if(fIni&&fFin&&fFin<fIni){alert('La fecha de fin estimada no puede ser anterior a la fecha de inicio.');return false;}
      var proj={
        id:DB.proyNid++,
        numero:num,
        nombre:nombre,
        descripcion:document.getElementById('np-desc').value,
        prioridad:document.getElementById('np-prioridad')?document.getElementById('np-prioridad').value:'Media',
        alcance:{
          objetivo:document.getElementById('np-objetivo')?document.getElementById('np-objetivo').value.trim():'',
          incluye:document.getElementById('np-incluye')?document.getElementById('np-incluye').value.trim():'',
          noIncluye:document.getElementById('np-noincluye')?document.getElementById('np-noincluye').value.trim():''
        },
        estado:'Planificado',
        fechaInicio:document.getElementById('np-finicio').value,
        fechaEstFin:document.getElementById('np-festfin').value,
        fechaFinReal:'',
        presupuesto:parseFloat(document.getElementById('np-presupuesto')?document.getElementById('np-presupuesto').value:0)||0,
        pctAvance:0,
        onedrive:document.getElementById('np-onedrive')?document.getElementById('np-onedrive').value.trim():'',
        onedriveLinks:[],
        materiales:[],
        historial:[{fecha:today(),accion:'Proyecto creado',estado:'Planificado'}],
        notas:[],
        tareas:[]
      };
      if(!DB.proyectos) DB.proyectos=[];
      DB.proyectos.unshift(proj);
      save();
      renderProyectos();
      setTimeout(function(){abrirProyecto(proj.id);},200);
      return true;
    });
}

function abrirProyecto(id){
  var p=(DB.proyectos||[]).find(function(x){return x.id===id;});
  if(!p) return;

  var esPlanif=p.estado==='Planificado';
  var esEnCurso=p.estado==='En curso';
  var esFin=p.estado==='Finalizado'||p.estado==='Cancelado';

  // Valor total
  var valor=(p.materiales||[]).reduce(function(a,m){
    var comp=(compById(m.compId)||{});
    return a+(parseFloat(m.cant)||0)*(parseFloat(comp.costo)||0);
  },0);

  // Aviso cierre pendiente: todas las tareas OK y proyecto en curso
  var tareasTotales=(p.tareas||[]).length;
  var tareasOKCount=(p.tareas||[]).filter(function(t){return tareaEstadoCached(t)==='OK';}).length;
  var todasOK=tareasTotales>0&&tareasOKCount===tareasTotales&&p.estado==='En curso';

  // Header
  var body=
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px">'+
      '<span class="mono" style="font-weight:700;color:var(--primary)">'+p.numero+'</span>'+
      proyEstadoPill(p.estado)+
      '<span style="font-size:11px;color:var(--text2)">Inicio: '+(p.fechaInicio||'--')+'</span>'+
      '<span style="font-size:11px;color:var(--text2)">Est. fin: '+(p.fechaEstFin||'--')+'</span>'+
      (p.fechaFinReal?'<span style="font-size:11px;color:var(--green)">Fin real: '+p.fechaFinReal+'</span>':'')+
    '</div>'+
    // Descripcion
    '<div style="background:var(--surface2);border-radius:var(--r);padding:10px 12px;margin-bottom:12px;font-size:12px;color:var(--text2)">'+
      '<strong style="color:var(--text)">'+p.nombre+'</strong>'+(p.descripcion?'<br>'+p.descripcion:'')+'</div>'+
    // Aviso cierre pendiente
    (todasOK?
      '<div style="background:#0a2a0a;border:1px solid var(--green);border-radius:var(--r);padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;gap:12px">'+
        '<div style="display:flex;align-items:center;gap:10px">'+
          '<span style="font-size:18px">✅</span>'+
          '<div>'+
            '<div style="font-weight:700;color:#66bb6a;font-size:12px">Todas las tareas completadas</div>'+
            '<div style="font-size:11px;color:var(--text2);margin-top:2px">El proyecto esta listo para iniciar el cierre.</div>'+
          '</div>'+
        '</div>'+
        '<button class="btn" style="background:var(--green);color:#fff;border-color:var(--green);font-size:12px;padding:6px 14px" onclick="iniciarCierreProyecto('+id+')">🏁 Iniciar cierre</button>'+
      '</div>':'')+
    // Alcance y prioridad
    ((p.alcance&&(p.alcance.objetivo||p.alcance.incluye||p.alcance.noIncluye))||p.prioridad?
      '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--r);padding:10px 14px;margin-bottom:12px">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'+
          '<div style="font-size:10px;color:var(--primary);font-weight:700;text-transform:uppercase;letter-spacing:.05em">Alcance</div>'+
          (p.prioridad?'<span style="background:'+(p.prioridad==='Alta'?'#3a0000':p.prioridad==='Baja'?'#0a2a0a':'#2a1a00')+';color:'+(p.prioridad==='Alta'?'#ef5350':p.prioridad==='Baja'?'#66bb6a':'#ffb74d')+';padding:2px 10px;border-radius:8px;font-size:10px;font-weight:700">'+p.prioridad+'</span>':'')+
        '</div>'+
        (p.alcance&&p.alcance.objetivo?'<div style="margin-bottom:6px"><div style="font-size:10px;color:var(--text2);margin-bottom:2px">Objetivo</div><div style="font-size:12px">'+p.alcance.objetivo+'</div></div>':'')+
        (p.alcance&&p.alcance.incluye?'<div style="margin-bottom:6px"><div style="font-size:10px;color:var(--green);margin-bottom:2px">Incluye</div><div style="font-size:12px">'+p.alcance.incluye+'</div></div>':'')+
        (p.alcance&&p.alcance.noIncluye?'<div><div style="font-size:10px;color:var(--red);margin-bottom:2px">NO incluye</div><div style="font-size:12px">'+p.alcance.noIncluye+'</div></div>':'')+
      '</div>':'')+''+
    // BARRA DE ACCIONES STICKY
    (!esFin?
      '<div style="position:sticky;top:0;z-index:10;background:#1e1e2e;border-bottom:2px solid var(--primary);padding:10px 16px;margin-bottom:16px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;border-radius:var(--r) var(--r) 0 0">'+
        (esPlanif?
          '<button class="btn btn-p" style="font-size:12px;padding:6px 14px" onclick="confirmarPlanificacion('+id+')">✅ Confirmar planificacion</button>'+
          '<button class="btn" style="font-size:12px;padding:6px 14px" onclick="agregarMaterialProyecto('+id+')">&#x2795; Material</button>'+
          '<button class="btn" style="font-size:12px;padding:6px 14px" onclick="agregarTareaProyecto('+id+')">&#x1F4CB; Tarea</button>'+
          '<button class="btn" style="font-size:12px;padding:6px 14px" onclick="editarPresupuestoProyecto('+id+')">&#x1F4B0; Presupuesto</button>'+
          '<button class="btn" style="font-size:12px;padding:6px 14px" onclick="editarAlcanceProyecto('+id+')">&#x1F4CB; Alcance</button>'+
          '<button class="btn" style="font-size:12px;padding:6px 14px" onclick="verRedTareas('+id+')">&#x1F578; Red</button>'+
          '<button class="btn" style="font-size:12px;padding:6px 14px;color:var(--red);border-color:var(--red)" onclick="cancelarProyecto('+id+')">&#x274C; Cancelar</button>':'')+
        (esEnCurso?
          '<button class="btn" style="font-size:12px;padding:6px 14px" onclick="agregarMaterialProyecto('+id+')">&#x2795; Material</button>'+
          '<button class="btn" style="font-size:12px;padding:6px 14px" onclick="agregarTareaProyecto('+id+')">&#x1F4CB; Tarea</button>'+
          '<button class="btn" style="font-size:12px;padding:6px 14px" onclick="iniciarCierreProyecto('+id+')">&#x1F3C1; Iniciar cierre</button>'+
          '<button class="btn" style="font-size:12px;padding:6px 14px" onclick="editarPresupuestoProyecto('+id+')">&#x1F4B0; Presupuesto</button>'+
          '<button class="btn" style="font-size:12px;padding:6px 14px" onclick="editarAlcanceProyecto('+id+')">&#x1F4CB; Alcance</button>'+
          '<button class="btn" style="font-size:12px;padding:6px 14px" onclick="verRedTareas('+id+')">&#x1F578; Red</button>'+
          '<button class="btn" style="font-size:12px;padding:6px 14px;color:var(--amber);border-color:var(--amber)" onclick="pausarProyecto('+id+')">&#x23F8; Pausar</button>'+
          '<button class="btn" style="font-size:12px;padding:6px 14px;color:var(--red);border-color:var(--red)" onclick="cancelarProyecto('+id+')">&#x274C; Cancelar</button>':'')+
        (p.estado==='Pausado'?
          '<button class="btn btn-p" style="font-size:12px;padding:6px 14px" onclick="cambiarEstadoProyecto('+id+",'En curso')"+'>&#x25B6; Reanudar</button>'+
          '<button class="btn" style="font-size:12px;padding:6px 14px" onclick="editarPresupuestoProyecto('+id+')">&#x1F4B0; Presupuesto</button>'+
          '<button class="btn" style="font-size:12px;padding:6px 14px" onclick="editarAlcanceProyecto('+id+')">&#x1F4CB; Alcance</button>'+
          '<button class="btn" style="font-size:12px;padding:6px 14px" onclick="verRedTareas('+id+')">&#x1F578; Red</button>'+
          '<button class="btn" style="font-size:12px;padding:6px 14px;color:var(--red);border-color:var(--red)" onclick="cancelarProyecto('+id+')">&#x274C; Cancelar</button>':'')+
      '</div>':'')+''+
    // Presupuesto y avance
    '<hr class="div">'+
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px">'+
      '<div style="background:var(--surface2);border-radius:var(--r);padding:10px 12px">'+
        '<div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Presupuesto</div>'+
        '<div style="font-size:16px;font-weight:700">$'+(Math.round(p.presupuesto||0).toLocaleString('es-AR'))+'</div>'+
        (!esFin?'<button class="btn btn-sm" style="margin-top:6px;font-size:10px" onclick="editarPresupuestoProyecto('+id+')">Editar</button>':'')+
      '</div>'+
      '<div style="background:var(--surface2);border-radius:var(--r);padding:10px 12px">'+
        '<div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Costo materiales</div>'+
        '<div style="font-size:16px;font-weight:700;color:'+(valor>(p.presupuesto||0)&&(p.presupuesto||0)>0?'var(--red)':'var(--text)')+'">$'+Math.round(valor).toLocaleString('es-AR')+'</div>'+
        ((p.presupuesto||0)>0?'<div style="font-size:10px;color:var(--text2);margin-top:2px">'+(valor>(p.presupuesto||0)?'⚠️ ':'')+Math.round(valor/(p.presupuesto||1)*100)+'% del presupuesto</div>':'')+
      '</div>'+
      (function(){
        var moTotal=(p.tareas||[]).reduce(function(a,t){return a+(parseFloat(t.costoMO)||0);},0);
        var totalGasto=valor+moTotal;
        return '<div style="background:var(--surface2);border-radius:var(--r);padding:10px 12px">'+
          '<div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">MO tareas</div>'+
          '<div style="font-size:16px;font-weight:700">$'+Math.round(moTotal).toLocaleString('es-AR')+'</div>'+
          '<div style="font-size:10px;color:var(--text2);margin-top:2px">Total: <strong>$'+Math.round(totalGasto).toLocaleString('es-AR')+'</strong></div>'+
        '</div>';
      })()+
    '</div>'+
    // Historial de cambios de presupuesto
    ((p.logPresupuesto||[]).length?
      '<div style="background:var(--surface2);border-radius:var(--r);padding:10px 14px;margin-bottom:12px">'+
        '<div style="font-size:10px;color:var(--text2);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Historial de presupuesto</div>'+
        '<table style="width:100%;border-collapse:collapse">'+
          (p.logPresupuesto||[]).slice().reverse().map(function(l){
            var subio=l.nuevo>l.anterior;
            return '<tr style="border-bottom:1px solid var(--border)">'+
              '<td style="padding:4px 8px;font-size:10px;color:var(--text2)">'+l.fecha+'</td>'+
              '<td style="padding:4px 8px;font-size:10px;text-decoration:line-through;color:var(--text2)">$'+Math.round(l.anterior).toLocaleString('es-AR')+'</td>'+
              '<td style="padding:4px 8px;font-size:10px;font-weight:700;color:'+(subio?'var(--amber)':'var(--green)')+'">$'+Math.round(l.nuevo).toLocaleString('es-AR')+' '+(subio?'▲':'▼')+'</td>'+
              '<td style="padding:4px 8px;font-size:10px;color:var(--text2)">'+l.causa+'</td>'+
            '</tr>';
          }).join('')+
        '</table>'+
      '</div>':'')+''+
    // KPIs Valor Ganado
    (function(){
      var presup=parseFloat(p.presupuesto)||0;
      if(!presup) return '';
      var pesoTotal=(p.tareas||[]).reduce(function(a,t){return a+(parseFloat(t.peso)||0);},0);
      if(!pesoTotal) return '';
      var avFisicoPct=(p.tareas||[]).reduce(function(a,t){
        return a+(parseFloat(t.peso)||0)*(parseFloat(t.avanceReal)||0)/100;
      },0)/100;
      var EV=avFisicoPct*presup;
      var matReal=(p.materiales||[]).reduce(function(a,m){
        var comp=compById(m.compId)||{};
        var ent=m.reservado?0:(parseFloat(m.entregado)||parseFloat(m.cant)||0);
        return a+ent*(parseFloat(comp.costo)||0);
      },0);
      var moReal=(p.tareas||[]).filter(function(t){return tareaEstadoCached(t)==='OK';}).reduce(function(a,t){return a+(parseFloat(t.costoMO)||0);},0);
      var AC=matReal+moReal;
      var avTiempoPct=null,PV=null;
      if(p.fechaInicio&&p.fechaEstFin){
        var ini=new Date(p.fechaInicio),fin=new Date(p.fechaEstFin),hoyD=new Date(today());
        avTiempoPct=Math.min(1,Math.max(0,(hoyD-ini)/(fin-ini)));
        PV=avTiempoPct*presup;
      }
      var CPI=AC>0?Math.round(EV/AC*100)/100:null;
      var SPI=PV!==null&&PV>0?Math.round(EV/PV*100)/100:null;
      var EAC=CPI&&CPI>0?AC+(presup-EV)/CPI:null;
      var VAC=EAC!==null?Math.round(presup-EAC):null;
      var cpiColor=CPI===null?'var(--text2)':CPI>=1?'var(--green)':CPI>=0.8?'var(--amber)':'var(--red)';
      var spiColor=SPI===null?'var(--text2)':SPI>=1?'var(--green)':SPI>=0.8?'var(--amber)':'var(--red)';
      var vacColor=VAC===null?'var(--text2)':VAC>=0?'var(--green)':'var(--red)';
      return '<div style="background:#0a0a1a;border:1px solid #1a1a3a;border-radius:var(--r);padding:10px 14px;margin-bottom:12px">'+
        '<div style="font-size:10px;color:#4fc3f7;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">KPIs — Método del Valor Ganado</div>'+
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:6px">'+
          '<div style="background:var(--surface2);border-radius:5px;padding:6px 8px;text-align:center">'+
            '<div style="font-size:9px;color:var(--text2);margin-bottom:2px">EV Valor ganado</div>'+
            '<div style="font-size:13px;font-weight:700;color:#4fc3f7">$'+Math.round(EV).toLocaleString('es-AR')+'</div>'+
            '<div style="font-size:9px;color:var(--text2)">'+Math.round(avFisicoPct*100)+'% físico</div>'+
          '</div>'+
          '<div style="background:var(--surface2);border-radius:5px;padding:6px 8px;text-align:center">'+
            '<div style="font-size:9px;color:var(--text2);margin-bottom:2px">AC Costo real</div>'+
            '<div style="font-size:13px;font-weight:700">$'+Math.round(AC).toLocaleString('es-AR')+'</div>'+
            '<div style="font-size:9px;color:var(--text2)">Mat + MO OK</div>'+
          '</div>'+
          (PV!==null?
            '<div style="background:var(--surface2);border-radius:5px;padding:6px 8px;text-align:center">'+
              '<div style="font-size:9px;color:var(--text2);margin-bottom:2px">PV Valor planif.</div>'+
              '<div style="font-size:13px;font-weight:700">$'+Math.round(PV).toLocaleString('es-AR')+'</div>'+
              '<div style="font-size:9px;color:var(--text2)">'+Math.round(avTiempoPct*100)+'% tiempo</div>'+
            '</div>':'')+
          '<div style="background:var(--surface2);border-radius:5px;padding:6px 8px;text-align:center">'+
            '<div style="font-size:9px;color:var(--text2);margin-bottom:2px">CPI</div>'+
            '<div style="font-size:20px;font-weight:900;color:'+cpiColor+'">'+(CPI===null?'--':CPI.toFixed(2))+'</div>'+
            '<div style="font-size:9px;color:'+cpiColor+'">'+(CPI===null?'Sin AC':CPI>=1?'OK':CPI>=0.8?'Alerta':'Crítico')+'</div>'+
          '</div>'+
          '<div style="background:var(--surface2);border-radius:5px;padding:6px 8px;text-align:center">'+
            '<div style="font-size:9px;color:var(--text2);margin-bottom:2px">SPI</div>'+
            '<div style="font-size:20px;font-weight:900;color:'+spiColor+'">'+(SPI===null?'--':SPI.toFixed(2))+'</div>'+
            '<div style="font-size:9px;color:'+spiColor+'">'+(SPI===null?'Sin fechas':SPI>=1?'OK':SPI>=0.8?'Alerta':'Crítico')+'</div>'+
          '</div>'+
          (EAC!==null?
            '<div style="background:var(--surface2);border-radius:5px;padding:6px 8px;text-align:center">'+
              '<div style="font-size:9px;color:var(--text2);margin-bottom:2px">EAC</div>'+
              '<div style="font-size:13px;font-weight:700;color:'+(EAC>presup?'var(--red)':'var(--green)')+'">$'+Math.round(EAC).toLocaleString('es-AR')+'</div>'+
              '<div style="font-size:9px;color:var(--text2)">Costo final est.</div>'+
            '</div>':'')+
          (VAC!==null?
            '<div style="background:var(--surface2);border-radius:5px;padding:6px 8px;text-align:center">'+
              '<div style="font-size:9px;color:var(--text2);margin-bottom:2px">VAC</div>'+
              '<div style="font-size:13px;font-weight:700;color:'+vacColor+'">'+(VAC>=0?'+':'')+Math.round(VAC).toLocaleString('es-AR')+'</div>'+
              '<div style="font-size:9px;color:'+vacColor+'">'+(VAC>=0?'Ahorro':'Desvío')+'</div>'+
            '</div>':'')+
        '</div>'+
        '<div style="font-size:9px;color:var(--text3);margin-top:6px">EV=avance físico×BAC · CPI=EV/AC · SPI=EV/PV · EAC=AC+(BAC−EV)/CPI · VAC=BAC−EAC</div>'+
      '</div>';
    })()+
    // % Avance
    '<div style="margin-bottom:12px">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'+
        '<div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.05em">Avance del proyecto</div>'+
        '<div style="display:flex;align-items:center;gap:8px">'+
          '<span style="font-size:18px;font-weight:700;color:var(--primary)">'+(p.pctAvance||0)+'%</span>'+
          (!esFin?'<input type="range" min="0" max="100" value="'+(p.pctAvance||0)+'" oninput="actualizarAvance('+id+',this.value)" style="width:120px;accent-color:var(--primary)">':'')+
        '</div>'+
      '</div>'+
      '<div style="background:var(--surface2);border-radius:4px;height:10px;overflow:hidden">'+
        '<div style="height:100%;background:'+(
          (p.pctAvance||0)>=100?'var(--green)':
          (p.pctAvance||0)>=60?'var(--blue)':
          'var(--primary)'
        )+';width:'+(p.pctAvance||0)+'%;transition:width .3s"></div>'+
      '</div>'+
    '</div>'+

    // OneDrive links
    '<hr class="div"><div class="sectitle" style="margin-bottom:8px">📁 OneDrive — Fotos y documentos</div>'+
    '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">'+
      // Link principal del proyecto
      (p.onedrive?
        '<div style="display:flex;align-items:center;gap:8px">'+
          '<span style="font-size:11px;color:var(--text2);flex-shrink:0">Carpeta principal:</span>'+
          '<a href="'+p.onedrive+'" target="_blank" style="color:var(--blue);font-size:12px;text-decoration:none;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+p.onedrive+'</a>'+
          '<button class="btn btn-sm" onclick="editarOneDriveProyecto('+id+')" title="Editar link">✏️</button>'+
        '</div>'
      :
        '<button class="btn btn-sm" onclick="editarOneDriveProyecto('+id+')">+ Agregar carpeta OneDrive</button>'
      )+
      // Links adicionales
      ((p.onedriveLinks||[]).length?
        '<div style="display:flex;flex-direction:column;gap:4px">'+
        (p.onedriveLinks||[]).map(function(l,li){
          return '<div style="display:flex;align-items:center;gap:8px">'+
            '<span style="background:var(--surface2);padding:1px 8px;border-radius:10px;font-size:10px;color:var(--text2);flex-shrink:0">'+l.etiqueta+'</span>'+
            '<a href="'+l.url+'" target="_blank" style="color:var(--blue);font-size:12px;text-decoration:none;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+l.url+'</a>'+
            '<button class="btn btn-sm" style="color:var(--red)" onclick="eliminarLinkProyecto('+id+','+li+')">X</button>'+
          '</div>';
        }).join('')+
        '</div>':'')+
      '<button class="btn btn-sm" onclick="agregarLinkProyecto('+id+')">+ Agregar otro link</button>'+
    '</div>'+

    // Acciones movidas a barra destacada post-header
    '';

  // Tareas
  if(esPlanif || esEnCurso || esFin){
    body+='<hr class="div"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'+
      '<div class="sectitle" style="margin:0">Lista de tareas</div>'+
      (!esFin?'<button class="btn btn-sm" onclick="agregarTareaProyecto('+id+')">+ Nueva tarea</button>':'')+
    '</div>';

    if(!(p.tareas||[]).length){
      body+='<div class="empty" style="margin-bottom:12px">Sin tareas registradas.</div>';
    } else {
      var hoy2=today();
      // Avance ponderado por peso de tarea
      var pesoTotal=(p.tareas||[]).reduce(function(a,t){return a+(parseFloat(t.peso)||0);},0);
      var avancePonderado=pesoTotal>0?(p.tareas||[]).reduce(function(a,t){
        return a+(parseFloat(t.peso)||0)*(parseFloat(t.avanceReal)||0)/100;
      },0):null;
      if(avancePonderado!==null){
        var pctMO=Math.round(avancePonderado);
        body+='<div style="background:var(--surface2);border-radius:var(--r);padding:8px 12px;margin-bottom:10px;display:flex;align-items:center;gap:12px">'+
          '<div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;white-space:nowrap">Avance MO ponderado</div>'+
          '<div style="flex:1;background:var(--surface3);border-radius:3px;height:8px;overflow:hidden">'+
            '<div style="height:100%;background:'+(pctMO>=100?'var(--green)':pctMO>=60?'var(--blue)':'var(--primary)')+';width:'+pctMO+'%;transition:width .3s"></div>'+
          '</div>'+
          '<div style="font-size:14px;font-weight:700;color:'+(pctMO>=100?'var(--green)':'var(--text)')+'">'+pctMO+'%</div>'+
          '<div style="font-size:10px;color:var(--text2)">('+Math.round(pesoTotal)+'% peso asignado)</div>'+
        '</div>';
      }
      body+='<table style="width:100%;border-collapse:collapse;margin-bottom:12px">'+
        '<thead><tr style="background:var(--surface2)">'+
          '<th style="padding:5px 10px;font-size:10px">Tarea</th>'+
          '<th style="padding:5px 10px;font-size:10px;text-align:center">Operario</th>'+
          '<th style="padding:5px 10px;font-size:10px;text-align:center">Vencimiento</th>'+
          '<th style="padding:5px 10px;font-size:10px;text-align:center">Peso</th>'+
          '<th style="padding:5px 10px;font-size:10px;text-align:center">Avance</th>'+
          '<th style="padding:5px 10px;font-size:10px;text-align:center">Estado</th>'+
          (!esFin?'<th style="padding:5px 10px;font-size:10px"></th>':'')+
        '</tr></thead><tbody>'+
        (p.tareas||[]).map(function(t,ti){
          var estado=tareaEstadoCached(t);
          var vencColor=estado==='Atrasado'?'var(--red)':estado==='OK'?'var(--green)':'var(--text2)';
          var avR=parseFloat(t.avanceReal)||0;
          var peso=parseFloat(t.peso)||0;
          return '<tr style="border-bottom:1px solid var(--border)'+(estado==='Atrasado'?';background:rgba(239,83,80,0.06)':'')+'">'+
            '<td style="padding:6px 10px;font-size:12px'+(estado==='OK'?';color:var(--text2);text-decoration:line-through':'')+'">'+
              t.desc+
              // Indicador de dependencias
              ((t.deps||[]).length?
                '<div style="margin-top:2px;display:flex;flex-wrap:wrap;gap:3px">'+
                (t.deps||[]).map(function(dep){
                  var pred=p.tareas[dep.tareaIdx];
                  if(!pred) return '';
                  var bloq=validarDependencias(p,ti,'completar')||validarDependencias(p,ti,'iniciar');
                  var estaDep=bloq?bloq.some(function(b){return b.pred===pred;}):false;
                  return '<span style="font-size:9px;background:'+(estaDep?'#3a0000':'#0a2a0a')+';color:'+(estaDep?'#ef5350':'#66bb6a')+';padding:1px 5px;border-radius:4px">'+dep.tipo+': '+pred.desc.slice(0,20)+'</span>';
                }).join('')+
                '</div>':'')+'</td>'+
            (function(){var opA=t.operario?(DB.operarios||[]).find(function(o){return o.id===t.operario;}):null;return '<td style="padding:6px 10px;text-align:center;font-size:10px;color:var(--text2)">'+(opA?'<span style="background:var(--surface3);padding:1px 6px;border-radius:8px">'+opA.nombre+'</span>':'--')+'</td>';})()+
            '<td style="padding:6px 10px;text-align:center;font-size:11px;color:'+vencColor+'">'+(t.fechaCumplimiento||'--')+'</td>'+
            '<td style="padding:6px 10px;text-align:center;font-size:11px;color:var(--text2)">'+(peso>0?peso+'%':'--')+'</td>'+
            '<td style="padding:6px 10px;min-width:80px">'+
              (peso>0?
                '<div style="display:flex;align-items:center;gap:4px">'+
                  '<div style="flex:1;background:var(--surface3);border-radius:3px;height:5px;overflow:hidden">'+
                    '<div style="height:100%;background:'+(avR>=100?'var(--green)':'var(--blue)')+';width:'+avR+'%"></div>'+
                  '</div>'+
                  '<span style="font-size:10px;color:var(--text2);white-space:nowrap">'+avR+'%</span>'+
                '</div>':
                '<span style="font-size:10px;color:var(--text3)">--</span>')+
            '</td>'+
            '<td style="padding:6px 10px;text-align:center">'+tareaPill(estado)+'</td>'+
            (!esFin?'<td style="padding:6px 10px;display:flex;gap:3px">'+
              '<button class="btn btn-sm" onclick="editarTareaProyecto('+id+','+ti+')" title="Editar">✏️</button>'+
              '<button class="btn btn-sm" onclick="marcarTareaOK('+id+','+ti+')" title="Marcar OK" style="color:var(--green)">✔</button>'+
              '<button class="btn btn-sm" onclick="marcarTareaPendConf('+id+','+ti+')" title="Pendiente confirmación" style="color:#ce93d8">⏳</button>'+
              '<button class="btn btn-sm" onclick="cancelarTarea('+id+','+ti+')" title="Cancelar" style="color:var(--text3)">✕</button>'+
              '<button class="btn btn-sm" onclick="eliminarTarea('+id+','+ti+')" title="Eliminar" style="color:var(--red)">🗑</button>'+
            '</td>':'')+
          '</tr>';
        }).join('')+
        '</tbody></table>';
    }
  }

  // Materiales
  body+='<div class="sectitle" style="margin-bottom:8px">Materiales del proyecto</div>';
  if(!(p.materiales||[]).length){
    body+='<div class="empty" style="margin-bottom:12px">Sin materiales. '+(esPlanif?'Agregá materiales antes de confirmar la planificacion.':'')+'</div>';
  } else {
    var tc=(DB.config&&DB.config.tipoCambio)||1;
    body+='<table style="width:100%;border-collapse:collapse;margin-bottom:12px">'+
      '<thead><tr style="background:var(--surface2)">'+
        '<th style="padding:5px 10px;font-size:10px">Codigo</th>'+
        '<th style="padding:5px 10px;font-size:10px">Componente</th>'+
        '<th style="padding:5px 10px;font-size:10px;text-align:center">Cant.</th>'+
        '<th style="padding:5px 10px;font-size:10px;text-align:center">Devuelto</th>'+
        '<th style="padding:5px 10px;font-size:10px">Tarea</th>'+
        '<th style="padding:5px 10px;font-size:10px;text-align:right">Valor $</th>'+
        (esFin?'':'<th style="padding:5px 10px;font-size:10px"></th>')+
      '</tr></thead><tbody>'+
      (p.materiales||[]).map(function(m,mi){
        var comp=(compById(m.compId)||{codigo:'?',desc:'?'});
        var val=(parseFloat(m.cant)||0)*(parseFloat(comp.costo)||0);
        var sobrante=(parseFloat(m.cant)||0)-(parseFloat(m.devuelto)||0);
        // Buscar tarea vinculada
        var tareaLabel='<span style="font-size:10px;color:var(--text3)">--</span>';
        if(m.tareaIdx!==undefined&&m.tareaIdx!==null&&p.tareas&&p.tareas[m.tareaIdx]){
          tareaLabel='<span style="font-size:10px;background:var(--surface3);padding:1px 6px;border-radius:8px">'+p.tareas[m.tareaIdx].desc.slice(0,28)+'</span>'+
            (!esFin?'<button class="btn btn-sm" style="color:var(--text3);margin-left:4px;padding:1px 5px" onclick="desvincularMaterialTarea('+id+','+mi+')" title="Desvincular">✕</button>':'');
        }
        return '<tr style="border-bottom:1px solid var(--border)">'+
          '<td style="padding:5px 10px;font-size:11px;font-family:monospace">'+comp.codigo+'</td>'+
          '<td style="padding:5px 10px;font-size:11px">'+comp.desc+'</td>'+
          '<td style="padding:5px 10px;text-align:center;font-weight:700">'+m.cant+' '+(comp.unidad||'')+'</td>'+
          '<td style="padding:5px 10px;text-align:center;color:var(--text2)">'+(m.devuelto||0)+(sobrante>0&&!esFin?'<span style="font-size:10px;color:var(--amber)"> ('+sobrante+' en proyecto)</span>':'')+'</td>'+
          '<td style="padding:5px 10px;font-size:11px">'+tareaLabel+'</td>'+
          '<td style="padding:5px 10px;text-align:right;font-size:11px">$'+Math.round(val).toLocaleString('es-AR')+'</td>'+
          (!esFin?'<td style="padding:5px 10px"><button class="btn btn-sm" style="color:var(--red)" onclick="quitarMaterialProyecto('+id+','+mi+')">X</button></td>':'')+
        '</tr>';
      }).join('')+
      '</tbody></table>'+
      '<div style="text-align:right;font-size:12px;color:var(--text2);margin-bottom:12px">Valor total: <strong style="color:var(--text)">$'+Math.round(valor).toLocaleString('es-AR')+'</strong></div>';
  }

  // Agregar material en planificacion
  if(esPlanif){
    body+='<button class="btn" style="margin-bottom:14px" onclick="agregarMaterialProyecto('+id+')">➕ Agregar material al plan</button>';
  }

  // Historial
  // Notas y comentarios
  var etapaColors={'Planificacion':'#1565C0','Ejecucion':'#2E7D32','Cierre':'#6A1B9A'};
  body+='<hr class="div"><div class="sectitle" style="margin-bottom:8px">Notas y comentarios</div>';
  if((p.notas||[]).length){
    body+='<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px">';
    (p.notas||[]).slice().reverse().forEach(function(n,ri){
      var realIdx=(p.notas||[]).length-1-ri;
      var color=etapaColors[n.etapa]||'#555';
      body+='<div style="background:var(--surface2);border-radius:var(--r);padding:8px 12px;border-left:3px solid '+color+'">'+
        '<div style="display:flex;gap:8px;align-items:center;margin-bottom:4px;justify-content:space-between">'+
          '<div style="display:flex;gap:8px;align-items:center">'+
            '<span style="font-family:monospace;font-size:10px;color:var(--text2)">'+n.fecha+' '+n.hora+'</span>'+
            '<span style="background:'+color+';color:#fff;padding:1px 8px;border-radius:10px;font-size:10px;font-weight:700">'+n.etapa+'</span>'+
          '</div>'+
          '<div style="display:flex;gap:4px">'+
            '<button class="btn btn-sm" onclick="editarNotaProyecto('+id+','+realIdx+')" title="Editar">✏️</button>'+
            '<button class="btn btn-sm" style="color:var(--red)" onclick="eliminarNotaProyecto('+id+','+realIdx+')" title="Eliminar">X</button>'+
          '</div>'+
        '</div>'+
        '<div style="font-size:12px;color:var(--text);white-space:pre-wrap;margin-bottom:'+(n.url?'6':'0')+'px">'+n.texto+'</div>'+
        (n.url?'<a href="'+n.url+'" target="_blank" style="font-size:11px;color:var(--blue);text-decoration:none;display:flex;align-items:center;gap:4px">📎 Ver fotos/docs en OneDrive</a>':'')+
      '</div>';
    });
    body+='</div>';
  } else {
    body+='<p style="font-size:12px;color:var(--text2);margin-bottom:10px">Sin notas registradas.</p>';
  }
  body+=
    '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px">'+
      '<div style="display:flex;gap:8px">'+
        '<select id="proj-nota-etapa" style="padding:6px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;background:var(--surface2);color:var(--text)">'+
          '<option value="Planificacion">Planificacion</option>'+
          '<option value="Ejecucion"'+(p.estado==='En curso'?' selected':'')+'>Ejecucion</option>'+
          '<option value="Cierre"'+(p.estado==='Finalizado'?' selected':'')+'>Cierre</option>'+
        '</select>'+
      '</div>'+
      '<textarea id="proj-nota-txt" rows="3" placeholder="Escribi una nota o comentario..." '+
        'style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;background:var(--surface2);color:var(--text);resize:vertical;font-family:inherit;width:100%"></textarea>'+
      '<input id="proj-nota-url" type="url" placeholder="Link OneDrive opcional (fotos de esta nota)" '+
        'style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;background:var(--surface2);color:var(--text);width:100%">'+
      '<button class="btn btn-p" style="align-self:flex-end" onclick="guardarNotaProyecto('+id+')">💬 Guardar nota</button>'+
    '</div>';

  // Historial
  if((p.historial||[]).length){
    body+='<hr class="div"><div class="sectitle" style="margin-bottom:8px">Historial</div>'+
      '<div style="display:flex;flex-direction:column;gap:4px">'+
      (p.historial||[]).slice().reverse().map(function(h){
        return '<div style="display:flex;gap:10px;font-size:11px;color:var(--text2)">'+
          '<span style="font-family:monospace;flex-shrink:0">'+h.fecha+'</span>'+
          '<span>'+h.accion+'</span>'+
        '</div>';
      }).join('')+'</div>';
  }

  // Breadcrumb + contenido en panel drill-down
  var breadcrumb='<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap">'+
    '<button class="btn btn-sm" onclick="cerrarFichaProyecto()" style="display:flex;align-items:center;gap:4px">'+
      '← Proyectos'+
    '</button>'+
    '<span style="color:var(--text3)">›</span>'+
    '<span style="font-size:12px;color:var(--text2)">'+p.numero+'</span>'+
    '<span style="color:var(--text3)">›</span>'+
    '<span style="font-size:12px;font-weight:700">'+p.nombre+'</span>'+
    proyEstadoPill(p.estado)+
  '</div>';

  var ficha=document.getElementById('proy-ficha');
  var lista=document.getElementById('proy-lista');
  if(ficha&&lista){
    lista.style.display='none';
    ficha.style.display='block';
    ficha.innerHTML=breadcrumb+'<div>'+body+'</div>';
    // Scroll al top del panel
    ficha.scrollTop=0;
    var panel=document.getElementById('panel-proyectos');
    if(panel) panel.scrollTop=0;
    window.scrollTo(0,0);
  }
}

function cerrarFichaProyecto(){
  var ficha=document.getElementById('proy-ficha');
  var lista=document.getElementById('proy-lista');
  if(ficha&&lista){
    ficha.style.display='none';
    ficha.innerHTML='';
    lista.style.display='block';
  }
}

function agregarTareaProyecto(id){
  var p=(DB.proyectos||[]).find(function(x){return x.id===id;});
  if(!p) return;
  var pesoUsado=(p.tareas||[]).reduce(function(a,t){return a+(parseFloat(t.peso)||0);},0);
  var pesoDisp=Math.max(0,100-pesoUsado);
  var operariosActivos=(DB.operarios||[]).filter(function(o){return o.activo!==false;});
  openModal('Nueva tarea',
    '<div class="fg2">'+
      '<div class="fg full"><label>Descripcion *</label><input id="nt-desc" placeholder="Descripcion de la tarea..."></div>'+
      '<div class="fg"><label>Fecha de cumplimiento</label><input id="nt-fecha" type="date"></div>'+
      '<div class="fg"><label>Operario asignado</label>'+
        '<select id="nt-operario" style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;background:var(--surface2);color:var(--text)">'+
          '<option value="">-- Sin asignar --</option>'+
          operariosActivos.map(function(o){return '<option value="'+o.id+'">'+o.nombre+(o.especialidad?' ('+o.especialidad+')':'')+'</option>';}).join('')+
        '</select></div>'+
      '<div class="fg"><label>Costo MO ($)</label><input id="nt-costo" type="number" min="0" value="0" placeholder="Monto de mano de obra"></div>'+
      '<div class="fg"><label>Peso en proyecto (%)<span style="font-size:10px;color:var(--text2);margin-left:6px">Disponible: '+pesoDisp+'%</span></label><input id="nt-peso" type="number" min="0" max="100" value="'+pesoDisp+'" placeholder="0"></div>'+
      '<div class="fg"><label>Avance real (%)</label><input id="nt-avance" type="number" min="0" max="100" value="0" placeholder="0"></div>'+
    '</div>',
    function(){
      var desc=document.getElementById('nt-desc').value.trim();
      if(!desc){alert('La descripcion es obligatoria.');return false;}
      if(!p.tareas) p.tareas=[];
      var nuevoPeso=parseFloat(document.getElementById('nt-peso')?document.getElementById('nt-peso').value:0)||0;
      var pesoUsadoActual=(p.tareas||[]).reduce(function(a,t){return a+(parseFloat(t.peso)||0);},0);
      if(pesoUsadoActual+nuevoPeso>100){
        alert('El peso total de las tareas supera el 100%.\nPeso ya asignado: '+Math.round(pesoUsadoActual)+'%\nDisponible: '+Math.round(100-pesoUsadoActual)+'%');
        return false;
      }
      p.tareas.push({
        desc:desc,
        fechaCumplimiento:document.getElementById('nt-fecha').value,
        operario:parseInt(document.getElementById('nt-operario')?document.getElementById('nt-operario').value:0)||null,
        costoMO:parseFloat(document.getElementById('nt-costo')?document.getElementById('nt-costo').value:0)||0,
        peso:nuevoPeso,
        avanceReal:parseFloat(document.getElementById('nt-avance')?document.getElementById('nt-avance').value:0)||0,
        estadoManual:null,
        fechaCreacion:today()
      });
      save();cerrarModal();setTimeout(function(){abrirProyecto(id);},100);return true;
    });
}

function editarTareaProyecto(projId, idx){
  var p=(DB.proyectos||[]).find(function(x){return x.id===projId;});
  if(!p||!p.tareas[idx]) return;
  var t=p.tareas[idx];
  var estadoActual=tareaEstadoCached(t);
  var pesoUsado=(p.tareas||[]).reduce(function(a,tt,i){return i===idx?a:a+(parseFloat(tt.peso)||0);},0);
  var pesoDisp=Math.max(0,100-pesoUsado);
  var operariosActivosE=(DB.operarios||[]).filter(function(o){return o.activo!==false;});
  openModal('Editar tarea',
    '<div class="fg2">'+
      '<div class="fg full"><label>Descripcion *</label><input id="et-desc" value="'+t.desc.replace(/"/g,"'")+'" placeholder="Descripcion de la tarea..."></div>'+
      '<div class="fg"><label>Fecha de cumplimiento</label><input id="et-fecha" type="date" value="'+(t.fechaCumplimiento||'')+'"></div>'+
      '<div class="fg"><label>Operario asignado</label>'+
        '<select id="et-operario" style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;background:var(--surface2);color:var(--text)">'+
          '<option value="">-- Sin asignar --</option>'+
          operariosActivosE.map(function(o){return '<option value="'+o.id+'"'+(t.operario===o.id?' selected':'')+'>'+o.nombre+(o.especialidad?' ('+o.especialidad+')':'')+'</option>';}).join('')+
        '</select></div>'+
      '<div class="fg"><label>Costo MO ($)</label><input id="et-costo" type="number" min="0" value="'+(t.costoMO||0)+'"></div>'+
      '<div class="fg"><label>Peso en proyecto (%)<span style="font-size:10px;color:var(--text2);margin-left:6px">Max disp: '+pesoDisp+'%</span></label><input id="et-peso" type="number" min="0" max="100" value="'+(t.peso||0)+'"></div>'+
      '<div class="fg"><label>Avance real (%)</label><input id="et-avance" type="number" min="0" max="100" value="'+(t.avanceReal||0)+'"></div>'+
      '<div class="fg"><label>Estado (manual)</label>'+
        '<select id="et-estado" style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;background:var(--surface2);color:var(--text)">'+
          '<option value="">Automatico ('+(estadoActual)+')</option>'+
          '<option value="OK"'+(t.estadoManual==='OK'?' selected':'')+'>OK</option>'+
          '<option value="Pendiente confirmacion"'+(t.estadoManual==='Pendiente confirmacion'?' selected':'')+'>Pendiente confirmación</option>'+
          '<option value="Cancelado"'+(t.estadoManual==='Cancelado'?' selected':'')+'>Cancelado</option>'+
        '</select></div>'+
      // Dependencias
      ((p.tareas||[]).length>1?
        '<div class="fg full" style="grid-column:1/-1">'+
          '<label>Dependencias <span style="font-size:10px;color:var(--text2)">(esta tarea depende de...)</span></label>'+
          '<div id="et-deps" style="display:flex;flex-direction:column;gap:6px;margin-top:4px">'+
            (p.tareas||[]).map(function(ot,oi){
              if(oi===idx) return '';
              var depExist=(t.deps||[]).find(function(d){return d.tareaIdx===oi;});
              return '<div style="display:flex;align-items:center;gap:8px;background:var(--surface2);border-radius:5px;padding:6px 8px">'+
                '<input type="checkbox" id="dep-'+oi+'" '+(depExist?'checked':'')+' style="flex-shrink:0">'+
                '<label for="dep-'+oi+'" style="flex:1;font-size:11px;cursor:pointer">'+ot.desc.slice(0,40)+'</label>'+
                '<select id="dep-tipo-'+oi+'" style="padding:3px 6px;border:1px solid var(--border);border-radius:4px;font-size:11px;background:var(--surface2);color:var(--text)">'+
                  '<option value="FI"'+(depExist&&depExist.tipo==='FI'?' selected':'')+' title="B no inicia hasta que A termine">FI — Fin→Inicio</option>'+
                  '<option value="II"'+(depExist&&depExist.tipo==='II'?' selected':'')+' title="B no inicia hasta que A inicie">II — Inicio→Inicio</option>'+
                  '<option value="FF"'+(depExist&&depExist.tipo==='FF'?' selected':'')+' title="B no termina hasta que A termine">FF — Fin→Fin</option>'+
                  '<option value="IF"'+(depExist&&depExist.tipo==='IF'?' selected':'')+' title="B no termina hasta que A inicie">IF — Inicio→Fin</option>'+
                '</select>'+
              '</div>';
            }).join('')+
          '</div>'+
        '</div>':''+
      '')+
    '</div>',
    function(){
      var desc=document.getElementById('et-desc').value.trim();
      if(!desc){alert('La descripcion es obligatoria.');return false;}
      t.desc=desc;
      t.fechaCumplimiento=document.getElementById('et-fecha').value;
      var operarioAnterior=t.operario;
      t.operario=parseInt(document.getElementById('et-operario')?document.getElementById('et-operario').value:0)||null;
      // Trazabilidad cambio de operario
      if(operarioAnterior!==t.operario){
        var opAntes=operarioAnterior?(DB.operarios||[]).find(function(o){return o.id===operarioAnterior;}):null;
        var opDespues=t.operario?(DB.operarios||[]).find(function(o){return o.id===t.operario;}):null;
        p.historial.push({fecha:today(),accion:'Tarea "'+t.desc+'" reasignada de '+(opAntes?opAntes.nombre:'Sin asignar')+' a '+(opDespues?opDespues.nombre:'Sin asignar')});
      }
      t.costoMO=parseFloat(document.getElementById('et-costo')?document.getElementById('et-costo').value:0)||0;
      var nuevoPesoE=parseFloat(document.getElementById('et-peso')?document.getElementById('et-peso').value:0)||0;
      var pesoUsadoE=(p.tareas||[]).reduce(function(a,tt,i){return i===idx?a:a+(parseFloat(tt.peso)||0);},0);
      if(pesoUsadoE+nuevoPesoE>100){
        alert('El peso total de las tareas supera el 100%.\nPeso de otras tareas: '+Math.round(pesoUsadoE)+'%\nDisponible: '+Math.round(100-pesoUsadoE)+'%');
        return false;
      }
      t.peso=nuevoPesoE;
      t.avanceReal=Math.min(100,Math.max(0,parseFloat(document.getElementById('et-avance')?document.getElementById('et-avance').value:0)||0));
      var est=document.getElementById('et-estado').value;
      t.estadoManual=est||null;
      // Guardar dependencias
      var newDeps=[];
      (p.tareas||[]).forEach(function(ot,oi){
        if(oi===idx) return;
        var cb=document.getElementById('dep-'+oi);
        if(cb&&cb.checked){
          var sel=document.getElementById('dep-tipo-'+oi);
          newDeps.push({tareaIdx:oi,tipo:sel?sel.value:'FI'});
        }
      });
      t.deps=newDeps;
      save();cerrarModal();setTimeout(function(){abrirProyecto(projId);},100);return true;
    });
}

// Verifica si una tarea puede avanzar según sus dependencias
// accion: 'iniciar' (II, IF) o 'completar' (FI, FF)
function validarDependencias(p, idx, accion){
  var t=(p.tareas||[])[idx];
  if(!t||!(t.deps||[]).length) return null; // sin dependencias, OK
  var bloqueantes=[];
  (t.deps||[]).forEach(function(dep){
    var pred=p.tareas[dep.tareaIdx];
    if(!pred) return;
    var estadoPred=tareaEstadoCached(pred);
    var predIniciada=pred.avanceReal>0||estadoPred==='OK'||estadoPred==='Pendiente confirmacion';
    var predCompletada=estadoPred==='OK';
    var bloquea=false;
    if(accion==='iniciar'){
      if(dep.tipo==='FI'&&!predCompletada) bloquea=true;  // B no inicia hasta que A termine
      if(dep.tipo==='II'&&!predIniciada)   bloquea=true;  // B no inicia hasta que A inicie
    } else { // completar
      if(dep.tipo==='FF'&&!predCompletada) bloquea=true;  // B no termina hasta que A termine
      if(dep.tipo==='IF'&&!predIniciada)   bloquea=true;  // B no termina hasta que A inicie
    }
    if(bloquea) bloqueantes.push({pred:pred,tipo:dep.tipo});
  });
  return bloqueantes.length?bloqueantes:null;
}

function marcarTareaOK(projId, idx){
  var p=(DB.proyectos||[]).find(function(x){return x.id===projId;});
  if(!p||!p.tareas[idx]) return;
  var bloq=validarDependencias(p,idx,'completar');
  if(bloq){
    alert('No se puede completar esta tarea. Dependencias pendientes:\n'+bloq.map(function(b){return '• '+b.tipo+': "'+b.pred.desc+'"';}).join('\n'));
    return;
  }
  p.tareas[idx].estadoManual='OK';
  p.tareas[idx].avanceReal=100;
  save();cerrarModal();setTimeout(function(){abrirProyecto(projId);},100);
}

function marcarTareaPendConf(projId, idx){
  var p=(DB.proyectos||[]).find(function(x){return x.id===projId;});
  if(!p||!p.tareas[idx]) return;
  var bloq=validarDependencias(p,idx,'completar');
  if(bloq){
    alert('No se puede marcar como pendiente de confirmación. Dependencias pendientes:\n'+bloq.map(function(b){return '• '+b.tipo+': "'+b.pred.desc+'"';}).join('\n'));
    return;
  }
  p.tareas[idx].estadoManual='Pendiente confirmacion';
  p.historial.push({fecha:today(),accion:'Tarea "'+p.tareas[idx].desc+'" marcada como Pendiente confirmacion'});
  save();cerrarModal();setTimeout(function(){abrirProyecto(projId);},100);
}

function cancelarTarea(projId, idx){
  var p=(DB.proyectos||[]).find(function(x){return x.id===projId;});
  if(!p||!p.tareas[idx]) return;
  p.tareas[idx].estadoManual='Cancelado';
  save();cerrarModal();setTimeout(function(){abrirProyecto(projId);},100);
}

function eliminarTarea(projId, idx){
  var p=(DB.proyectos||[]).find(function(x){return x.id===projId;});
  if(!p||!p.tareas[idx]) return;
  if(!confirm('Eliminar esta tarea?')) return;
  p.tareas.splice(idx,1);
  save();cerrarModal();setTimeout(function(){abrirProyecto(projId);},100);
}

function actualizarAvance(id, val){
  var p=(DB.proyectos||[]).find(function(x){return x.id===id;});
  if(!p) return;
  p.pctAvance=parseInt(val)||0;
  save();
  // Actualizar solo el display sin reabrir el modal
  var spans=document.querySelectorAll('#mbox span');
  spans.forEach(function(s){if(s.textContent.match(/^\d+%$/)) s.textContent=p.pctAvance+'%';});
  var bar=document.querySelector('#mbox .proj-avance-bar');
  if(bar) bar.style.width=p.pctAvance+'%';
}

function editarPresupuestoProyecto(id){
  var p=(DB.proyectos||[]).find(function(x){return x.id===id;});
  if(!p) return;
  var logPresup=p.logPresupuesto||[];

  openModal('Presupuesto del proyecto — '+p.numero,
    '<div class="fg2">'+
      '<div class="fg full"><label>Presupuesto total ($)</label>'+
        '<input id="ep-pres" type="number" min="0" value="'+(p.presupuesto||0)+'" style="width:100%"></div>'+
      '<div class="fg full"><label>Causa del cambio *</label>'+
        '<input id="ep-causa" placeholder="Ej: Ampliación de alcance, ajuste por inflación..." style="width:100%"></div>'+
      (logPresup.length?
        '<div class="fg full" style="grid-column:1/-1">'+
          '<div style="font-size:10px;color:var(--text2);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Historial de cambios</div>'+
          '<table style="width:100%;border-collapse:collapse">'+
            '<thead><tr style="background:var(--surface2)">'+
              '<th style="padding:4px 8px;font-size:10px">Fecha</th>'+
              '<th style="padding:4px 8px;font-size:10px;text-align:right">Anterior</th>'+
              '<th style="padding:4px 8px;font-size:10px;text-align:right">Nuevo</th>'+
              '<th style="padding:4px 8px;font-size:10px">Causa</th>'+
            '</tr></thead><tbody>'+
            logPresup.slice().reverse().map(function(l){
              var subio=l.nuevo>l.anterior;
              return '<tr style="border-bottom:1px solid var(--border)">'+
                '<td style="padding:4px 8px;font-size:10px;color:var(--text2)">'+l.fecha+'</td>'+
                '<td style="padding:4px 8px;font-size:10px;text-align:right;text-decoration:line-through;color:var(--text2)">$'+Math.round(l.anterior).toLocaleString('es-AR')+'</td>'+
                '<td style="padding:4px 8px;font-size:10px;text-align:right;font-weight:700;color:'+(subio?'var(--amber)':'var(--green)')+'">$'+Math.round(l.nuevo).toLocaleString('es-AR')+' '+(subio?'▲':'▼')+'</td>'+
                '<td style="padding:4px 8px;font-size:10px">'+l.causa+'</td>'+
              '</tr>';
            }).join('')+
          '</tbody></table>'+
        '</div>':'')+''+
    '</div>',
    function(){
      var nuevo=parseFloat(document.getElementById('ep-pres').value)||0;
      var causa=(document.getElementById('ep-causa').value||'').trim();
      if(!causa){alert('La causa del cambio es obligatoria.');return false;}
      var anterior=parseFloat(p.presupuesto)||0;
      if(!p.logPresupuesto) p.logPresupuesto=[];
      if(nuevo!==anterior){
        p.logPresupuesto.push({fecha:today(),anterior:anterior,nuevo:nuevo,causa:causa});
        p.historial.push({fecha:today(),accion:'Presupuesto: $'+Math.round(anterior).toLocaleString('es-AR')+' → $'+Math.round(nuevo).toLocaleString('es-AR')+' ('+causa+')'});
      }
      p.presupuesto=nuevo;
      save();cerrarModal();setTimeout(function(){abrirProyecto(id);},100);return true;
    });
}

function editarAlcanceProyecto(id){
  var p=(DB.proyectos||[]).find(function(x){return x.id===id;});
  if(!p) return;
  var a=p.alcance||{};
  openModal('Alcance y prioridad -- '+p.numero,
    '<div class="fg2">'+
      '<div class="fg"><label>Prioridad</label>'+
        '<select id="ea-prior" style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;background:var(--surface2);color:var(--text)">'+
          ['Baja','Media','Alta'].map(function(v){return '<option value="'+v+'"'+(p.prioridad===v?' selected':'')+'>'+v+'</option>';}).join('')+
        '</select></div>'+
      '<div class="fg full" style="background:var(--surface2);border-radius:var(--r);padding:10px 12px;border:1px solid var(--border)">'+
        '<div style="font-size:10px;color:var(--primary);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Alcance</div>'+
        '<div class="fg full"><label>Objetivo</label><textarea id="ea-obj" rows="2" placeholder="Que se quiere lograr...">'+( a.objetivo||'')+'</textarea></div>'+
        '<div class="fg full"><label>Que incluye</label><textarea id="ea-inc" rows="2" placeholder="Trabajos y responsabilidades incluidas...">'+( a.incluye||'')+'</textarea></div>'+
        '<div class="fg full"><label>Que NO incluye</label><textarea id="ea-noinc" rows="2" placeholder="Exclusiones explicitas...">'+( a.noIncluye||'')+'</textarea></div>'+
      '</div>'+
    '</div>',
    function(){
      p.prioridad=document.getElementById('ea-prior').value;
      p.alcance={
        objetivo:document.getElementById('ea-obj').value.trim(),
        incluye:document.getElementById('ea-inc').value.trim(),
        noIncluye:document.getElementById('ea-noinc').value.trim()
      };
      p.historial.push({fecha:today(),accion:'Alcance y prioridad actualizados'});
      save();cerrarModal();setTimeout(function(){abrirProyecto(id);},100);return true;
    });
}

function editarOneDriveProyecto(id){
  var p=(DB.proyectos||[]).find(function(x){return x.id===id;});
  if(!p) return;
  openModal('Carpeta principal OneDrive',
    '<div class="fg"><label>URL de la carpeta en OneDrive</label>'+
      '<input id="od-url" type="url" value="'+(p.onedrive||'')+'" placeholder="https://onedrive.live.com/..." style="width:100%"></div>',
    function(){
      var url=document.getElementById('od-url').value.trim();
      p.onedrive=url;
      save();cerrarModal();setTimeout(function(){abrirProyecto(id);},100);return true;
    });
}

function agregarLinkProyecto(id){
  var p=(DB.proyectos||[]).find(function(x){return x.id===id;});
  if(!p) return;
  openModal('Agregar link adicional',
    '<div class="fg2">'+
      '<div class="fg"><label>Etiqueta</label><input id="al-etiqueta" placeholder="Ej: Fotos instalacion, Planos, Factura..."></div>'+
      '<div class="fg full"><label>URL OneDrive</label><input id="al-url" type="url" placeholder="https://onedrive.live.com/..." style="width:100%"></div>'+
    '</div>',
    function(){
      var url=document.getElementById('al-url').value.trim();
      var etiqueta=document.getElementById('al-etiqueta').value.trim()||'Link';
      if(!url){alert('Ingresa una URL.');return false;}
      if(!p.onedriveLinks) p.onedriveLinks=[];
      p.onedriveLinks.push({etiqueta:etiqueta,url:url,fecha:today()});
      save();cerrarModal();setTimeout(function(){abrirProyecto(id);},100);return true;
    });
}

function eliminarLinkProyecto(projId, idx){
  var p=(DB.proyectos||[]).find(function(x){return x.id===projId;});
  if(!p||!p.onedriveLinks[idx]) return;
  if(!confirm('Eliminar este link?')) return;
  p.onedriveLinks.splice(idx,1);
  save();cerrarModal();setTimeout(function(){abrirProyecto(projId);},100);
}

function editarNotaProyecto(projId, idx){
  var p=(DB.proyectos||[]).find(function(x){return x.id===projId;});
  if(!p||!p.notas[idx]) return;
  var n=p.notas[idx];
  var etapaColors={'Planificacion':'#1565C0','Ejecucion':'#2E7D32','Cierre':'#6A1B9A'};
  openModal('Editar nota',
    '<div style="display:flex;flex-direction:column;gap:8px">'+
      '<div style="font-size:11px;color:var(--text2);font-family:monospace">'+n.fecha+' '+n.hora+'</div>'+
      '<select id="en-etapa" style="padding:6px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;background:var(--surface2);color:var(--text)">'+
        '<option value="Planificacion"'+(n.etapa==='Planificacion'?' selected':'')+'>Planificacion</option>'+
        '<option value="Ejecucion"'+(n.etapa==='Ejecucion'?' selected':'')+'>Ejecucion</option>'+
        '<option value="Cierre"'+(n.etapa==='Cierre'?' selected':'')+'>Cierre</option>'+
      '</select>'+
      '<textarea id="en-texto" rows="5" style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;background:var(--surface2);color:var(--text);resize:vertical;font-family:inherit;width:100%">'+n.texto+'</textarea>'+
    '</div>',
    function(){
      var txt=document.getElementById('en-texto').value.trim();
      if(!txt){alert('El texto no puede estar vacio.');return false;}
      p.notas[idx].texto=txt;
      p.notas[idx].etapa=document.getElementById('en-etapa').value;
      p.notas[idx].editado=today();
      save();
      setTimeout(function(){abrirProyecto(projId);},100);
      return true;
    });
}

function eliminarNotaProyecto(projId, idx){
  var p=(DB.proyectos||[]).find(function(x){return x.id===projId;});
  if(!p||!p.notas[idx]) return;
  if(!confirm('Eliminar esta nota?')) return;
  p.notas.splice(idx,1);
  save();
  cerrarModal();
  setTimeout(function(){abrirProyecto(projId);},100);
}

function guardarNotaProyecto(id){
  var p=(DB.proyectos||[]).find(function(x){return x.id===id;});
  if(!p) return;
  var txt=document.getElementById('proj-nota-txt');
  var etapaEl=document.getElementById('proj-nota-etapa');
  if(!txt||!txt.value.trim()){alert('Escribi algo antes de guardar.');return;}
  if(!p.notas) p.notas=[];
  var d=new Date();
  var hh=String(d.getHours()).padStart(2,'0');
  var mm=String(d.getMinutes()).padStart(2,'0');
  var urlEl=document.getElementById('proj-nota-url');
  p.notas.push({
    fecha:today(),
    hora:hh+':'+mm,
    etapa:etapaEl?etapaEl.value:'Ejecucion',
    texto:txt.value.trim(),
    url:urlEl?urlEl.value.trim():''
  });
  save();
  cerrarModal();
  setTimeout(function(){abrirProyecto(id);},100);
}

function agregarMaterialProyecto(projId){
  var p=(DB.proyectos||[]).find(function(x){return x.id===projId;});
  if(!p) return;
  var compsSorted=[...DB.componentes].sort(function(a,b){return (a.desc||'').localeCompare(b.desc||'','es');});
  var datalistOpts=compsSorted.map(function(c){
    var stock=stockActual(c.id);
    return '<option value="'+c.id+'" label="['+stock+'] '+c.codigo+' -- '+c.desc+'">'+c.codigo+' -- '+c.desc+'</option>';
  }).join('');
  // Opciones para el select oculto (búsqueda real)
  var selectOpts=compsSorted.map(function(c){
    var stock=stockActual(c.id);
    return '<option value="'+c.id+'">['+stock+'] '+c.codigo+' -- '+c.desc+'</option>';
  }).join('');

  var tareasDisp=(p.tareas||[]).filter(function(t){return tareaEstadoCached(t)!=='OK'&&tareaEstadoCached(t)!=='Cancelado';});

  openModal('Agregar material -- '+p.numero,
    '<div class="fg2">'+
      '<div class="fg full"><label>Componente * <span style="font-size:10px;color:var(--text2)">(escribi para buscar)</span></label>'+
        '<input id="am-comp-txt" list="am-comp-dl" placeholder="Escribi codigo o descripcion..." autocomplete="off" '+
          'style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;width:100%;background:var(--surface2);color:var(--text)">'+
        '<datalist id="am-comp-dl">'+
          compsSorted.map(function(c){
            var stock=stockActual(c.id);
            return '<option value="'+c.codigo+' -- '+c.desc+'" data-id="'+c.id+'">[Stock: '+stock+'] '+c.codigo+'</option>';
          }).join('')+
        '</datalist>'+
        '<input type="hidden" id="am-comp">'+
        // Script para resolver el ID al seleccionar
        '<script>(function(){'+
          'var compMap={};'+
          compsSorted.map(function(c){return 'compMap["'+c.codigo+' -- '+c.desc+'"]="'+c.id+'";';}).join('')+
          'document.getElementById("am-comp-txt").addEventListener("input",function(){'+
            'var v=this.value.trim();'+
            'var id=compMap[v]||"";'+
            'document.getElementById("am-comp").value=id;'+
            'var comp='+JSON.stringify(compsSorted.map(function(c){return {id:c.id,stock:stockActual(c.id),costo:parseFloat(c.costo)||0,unidad:c.unidad||''};})).replace(/<\/script>/gi,'<\\/script>')+';'+
            'var found=comp.find(function(c){return String(c.id)===String(id);});'+
            'var info=document.getElementById("am-comp-info");'+
            'if(found&&info){info.textContent="Stock disponible: "+found.stock+" "+found.unidad+" | Costo: $"+Math.round(found.costo).toLocaleString("es-AR");}'+
            'else if(info){info.textContent="";}'+
          '});'+
        '})();<\/script>'+
        '<div id="am-comp-info" style="font-size:11px;color:#4fc3f7;margin-top:4px;min-height:16px"></div>'+
      '</div>'+
      '<div class="fg"><label>Cantidad *</label><input id="am-cant" type="number" min="0.01" step="0.01" value="1"></div>'+
      (p.estado==='En curso'&&tareasDisp.length?
        '<div class="fg full"><label>Vincular a tarea <span style="font-size:10px;color:var(--text2)">(opcional)</span></label>'+
          '<select id="am-tarea" style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;width:100%;background:var(--surface2);color:var(--text)">'+
            '<option value="">-- Sin vincular --</option>'+
            tareasDisp.map(function(t,i){return '<option value="'+i+'">'+t.desc.slice(0,60)+'</option>';}).join('')+
          '</select>'+
        '</div>':'')+
    '</div>',
    function(){
      var compId=parseInt(document.getElementById('am-comp').value)||0;
      // Fallback: intentar resolver por texto si el hidden está vacío
      if(!compId){
        var txt=(document.getElementById('am-comp-txt')?document.getElementById('am-comp-txt').value||'':'').trim();
        var found=compsSorted.find(function(c){return (c.codigo+' -- '+c.desc)===txt;});
        if(found) compId=found.id;
      }
      var cant=parseFloat(document.getElementById('am-cant').value)||0;
      if(!compId||!cant){alert('Selecciona un componente e ingresa la cantidad.');return false;}
      var comp=DB.componentes.find(function(c){return c.id===compId;})||{};
      // Agregar a materiales del proyecto
      var existing=p.materiales.find(function(m){return m.compId===compId;});
      if(p.estado==='Planificado'){
        // RESERVA: descontar stock fisico inmediatamente, guardar flag reservado
        var stockDisp=stockActual(compId);
        var cantAReservar=Math.min(cant,stockDisp);
        var cantFaltante=cant-cantAReservar;
        if(existing){
          existing.cant=parseFloat(existing.cant)+cant;
          existing.reservado=(existing.reservado||true);
          existing.cantPendienteOC=(parseFloat(existing.cantPendienteOC)||0)+cantFaltante;
        } else {
          p.materiales.push({compId:compId,cant:cant,devuelto:0,reservado:true,cantPendienteOC:cantFaltante});
        }
        if(cantAReservar>0){
          DB.movimientos.push({
            id:DB.nid++,cid:compId,tipo:'Reserva',cant:cantAReservar,
            fecha:today(),nota:'Reserva proyecto '+p.numero,origen:'Reserva',estadoMat:'N',proyId:p.id
          });
        }
        var accion='Material reservado en deposito transitorio: '+comp.desc+' x'+cant;
        if(cantFaltante>0) accion+=' (faltante: '+cantFaltante+' -- se generara OC)';
        p.historial.push({fecha:today(),accion:accion});
      } else if(p.estado==='En curso'){
        // En curso: entregar lo que hay, OC por el total si hay faltante
        var stockDisp2=stockActual(compId);
        var cantAEntregar=Math.min(cant,stockDisp2);
        var cantFaltante2=cant-cantAEntregar;
        if(existing){
          existing.cant=parseFloat(existing.cant)+cant;
          existing.cantPendienteOC=(parseFloat(existing.cantPendienteOC)||0)+cantFaltante2;
          existing.entregado=(parseFloat(existing.entregado)||0)+cantAEntregar;
        } else {
          p.materiales.push({compId:compId,cant:cant,devuelto:0,reservado:false,cantPendienteOC:cantFaltante2,entregado:cantAEntregar});
        }
        if(cantAEntregar>0){
          DB.movimientos.push({
            id:DB.nid++,cid:compId,tipo:'Salida instalacion',cant:cantAEntregar,
            fecha:today(),nota:'Proyecto '+p.numero,origen:'Proyecto',estadoMat:'N',proyId:p.id
          });
        }
        if(cantFaltante2>0){
          // Generar OC por proveedor por el total solicitado
          var prov2=comp.proveedor||'Sin proveedor';
          var ocExistente=DB.ordenes.find(function(o){
            return o.ocReserva&&o.proyId===p.id&&o.proveedor===prov2&&o.estado!=='Cancelada'&&o.estado!=='Recibida';
          });
          if(ocExistente){
            // Agregar el item a la OC existente del mismo proveedor
            var itemExistente=ocExistente.items.find(function(i){return i.cid===compId;});
            if(itemExistente) itemExistente.cant=parseFloat(itemExistente.cant)+cant;
            else ocExistente.items.push({cid:compId,cant:cant});
            p.historial.push({fecha:today(),accion:'Item agregado a OC existente '+ocExistente.numero+': '+comp.desc+' x'+cant});
          } else {
            var nuevaOC={
              id:DB.nid++,numero:getNumOC(),fecha:today(),
              estado:'Pendiente de compra',
              items:[{cid:compId,cant:cant}],
              proveedor:prov2,
              obs:'Generada por material adicional -- Proyecto '+p.numero,
              ocReserva:true,proyId:p.id
            };
            DB.ordenes.unshift(nuevaOC);
            p.historial.push({fecha:today(),accion:'OC generada por faltante: '+nuevaOC.numero+' -- '+comp.desc+' x'+cant+' (entregado: '+cantAEntregar+', pendiente: '+cantFaltante2+')'});
          }
        }
        var tareaSelIdx=document.getElementById('am-tarea')?document.getElementById('am-tarea').value:'';
        var tareaSelLabel='';
        if(tareaSelIdx!==''){
          var tSel=tareasDisp[parseInt(tareaSelIdx)];
          if(tSel){
            tareaSelLabel=tSel.desc;
            // Guardar referencia al índice real de la tarea en p.tareas
            var idxReal=(p.tareas||[]).indexOf(tSel);
            if(existing) existing.tareaIdx=idxReal;
            else{
              var lastMat=p.materiales[p.materiales.length-1];
              if(lastMat) lastMat.tareaIdx=idxReal;
            }
          }
        }
        var accion2='Material adicional: '+comp.desc+' x'+cant;
        if(cantAEntregar>0) accion2+=' -- entregado al proyecto: '+cantAEntregar;
        if(cantFaltante2>0) accion2+=' -- OC generada por faltante: '+cantFaltante2;
        if(tareaSelLabel) accion2+=' -- vinculado a tarea: "'+tareaSelLabel+'"';
        p.historial.push({fecha:today(),accion:accion2});
      }
      save();cerrarModal();
      setTimeout(function(){abrirProyecto(projId);},100);
      return true;
    });
}

function desvincularMaterialTarea(projId, matIdx){
  var p=(DB.proyectos||[]).find(function(x){return x.id===projId;});
  if(!p||!p.materiales[matIdx]) return;
  var m=p.materiales[matIdx];
  var comp=compById(m.compId)||{desc:'?'};
  var tareaAntes=m.tareaIdx!==undefined&&p.tareas&&p.tareas[m.tareaIdx]?p.tareas[m.tareaIdx].desc:'--';
  delete m.tareaIdx;
  p.historial.push({fecha:today(),accion:'Material "'+comp.desc+'" desvinculado de tarea "'+tareaAntes+'"'});
  save();
  setTimeout(function(){abrirProyecto(projId);},100);
}

function quitarMaterialProyecto(projId, idx){
  var p=(DB.proyectos||[]).find(function(x){return x.id===projId;});
  if(!p||!p.materiales[idx]) return;
  var m=p.materiales[idx];
  var comp=(compById(m.compId)||{desc:'?'});
  if(!confirm('Quitar '+comp.desc+' x'+m.cant+' del proyecto?')) return;
  if(p.estado==='Planificado' && m.reservado){
    // Devolver al stock lo que habia sido reservado (lo que no tenia OC pendiente)
    var cantReservadaEnStock=(parseFloat(m.cant)||0)-(parseFloat(m.cantPendienteOC)||0);
    if(cantReservadaEnStock>0){
      DB.movimientos.push({
        id:DB.nid++,cid:m.compId,tipo:'Entrada',cant:cantReservadaEnStock,
        fecha:today(),ref:p.numero,nota:'Quita de reserva proyecto '+p.numero,origen:'Devolucion proyecto'
      });
    }
    p.historial.push({fecha:today(),accion:'Material quitado de deposito transitorio: '+comp.desc+' x'+m.cant+' (stock restaurado)'});
  } else {
    // En curso: devuelve al stock normal
    DB.movimientos.push({
      id:DB.nid++,cid:m.compId,tipo:'Entrada',cant:m.cant,
      fecha:today(),ref:p.numero,nota:'Quita de proyecto',origen:'Devolucion proyecto'
    });
    p.historial.push({fecha:today(),accion:'Material quitado: '+comp.desc+' x'+m.cant+' (devuelto al stock)'});
  }
  p.materiales.splice(idx,1);
  save();cerrarModal();
  renderProyectos();
  setTimeout(function(){abrirProyecto(projId);},100);
}

function confirmarPlanificacion(id){
  if(esOperador()){alert("Accion no permitida para Operador.");return;}
  var p=(DB.proyectos||[]).find(function(x){return x.id===id;});
  if(!p) return;
  if(!(p.materiales||[]).length){alert('Agrega materiales antes de confirmar.');return;}
  if(!confirm('Aprobar planificacion de '+p.numero+'?\nLos materiales reservados pasan al proyecto. Se emitiran OC para los faltantes.')) return;

  // Buscar items con faltante (cantPendienteOC > 0)
  var faltantesPorProv={};
  p.materiales.forEach(function(m){
    var faltante=parseFloat(m.cantPendienteOC)||0;
    if(faltante<=0) return;
    var comp=(compById(m.compId)||{});
    var prov=comp.proveedor||'Sin proveedor';
    if(!faltantesPorProv[prov]) faltantesPorProv[prov]=[];
    faltantesPorProv[prov].push({cid:m.compId,cant:parseFloat(m.cant)||0}); // OC por cantidad total reservada
  });

  // Generar OC por proveedor
  var ocGeneradas=[];
  Object.keys(faltantesPorProv).forEach(function(prov){
    var oc={
      id:DB.nid++,
      numero:getNumOC(),
      fecha:today(),
      estado:'Pendiente de compra',
      items:faltantesPorProv[prov],
      proveedor:prov,
      obs:'Generada por reserva -- Proyecto '+p.numero,
      ocReserva:true,
      proyId:p.id
    };
    DB.ordenes.unshift(oc);
    ocGeneradas.push(oc.numero);
    p.historial.push({fecha:today(),accion:'OC generada por faltante: '+oc.numero+' -- '+prov});
  });

  // Pasar materiales del deposito transitorio al proyecto
  // Los movimientos de Reserva ya descontaron el stock, ahora los convertimos en Salida instalacion
  p.materiales.forEach(function(m){
    var cantEnStock=(parseFloat(m.cant)||0)-(parseFloat(m.cantPendienteOC)||0);
    if(cantEnStock>0){
      // Registrar conversion de Reserva a Salida proyecto
      DB.movimientos.push({
        id:DB.nid++,cid:m.compId,tipo:'Salida instalacion',cant:cantEnStock,
        fecha:today(),nota:'Aprobacion proyecto '+p.numero,origen:'Proyecto',estadoMat:'N',proyId:p.id
      });
      // Anular el movimiento de Reserva (entrada compensatoria)
      DB.movimientos.push({
        id:DB.nid++,cid:m.compId,tipo:'Entrada',cant:cantEnStock,
        fecha:today(),nota:'Conversion reserva a salida -- Proyecto '+p.numero,origen:'Ajuste reserva',proyId:p.id
      });
    }
    // Marcar como no reservado (ya es del proyecto)
    m.reservado=false;
    m.entregado=cantEnStock;
  });

  p.estado='En curso';
  p.historial.push({fecha:today(),accion:'Planificacion aprobada -- materiales pasados al proyecto'+(ocGeneradas.length?' -- OC generadas: '+ocGeneradas.join(', '):''),estado:'En curso'});

  if(ocGeneradas.length){
    alert('Proyecto aprobado.\nSe generaron '+ocGeneradas.length+' OC por materiales faltantes:\n'+ocGeneradas.join('\n')+'\n\nEl proyecto quedara con entrega parcial hasta recibir las OC.');
  }

  save();cerrarModal();
  renderProyectos();
  setTimeout(function(){abrirProyecto(id);},100);
}

function iniciarCierreProyecto(id){
  if(esOperador()){alert("Accion no permitida para Operador.");return;}
  var p=(DB.proyectos||[]).find(function(x){return x.id===id;});
  if(!p) return;

  // CHECKLIST DE CIERRE
  var checks=[];
  var tareasTotal=(p.tareas||[]).length;
  var tareasOK=(p.tareas||[]).filter(function(t){return tareaEstadoCached(t)==='OK';}).length;
  var tareasPendConf=(p.tareas||[]).filter(function(t){return tareaEstadoCached(t)==='Pendiente confirmacion';}).length;
  var tareasAt=(p.tareas||[]).filter(function(t){return tareaEstadoCached(t)==='Atrasado';}).length;
  var tieneOCPendiente=(DB.ordenes||[]).some(function(o){return o.ocReserva&&o.proyId===p.id&&o.estado!=='Recibida'&&o.estado!=='Cancelada';});
  var tieneDocumentacion=(p.notas||[]).length>0||(p.onedriveLinks||[]).length>0||p.onedrive;
  var tienePresupuesto=parseFloat(p.presupuesto)||0;

  if(tareasAt>0) checks.push({ok:false,label:tareasAt+' tarea'+(tareasAt>1?'s':'')+' atrasada'+(tareasAt>1?'s':'')+' sin completar'});
  if(tareasPendConf>0) checks.push({ok:false,label:tareasPendConf+' tarea'+(tareasPendConf>1?'s':'')+' pendiente'+(tareasPendConf>1?'s':'')+' de confirmacion'});
  if(tareasTotal>0&&tareasOK<tareasTotal) checks.push({ok:false,label:(tareasTotal-tareasOK-tareasAt-tareasPendConf)+' tarea'+(tareasTotal-tareasOK>1?'s':'')+' en curso sin completar'});
  if(tieneOCPendiente) checks.push({ok:false,label:'Hay OC de reserva pendientes de recibir'});
  checks.push({ok:tareasTotal>0&&tareasOK===tareasTotal,label:'Todas las tareas completadas ('+tareasOK+'/'+tareasTotal+')'});
  checks.push({ok:tieneDocumentacion,label:'Documentacion / notas cargadas'});
  checks.push({ok:tienePresupuesto>0,label:'Presupuesto cargado'});

  var alertas=checks.filter(function(c){return !c.ok&&['atrasada','pendiente de confirmacion','en curso'].some(function(x){return c.label.toLowerCase().indexOf(x)>-1;})});
  var bloqueantes=checks.filter(function(c){return !c.ok&&c.label.indexOf('OC')>-1;});

  var htmlCheck='<div style="margin-bottom:14px">'+
    '<div style="font-size:11px;color:var(--text2);margin-bottom:8px;font-weight:700;text-transform:uppercase;letter-spacing:.05em">Checklist de cierre</div>'+
    checks.map(function(ch){
      return '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">'+
        '<span style="font-size:14px">'+(ch.ok?'✅':'⚠️')+'</span>'+
        '<span style="font-size:12px;color:'+(ch.ok?'var(--green)':'var(--amber)')+'">'+ch.label+'</span>'+
      '</div>';
    }).join('')+
  '</div>';

  if(bloqueantes.length){
    openModal('No se puede cerrar -- '+p.numero,
      htmlCheck+
      '<div style="background:#3a0000;border-radius:var(--r);padding:10px 14px;font-size:12px;color:#ef5350">'+
        'No se puede finalizar el proyecto mientras haya OC de reserva pendientes.'+
      '</div>',
      null, true);
    return;
  }

  var sobrantes=p.materiales.filter(function(m){return (parseFloat(m.cant)||0)>(parseFloat(m.devuelto)||0);});
  var tieneAlertas=alertas.length>0;

  var htmlSobrantes='';
  if(sobrantes.length){
    var compOpts=sobrantes.map(function(m){
      var comp=(compById(m.compId)||{desc:'?',unidad:''});
      var enProyecto=(parseFloat(m.cant)||0)-(parseFloat(m.devuelto)||0);
      return '<tr style="border-bottom:1px solid var(--border)">'+
        '<td style="padding:6px 10px;font-size:12px">'+comp.desc+'</td>'+
        '<td style="padding:6px 10px;text-align:center">'+enProyecto+' '+(comp.unidad||'')+'</td>'+
        '<td style="padding:6px 10px"><input type="number" class="dev-cant" data-compid="'+m.compId+'" min="0" max="'+enProyecto+'" value="'+enProyecto+'" style="width:70px;padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:12px;text-align:center;background:var(--surface2);color:var(--text)"></td>'+
      '</tr>';
    }).join('');
    htmlSobrantes='<div style="font-size:11px;color:var(--text2);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Devolución de sobrantes</div>'+
      '<p style="font-size:12px;color:var(--text2);margin-bottom:10px">Indicá cuánto devolver al stock. Pone 0 para no devolver.</p>'+
      '<table style="width:100%;border-collapse:collapse">'+
      '<thead><tr style="background:var(--surface2)"><th style="padding:6px 10px;font-size:10px">Componente</th><th style="padding:6px 10px;font-size:10px;text-align:center">En proyecto</th><th style="padding:6px 10px;font-size:10px;text-align:center">A devolver</th></tr></thead>'+
      '<tbody>'+compOpts+'</tbody></table>';
  }

  openModal('Cierre de proyecto -- '+p.numero,
    htmlCheck+
    (tieneAlertas?'<div style="background:#2a1a00;border:1px solid var(--amber);border-radius:var(--r);padding:8px 12px;font-size:11px;color:var(--amber);margin-bottom:12px">Hay ítems sin completar. Podés continuar igual.</div>':'')+
    htmlSobrantes,
    function(){
      var inputs=document.querySelectorAll('.dev-cant');
      inputs.forEach(function(inp){
        var compId=parseInt(inp.dataset.compid);
        var cantDev=parseFloat(inp.value)||0;
        if(cantDev<=0) return;
        var mat=p.materiales.find(function(m){return m.compId===compId;});
        if(!mat) return;
        mat.devuelto=(parseFloat(mat.devuelto)||0)+cantDev;
        DB.movimientos.push({id:DB.nid++,cid:compId,tipo:'Entrada',cant:cantDev,fecha:today(),ref:p.numero,nota:'Devolucion proyecto '+p.numero,origen:'Devolucion proyecto'});
        var comp=DB.componentes.find(function(c){return c.id===compId;})||{desc:'?'};
        p.historial.push({fecha:today(),accion:'Devuelto al stock: '+comp.desc+' x'+cantDev});
      });
      p.estado='Finalizado';p.fechaFinReal=today();
      p.historial.push({fecha:today(),accion:'Proyecto finalizado',estado:'Finalizado'});
      save();renderProyectos();renderStock();return true;
    });
}

function pausarProyecto(id){
  var p=(DB.proyectos||[]).find(function(x){return x.id===id;});
  if(!p) return;
  var razones=DB.config.razonesPausa||['Espera material','Espera presupuesto','Espera MO'];
  openModal('Pausar proyecto -- '+p.numero,
    '<div class="fg">'+
      '<label>Razon de la pausa *</label>'+
      '<select id="pausa-razon" style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;width:100%;background:var(--surface2);color:var(--text)" onchange="document.getElementById(\'pausa-otro-wrap\').style.display=this.value===\'Otro\'?\'block\':\'none\'">'+
        razones.map(function(r){return '<option value="'+r+'">'+r+'</option>';}).join('')+
        '<option value="Otro">+ Otro (agregar a lista)...</option>'+
      '</select>'+
    '</div>'+
    '<div class="fg" id="pausa-otro-wrap" style="display:none">'+
      '<label>Nueva razon</label>'+
      '<input id="pausa-otro" placeholder="Describir razon...">'+
    '</div>',
    function(){
      var razonEl=document.getElementById('pausa-razon');
      var razon=razonEl?razonEl.value:'';
      if(razon==='Otro'){
        var otro=document.getElementById('pausa-otro');
        var nueva=otro&&otro.value.trim()?otro.value.trim():'';
        if(!nueva){alert('Ingresa una razon.');return false;}
        // Agregar a la lista si no existe
        if(DB.config.razonesPausa.indexOf(nueva)===-1){
          DB.config.razonesPausa.push(nueva);
        }
        razon=nueva;
      }
      if(!razon){alert('Selecciona una razon.');return false;}
      p.fechaPausa=today();
      p.razonPausa=razon;
      if(p.fechaEstFin){
        var hoyD=new Date(today());
        var finD=new Date(p.fechaEstFin);
        p.diasRestantesAlPausar=Math.max(0,Math.round((finD-hoyD)/(1000*60*60*24)));
      }
      p.estado='Pausado';
      p.historial.push({fecha:today(),accion:'Proyecto pausado. Razon: '+razon+'. Dias restantes: '+(p.diasRestantesAlPausar||0)+'. Fin estimado al pausar: '+(p.fechaEstFin||'--'),estado:'Pausado'});
      save();cerrarModal();renderProyectos();
      setTimeout(function(){abrirProyecto(id);},100);
      return true;
    });
}

function cambiarEstadoProyecto(id, nuevoEstado){
  var p=(DB.proyectos||[]).find(function(x){return x.id===id;});
  if(!p) return;
  if(!confirm('Cambiar estado a "'+nuevoEstado+'"?')) return;

  if(nuevoEstado==='Pausado'){
    // Registrar fecha de pausa y dias restantes al pausar
    p.fechaPausa=today();
    if(p.fechaEstFin){
      var hoyD=new Date(today());
      var finD=new Date(p.fechaEstFin);
      p.diasRestantesAlPausar=Math.max(0,Math.round((finD-hoyD)/(1000*60*60*24)));
    }
    p.historial.push({fecha:today(),accion:'Proyecto pausado. Dias restantes: '+(p.diasRestantesAlPausar||0)+'. Fin estimado al pausar: '+(p.fechaEstFin||'--'),estado:'Pausado'});

  } else if(nuevoEstado==='En curso' && p.estado==='Pausado'){
    // Calcular dias de pausa
    var hoyStr=today();
    var diasPausa=0;
    if(p.fechaPausa){
      var pausaD=new Date(p.fechaPausa);
      var hoyD2=new Date(hoyStr);
      diasPausa=Math.max(0,Math.round((hoyD2-pausaD)/(1000*60*60*24)));
    }
    // Reprogramar fecha fin: hoy + diasRestantesAlPausar
    var nuevaFechaFin=p.fechaEstFin;
    if(diasPausa>0 && p.fechaEstFin){
      var finD2=new Date(p.fechaEstFin);
      finD2.setDate(finD2.getDate()+diasPausa);
      nuevaFechaFin=finD2.getFullYear()+'-'+String(finD2.getMonth()+1).padStart(2,'0')+'-'+String(finD2.getDate()).padStart(2,'0');
      p.fechaEstFin=nuevaFechaFin;
    }
    // Reprogramar tareas no OK: correr diasPausa dias, tope = nueva fechaEstFin
    var tareasReprog=0;
    if(diasPausa>0){
      (p.tareas||[]).forEach(function(t){
        if(tareaEstadoCached(t)==='OK') return;
        if(!t.fechaCumplimiento) return;
        var td=new Date(t.fechaCumplimiento);
        td.setDate(td.getDate()+diasPausa);
        var nuevaFechaT=td.getFullYear()+'-'+String(td.getMonth()+1).padStart(2,'0')+'-'+String(td.getDate()).padStart(2,'0');
        // Tope: no puede superar la nueva fecha fin del proyecto
        if(nuevaFechaFin && nuevaFechaT>nuevaFechaFin) nuevaFechaT=nuevaFechaFin;
        t.fechaCumplimiento=nuevaFechaT;
        tareasReprog++;
      });
    }
    p.fechaReanudacion=hoyStr;
    p.historial.push({fecha:hoyStr,accion:'Proyecto reanudado. Pausa: '+diasPausa+' dias. Nueva fecha fin: '+nuevaFechaFin+(tareasReprog?' -- '+tareasReprog+' tarea(s) reprogramadas':''),estado:'En curso'});

  } else {
    p.historial.push({fecha:today(),accion:'Estado cambiado a '+nuevoEstado,estado:nuevoEstado});
  }

  p.estado=nuevoEstado;
  save();cerrarModal();renderProyectos();
  setTimeout(function(){abrirProyecto(id);},100);
}

function cancelarProyecto(id){
  if(esOperador()){alert("Accion no permitida para Operador.");return;}
  var p=(DB.proyectos||[]).find(function(x){return x.id===id;});
  if(!p) return;
  var msg='Cancelar el proyecto '+p.numero+'?';
  if(p.estado==='Planificado'){
    var tieneReservas=p.materiales.some(function(m){return m.reservado;});
    if(tieneReservas) msg+='\n\nSe devolvera al stock todo el material reservado en el deposito transitorio.';
    var tieneOC=DB.ordenes.some(function(o){return o.ocReserva&&o.proyId===p.id&&o.estado!=='Cancelada';});
    if(tieneOC) msg+='\nLas OC de reserva vinculadas seran canceladas.';
  } else {
    var sobrantes=p.materiales.filter(function(m){return (parseFloat(m.cant)||0)>(parseFloat(m.devuelto)||0);});
    if(sobrantes.length) msg+='\n\nSe devolvera automaticamente todo el material restante al stock.';
  }
  if(!confirm(msg)) return;

  if(p.estado==='Planificado'){
    // Devolver reservas al stock
    p.materiales.forEach(function(m){
      if(!m.reservado) return;
      var cantEnStock=(parseFloat(m.cant)||0)-(parseFloat(m.cantPendienteOC)||0);
      if(cantEnStock>0){
        DB.movimientos.push({
          id:DB.nid++,cid:m.compId,tipo:'Entrada',cant:cantEnStock,
          fecha:today(),ref:p.numero,nota:'Cancelacion proyecto '+p.numero+' -- devolucion reserva',origen:'Devolucion proyecto'
        });
      }
    });
    // Cancelar OC de reserva vinculadas
    DB.ordenes.forEach(function(o){
      if(o.ocReserva&&o.proyId===p.id&&o.estado!=='Cancelada'&&o.estado!=='Recibida'){
        o.estado='Cancelada';
        p.historial.push({fecha:today(),accion:'OC '+o.numero+' cancelada por cancelacion del proyecto'});
      }
    });
  } else {
    // En curso: devolver sobrantes
    var sobrantes2=p.materiales.filter(function(m){return (parseFloat(m.cant)||0)>(parseFloat(m.devuelto)||0);});
    sobrantes2.forEach(function(m){
      var cantDev=(parseFloat(m.cant)||0)-(parseFloat(m.devuelto)||0);
      m.devuelto=parseFloat(m.cant)||0;
      DB.movimientos.push({
        id:DB.nid++,cid:m.compId,tipo:'Entrada',cant:cantDev,
        fecha:today(),ref:p.numero,nota:'Cancelacion proyecto '+p.numero,origen:'Devolucion proyecto'
      });
    });
  }
  p.estado='Cancelado';
  p.historial.push({fecha:today(),accion:'Proyecto cancelado -- materiales devueltos al stock',estado:'Cancelado'});
  save();cerrarModal();renderProyectos();renderStock();
}

function borrarProyecto(id){
  var p=(DB.proyectos||[]).find(function(x){return x.id===id;});
  if(!p) return;
  if(!confirm('Eliminar el proyecto '+p.numero+'? Esta accion no se puede deshacer.')) return;
  DB.proyectos=DB.proyectos.filter(function(x){return x.id!==id;});
  save();renderProyectos();
}

// REPORTE: Avance de proyectos ================================
function reporteProyectos(){
  var hoy=today();
  var lista=(DB.proyectos||[]).slice().sort(function(a,b){return (b.numero||'').localeCompare(a.numero||'');});
  if(!lista.length){reporteContainer('Avance de proyectos','<div class="empty">Sin proyectos registrados.</div>');return;}

  var cntPlanif=lista.filter(function(p){return p.estado==='Planificado';}).length;
  var cntActivos=lista.filter(function(p){return p.estado==='En curso';}).length;
  var cntPausados=lista.filter(function(p){return p.estado==='Pausado';}).length;
  var cntFin=lista.filter(function(p){return p.estado==='Finalizado';}).length;

  var h='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin-bottom:16px">'+
    '<div class="stat"><div class="stat-n amber">'+cntPlanif+'</div><div class="stat-l">Planificados</div></div>'+
    '<div class="stat"><div class="stat-n blue">'+cntActivos+'</div><div class="stat-l">En curso</div></div>'+
    (cntPausados?'<div class="stat"><div class="stat-n" style="color:#aaa">'+cntPausados+'</div><div class="stat-l">Pausados</div></div>':'')+
    '<div class="stat"><div class="stat-n green">'+cntFin+'</div><div class="stat-l">Finalizados</div></div>'+
  '</div>';

  lista.forEach(function(p){
    var esCancelado=p.estado==='Cancelado';
    if(esCancelado) return; // Omitir cancelados

    // Calculos generales
    var valor=(p.materiales||[]).reduce(function(a,m){
      var comp=(compById(m.compId)||{});
      return a+(parseFloat(m.cant)||0)*(parseFloat(comp.costo)||0);
    },0);
    var valorPendOC=(p.materiales||[]).reduce(function(a,m){
      var comp=(compById(m.compId)||{});
      return a+(parseFloat(m.cantPendienteOC)||0)*(parseFloat(comp.costo)||0);
    },0);

    // Barra de tiempo
    var pctTiempo=0;
    if(p.fechaInicio&&p.fechaEstFin){
      var total=new Date(p.fechaEstFin)-new Date(p.fechaInicio);
      var trans=new Date(hoy)-new Date(p.fechaInicio);
      pctTiempo=total>0?Math.min(100,Math.max(0,Math.round(trans/total*100))):0;
    }
    var diff=p.fechaEstFin&&p.estado!=='Finalizado'?Math.round((new Date(p.fechaEstFin)-new Date())/86400000):null;

    // Avance ponderado MO por tareas
    var pesoTotal=(p.tareas||[]).reduce(function(a,t){return a+(parseFloat(t.peso)||0);},0);
    var avanceMO=pesoTotal>0?Math.round((p.tareas||[]).reduce(function(a,t){
      return a+(parseFloat(t.peso)||0)*(parseFloat(t.avanceReal)||0)/100;
    },0)):null;

    // Tareas stats
    var tareasOK=(p.tareas||[]).filter(function(t){return tareaEstadoCached(t)==='OK';}).length;
    var tareasAt=(p.tareas||[]).filter(function(t){return tareaEstadoCached(t)==='Atrasado';}).length;
    var tareasTot=(p.tareas||[]).length;

    // Reprogramaciones
    var reprog=(p.historial||[]).filter(function(h){return h.accion&&h.accion.indexOf('reanudado')>-1;});

    h+='<div class="card" style="margin-bottom:12px">'+
      // HEADER
      '<div class="ch" style="flex-wrap:wrap;gap:6px">'+
        '<div style="display:flex;align-items:center;gap:8px">'+
          '<span class="mono" style="font-size:11px;color:var(--primary)">'+p.numero+'</span>'+
          '<strong style="font-size:13px">'+p.nombre+'</strong>'+
        '</div>'+
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'+
          proyEstadoPill(p.estado)+
          (p.estado==='Pausado'&&p.razonPausa?'<span style="background:#2a2000;border:1px solid #665500;color:#ffcc44;padding:2px 8px;border-radius:8px;font-size:10px">⏸ '+p.razonPausa+'</span>':'')+
        '</div>'+
      '</div>'+
      '<div class="card-body">'+

      // FILA 1: Fechas y estado materiales
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:12px">'+
        '<div style="background:var(--surface2);border-radius:6px;padding:8px 10px">'+
          '<div style="font-size:9px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em">Inicio</div>'+
          '<div style="font-size:12px;font-weight:700;margin-top:2px">'+(p.fechaInicio||'--')+'</div>'+
          '<div style="font-size:9px;color:var(--text2);margin-top:1px">'+(p.fechaInicio?'Real':'Planificado')+'</div>'+
        '</div>'+
        '<div style="background:var(--surface2);border-radius:6px;padding:8px 10px">'+
          '<div style="font-size:9px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em">Fin estimado</div>'+
          '<div style="font-size:12px;font-weight:700;margin-top:2px;color:'+(diff!==null&&diff<0?'var(--red)':'var(--text)')+'">'+(p.fechaEstFin||'--')+'</div>'+
          (diff!==null?'<div style="font-size:9px;color:'+(diff<0?'var(--red)':'var(--text2)')+';margin-top:1px">'+(diff<0?Math.abs(diff)+' dias atrasado':diff+' dias restantes')+'</div>':'')+''+
        '</div>'+
        (p.fechaFinReal?'<div style="background:#0a2a0a;border:1px solid var(--green);border-radius:6px;padding:8px 10px">'+
          '<div style="font-size:9px;color:var(--green);text-transform:uppercase;letter-spacing:.05em">Fin real</div>'+
          '<div style="font-size:12px;font-weight:700;color:var(--green);margin-top:2px">'+p.fechaFinReal+'</div>'+
        '</div>':'')+
        // Estado materiales (solo Planificado/En curso)
        (p.estado==='Planificado'||p.estado==='En curso'?
          '<div style="background:var(--surface2);border-radius:6px;padding:8px 10px">'+
            '<div style="font-size:9px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em">Materiales</div>'+
            '<div style="font-size:11px;font-weight:700;margin-top:4px">'+
              (p.estado==='Planificado'?
                '<span style="color:#ce93d8">'+(p.materiales||[]).filter(function(m){return m.reservado;}).length+' reservados</span>':
                '<span style="color:var(--green)">'+(p.materiales||[]).filter(function(m){return !m.cantPendienteOC||m.cantPendienteOC<=0;}).length+' entregados</span>')+
            '</div>'+
            (valorPendOC>0?'<div style="font-size:9px;color:var(--amber);margin-top:2px">$'+Math.round(valorPendOC).toLocaleString('es-AR')+' pend. OC</div>':'')+
          '</div>':'')+''+
      '</div>'+

      // FILA 2: Erogaciones vs presupuesto
      (function(){
        var presup=parseFloat(p.presupuesto)||0;
        var esPlanif=p.estado==='Planificado';
        // Estimado (planificado): todos los materiales y toda la MO planificada
        var estimMat=valor;
        var estimMO=(p.tareas||[]).reduce(function(a,t){return a+(parseFloat(t.costoMO)||0);},0);
        var estimTotal=estimMat+estimMO;
        // Erogado real (en curso/pausado/finalizado): materiales entregados + MO de tareas OK
        var erogMat=(p.materiales||[]).reduce(function(a,m){
          var comp=(compById(m.compId)||{});
          var entregado=m.reservado?0:(parseFloat(m.entregado)||parseFloat(m.cant)||0);
          return a+entregado*(parseFloat(comp.costo)||0);
        },0);
        var erogMO=(p.tareas||[]).filter(function(t){return tareaEstadoCached(t)==='OK';}).reduce(function(a,t){return a+(parseFloat(t.costoMO)||0);},0);
        var erogTotal=erogMat+erogMO;
        // Segun estado usamos estimado o erogado para la comparacion
        var compMat=esPlanif?estimMat:erogMat;
        var compMO=esPlanif?estimMO:erogMO;
        var compTotal=esPlanif?estimTotal:erogTotal;
        var label=esPlanif?'Estimado':'Erogado';
        var labelMat=esPlanif?'Mat. estimados':'Mat. entregados';
        var labelMO=esPlanif?'MO planificada':'MO ejecutada (OK)';
        var superaPresup=presup>0&&compTotal>presup;
        var diferencia=presup-compTotal;
        var pctEjec=presup>0?Math.min(200,Math.round(compTotal/presup*100)):0;
        return '<div style="background:var(--surface2);border:1px solid '+(superaPresup?'var(--red)':esPlanif?'#3a3a5a':'var(--border)')+';border-radius:6px;padding:10px 12px;margin-bottom:10px">'+
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'+
            '<div style="font-size:9px;color:'+(superaPresup?'var(--red)':'var(--text2)')+';text-transform:uppercase;letter-spacing:.05em;font-weight:700">'+(esPlanif?'Presupuesto estimado':'Erogaciones vs presupuesto')+'</div>'+
            (esPlanif?'<span style="background:#1a1a3a;color:#8888ff;padding:1px 8px;border-radius:8px;font-size:9px">Estimado -- sin erogaciones reales aun</span>':'')+
          '</div>'+
          '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:6px;margin-bottom:10px">'+
            '<div style="background:var(--surface3);border-radius:5px;padding:6px 8px">'+
              '<div style="font-size:9px;color:var(--text2)">Presupuesto</div>'+
              '<div style="font-size:13px;font-weight:700">'+(presup?'$'+Math.round(presup).toLocaleString('es-AR'):'--')+'</div>'+
            '</div>'+
            '<div style="background:var(--surface3);border-radius:5px;padding:6px 8px">'+
              '<div style="font-size:9px;color:var(--text2)">'+labelMat+'</div>'+
              '<div style="font-size:13px;font-weight:700;color:var(--blue)">$'+Math.round(compMat).toLocaleString('es-AR')+'</div>'+
            '</div>'+
            '<div style="background:var(--surface3);border-radius:5px;padding:6px 8px">'+
              '<div style="font-size:9px;color:var(--text2)">'+labelMO+'</div>'+
              '<div style="font-size:13px;font-weight:700;color:var(--amber)">$'+Math.round(compMO).toLocaleString('es-AR')+'</div>'+
            '</div>'+
            '<div style="background:'+(superaPresup?'#3a0000':'#0a2a0a')+';border-radius:5px;padding:6px 8px">'+
              '<div style="font-size:9px;color:'+(superaPresup?'var(--red)':'var(--green)')+'">Total '+label+'</div>'+
              '<div style="font-size:13px;font-weight:700;color:'+(superaPresup?'var(--red)':'var(--green)')+'">$'+Math.round(compTotal).toLocaleString('es-AR')+'</div>'+
            '</div>'+
          '</div>'+
          (!esPlanif&&estimTotal>erogTotal?
            '<div style="font-size:9px;color:var(--text2);margin-bottom:8px">'+
              'Erogado vs estimado: <strong>$'+Math.round(erogTotal).toLocaleString('es-AR')+'</strong> de <strong>$'+Math.round(estimTotal).toLocaleString('es-AR')+'</strong> estimados'+
            '</div>':'')+
          (presup>0?
            '<div style="margin-bottom:4px">'+
              '<div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text2);margin-bottom:3px">'+
                '<span>Ejecucion presupuestaria</span>'+
                '<span style="color:'+(superaPresup?'var(--red)':'var(--text)')+';font-weight:700">'+pctEjec+'%</span>'+
              '</div>'+
              '<div style="background:var(--surface3);border-radius:3px;height:8px;overflow:hidden;position:relative">'+
                '<div style="height:100%;background:var(--blue);width:'+Math.min(100,Math.round(compMat/presup*100))+'%;position:absolute;left:0"></div>'+
                '<div style="height:100%;background:var(--amber);width:'+Math.min(100,Math.round(compMO/presup*100))+'%;position:absolute;left:'+Math.min(100,Math.round(compMat/presup*100))+'%"></div>'+
                (superaPresup?'<div style="position:absolute;right:0;top:0;bottom:0;width:3px;background:var(--red)"></div>':'')+
              '</div>'+
              '<div style="display:flex;gap:10px;margin-top:4px;font-size:9px">'+
                '<span style="color:var(--blue)">■ Materiales</span>'+
                '<span style="color:var(--amber)">■ MO</span>'+
                '<span style="color:'+(diferencia>=0?'var(--green)':'var(--red)')+';margin-left:auto;font-weight:700">'+(diferencia>=0?'Disponible: $'+Math.round(diferencia).toLocaleString('es-AR'):'Exceso: $'+Math.round(Math.abs(diferencia)).toLocaleString('es-AR'))+'</span>'+
              '</div>'+
            '</div>':'<div style="font-size:10px;color:var(--text3)">Sin presupuesto cargado</div>')+
        '</div>';
      })()+

      // FILA 3: Barras de avance
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">'+
        // Avance planificado (tiempo)
        '<div style="background:var(--surface2);border-radius:6px;padding:8px 10px">'+
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'+
            '<div style="font-size:9px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em">Avance tiempo</div>'+
            '<div style="font-size:13px;font-weight:700;color:'+(pctTiempo>=100?'var(--red)':'var(--blue)')+'">'+pctTiempo+'%</div>'+
          '</div>'+
          '<div style="background:var(--surface3);border-radius:3px;height:6px;overflow:hidden">'+
            '<div style="height:100%;background:'+(pctTiempo>=100?'var(--red)':'var(--blue)')+';width:'+pctTiempo+'%"></div>'+
          '</div>'+
        '</div>'+
        // Avance real MO
        '<div style="background:var(--surface2);border-radius:6px;padding:8px 10px">'+
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'+
            '<div style="font-size:9px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em">Avance MO</div>'+
            '<div style="font-size:13px;font-weight:700;color:'+(avanceMO===null?'var(--text3)':avanceMO>=100?'var(--green)':'var(--text)')+'">'+
              (avanceMO===null?'--':avanceMO+'%')+
            '</div>'+
          '</div>'+
          (avanceMO!==null?
            '<div style="background:var(--surface3);border-radius:3px;height:6px;overflow:hidden">'+
              '<div style="height:100%;background:'+(avanceMO>=100?'var(--green)':avanceMO>=60?'var(--blue)':'var(--primary)')+';width:'+avanceMO+'%"></div>'+
            '</div>':
            '<div style="font-size:10px;color:var(--text3)">Sin tareas con peso asignado</div>')+
          (pesoTotal>0&&pesoTotal<100?'<div style="font-size:9px;color:var(--amber);margin-top:3px">'+Math.round(pesoTotal)+'% peso asignado (falta '+(100-Math.round(pesoTotal))+'%)</div>':'')+
        '</div>'+
        // Avance manual global
        '<div style="background:var(--surface2);border-radius:6px;padding:8px 10px">'+
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'+
            '<div style="font-size:9px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em">Avance global (manual)</div>'+
            '<div style="font-size:13px;font-weight:700">'+(p.pctAvance||0)+'%</div>'+
          '</div>'+
          '<div style="background:var(--surface3);border-radius:3px;height:6px;overflow:hidden">'+
            '<div style="height:100%;background:var(--primary);width:'+(p.pctAvance||0)+'%"></div>'+
          '</div>'+
        '</div>'+
        // Tareas resumen
        '<div style="background:var(--surface2);border-radius:6px;padding:8px 10px">'+
          '<div style="font-size:9px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Tareas</div>'+
          (tareasTot?
            '<div style="display:flex;gap:6px;flex-wrap:wrap">'+
              (tareasOK?'<span style="background:var(--green);color:#fff;padding:1px 8px;border-radius:8px;font-size:10px;font-weight:700">'+tareasOK+' OK</span>':'')+
              (tareasAt?'<span style="background:var(--red);color:#fff;padding:1px 8px;border-radius:8px;font-size:10px;font-weight:700">'+tareasAt+' atrasada'+(tareasAt>1?'s':'')+'</span>':'')+
              '<span style="font-size:10px;color:var(--text2)">'+tareasTot+' total</span>'+
            '</div>':
            '<div style="font-size:10px;color:var(--text3)">Sin tareas</div>')+
        '</div>'+
      '</div>'+

      // REPROGRAMACIONES
      (reprog.length?
        '<div style="background:#1a0a2a;border:1px solid #3a1a5a;border-radius:6px;padding:8px 10px;margin-bottom:10px">'+
          '<div style="font-size:9px;color:#ce93d8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Reprogramaciones ('+reprog.length+')</div>'+
          reprog.map(function(h){
            return '<div style="font-size:10px;color:var(--text2);margin-bottom:2px">'+h.fecha+' -- '+h.accion+'</div>';
          }).join('')+
        '</div>':'')+

      // MATERIALES (tabla compacta)
      ((p.materiales||[]).length?
        '<div style="font-size:9px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Materiales</div>'+
        '<table style="width:100%;border-collapse:collapse;margin-bottom:10px">'+
          '<thead><tr style="background:var(--surface2)">'+
            '<th style="padding:3px 8px;font-size:10px">Componente</th>'+
            '<th style="padding:3px 8px;font-size:10px;text-align:center">Cant.</th>'+
            '<th style="padding:3px 8px;font-size:10px;text-align:center">Estado</th>'+
            '<th style="padding:3px 8px;font-size:10px;text-align:right">Valor $</th>'+
          '</tr></thead><tbody>'+
          (p.materiales||[]).map(function(m){
            var comp=(compById(m.compId)||{desc:'?',unidad:''});
            var val=(parseFloat(m.cant)||0)*(parseFloat(comp.costo)||0);
            var estadoMat=m.reservado?'<span style="color:#ce93d8;font-size:10px">Reservado</span>':
              (parseFloat(m.cantPendienteOC)||0)>0?'<span style="color:var(--amber);font-size:10px">Parcial (OC)</span>':
              '<span style="color:var(--green);font-size:10px">Entregado</span>';
            return '<tr style="border-bottom:1px solid var(--border)">'+
              '<td style="padding:3px 8px;font-size:11px">'+comp.desc+'</td>'+
              '<td style="padding:3px 8px;text-align:center;font-size:11px">'+m.cant+' '+(comp.unidad||'')+'</td>'+
              '<td style="padding:3px 8px;text-align:center">'+estadoMat+'</td>'+
              '<td style="padding:3px 8px;text-align:right;font-size:11px">$'+Math.round(val).toLocaleString('es-AR')+'</td>'+
            '</tr>';
          }).join('')+
          '</tbody></table>':'')+

      '</div></div>';
  });

  reporteContainer('Avance de proyectos', h);
}



// =======================================================
// ORDENES
// =======================================================
function getNumOC(){
  var yr=new Date().getFullYear();
  var same=DB.ordenes.filter(function(o){return o.numero&&o.numero.startsWith('OC-'+yr);});
  var max=0;
  same.forEach(function(o){var n=parseInt((o.numero||'').split('-')[2]||'0');if(n>max)max=n;});
  return 'OC-'+yr+'-'+String(max+1).padStart(4,'0');
}

function renderOrdenes(){
  var q=(document.getElementById('q-ord')?document.getElementById('q-ord').value||'':'').toLowerCase();
  var todasOC=[...DB.ordenes].sort(function(a,b){return (b.fecha||'').localeCompare(a.fecha||'');});
  var ocReserva=todasOC.filter(function(o){return o.ocReserva&&(!q||((o.numero||'')+(o.proveedor||'')+(o.estado||'')).toLowerCase().includes(q));});
  var ocNormal=todasOC.filter(function(o){return !o.ocReserva&&(!q||((o.numero||'')+(o.proveedor||'')+(o.estado||'')).toLowerCase().includes(q));});

  var tb=document.getElementById('tbody-ord');
  var estPillNorm={'Pendiente':'p-a',Enviada:'p-b',Recibida:'p-g',Cancelada:'p-r'};
  var estPillRes={'Pendiente de compra':'p-a','Pendiente de entrega':'p-a',Recibida:'p-g',Cancelada:'p-r'};

  function filaOC(o, esReserva){
    var items=o.items.map(function(i){var c=DB.componentes.find(function(x){return x.id===i.cid;})||{desc:'?'};return c.desc+' ('+i.cant+')';}).join(', ');
    var total=o.items.reduce(function(a,i){var c=DB.componentes.find(function(x){return x.id===i.cid;})||{costo:0};return a+(parseFloat(c.costo)||0)*i.cant;},0);
    var pillMap=esReserva?estPillRes:estPillNorm;
    var proyInfo='';
    if(esReserva&&o.proyId){
      var proy=(DB.proyectos||[]).find(function(x){return x.id===o.proyId;});
      if(proy) proyInfo='<div style="font-size:10px;color:#ce93d8;margin-top:2px">'+proy.numero+' -- '+proy.nombre+'</div>';
    }
    return '<tr>'+
      '<td>'+o.fecha+'</td>'+
      '<td class="mono" style="font-size:11px">'+( o.numero||'--')+'</td>'+
      '<td><span class="pill '+(pillMap[o.estado]||'p-x')+'">'+o.estado+'</span></td>'+
      '<td style="font-size:11px">'+items+proyInfo+'</td>'+
      '<td>'+(o.proveedor||'--')+'</td>'+
      '<td>'+(total?'$'+Math.round(total).toLocaleString('es-AR'):'--')+'</td>'+
      '<td style="font-size:11px">'+(o.obs||'--')+'</td>'+
      '<td style="display:flex;gap:4px">'+
        '<button class="btn btn-sm" onclick="cambiarEstadoOrden('+o.id+')">Estado</button>'+
        '<button class="btn btn-sm btn-p" onclick="pdfOrden('+o.id+')">PDF</button>'+
        '<button class="btn btn-sm" style="color:var(--red)" onclick="eliminarOrden('+o.id+')">X</button>'+
      '</td>'+
    '</tr>';
  }

  var html='';
  // Seccion OC de reserva
  if(ocReserva.length){
    html+='<tr style="background:#1a0a2a"><td colspan="8" style="padding:6px 10px;font-size:10px;font-weight:700;color:#ce93d8;text-transform:uppercase;letter-spacing:.06em">OC por reserva de proyecto</td></tr>';
    html+=ocReserva.map(function(o){return filaOC(o,true);}).join('');
    if(ocNormal.length){
      html+='<tr><td colspan="8" style="padding:4px 10px;font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.06em;background:var(--surface2)">Ordenes de compra normales</td></tr>';
    }
  }
  // Seccion OC normales
  if(ocNormal.length){
    html+=ocNormal.map(function(o){return filaOC(o,false);}).join('');
  }
  if(!html){
    html='<tr><td colspan="8" class="empty">Sin ordenes de compra.</td></tr>';
  }
  tb.innerHTML=html;
}

function modalOrden(){
  var compOpts=[...DB.componentes].sort(function(a,b){return (a.desc||'').localeCompare(b.desc||'','es');}).map(function(c){
    return '<option value="'+c.id+'">'+c.codigo+' -- '+c.desc+'</option>';
  }).join('');
  openModal('Nueva orden de compra',
    '<div id="orden-items"><div class="fg2" style="margin-bottom:8px">'+
      '<div class="fg"><label>Componente *</label><select class="ord-cid" style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;width:100%;background:var(--surface2);color:var(--text)"><option value="">-- seleccionar --</option>'+compOpts+'</select></div>'+
      '<div class="fg"><label>Cantidad *</label><input class="ord-cant" type="number" min="1" value="1"></div>'+
    '</div></div>'+
    '<button class="btn btn-sm" onclick="addOrdenItem()" style="margin-bottom:10px">+ Agregar item</button>'+
    '<div class="fg"><label>Proveedor</label><select id="ord-prov" style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;width:100%;background:var(--surface2);color:var(--text)">'+
      '<option value="">-- sin vincular --</option>'+
      DB.proveedores.sort(function(a,b){return (a.empresa||'').localeCompare(b.empresa||'');}).map(function(p){return '<option value="'+p.empresa+'">'+p.empresa+'</option>';}).join('')+
    '</select></div>'+
    '<div class="fg"><label>Observaciones</label><input id="ord-obs" placeholder="Notas..."></div>',
    function(){
      var cids=[...document.querySelectorAll('.ord-cid')].map(function(s){return parseInt(s.value);});
      var cants=[...document.querySelectorAll('.ord-cant')].map(function(i){return parseFloat(i.value)||0;});
      var items=cids.map(function(cid,i){return {cid:cid,cant:cants[i]};}).filter(function(x){return x.cid&&x.cant>0;});
      if(!items.length){alert('Agrega al menos un componente con cantidad.');return false;}
      DB.ordenes.unshift({id:DB.nid++,numero:getNumOC(),fecha:today(),estado:'Pendiente',items:items,proveedor:document.getElementById('ord-prov').value,obs:document.getElementById('ord-obs').value});
      save();renderOrdenes();return true;
    });
}

function addOrdenItem(){
  var cont=document.getElementById('orden-items');
  var compOpts=[...DB.componentes].sort(function(a,b){return (a.desc||'').localeCompare(b.desc||'','es');}).map(function(c){return '<option value="'+c.id+'">'+c.codigo+' -- '+c.desc+'</option>';}).join('');
  var div=document.createElement('div');div.className='fg2';div.style.marginBottom='8px';
  div.innerHTML='<div class="fg"><label>Componente *</label><select class="ord-cid" style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;width:100%;background:var(--surface2);color:var(--text)"><option value="">-- seleccionar --</option>'+compOpts+'</select></div><div class="fg"><label>Cantidad *</label><input class="ord-cant" type="number" min="1" value="1"></div>';
  cont.appendChild(div);
}

function generarOrdenAutomatica(){
  var criticos=DB.componentes.filter(function(c){var min=parseFloat(c.min)||0;return min>0&&stockActual(c.id)<min;});
  if(!criticos.length){alert('No hay componentes bajo stock minimo.');return;}
  var porProv={};
  criticos.forEach(function(c){
    var prov=c.proveedor||'Sin proveedor';
    if(!porProv[prov]) porProv[prov]=[];
    var faltante=Math.max(1,(parseFloat(c.min)||1)-stockActual(c.id)+Math.ceil((parseFloat(c.min)||1)));
    porProv[prov].push({cid:c.id,cant:faltante});
  });
  var count=Object.keys(porProv).length;
  if(!confirm('Se generaran '+count+' orden'+(count>1?'es':'')+' de compra. Continuar?')) return;
  Object.entries(porProv).forEach(function(entry){
    DB.ordenes.unshift({id:DB.nid++,numero:getNumOC(),fecha:today(),estado:'Pendiente',items:entry[1],proveedor:entry[0],obs:'Generada automaticamente -- stock critico'});
  });
  save();renderOrdenes();
}

function cambiarEstadoOrden(id){
  var o=DB.ordenes.find(function(x){return x.id===id;});
  if(!o) return;
  var estados=['Pendiente','Pendiente de compra','Pendiente de entrega','Enviada','Recibida','Cancelada'];
  // Flujo simplificado para OC de reserva
  if(o.ocReserva){
    var flujoReserva=['Pendiente de compra','Pendiente de entrega','Recibida'];
    var curR=flujoReserva.indexOf(o.estado);
    if(o.estado==='Recibida'){alert('Esta orden ya fue recibida.');return;}
    if(o.estado==='Cancelada'){alert('Esta orden esta Cancelada.');return;}
    var sigR=curR>=0?flujoReserva[curR+1]:flujoReserva[1];
    if(!sigR) sigR='Recibida';
    if(sigR!=='Recibida'){
      if(!confirm('Cambiar estado a "'+sigR+'"?')) return;
      o.estado=sigR;
      save();renderOrdenes();renderStock();
      return;
    }
    // Al recibir: mostrar modal de confirmacion con detalle
    var pRec=o.proyId?(DB.proyectos||[]).find(function(x){return x.id===o.proyId;}):null;
    var detalleItems=o.items.map(function(item){
      var comp=(compById(item.cid)||{desc:'?',unidad:''});
      var mat=pRec?(pRec.materiales||[]).find(function(m){return m.compId===item.cid;}):null;
      var pendiente=mat?parseFloat(mat.cantPendienteOC)||0:0;
      var aAsignar=Math.min(pendiente,item.cant);
      var remanente=item.cant-aAsignar;
      return {comp:comp,cant:item.cant,cid:item.cid,pendiente:pendiente,aAsignar:aAsignar,remanente:remanente};
    });
    var htmlDet=
      '<div style="font-size:11px;color:var(--text2);margin-bottom:10px">'+
        '<strong style="color:var(--text)">OC '+o.numero+'</strong> &middot; '+o.proveedor+
        (pRec?' &middot; Proyecto <span style="color:var(--primary)">'+pRec.numero+' -- '+pRec.nombre+'</span>':'')+
      '</div>'+
      '<table style="width:100%;border-collapse:collapse;margin-bottom:12px">'+
        '<thead><tr style="background:var(--surface2)">'+
          '<th style="padding:5px 8px;font-size:10px;text-align:left">Material</th>'+
          '<th style="padding:5px 8px;font-size:10px;text-align:center">Llega</th>'+
          '<th style="padding:5px 8px;font-size:10px;text-align:center;color:var(--primary)">Al proyecto</th>'+
          '<th style="padding:5px 8px;font-size:10px;text-align:center;color:#66bb6a">Al stock</th>'+
        '</tr></thead><tbody>'+
        detalleItems.map(function(d){
          return '<tr style="border-bottom:1px solid var(--border)">'+
            '<td style="padding:5px 8px;font-size:11px">'+d.comp.desc+'</td>'+
            '<td style="padding:5px 8px;text-align:center;font-size:11px">'+d.cant+' '+(d.comp.unidad||'')+'</td>'+
            '<td style="padding:5px 8px;text-align:center;font-size:11px;font-weight:700;color:var(--primary)">'+d.aAsignar+' '+(d.comp.unidad||'')+'</td>'+
            '<td style="padding:5px 8px;text-align:center;font-size:11px;font-weight:700;color:#66bb6a">'+d.remanente+' '+(d.comp.unidad||'')+'</td>'+
          '</tr>';
        }).join('')+
        '</tbody></table>'+
      '<div style="font-size:11px;color:var(--text2)">Confirmar recepcion y asignacion automatica?</div>';
    openModal('Recibir OC de reserva', htmlDet, function(){
      detalleItems.forEach(function(d){
        DB.movimientos.push({id:DB.nid++,cid:d.cid,tipo:'Entrada',cant:d.cant,fecha:today(),ref:'Orden #'+(o.numero||o.id),nota:'Recepcion OC reserva',origen:'Compra'});
        if(pRec&&d.aAsignar>0){
          var mat=pRec.materiales.find(function(m){return m.compId===d.cid;});
          DB.movimientos.push({id:DB.nid++,cid:d.cid,tipo:'Salida instalacion',cant:d.aAsignar,fecha:today(),nota:'Asignacion saldo OC '+o.numero+' a proyecto '+pRec.numero,origen:'Proyecto',estadoMat:'N',proyId:pRec.id});
          if(mat){mat.cantPendienteOC=Math.max(0,(parseFloat(mat.cantPendienteOC)||0)-d.aAsignar);mat.entregado=(parseFloat(mat.entregado)||0)+d.aAsignar;}
          pRec.historial.push({fecha:today(),accion:'Recibida OC '+o.numero+': '+d.aAsignar+' '+d.comp.unidad+' '+d.comp.desc+' al proyecto'+(d.remanente>0?', '+d.remanente+' al stock':'')});
        }
      });
      o.estado='Recibida';
      save();renderOrdenes();renderStock();
      return true;
    });
    return;
  }
  // Flujo normal (OC no de reserva)
  var estadosNorm=['Pendiente','Enviada','Recibida','Cancelada'];
  var cur=estadosNorm.indexOf(o.estado);
  if(o.estado==='Recibida'){alert('Esta orden ya fue recibida.');return;}
  if(o.estado==='Cancelada'){alert('Esta orden esta Cancelada.');return;}
  var sig=estadosNorm[cur+1];
  if(!confirm('Cambiar estado a "'+sig+'"?')) return;
  o.estado=sig;
  if(sig==='Recibida'){
    o.items.forEach(function(item){
      DB.movimientos.push({id:DB.nid++,cid:item.cid,tipo:'Entrada',cant:item.cant,fecha:today(),ref:'Orden #'+(o.numero||o.id),lote:'',precio:0,nota:'Recepcion orden de compra',origen:'Compra'});
    });
    alert('Stock actualizado con los items recibidos.');
  }
  save();renderOrdenes();renderStock();
}

function eliminarOrden(id){
  if(!confirm('Eliminar esta orden?')) return;
  DB.ordenes=DB.ordenes.filter(function(x){return x.id!==id;});
  save();renderOrdenes();
}

function pdfOrden(id){
  var o=DB.ordenes.find(function(x){return x.id===id;});
  if(!o) return;
  var empresa=(DB.config&&DB.config.empresa)||'Viking Security Systems';
  var rows='';
  o.items.forEach(function(item){
    var c=(compById(item.cid)||{codigo:'?',desc:'?',unidad:'u',costo:0});
    var sub=(parseFloat(c.costo)||0)*item.cant;
    rows+='<tr><td>'+c.codigo+'</td><td>'+c.desc+'</td><td style="text-align:center">'+item.cant+' '+(c.unidad||'')+'</td><td style="text-align:right">$'+Math.round(c.costo||0).toLocaleString('es-AR')+'</td><td style="text-align:right">$'+Math.round(sub).toLocaleString('es-AR')+'</td></tr>';
  });
  var total=o.items.reduce(function(a,i){var c=DB.componentes.find(function(x){return x.id===i.cid;})||{costo:0};return a+(parseFloat(c.costo)||0)*i.cant;},0);
  var css='*{box-sizing:border-box;margin:0;padding:0}body{font-family:Segoe UI,Arial,sans-serif;padding:28px;font-size:13px}h1{font-size:18px;color:#B71C1C;margin-bottom:4px}.meta{font-size:12px;color:#666;margin-bottom:20px}table{width:100%;border-collapse:collapse}th{background:#B71C1C;color:#fff;padding:8px 12px;font-size:11px;text-align:left}td{padding:7px 12px;border-bottom:1px solid #eee}tfoot td{background:#f8f8f8;font-weight:700}.btn{position:fixed;top:14px;right:14px;background:#B71C1C;color:#fff;border:none;padding:8px 18px;border-radius:6px;cursor:pointer}@media print{.btn{display:none}}';
  var w=window.open('','_blank');
  w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Orden '+( o.numero||o.id)+'</title><style>'+css+'</style></head><body>'+
    '<button class="btn" onclick="window.print()">Imprimir</button>'+
    '<h1>ORDEN DE COMPRA -- '+(o.numero||'OC')+'</h1>'+
    '<div class="meta">'+empresa+' - Fecha: '+o.fecha+' - Estado: '+o.estado+(o.proveedor?'<br>Proveedor: '+o.proveedor:'')+(o.obs?'<br>Obs: '+o.obs:'')+'</div>'+
    '<table><thead><tr><th>Codigo</th><th>Descripcion</th><th style="text-align:center">Cantidad</th><th style="text-align:right">P. unitario</th><th style="text-align:right">Subtotal</th></tr></thead>'+
    '<tbody>'+rows+'</tbody><tfoot><tr><td colspan="4" style="text-align:right;padding:8px 12px">TOTAL ESTIMADO</td><td style="text-align:right;padding:8px 12px;color:#B71C1C">$'+Math.round(total).toLocaleString('es-AR')+'</td></tr></tfoot></table></body></html>');
  w.document.close();
}

// =======================================================
// =======================================================
// OPERARIOS
// =======================================================
function renderOperarios(){
  var el=document.getElementById('operarios-body');
  if(!el) return;
  var lista=(DB.operarios||[]).slice().sort(function(a,b){return (a.nombre||'').localeCompare(b.nombre||'','es');});
  var vista=window._vistaOperarios||'cards';

  // Recolectar tareas activas de todos los proyectos
  var hoy=today();
  var en7dias=new Date();en7dias.setDate(en7dias.getDate()+7);
  var en7str=en7dias.getFullYear()+'-'+String(en7dias.getMonth()+1).padStart(2,'0')+'-'+String(en7dias.getDate()).padStart(2,'0');

  function getTareasOperario(opId){
    var res=[];
    (DB.proyectos||[]).forEach(function(p){
      if(p.estado==='Cancelado'||p.estado==='Finalizado') return;
      (p.tareas||[]).forEach(function(t){
        if(opId===null ? !t.operario : t.operario===opId){
          res.push({proy:p,tarea:t,estado:tareaEstadoCached(t)});
        }
      });
    });
    return res;
  }

  var activos=lista.filter(function(o){return o.activo!==false;});
  var totalPend=0,totalAt=0;
  activos.forEach(function(o){
    var tt=getTareasOperario(o.id);
    totalPend+=tt.filter(function(x){return x.estado!=='OK'&&x.estado!=='Cancelado';}).length;
    totalAt+=tt.filter(function(x){return x.estado==='Atrasado';}).length;
  });

  var h='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">'+
    '<div>'+
      '<div style="font-size:16px;font-weight:700">👷 Operarios</div>'+
      '<div style="font-size:11px;color:var(--text2);margin-top:2px">'+lista.length+' registrado'+(lista.length!==1?'s':'')+' &middot; '+activos.length+' activos</div>'+
    '</div>'+
    '<div style="display:flex;gap:8px;align-items:center">'+
      '<div style="display:flex;border:1px solid var(--border);border-radius:var(--r);overflow:hidden">'+
        '<button onclick="window._vistaOperarios=&quot;cards&quot;;renderOperarios()" style="padding:6px 14px;font-size:12px;border:none;cursor:pointer;background:'+(vista==='cards'?'var(--primary)':'var(--surface2)')+';color:'+(vista==='cards'?'#fff':'var(--text2)')+'">Cards</button>'+
        '<button onclick="window._vistaOperarios=&quot;tabla&quot;;renderOperarios()" style="padding:6px 14px;font-size:12px;border:none;border-left:1px solid var(--border);cursor:pointer;background:'+(vista==='tabla'?'var(--primary)':'var(--surface2)')+';color:'+(vista==='tabla'?'#fff':'var(--text2)')+'">Tabla</button>'+
        '<button onclick="window._vistaOperarios=&quot;kanban&quot;;renderOperarios()" style="padding:6px 14px;font-size:12px;border:none;border-left:1px solid var(--border);cursor:pointer;background:'+(vista==='kanban'?'var(--primary)':'var(--surface2)')+';color:'+(vista==='kanban'?'#fff':'var(--text2)')+'">Kanban</button>'+
      '</div>'+
      '<button class="btn btn-p" onclick="modalOperario(-1)">+ Nuevo operario</button>'+
    '</div>'+
  '</div>'+
  // Stats globales
  '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-bottom:16px">'+
    '<div class="stat"><div class="stat-n blue">'+activos.length+'</div><div class="stat-l">Activos</div></div>'+
    '<div class="stat"><div class="stat-n amber">'+totalPend+'</div><div class="stat-l">Tareas pend.</div></div>'+
    '<div class="stat"><div class="stat-n red">'+totalAt+'</div><div class="stat-l">Atrasadas</div></div>'+
    '<div class="stat"><div class="stat-n">'+lista.length+'</div><div class="stat-l">Total</div></div>'+
  '</div>';

  if(!lista.length){
    h+='<div class="card"><div class="card-body"><div class="empty">Sin operarios registrados.</div></div></div>';
    el.innerHTML=h;return;
  }

  // ===== VISTA CARDS =====
  if(vista==='cards'){
    h+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">';
    lista.forEach(function(o){
      var tareasAsig=getTareasOperario(o.id);
      var pendientes=tareasAsig.filter(function(x){return x.estado!=='OK'&&x.estado!=='Cancelado';});
      var atrasadas=pendientes.filter(function(x){return x.estado==='Atrasado';});
      h+='<div class="card" style="'+(o.activo===false?'opacity:.6':'')+'">'+
        '<div class="ch">'+
          '<div style="display:flex;align-items:center;gap:10px">'+
            '<div style="width:36px;height:36px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#fff;flex-shrink:0">'+
              (o.nombre||'?')[0].toUpperCase()+
            '</div>'+
            '<div><div style="font-weight:700;font-size:13px">'+o.nombre+'</div>'+
            '<div style="font-size:11px;color:var(--text2)">'+(o.especialidad||'--')+'</div></div>'+
          '</div>'+
          '<div style="display:flex;gap:4px;align-items:center">'+
            '<span style="background:'+(o.activo===false?'#2a2a2a':'#0a2a0a')+';color:'+(o.activo===false?'#666':'#66bb6a')+';padding:2px 8px;border-radius:8px;font-size:10px;font-weight:700">'+(o.activo===false?'Inactivo':'Activo')+'</span>'+
            '<button class="btn btn-sm" onclick="modalOperario('+o.id+')">✏️</button>'+
            '<button class="btn btn-sm" style="color:var(--red)" onclick="eliminarOperario('+o.id+')">X</button>'+
          '</div>'+
        '</div>'+
        '<div class="card-body">'+
          (o.tel?'<div style="font-size:11px;color:var(--text2);margin-bottom:8px">📞 '+o.tel+'</div>':'')+
          '<div style="display:flex;gap:8px;margin-bottom:'+(pendientes.length?'10':'0')+'px">'+
            '<div style="background:var(--surface3);border-radius:5px;padding:6px 10px;text-align:center;flex:1"><div style="font-size:14px;font-weight:700;color:'+(atrasadas.length>0?'var(--red)':pendientes.length>0?'var(--amber)':'var(--green)')+'">'+pendientes.length+'</div><div style="font-size:9px;color:var(--text2)">Pend.</div></div>'+
            '<div style="background:var(--surface3);border-radius:5px;padding:6px 10px;text-align:center;flex:1"><div style="font-size:14px;font-weight:700;color:var(--red)">'+atrasadas.length+'</div><div style="font-size:9px;color:var(--text2)">Atras.</div></div>'+
            '<div style="background:var(--surface3);border-radius:5px;padding:6px 10px;text-align:center;flex:1"><div style="font-size:14px;font-weight:700">'+tareasAsig.length+'</div><div style="font-size:9px;color:var(--text2)">Total</div></div>'+
          '</div>'+
          (pendientes.length?
            '<div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">Pendientes</div>'+
            pendientes.slice(0,4).map(function(x){
              return '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="cerrarBusqueda();goTo(&quot;proyectos&quot;);setTimeout(function(){abrirProyecto('+x.proy.id+');},200)">'+
                '<div><div style="font-size:11px">'+x.tarea.desc.slice(0,35)+(x.tarea.desc.length>35?'...':'')+'</div>'+
                '<div style="font-size:10px;color:var(--text2)">'+x.proy.numero+'</div></div>'+
                '<div style="display:flex;align-items:center;gap:4px">'+
                  (x.tarea.fechaCumplimiento?'<span style="font-size:10px;color:'+(x.estado==='Atrasado'?'var(--red)':'var(--text2)')+'">'+x.tarea.fechaCumplimiento+'</span>':'')+
                  tareaPill(x.estado)+
                '</div>'+
              '</div>';
            }).join('')+
            (pendientes.length>4?'<div style="font-size:10px;color:var(--text2);margin-top:4px">...y '+(pendientes.length-4)+' más</div>':''):
            '<div style="font-size:11px;color:var(--green)">Sin tareas pendientes ✓</div>')+
        '</div></div>';
    });
    h+='</div>';
  }

  // ===== VISTA TABLA =====
  else if(vista==='tabla'){
    h+='<div class="card"><div class="card-body">'+
      '<table style="width:100%;border-collapse:collapse">'+
        '<thead><tr style="background:var(--surface2)">'+
          '<th style="padding:6px 10px;font-size:10px;text-align:left">Operario</th>'+
          '<th style="padding:6px 10px;font-size:10px;text-align:left">Especialidad</th>'+
          '<th style="padding:6px 10px;font-size:10px;text-align:center">Estado</th>'+
          '<th style="padding:6px 10px;font-size:10px;text-align:center">Pend.</th>'+
          '<th style="padding:6px 10px;font-size:10px;text-align:center">Atrasadas</th>'+
          '<th style="padding:6px 10px;font-size:10px;text-align:center">Prox. 7 días</th>'+
          '<th style="padding:6px 10px;font-size:10px;text-align:center">Total asig.</th>'+
          '<th style="padding:6px 10px;font-size:10px;text-align:right">MO asig. $</th>'+
          '<th style="padding:6px 10px;font-size:10px;text-align:center">Carga</th>'+
          '<th style="padding:6px 10px;font-size:10px"></th>'+
        '</tr></thead><tbody>'+
        lista.map(function(o){
          var tt=getTareasOperario(o.id);
          var pend=tt.filter(function(x){return x.estado!=='OK'&&x.estado!=='Cancelado';});
          var atr=pend.filter(function(x){return x.estado==='Atrasado';});
          var prox7=pend.filter(function(x){return x.tarea.fechaCumplimiento&&x.tarea.fechaCumplimiento<=en7str&&x.tarea.fechaCumplimiento>=hoy;});
          var moAsig=pend.reduce(function(a,x){return a+(parseFloat(x.tarea.costoMO)||0);},0);
          var cargaPct=Math.min(100,pend.length*20); // 5 tareas = 100%
          var cargaColor=cargaPct>=80?'var(--red)':cargaPct>=40?'var(--amber)':'var(--green)';
          return '<tr style="border-bottom:1px solid var(--border)'+(o.activo===false?';opacity:.6':'')+'">'+
            '<td style="padding:6px 10px">'+
              '<div style="display:flex;align-items:center;gap:8px">'+
                '<div style="width:28px;height:28px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;flex-shrink:0">'+(o.nombre||'?')[0].toUpperCase()+'</div>'+
                '<strong style="font-size:12px">'+o.nombre+'</strong>'+
              '</div>'+
            '</td>'+
            '<td style="padding:6px 10px;font-size:11px;color:var(--text2)">'+(o.especialidad||'--')+'</td>'+
            '<td style="padding:6px 10px;text-align:center"><span style="background:'+(o.activo===false?'#2a2a2a':'#0a2a0a')+';color:'+(o.activo===false?'#666':'#66bb6a')+';padding:1px 7px;border-radius:8px;font-size:10px">'+(o.activo===false?'Inactivo':'Activo')+'</span></td>'+
            '<td style="padding:6px 10px;text-align:center;font-weight:700;color:'+(pend.length>3?'var(--amber)':'var(--text)')+'">'+pend.length+'</td>'+
            '<td style="padding:6px 10px;text-align:center;font-weight:700;color:'+(atr.length>0?'var(--red)':'var(--text3)')+'">'+atr.length+'</td>'+
            '<td style="padding:6px 10px;text-align:center;font-size:11px;color:'+(prox7.length>0?'var(--amber)':'var(--text3)')+'">'+prox7.length+'</td>'+
            '<td style="padding:6px 10px;text-align:center;font-size:11px">'+tt.length+'</td>'+
            '<td style="padding:6px 10px;text-align:right;font-size:11px;font-weight:700">'+(moAsig>0?'$'+Math.round(moAsig).toLocaleString('es-AR'):'--')+'</td>'+
            '<td style="padding:6px 10px;min-width:80px">'+
              '<div style="background:var(--surface3);border-radius:3px;height:6px;overflow:hidden">'+
                '<div style="height:100%;background:'+cargaColor+';width:'+cargaPct+'%"></div>'+
              '</div>'+
              '<div style="font-size:9px;color:'+cargaColor+';margin-top:2px;text-align:center">'+(cargaPct>=80?'Alta':cargaPct>=40?'Media':'Baja')+'</div>'+
            '</td>'+
            '<td style="padding:6px 10px">'+
              '<button class="btn btn-sm" onclick="modalOperario('+o.id+')">✏️</button>'+
            '</td>'+
          '</tr>';
        }).join('')+
        '</tbody></table>'+
    '</div></div>';
  }

  // ===== VISTA KANBAN =====
  else if(vista==='kanban'){
    var columnas=[{id:null,label:'Sin asignar',color:'#555'}];
    activos.forEach(function(o){columnas.push({id:o.id,label:o.nombre,color:'var(--primary)',esp:o.especialidad});});

    h+='<div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px">';
    columnas.forEach(function(col){
      var tareas=getTareasOperario(col.id).filter(function(x){return x.estado!=='OK'&&x.estado!=='Cancelado';});
      h+='<div style="min-width:220px;max-width:260px;flex-shrink:0">'+
        '<div style="background:var(--surface2);border-radius:var(--r);padding:8px 12px;margin-bottom:8px;border-left:3px solid '+col.color+'">'+
          '<div style="font-weight:700;font-size:12px">'+col.label+'</div>'+
          (col.esp?'<div style="font-size:10px;color:var(--text2)">'+col.esp+'</div>':'')+
          '<div style="font-size:10px;color:var(--text2);margin-top:2px">'+tareas.length+' tarea'+(tareas.length!==1?'s':'')+'</div>'+
        '</div>'+
        tareas.map(function(x){
          var color=x.estado==='Atrasado'?'#3a0000':x.tarea.fechaCumplimiento&&x.tarea.fechaCumplimiento<=en7str?'#2a1a00':'var(--surface2)';
          var borderColor=x.estado==='Atrasado'?'var(--red)':x.tarea.fechaCumplimiento&&x.tarea.fechaCumplimiento<=en7str?'var(--amber)':'var(--border)';
          return '<div style="background:'+color+';border:1px solid '+borderColor+';border-radius:var(--r);padding:8px 10px;margin-bottom:6px;cursor:pointer" onclick="cerrarBusqueda();goTo(&quot;proyectos&quot;);setTimeout(function(){abrirProyecto('+x.proy.id+');},200)">'+
            '<div style="font-size:11px;font-weight:600;margin-bottom:4px">'+x.tarea.desc+'</div>'+
            '<div style="display:flex;justify-content:space-between;align-items:center">'+
              '<span style="font-size:10px;color:var(--text2);background:var(--surface3);padding:1px 6px;border-radius:8px">'+x.proy.numero+'</span>'+
              '<div style="display:flex;align-items:center;gap:4px">'+
                (x.tarea.fechaCumplimiento?'<span style="font-size:10px;color:'+(x.estado==='Atrasado'?'var(--red)':'var(--text2)')+'">'+x.tarea.fechaCumplimiento+'</span>':'')+
                tareaPill(x.estado)+
              '</div>'+
            '</div>'+
            (parseFloat(x.tarea.costoMO)?'<div style="font-size:10px;color:var(--amber);margin-top:3px">MO: $'+Math.round(parseFloat(x.tarea.costoMO)).toLocaleString('es-AR')+'</div>':'')+
          '</div>';
        }).join('')+
        (!tareas.length?'<div style="font-size:11px;color:var(--text3);text-align:center;padding:16px 0">Sin tareas pendientes</div>':'')+
      '</div>';
    });
    h+='</div>';
  }

  el.innerHTML=h;
}

function modalOperario(id){
  var o=id>=0?(DB.operarios||[]).find(function(x){return x.id===id;}):null;
  var especialidades=['Instalacion','Programacion','Mantenimiento','Electricidad','Camaras','Alarmas','Redes','Otro'];
  openModal(o?'Editar operario':'Nuevo operario',
    '<div class="fg2">'+
      '<div class="fg full"><label>Nombre *</label><input id="op-nombre" value="'+(o?o.nombre||'':'')+'" placeholder="Nombre completo"></div>'+
      '<div class="fg"><label>Especialidad</label>'+
        '<input id="op-esp" value="'+(o?o.especialidad||'':'')+'" list="op-esp-dl" placeholder="Especialidad">'+
        '<datalist id="op-esp-dl">'+especialidades.map(function(e){return '<option>'+e+'</option>';}).join('')+'</datalist></div>'+
      '<div class="fg"><label>Telefono / contacto</label><input id="op-tel" value="'+(o?o.tel||'':'')+'" placeholder="Tel o WhatsApp"></div>'+
      '<div class="fg full"><label>Notas</label><textarea id="op-notas" rows="2">'+(o?o.notas||'':'')+'</textarea></div>'+
      '<div class="fg"><label>Estado</label>'+
        '<select id="op-activo" style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;background:var(--surface2);color:var(--text)">'+
          '<option value="1"'+((!o||o.activo!==false)?' selected':'')+'>Activo</option>'+
          '<option value="0"'+((o&&o.activo===false)?' selected':'')+'>Inactivo</option>'+
        '</select></div>'+
    '</div>',
    function(){
      var nombre=document.getElementById('op-nombre').value.trim();
      if(!nombre){alert('El nombre es obligatorio.');return false;}
      if(o){
        o.nombre=nombre;
        o.especialidad=document.getElementById('op-esp').value.trim();
        o.tel=document.getElementById('op-tel').value.trim();
        o.notas=document.getElementById('op-notas').value.trim();
        o.activo=document.getElementById('op-activo').value==='1';
      } else {
        if(!DB.operarios) DB.operarios=[];
        DB.operarios.push({
          id:DB.nid++,
          nombre:nombre,
          especialidad:document.getElementById('op-esp').value.trim(),
          tel:document.getElementById('op-tel').value.trim(),
          notas:document.getElementById('op-notas').value.trim(),
          activo:true
        });
      }
      save();renderOperarios();return true;
    });
}

function eliminarOperario(id){
  var o=(DB.operarios||[]).find(function(x){return x.id===id;});
  if(!o) return;
  // Verificar si tiene tareas asignadas
  var tieneTareas=(DB.proyectos||[]).some(function(p){
    return (p.tareas||[]).some(function(t){return t.operario===id;});
  });
  var msg='Eliminar operario "'+o.nombre+'"?';
  if(tieneTareas) msg+='\n\nTiene tareas asignadas. Las tareas perderán la asignación pero no se eliminarán.';
  if(!confirm(msg)) return;
  // Desasignar tareas
  if(tieneTareas){
    (DB.proyectos||[]).forEach(function(p){
      (p.tareas||[]).forEach(function(t){if(t.operario===id) delete t.operario;});
    });
  }
  DB.operarios=DB.operarios.filter(function(x){return x.id!==id;});
  save();renderOperarios();
}

// PROVEEDORES
// =======================================================
function renderProveedores(){
  var el=document.getElementById('prov-body');
  if(!el) return;
  var h='<div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:10px"><button class="btn btn-p" onclick="modalProveedor(-1)">+ Nuevo proveedor</button></div>';
  if(!DB.proveedores.length){h+='<div class="empty">Sin proveedores registrados.</div>';el.innerHTML=h;return;}
  h+='<div class="card"><div class="twrap"><table><thead><tr><th>Empresa</th><th>Contacto</th><th>Telefono</th><th>Email</th><th>Rubro</th><th>Condiciones</th><th></th></tr></thead><tbody>';
  var provSorted=[...DB.proveedores].sort(function(a,b){
    var ea=(a.empresa||'').toLowerCase(); var eb=(b.empresa||'').toLowerCase();
    if(ea!==eb) return ea.localeCompare(eb,'es');
    return (a.rubro||'').toLowerCase().localeCompare((b.rubro||'').toLowerCase(),'es');
  });
  provSorted.forEach(function(p,i){
    var i=DB.proveedores.indexOf(p);
    h+='<tr><td><strong>'+p.empresa+'</strong></td><td>'+(p.contacto||'--')+'</td><td>'+(p.tel||'--')+'</td><td>'+(p.email||'--')+'</td><td>'+(p.rubro||'--')+'</td><td style="font-size:11px">'+(p.condiciones||'--')+'</td>'+
      '<td style="display:flex;gap:4px"><button class="btn btn-sm" onclick="modalProveedor('+i+')">Ed.</button><button class="btn btn-sm" style="color:var(--red)" onclick="borrarProveedor('+p.id+')">X</button></td></tr>';
  });
  h+='</tbody></table></div></div>';
  el.innerHTML=h;
}

function modalProveedor(idx){
  var p=idx>=0?DB.proveedores[idx]:{};
  openModal(idx>=0?'Editar proveedor':'Nuevo proveedor',
    '<div class="fg2">'+
      '<div class="fg"><label>Empresa *</label><input id="pv-emp" value="'+(p.empresa||'')+'"></div>'+
      '<div class="fg"><label>Rubro</label><input id="pv-rub" value="'+(p.rubro||'')+'"></div>'+
      '<div class="fg"><label>Contacto</label><input id="pv-con" value="'+(p.contacto||'')+'"></div>'+
      '<div class="fg"><label>Telefono</label><input id="pv-tel" value="'+(p.tel||'')+'"></div>'+
      '<div class="fg"><label>Email</label><input id="pv-email" type="email" value="'+(p.email||'')+'"></div>'+
      '<div class="fg"><label>Condiciones</label><input id="pv-cond" value="'+(p.condiciones||'')+'"></div>'+
      '<div class="fg full"><label>Observaciones</label><textarea id="pv-obs">'+(p.obs||'')+'</textarea></div>'+
    '</div>',
    function(){
      var emp=document.getElementById('pv-emp').value.trim();
      if(!emp){alert('El nombre de la empresa es obligatorio.');return false;}
      var obj={id:idx>=0?p.id:DB.nid++,empresa:emp,rubro:document.getElementById('pv-rub').value,contacto:document.getElementById('pv-con').value,tel:document.getElementById('pv-tel').value,email:document.getElementById('pv-email').value,condiciones:document.getElementById('pv-cond').value,obs:document.getElementById('pv-obs').value};
      if(idx>=0) DB.proveedores[idx]=obj; else DB.proveedores.push(obj);
      save();renderProveedores();return true;
    });
}

function borrarProveedor(id){
  if(!confirm('Eliminar este proveedor?')) return;
  DB.proveedores=DB.proveedores.filter(function(p){return p.id!==id;});
  save();renderProveedores();
}

// =======================================================
// REPORTES
// =======================================================
function cerrarReporte(){ var el=document.getElementById('reporte-resultado');if(el)el.innerHTML=''; }

function reporteContainer(titulo,html){
  document.getElementById('reporte-resultado').innerHTML=
    '<div class="card" style="margin-top:10px"><div class="ch"><div class="ct">'+titulo+'</div>'+
    '<button class="btn btn-sm" onclick="cerrarReporte()">X Cerrar</button></div><div class="card-body">'+html+'</div></div>';
}

function reporteStockCritico(){
  var tc=(DB.config&&DB.config.tipoCambio)||1;
  var criticos=DB.componentes.filter(function(c){return stockActual(c.id)<=(parseFloat(c.min)||0)&&(parseFloat(c.min)||0)>0;});
  if(!criticos.length){reporteContainer('Stock critico','<p style="color:var(--green)">No hay componentes en stock critico.</p>');return;}
  var h='<table><thead><tr><th>Codigo</th><th>Componente</th><th>Stock</th><th>Minimo</th><th>Faltante</th><th>Val. rep. $</th></tr></thead><tbody>';
  criticos.forEach(function(c){
    var actual=stockActual(c.id);var faltante=Math.max(0,(c.min||0)-actual);var valor=faltante*(parseFloat(c.costo)||0);
    h+='<tr><td class="mono" style="font-size:10px">'+c.codigo+'</td><td>'+c.desc+'</td><td style="color:var(--red);font-weight:700">'+actual+'</td><td>'+(c.min||0)+'</td><td>'+faltante+'</td><td>$'+Math.round(valor).toLocaleString('es-AR')+'</td></tr>';
  });
  h+='</tbody></table>';
  reporteContainer('Stock critico', h);
}

function reporteInventario(){
  var tc=(DB.config&&DB.config.tipoCambio)||1;
  var areas=['Fabrica','Mantenimiento','Instalacion'];
  var h='<table><thead><tr><th>Area</th><th>Componentes</th><th>Valor $</th><th>Valor U$S</th></tr></thead><tbody>';
  var totalVal=0;
  areas.forEach(function(area){
    var comps=DB.componentes.filter(function(c){return c.area===area;});
    var val=comps.reduce(function(a,c){return a+stockActual(c.id)*(parseFloat(c.costo)||0);},0);
    totalVal+=val;
    h+='<tr><td>'+area+'</td><td>'+comps.length+'</td><td>$'+Math.round(val).toLocaleString('es-AR')+'</td><td>U$S '+(tc>0?(val/tc).toFixed(0):0)+'</td></tr>';
  });
  var totalReal=DB.componentes.reduce(function(a,c){return a+stockActual(c.id)*(parseFloat(c.costo)||0);},0);
  h+='<tr style="font-weight:700"><td>TOTAL</td><td>'+DB.componentes.length+'</td><td>$'+Math.round(totalReal).toLocaleString('es-AR')+'</td><td>U$S '+(tc>0?(totalReal/tc).toFixed(0):0)+'</td></tr>';
  h+='</tbody></table>';
  reporteContainer('Inventario por area', h);
}

function reporteMovimientos(){
  var tc=(DB.config&&DB.config.tipoCambio)||1;
  var hace30=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
  var recientes=DB.movimientos.filter(function(m){return m.fecha>=hace30;});
  var entradas=recientes.filter(function(m){return m.tipo==='Entrada';});
  var salidas=recientes.filter(function(m){return m.tipo!=='Entrada';});
  var totalEnt=entradas.reduce(function(a,m){return a+(parseFloat(m.precio)||0)*(parseFloat(m.cant)||0);},0);
  var totalSal=salidas.reduce(function(a,m){return a+(parseFloat(m.precio)||0)*(parseFloat(m.cant)||0);},0);
  var h='<p style="font-size:12px;color:var(--text2);margin-bottom:12px">Ultimos 30 dias</p>';
  h+='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px">'+
    '<div class="stat"><div class="stat-n green">'+entradas.length+'</div><div class="stat-l">Entradas</div></div>'+
    '<div class="stat"><div class="stat-n red">'+salidas.length+'</div><div class="stat-l">Salidas</div></div>'+
    '<div class="stat"><div class="stat-n">'+recientes.length+'</div><div class="stat-l">Total</div></div></div>';
  h+='<table><thead><tr><th>Tipo</th><th>Movimientos</th><th>Valor $</th></tr></thead><tbody>';
  h+='<tr><td><span class="pill p-g">Entradas</span></td><td>'+entradas.length+'</td><td>$'+Math.round(totalEnt).toLocaleString('es-AR')+'</td></tr>';
  h+='<tr><td><span class="pill p-r">Salidas</span></td><td>'+salidas.length+'</td><td>$'+Math.round(totalSal).toLocaleString('es-AR')+'</td></tr>';
  h+='</tbody></table>';
  reporteContainer('Movimientos (ultimos 30 dias)', h);
}

function reporteUbicaciones(){
  var grupos={};
  DB.componentes.forEach(function(c){
    var key=(c.ubicacion||'').trim()||'__sin__';
    if(!grupos[key]) grupos[key]=[];
    grupos[key].push(c);
  });
  var keys=Object.keys(grupos).filter(function(k){return k!=='__sin__';}).sort();
  if(grupos['__sin__']) keys.push('__sin__');

  var html='<div style="display:flex;gap:8px;margin-bottom:14px">'+
    '<input id="ubic-q" type="text" placeholder="Buscar..." oninput="ubicRenderL()" style="padding:5px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;background:var(--surface2);color:var(--text);flex:1">'+
  '</div><div id="ubic-body"></div>';
  reporteContainer('Ubicaciones / Cajoneras', html);

  window._ubicGruposL=grupos; window._ubicKeysL=keys;
  window.ubicRenderL=function(){
    var q=(document.getElementById('ubic-q')?document.getElementById('ubic-q').value||'':'').toLowerCase();
    var body=document.getElementById('ubic-body'); if(!body) return;
    var h='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px">';
    var hayAlgo=false;
    window._ubicKeysL.forEach(function(key){
      var comps=window._ubicGruposL[key];if(!comps) return;
      if(q){var km=key!=='__sin__'&&key.toLowerCase().includes(q);if(!km){comps=comps.filter(function(c){return (c.desc+c.codigo).toLowerCase().includes(q);});}}
      if(!comps.length) return;
      hayAlgo=true;
      var criticos=comps.filter(function(c){return stockActual(c.id)<=(parseFloat(c.min)||0)&&(parseFloat(c.min)||0)>0;}).length;
      var titulo=key==='__sin__'?'Sin cajonera asignada':'Cajonera: '+key;
      h+='<div class="card"><div class="ch"><div class="ct">'+titulo+'</div><span style="font-size:11px;color:var(--text2)">'+comps.length+' items'+(criticos>0?' - <span style="color:var(--amber)">'+criticos+' criticos</span>':'')+'</span></div>'+
        '<div class="card-body" style="padding:8px 14px"><table style="width:100%;border-collapse:collapse">'+
        comps.map(function(c){
          var qty=stockActual(c.id);var min=parseFloat(c.min)||0;
          var sc=qty<=0?'var(--red)':qty<=min?'var(--amber)':'var(--green)';
          return '<tr style="border-bottom:1px solid var(--border)">'+
            '<td style="padding:4px 0;font-size:10px;font-family:monospace;color:var(--text2)">'+c.codigo+'</td>'+
            '<td style="padding:4px 6px;font-size:11px">'+c.desc+(c.nroCajon?' '+cajonBadge('',c.nroCajon):'')+'</td>'+
            '<td style="padding:4px 0;font-size:12px;font-weight:700;text-align:right;color:'+sc+'">'+qty+'</td>'+
          '</tr>';
        }).join('')+'</table></div></div>';
    });
    if(!hayAlgo) h+='<p style="color:var(--text2);font-size:12px">Sin resultados.</p>';
    h+='</div>';
    body.innerHTML=h;
  };
  window.ubicRenderL();
}

function limpiarFiltrosSM(){
  var d=document.getElementById('rsm-desde');if(d) d.value='';
  var h=document.getElementById('rsm-hasta');if(h) h.value='';
  var c=document.getElementById('rsm-comp'); if(c) c.value='';
  var m=document.getElementById('rsm-motivo');if(m) m.value='';
  reporteSalidasPorMotivo();
}

function reporteSalidasPorMotivo(){
  var hoy=today();var primerMes=hoy.slice(0,7)+'-01';
  var fDesde=document.getElementById('rsm-desde')?document.getElementById('rsm-desde').value:primerMes;
  var fHasta=document.getElementById('rsm-hasta')?document.getElementById('rsm-hasta').value:hoy;
  var fComp=(document.getElementById('rsm-comp')?document.getElementById('rsm-comp').value||'':'').toLowerCase();
  var fMotivo=document.getElementById('rsm-motivo')?document.getElementById('rsm-motivo').value:'';
  var salidas=DB.movimientos.filter(function(m){
    if(m.tipo!=='Salida manual') return false;
    if(fDesde&&m.fecha<fDesde) return false;
    if(fHasta&&m.fecha>fHasta) return false;
    if(fComp){var comp=DB.componentes.find(function(c){return c.id===(m.cid||m.compId);});if(!comp||!(comp.desc+comp.codigo).toLowerCase().includes(fComp)) return false;}
    if(fMotivo&&(m.nota||'').trim()!==fMotivo) return false;
    return true;
  });
  var grupos={};
  salidas.forEach(function(m){
    var mot=(m.nota||'Sin motivo').trim()||'Sin motivo';
    if(!grupos[mot]) grupos[mot]={movimientos:[],totalValor:0};
    var comp=DB.componentes.find(function(c){return c.id===(m.cid||m.compId);})||{};
    var valor=(parseFloat(m.cant)||0)*(parseFloat(comp.costo||comp.precio)||0);
    grupos[mot].movimientos.push({m:m,comp:comp,valor:valor});
    grupos[mot].totalValor+=valor;
  });
  var mots=Object.keys(grupos).sort(function(a,b){return grupos[b].totalValor-grupos[a].totalValor;});
  var totalValor=salidas.reduce(function(a,m){var comp=DB.componentes.find(function(c){return c.id===(m.cid||m.compId);})||{};return a+(parseFloat(m.cant)||0)*(parseFloat(comp.costo||comp.precio)||0);},0);
  var motivosDisp=[...new Set(DB.movimientos.filter(function(m){return m.tipo==='Salida manual'&&m.nota;}).map(function(m){return m.nota.trim();}))].sort();
  var h='<div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px">'+
    '<div><label style="font-size:11px;color:var(--text2);display:block;margin-bottom:3px">Desde</label><input id="rsm-desde" type="date" value="'+fDesde+'" onchange="reporteSalidasPorMotivo()" style="padding:5px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;background:var(--surface2);color:var(--text)"></div>'+
    '<div><label style="font-size:11px;color:var(--text2);display:block;margin-bottom:3px">Hasta</label><input id="rsm-hasta" type="date" value="'+fHasta+'" onchange="reporteSalidasPorMotivo()" style="padding:5px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;background:var(--surface2);color:var(--text)"></div>'+
    '<div><label style="font-size:11px;color:var(--text2);display:block;margin-bottom:3px">Componente</label><input id="rsm-comp" value="'+(fComp||'')+'" placeholder="Filtrar..." onchange="reporteSalidasPorMotivo()" style="padding:5px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;background:var(--surface2);color:var(--text)"></div>'+
    '<div><label style="font-size:11px;color:var(--text2);display:block;margin-bottom:3px">Motivo</label><select id="rsm-motivo" onchange="reporteSalidasPorMotivo()" style="padding:5px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;background:var(--surface2);color:var(--text)"><option value="">Todos</option>'+motivosDisp.map(function(mot){return '<option value="'+mot+'"'+(mot===fMotivo?' selected':'')+'>'+mot+'</option>';}).join('')+'</select></div>'+
    '<button class="btn btn-sm" onclick="limpiarFiltrosSM()">X Limpiar</button></div>';
  if(!salidas.length){h+='<div class="empty">Sin salidas manuales en el periodo.</div>';reporteContainer('Salidas por motivo',h);return;}
  h+='<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px">'+
    '<div class="stat"><div class="stat-n">'+salidas.length+'</div><div class="stat-l">Movimientos</div></div>'+
    '<div class="stat"><div class="stat-n">'+mots.length+'</div><div class="stat-l">Motivos</div></div>'+
    '<div class="stat"><div class="stat-n red">$'+Math.round(totalValor).toLocaleString('es-AR')+'</div><div class="stat-l">Valor total</div></div></div>';
  mots.forEach(function(mot){
    var g=grupos[mot];var pct=totalValor>0?Math.round(g.totalValor/totalValor*100):0;
    h+='<div class="card" style="margin-bottom:10px"><div class="ch"><div class="ct">'+mot+'</div><div style="display:flex;gap:10px;font-size:12px"><span style="color:var(--text2)">'+g.movimientos.length+' mov.</span><span style="font-weight:700;color:var(--red)">$'+Math.round(g.totalValor).toLocaleString('es-AR')+'</span><span style="color:var(--text2);font-size:11px">'+pct+'%</span></div></div>'+
      '<div class="card-body"><div style="background:var(--surface2);border-radius:3px;height:4px;margin-bottom:10px;overflow:hidden"><div style="height:100%;background:var(--red);width:'+pct+'%"></div></div>'+
      '<table style="width:100%;border-collapse:collapse"><thead><tr style="background:var(--surface2)"><th style="padding:5px 10px;font-size:10px">Fecha</th><th style="padding:5px 10px;font-size:10px">Codigo</th><th style="padding:5px 10px;font-size:10px">Componente</th><th style="padding:5px 10px;font-size:10px;text-align:center">Cant.</th><th style="padding:5px 10px;font-size:10px;text-align:right">Valor $</th></tr></thead><tbody>'+
      g.movimientos.map(function(item){return '<tr style="border-bottom:1px solid var(--border)"><td style="padding:5px 10px;font-size:11px">'+item.m.fecha+'</td><td style="padding:5px 10px;font-size:11px;font-family:monospace">'+(item.comp.codigo||'--')+'</td><td style="padding:5px 10px;font-size:11px">'+(item.comp.desc||'--')+'</td><td style="padding:5px 10px;font-size:11px;text-align:center;font-weight:700">'+item.m.cant+(item.comp.unidad?' '+item.comp.unidad:'')+'</td><td style="padding:5px 10px;font-size:11px;text-align:right">'+(item.valor>0?'$'+Math.round(item.valor).toLocaleString('es-AR'):'--')+'</td></tr>';}).join('')+
      '</tbody></table></div></div>';
  });
  reporteContainer('Salidas por motivo', h);
}

function limpiarFiltrosREO(){
  var d=document.getElementById('reo-desde');if(d) d.value='';
  var h=document.getElementById('reo-hasta');if(h) h.value='';
  var c=document.getElementById('reo-comp'); if(c) c.value='';
  var o=document.getElementById('reo-origen');if(o) o.value='';
  reporteEntradasPorOrigen();
}

function reporteEntradasPorOrigen(){
  var hoy=today();var primerMes=hoy.slice(0,7)+'-01';
  var fDesde=document.getElementById('reo-desde')?document.getElementById('reo-desde').value:primerMes;
  var fHasta=document.getElementById('reo-hasta')?document.getElementById('reo-hasta').value:hoy;
  var fComp=(document.getElementById('reo-comp')?document.getElementById('reo-comp').value||'':'').toLowerCase();
  var fOrigen=document.getElementById('reo-origen')?document.getElementById('reo-origen').value:'';
  var entradas=DB.movimientos.filter(function(m){
    if(m.tipo!=='Entrada') return false;
    if(fDesde&&m.fecha<fDesde) return false;
    if(fHasta&&m.fecha>fHasta) return false;
    if(fComp){var comp=DB.componentes.find(function(c){return c.id===(m.cid||m.compId);});if(!comp||!(comp.desc+comp.codigo).toLowerCase().includes(fComp)) return false;}
    if(fOrigen&&(m.origen||'Sin origen').trim()!==fOrigen) return false;
    return true;
  });
  var grupos={};
  entradas.forEach(function(m){
    var ori=(m.origen||'Sin origen').trim()||'Sin origen';
    if(!grupos[ori]) grupos[ori]={movimientos:[],totalValor:0};
    var comp=DB.componentes.find(function(c){return c.id===(m.cid||m.compId);})||{};
    var valor=(parseFloat(m.cant)||0)*(parseFloat(comp.costo||comp.precio)||0);
    grupos[ori].movimientos.push({m:m,comp:comp,valor:valor});
    grupos[ori].totalValor+=valor;
  });
  var oris=Object.keys(grupos).sort(function(a,b){return grupos[b].totalValor-grupos[a].totalValor;});
  var totalValor=entradas.reduce(function(a,m){var comp=DB.componentes.find(function(c){return c.id===(m.cid||m.compId);})||{};return a+(parseFloat(m.cant)||0)*(parseFloat(comp.costo||comp.precio)||0);},0);
  var origenesDisp=[...new Set(DB.movimientos.filter(function(m){return m.tipo==='Entrada';}).map(function(m){return (m.origen||'Sin origen').trim();}))].sort();
  var h='<div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px">'+
    '<div><label style="font-size:11px;color:var(--text2);display:block;margin-bottom:3px">Desde</label><input id="reo-desde" type="date" value="'+fDesde+'" onchange="reporteEntradasPorOrigen()" style="padding:5px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;background:var(--surface2);color:var(--text)"></div>'+
    '<div><label style="font-size:11px;color:var(--text2);display:block;margin-bottom:3px">Hasta</label><input id="reo-hasta" type="date" value="'+fHasta+'" onchange="reporteEntradasPorOrigen()" style="padding:5px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;background:var(--surface2);color:var(--text)"></div>'+
    '<div><label style="font-size:11px;color:var(--text2);display:block;margin-bottom:3px">Componente</label><input id="reo-comp" value="'+(fComp||'')+'" placeholder="Filtrar..." onchange="reporteEntradasPorOrigen()" style="padding:5px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;background:var(--surface2);color:var(--text)"></div>'+
    '<div><label style="font-size:11px;color:var(--text2);display:block;margin-bottom:3px">Origen</label><select id="reo-origen" onchange="reporteEntradasPorOrigen()" style="padding:5px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;background:var(--surface2);color:var(--text)"><option value="">Todos</option>'+origenesDisp.map(function(o){return '<option value="'+o+'"'+(o===fOrigen?' selected':'')+'>'+o+'</option>';}).join('')+'</select></div>'+
    '<button class="btn btn-sm" onclick="limpiarFiltrosREO()">X Limpiar</button></div>';
  if(!entradas.length){h+='<div class="empty">Sin entradas en el periodo.</div>';reporteContainer('Entradas por origen',h);return;}
  h+='<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px">'+
    '<div class="stat"><div class="stat-n">'+entradas.length+'</div><div class="stat-l">Movimientos</div></div>'+
    '<div class="stat"><div class="stat-n">'+oris.length+'</div><div class="stat-l">Origenes</div></div>'+
    '<div class="stat"><div class="stat-n green">$'+Math.round(totalValor).toLocaleString('es-AR')+'</div><div class="stat-l">Valor total</div></div></div>';
  oris.forEach(function(ori){
    var g=grupos[ori];var pct=totalValor>0?Math.round(g.totalValor/totalValor*100):0;
    h+='<div class="card" style="margin-bottom:10px"><div class="ch"><div class="ct">'+ori+'</div><div style="display:flex;gap:10px;font-size:12px"><span style="color:var(--text2)">'+g.movimientos.length+' mov.</span><span style="font-weight:700;color:var(--green)">$'+Math.round(g.totalValor).toLocaleString('es-AR')+'</span><span style="color:var(--text2);font-size:11px">'+pct+'%</span></div></div>'+
      '<div class="card-body"><div style="background:var(--surface2);border-radius:3px;height:4px;margin-bottom:10px;overflow:hidden"><div style="height:100%;background:var(--green);width:'+pct+'%"></div></div>'+
      '<table style="width:100%;border-collapse:collapse"><thead><tr style="background:var(--surface2)"><th style="padding:5px 10px;font-size:10px">Fecha</th><th style="padding:5px 10px;font-size:10px">Codigo</th><th style="padding:5px 10px;font-size:10px">Componente</th><th style="padding:5px 10px;font-size:10px;text-align:center">Cant.</th><th style="padding:5px 10px;font-size:10px;text-align:right">Valor $</th><th style="padding:5px 10px;font-size:10px">Ref.</th></tr></thead><tbody>'+
      g.movimientos.map(function(item){return '<tr style="border-bottom:1px solid var(--border)"><td style="padding:5px 10px;font-size:11px">'+item.m.fecha+'</td><td style="padding:5px 10px;font-size:11px;font-family:monospace">'+(item.comp.codigo||'--')+'</td><td style="padding:5px 10px;font-size:11px">'+(item.comp.desc||'--')+'</td><td style="padding:5px 10px;font-size:11px;text-align:center;font-weight:700">'+item.m.cant+(item.comp.unidad?' '+item.comp.unidad:'')+'</td><td style="padding:5px 10px;font-size:11px;text-align:right">'+(item.valor>0?'$'+Math.round(item.valor).toLocaleString('es-AR'):'--')+'</td><td style="padding:5px 10px;font-size:11px">'+(item.m.ref||'--')+'</td></tr>';}).join('')+
      '</tbody></table></div></div>';
  });
  reporteContainer('Entradas por origen', h);
}

function reporteOCporProveedor(){
  var provMap={};
  DB.ordenes.forEach(function(o){
    var prov=o.proveedor||'Sin proveedor';
    if(!provMap[prov]) provMap[prov]={ordenes:[],total:0};
    var total=o.items.reduce(function(a,i){var c=DB.componentes.find(function(x){return x.id===i.cid;})||{costo:0};return a+(parseFloat(c.costo)||0)*i.cant;},0);
    provMap[prov].ordenes.push({numero:o.numero||'--',fecha:o.fecha,estado:o.estado,total:total});
    provMap[prov].total+=total;
  });
  if(!Object.keys(provMap).length){reporteContainer('OC por proveedor','<div class="empty">Sin ordenes de compra.</div>');return;}
  var h='';
  Object.entries(provMap).sort(function(a,b){return b[1].total-a[1].total;}).forEach(function(entry){
    var prov=entry[0],data=entry[1];
    h+='<div class="card" style="margin-bottom:10px"><div class="ch"><div class="ct">'+prov+'</div><div style="font-size:12px;font-weight:700">$'+Math.round(data.total).toLocaleString('es-AR')+'</div></div>'+
      '<div class="card-body"><table style="width:100%;border-collapse:collapse"><thead><tr style="background:var(--surface2)"><th style="padding:5px 10px;font-size:10px">N OC</th><th style="padding:5px 10px;font-size:10px">Fecha</th><th style="padding:5px 10px;font-size:10px">Estado</th><th style="padding:5px 10px;font-size:10px;text-align:right">Total</th></tr></thead><tbody>'+
      data.ordenes.map(function(o){return '<tr style="border-bottom:1px solid var(--border)"><td style="padding:5px 10px;font-family:monospace">'+o.numero+'</td><td style="padding:5px 10px;font-size:11px">'+o.fecha+'</td><td style="padding:5px 10px"><span class="pill p-b">'+o.estado+'</span></td><td style="padding:5px 10px;text-align:right;font-weight:700">$'+Math.round(o.total).toLocaleString('es-AR')+'</td></tr>';}).join('')+
      '</tbody></table></div></div>';
  });
  reporteContainer('OC por proveedor', h);
}

function reporteStockPrecios(){
  var tc=(DB.config&&DB.config.tipoCambio)||1;
  var list=DB.componentes.slice().sort(function(a,b){return (a.desc||'').localeCompare(b.desc||'','es');});
  var totalCosto=0,totalVenta=0;
  var rows=list.map(function(c){
    var qty=stockActual(c.id);
    var costo=parseFloat(c.costo||c.precio)||0;
    var venta=parseFloat(c.venta)||0;
    var stC=qty*costo;var stV=qty*venta;totalCosto+=stC;totalVenta+=stV;
    var critico=qty<=(parseFloat(c.min)||0)&&(parseFloat(c.min)||0)>0;
    return '<tr style="'+(critico?'background:#FFF3E0':'')+'"><td>'+c.codigo+'</td><td>'+c.desc+'</td><td>'+(c.categoria||'--')+'</td>'+
      '<td style="text-align:center;font-weight:700;color:'+(critico?'#B71C1C':'#222')+'">'+qty+'</td>'+
      '<td style="text-align:right">$'+Math.round(costo).toLocaleString('es-AR')+'</td>'+
      '<td style="text-align:right">$'+Math.round(venta).toLocaleString('es-AR')+'</td>'+
      '<td style="text-align:right">$'+Math.round(stC).toLocaleString('es-AR')+'</td>'+
      '<td style="text-align:right">$'+Math.round(stV).toLocaleString('es-AR')+'</td></tr>';
  }).join('');
  var empresa=(DB.config&&DB.config.empresa)||'Viking Security Systems';
  var margen=totalCosto>0?((totalVenta-totalCosto)/totalCosto*100).toFixed(1):0;
  var css='*{box-sizing:border-box;margin:0;padding:0}body{font-family:Segoe UI,Arial,sans-serif;padding:20px;font-size:11px}h1{font-size:15px;color:#B71C1C;margin-bottom:2px}.meta{color:#666;font-size:10px;margin-bottom:12px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}.stat{background:#f5f5f5;border-radius:5px;padding:9px;text-align:center}.stat .n{font-size:13px;font-weight:700}.stat .l{font-size:9px;color:#888;text-transform:uppercase}table{width:100%;border-collapse:collapse}th{background:#B71C1C;color:#fff;padding:6px 8px;font-size:9px;text-align:left}td{padding:5px 8px;border-bottom:1px solid #eee}tfoot td{background:#222;color:#fff;font-weight:700}.btn{position:fixed;top:12px;right:12px;background:#B71C1C;color:#fff;border:none;padding:6px 14px;border-radius:5px;cursor:pointer}@media print{.btn{display:none}}';
  var w=window.open('','_blank');
  w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Stock con precios</title><style>'+css+'</style></head><body>'+
    '<button class="btn" onclick="window.print()">Imprimir</button><h1>STOCK CON PRECIOS</h1><div class="meta">'+empresa+' - '+today()+'</div>'+
    '<div class="stats"><div class="stat"><div class="n">'+list.length+'</div><div class="l">Componentes</div></div><div class="stat"><div class="n" style="color:#B71C1C">$'+Math.round(totalCosto).toLocaleString('es-AR')+'</div><div class="l">Valor costo</div></div><div class="stat"><div class="n" style="color:green">$'+Math.round(totalVenta).toLocaleString('es-AR')+'</div><div class="l">Valor venta</div></div><div class="stat"><div class="n">'+margen+'%</div><div class="l">Margen</div></div></div>'+
    '<table><thead><tr><th>Codigo</th><th>Descripcion</th><th>Categoria</th><th style="text-align:center">Stock</th><th style="text-align:right">Costo $</th><th style="text-align:right">Venta $</th><th style="text-align:right">Total costo</th><th style="text-align:right">Total venta</th></tr></thead>'+
    '<tbody>'+rows+'</tbody><tfoot><tr><td colspan="6" style="text-align:right;padding:7px 8px">TOTALES</td><td style="text-align:right;padding:7px 8px">$'+Math.round(totalCosto).toLocaleString('es-AR')+'</td><td style="text-align:right;padding:7px 8px;color:#81C784">$'+Math.round(totalVenta).toLocaleString('es-AR')+'</td></tr></tfoot></table></body></html>');
  w.document.close();
}

// REPORTE: Historial de precios ================================
function reporteLogPrecios(){
  // Filtros
  var desde=document.getElementById('rlp-desde')?document.getElementById('rlp-desde').value:'';
  var hasta=document.getElementById('rlp-hasta')?document.getElementById('rlp-hasta').value:'';
  var qComp=(document.getElementById('rlp-comp')?document.getElementById('rlp-comp').value||'':'').toLowerCase();

  // Recolectar todos los cambios
  var cambios=[];
  DB.componentes.forEach(function(c){
    if(!(c.logPrecios&&c.logPrecios.length)) return;
    c.logPrecios.forEach(function(l){
      if(desde&&l.fecha<desde) return;
      if(hasta&&l.fecha>hasta) return;
      if(qComp&&!(c.desc||'').toLowerCase().includes(qComp)&&!(c.codigo||'').toLowerCase().includes(qComp)) return;
      cambios.push({fecha:l.fecha,comp:c,campo:l.campo,anterior:l.anterior,nuevo:l.nuevo});
    });
  });
  cambios.sort(function(a,b){return b.fecha.localeCompare(a.fecha);});

  var filtros=
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:flex-end">'+
      '<div><div style="font-size:10px;color:var(--text2);margin-bottom:3px">Componente</div>'+
        '<input id="rlp-comp" placeholder="Buscar..." style="padding:6px 9px;border:1px solid var(--border);border-radius:var(--r);background:var(--surface2);color:var(--text);font-size:12px" value="'+qComp+'"></div>'+
      '<div><div style="font-size:10px;color:var(--text2);margin-bottom:3px">Desde</div>'+
        '<input id="rlp-desde" type="date" style="padding:6px 9px;border:1px solid var(--border);border-radius:var(--r);background:var(--surface2);color:var(--text);font-size:12px" value="'+desde+'"></div>'+
      '<div><div style="font-size:10px;color:var(--text2);margin-bottom:3px">Hasta</div>'+
        '<input id="rlp-hasta" type="date" style="padding:6px 9px;border:1px solid var(--border);border-radius:var(--r);background:var(--surface2);color:var(--text);font-size:12px" value="'+hasta+'"></div>'+
      '<button class="btn btn-p" onclick="reporteLogPrecios()">Filtrar</button>'+
    '</div>';

  if(!cambios.length){
    reporteContainer('Historial de precios', filtros+'<div class="empty">Sin cambios de precios registrados.</div>');
    return;
  }

  var h=filtros+
    '<table style="width:100%;border-collapse:collapse">'+
      '<thead><tr style="background:var(--surface2)">'+
        '<th style="padding:5px 10px;font-size:10px">Fecha</th>'+
        '<th style="padding:5px 10px;font-size:10px">Componente</th>'+
        '<th style="padding:5px 10px;font-size:10px">Campo</th>'+
        '<th style="padding:5px 10px;font-size:10px;text-align:right">Anterior</th>'+
        '<th style="padding:5px 10px;font-size:10px;text-align:right">Nuevo</th>'+
        '<th style="padding:5px 10px;font-size:10px;text-align:right">Variacion</th>'+
      '</tr></thead><tbody>'+
      cambios.map(function(x){
        var subio=x.nuevo>x.anterior;
        var pct=x.anterior>0?Math.round((x.nuevo-x.anterior)/x.anterior*100):0;
        return '<tr style="border-bottom:1px solid var(--border)">'+
          '<td style="padding:6px 10px;font-size:11px;color:var(--text2)">'+x.fecha+'</td>'+
          '<td style="padding:6px 10px;font-size:11px">'+x.comp.desc+'<br><span style="font-size:10px;color:var(--text2)">'+x.comp.codigo+'</span></td>'+
          '<td style="padding:6px 10px;font-size:11px">'+x.campo+'</td>'+
          '<td style="padding:6px 10px;font-size:11px;text-align:right;color:var(--text2);text-decoration:line-through">'+x.anterior+'</td>'+
          '<td style="padding:6px 10px;font-size:11px;text-align:right;font-weight:700;color:'+(subio?'var(--red)':'var(--green)')+'">'+x.nuevo+'</td>'+
          '<td style="padding:6px 10px;font-size:11px;text-align:right;color:'+(subio?'var(--red)':'var(--green)')+'">'+(subio?'+':'')+pct+'% '+(subio?'▲':'▼')+'</td>'+
        '</tr>';
      }).join('')+
      '</tbody></table>';

  reporteContainer('Historial de precios ('+cambios.length+' cambios)', h);
}

// REPORTE: Uso de recursos por proyecto ================================
function reporteUsoRecursos(){
  var estados=['Finalizado','En curso','Pausado'];
  var lista=(DB.proyectos||[]).filter(function(p){return estados.indexOf(p.estado)>-1;})
    .sort(function(a,b){return (b.numero||'').localeCompare(a.numero||'');});

  if(!lista.length){
    reporteContainer('Uso de recursos','<div class="empty">Sin proyectos finalizados o en curso.</div>');
    return;
  }

  var h='';
  lista.forEach(function(p){
    var esFin=p.estado==='Finalizado';

    // MATERIALES
    var totalMatEstim=0, totalMatReal=0, totalMatDevuelto=0;
    var rowsMat=(p.materiales||[]).map(function(m){
      var comp=(compById(m.compId)||{desc:'?',unidad:'',costo:0});
      var costo=parseFloat(comp.costo)||0;
      var cantEstim=parseFloat(m.cant)||0;
      var cantReal=esFin?(parseFloat(m.entregado)||cantEstim):( parseFloat(m.entregado)||0);
      var devuelto=parseFloat(m.devuelto)||0;
      var costoEstim=cantEstim*costo;
      var costoReal=cantReal*costo;
      totalMatEstim+=costoEstim;
      totalMatReal+=costoReal;
      totalMatDevuelto+=devuelto*costo;
      var diff=cantReal-cantEstim;
      return '<tr style="border-bottom:1px solid var(--border)">'+
        '<td style="padding:4px 8px;font-size:11px">'+comp.desc+'</td>'+
        '<td style="padding:4px 8px;font-size:10px;color:var(--text2)">'+( comp.unidad||'')+'</td>'+
        '<td style="padding:4px 8px;text-align:center;font-size:11px">'+cantEstim+'</td>'+
        '<td style="padding:4px 8px;text-align:center;font-size:11px;font-weight:700;color:'+(cantReal<cantEstim?'var(--green)':cantReal>cantEstim?'var(--red)':'var(--text)')+'">'+cantReal+'</td>'+
        (devuelto>0?'<td style="padding:4px 8px;text-align:center;font-size:11px;color:#66bb6a">'+devuelto+'</td>':'<td style="padding:4px 8px;text-align:center;font-size:11px;color:var(--text3)">--</td>')+
        '<td style="padding:4px 8px;text-align:right;font-size:11px;color:var(--text2)">$'+Math.round(costoEstim).toLocaleString('es-AR')+'</td>'+
        '<td style="padding:4px 8px;text-align:right;font-size:11px;font-weight:700;color:'+(costoReal>costoEstim?'var(--red)':costoReal<costoEstim?'var(--green)':'var(--text)')+'">$'+Math.round(costoReal).toLocaleString('es-AR')+'</td>'+
        '<td style="padding:4px 8px;text-align:center;font-size:10px;color:'+(diff>0?'var(--red)':diff<0?'var(--green)':'var(--text2)')+'">'+
          (diff===0?'--':(diff>0?'+':'')+diff)+
        '</td>'+
      '</tr>';
    }).join('');

    // MO POR TAREA
    var moEstim=0, moReal=0;
    var rowsMO=(p.tareas||[]).map(function(t){
      var mo=parseFloat(t.costoMO)||0;
      var esOK=tareaEstadoCached(t)==='OK';
      moEstim+=mo;
      if(esOK) moReal+=mo;
      return '<tr style="border-bottom:1px solid var(--border)">'+
        '<td style="padding:4px 8px;font-size:11px;'+(esOK?'':'color:var(--text2)')+'">'+t.desc+'</td>'+
        '<td style="padding:4px 8px;text-align:center;font-size:11px">'+tareaPill(tareaEstadoCached(t))+'</td>'+
        '<td style="padding:4px 8px;text-align:center;font-size:11px;color:var(--text2)">'+(t.fechaCumplimiento||'--')+'</td>'+
        '<td style="padding:4px 8px;text-align:right;font-size:11px">$'+Math.round(mo).toLocaleString('es-AR')+'</td>'+
        '<td style="padding:4px 8px;text-align:right;font-size:11px;font-weight:700;color:'+(esOK?'var(--green)':'var(--text3)')+'">'+
          (esOK?'$'+Math.round(mo).toLocaleString('es-AR'):'--')+
        '</td>'+
      '</tr>';
    }).join('');

    var totalEstim=totalMatEstim+moEstim;
    var totalReal=totalMatReal+moReal;
    var presup=parseFloat(p.presupuesto)||0;
    var superaPresup=presup>0&&totalReal>presup;

    h+='<div class="card" style="margin-bottom:14px">'+
      // HEADER
      '<div class="ch" style="flex-wrap:wrap;gap:6px">'+
        '<div style="display:flex;align-items:center;gap:8px">'+
          '<span class="mono" style="font-size:11px;color:var(--primary)">'+p.numero+'</span>'+
          '<strong>'+p.nombre+'</strong>'+
        '</div>'+
        '<div style="display:flex;gap:6px;align-items:center">'+
          proyEstadoPill(p.estado)+
          (p.prioridad?'<span style="background:'+(p.prioridad==='Alta'?'#3a0000':p.prioridad==='Baja'?'#0a2a0a':'#2a1a00')+';color:'+(p.prioridad==='Alta'?'#ef5350':p.prioridad==='Baja'?'#66bb6a':'#ffb74d')+';padding:1px 8px;border-radius:8px;font-size:10px">'+p.prioridad+'</span>':'')+
        '</div>'+
      '</div>'+
      '<div class="card-body">'+

      // RESUMEN COSTOS
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-bottom:14px">'+
        (presup>0?'<div style="background:var(--surface3);border-radius:6px;padding:8px 10px">'+
          '<div style="font-size:9px;color:var(--text2)">Presupuesto</div>'+
          '<div style="font-size:13px;font-weight:700">$'+Math.round(presup).toLocaleString('es-AR')+'</div>'+
        '</div>':'')+
        '<div style="background:var(--surface3);border-radius:6px;padding:8px 10px">'+
          '<div style="font-size:9px;color:var(--text2)">Mat. '+(esFin?'consumidos':'estimados')+'</div>'+
          '<div style="font-size:13px;font-weight:700;color:var(--blue)">$'+Math.round(totalMatReal).toLocaleString('es-AR')+'</div>'+
          (totalMatDevuelto>0?'<div style="font-size:9px;color:#66bb6a">Dev: $'+Math.round(totalMatDevuelto).toLocaleString('es-AR')+'</div>':'')+
        '</div>'+
        '<div style="background:var(--surface3);border-radius:6px;padding:8px 10px">'+
          '<div style="font-size:9px;color:var(--text2)">MO ejecutada</div>'+
          '<div style="font-size:13px;font-weight:700;color:var(--amber)">$'+Math.round(moReal).toLocaleString('es-AR')+'</div>'+
          '<div style="font-size:9px;color:var(--text2)">de $'+Math.round(moEstim).toLocaleString('es-AR')+' planif.</div>'+
        '</div>'+
        '<div style="background:'+(superaPresup?'#3a0000':'#0a2a0a')+';border-radius:6px;padding:8px 10px">'+
          '<div style="font-size:9px;color:'+(superaPresup?'#ef5350':'#66bb6a')+'">Total '+(esFin?'real':'erogado')+'</div>'+
          '<div style="font-size:13px;font-weight:700;color:'+(superaPresup?'var(--red)':'var(--green)')+'">$'+Math.round(totalReal).toLocaleString('es-AR')+'</div>'+
          (presup>0?'<div style="font-size:9px;color:'+(superaPresup?'var(--red)':'#66bb6a')+'">'+
            (superaPresup?'Exceso: $'+Math.round(totalReal-presup).toLocaleString('es-AR'):'Ahorro: $'+Math.round(presup-totalReal).toLocaleString('es-AR'))+
          '</div>':'')+
        '</div>'+
      '</div>'+

      // MATERIALES
      ((p.materiales||[]).length?
        '<div style="font-size:10px;color:var(--text2);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Materiales</div>'+
        '<table style="width:100%;border-collapse:collapse;margin-bottom:14px">'+
          '<thead><tr style="background:var(--surface2)">'+
            '<th style="padding:4px 8px;font-size:10px">Componente</th>'+
            '<th style="padding:4px 8px;font-size:10px">Ud</th>'+
            '<th style="padding:4px 8px;font-size:10px;text-align:center">Estimado</th>'+
            '<th style="padding:4px 8px;font-size:10px;text-align:center">Real</th>'+
            '<th style="padding:4px 8px;font-size:10px;text-align:center">Devuelto</th>'+
            '<th style="padding:4px 8px;font-size:10px;text-align:right">Costo estim.</th>'+
            '<th style="padding:4px 8px;font-size:10px;text-align:right">Costo real</th>'+
            '<th style="padding:4px 8px;font-size:10px;text-align:center">Dif.</th>'+
          '</tr></thead><tbody>'+rowsMat+'</tbody>'+
          '<tfoot><tr style="background:var(--surface2)">'+
            '<td colspan="5" style="padding:5px 8px;font-size:11px;font-weight:700">Total materiales</td>'+
            '<td style="padding:5px 8px;text-align:right;font-size:11px;color:var(--text2)">$'+Math.round(totalMatEstim).toLocaleString('es-AR')+'</td>'+
            '<td style="padding:5px 8px;text-align:right;font-size:11px;font-weight:700;color:'+(totalMatReal>totalMatEstim?'var(--red)':'var(--green)')+'">$'+Math.round(totalMatReal).toLocaleString('es-AR')+'</td>'+
            '<td></td>'+
          '</tr></tfoot>'+
        '</table>':'<div style="font-size:11px;color:var(--text3);margin-bottom:14px">Sin materiales registrados.</div>')+

      // MO
      ((p.tareas||[]).length?
        '<div style="font-size:10px;color:var(--text2);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Mano de obra por tarea</div>'+
        '<table style="width:100%;border-collapse:collapse;margin-bottom:10px">'+
          '<thead><tr style="background:var(--surface2)">'+
            '<th style="padding:4px 8px;font-size:10px">Tarea</th>'+
            '<th style="padding:4px 8px;font-size:10px;text-align:center">Estado</th>'+
            '<th style="padding:4px 8px;font-size:10px;text-align:center">Fecha</th>'+
            '<th style="padding:4px 8px;font-size:10px;text-align:right">MO planif.</th>'+
            '<th style="padding:4px 8px;font-size:10px;text-align:right">MO ejecutada</th>'+
          '</tr></thead><tbody>'+rowsMO+'</tbody>'+
          '<tfoot><tr style="background:var(--surface2)">'+
            '<td colspan="3" style="padding:5px 8px;font-size:11px;font-weight:700">Total MO</td>'+
            '<td style="padding:5px 8px;text-align:right;font-size:11px;color:var(--text2)">$'+Math.round(moEstim).toLocaleString('es-AR')+'</td>'+
            '<td style="padding:5px 8px;text-align:right;font-size:11px;font-weight:700;color:var(--amber)">$'+Math.round(moReal).toLocaleString('es-AR')+'</td>'+
          '</tr></tfoot>'+
        '</table>':'<div style="font-size:11px;color:var(--text3)">Sin tareas registradas.</div>')+

      '</div></div>';
  });

  reporteContainer('Uso de recursos por proyecto', h);
}

function verRedTareas(id){
  var p=(DB.proyectos||[]).find(function(x){return x.id===id;});
  if(!p||(p.tareas||[]).length===0){alert('El proyecto no tiene tareas.');return;}
  var tareas=p.tareas||[];

  // Layout: calcular niveles por topological sort
  var niveles=[];
  var nivel=new Array(tareas.length).fill(0);
  // Calcular nivel máximo de predecesores
  for(var i=0;i<tareas.length;i++){
    var deps=tareas[i].deps||[];
    deps.forEach(function(dep){
      if(dep.tareaIdx<tareas.length){
        nivel[i]=Math.max(nivel[i],nivel[dep.tareaIdx]+1);
      }
    });
  }
  var maxNivel=Math.max.apply(null,nivel);

  // Agrupar por nivel
  var porNivel={};
  for(var i=0;i<tareas.length;i++){
    var nv=nivel[i];
    if(!porNivel[nv]) porNivel[nv]=[];
    porNivel[nv].push(i);
  }

  // Dimensiones
  var NODE_W=160,NODE_H=52,GAP_X=60,GAP_Y=20;
  var cols=maxNivel+1;
  var maxRows=Math.max.apply(null,Object.values(porNivel).map(function(a){return a.length;}));
  var SVG_W=cols*(NODE_W+GAP_X)+GAP_X;
  var SVG_H=maxRows*(NODE_H+GAP_Y)+GAP_Y+40;

  // Posiciones de cada nodo
  var pos=new Array(tareas.length);
  for(var nv=0;nv<=maxNivel;nv++){
    var grupo=porNivel[nv]||[];
    var totalH=grupo.length*(NODE_H+GAP_Y)-GAP_Y;
    var startY=(SVG_H-totalH)/2;
    grupo.forEach(function(idx,gi){
      pos[idx]={
        x:GAP_X+nv*(NODE_W+GAP_X),
        y:startY+gi*(NODE_H+GAP_Y)
      };
    });
  }

  // Colores por estado
  var colMap={
    'OK':'#2e7d32','Atrasado':'#c62828',
    'Pendiente confirmacion':'#6a1b9a',
    'En curso':'#1565C0','Cancelado':'#555'
  };
  var colBorderMap={
    'OK':'#66bb6a','Atrasado':'#ef5350',
    'Pendiente confirmacion':'#ce93d8',
    'En curso':'#4fc3f7','Cancelado':'#888'
  };
  var tipoDep={FI:'Fin→Inicio',II:'Inicio→Inicio',FF:'Fin→Fin',IF:'Inicio→Fin'};
  var colorDep={FI:'#ef5350',II:'#4fc3f7',FF:'#66bb6a',IF:'#ffb74d'};

  // SVG
  var svg='<svg width="'+SVG_W+'" height="'+SVG_H+'" viewBox="0 0 '+SVG_W+' '+SVG_H+'" xmlns="http://www.w3.org/2000/svg" style="background:#111;border-radius:8px;display:block;max-width:100%">';

  // Definir markers (flechas) por tipo
  svg+='<defs>';
  Object.keys(colorDep).forEach(function(tipo){
    svg+='<marker id="arr-'+tipo+'" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">'+
      '<path d="M0,0 L8,3 L0,6 Z" fill="'+colorDep[tipo]+'"/>'+
    '</marker>';
  });
  svg+='</defs>';

  // Flechas de dependencias
  tareas.forEach(function(t,ti){
    (t.deps||[]).forEach(function(dep){
      if(dep.tareaIdx>=tareas.length) return;
      var from=pos[dep.tareaIdx];
      var to=pos[ti];
      var col=colorDep[dep.tipo]||'#aaa';
      // Punto de salida (derecha del nodo origen) y entrada (izquierda del destino)
      var x1=from.x+NODE_W;
      var y1=from.y+NODE_H/2;
      var x2=to.x;
      var y2=to.y+NODE_H/2;
      var cx=(x1+x2)/2;
      // Bezier
      svg+='<path d="M'+x1+','+y1+' C'+cx+','+y1+' '+cx+','+y2+' '+x2+','+y2+'" '+
        'stroke="'+col+'" stroke-width="2" fill="none" marker-end="url(#arr-'+dep.tipo+')" opacity="0.8"/>'+
      '<text x="'+cx+'" y="'+(Math.min(y1,y2)-5)+'" text-anchor="middle" font-size="9" fill="'+col+'" font-family="monospace">'+dep.tipo+'</text>';
    });
  });

  // Nodos
  tareas.forEach(function(t,ti){
    var estado=tareaEstadoCached(t);
    var bg=colMap[estado]||'#222';
    var border=colBorderMap[estado]||'#444';
    var p2=pos[ti];
    var label=t.desc.length>22?t.desc.slice(0,22)+'…':t.desc;
    var opAsig=t.operario?(DB.operarios||[]).find(function(o){return o.id===t.operario;}):null;
    var peso=parseFloat(t.peso)||0;
    var avR=parseFloat(t.avanceReal)||0;

    svg+='<g>'+
      '<rect x="'+p2.x+'" y="'+p2.y+'" width="'+NODE_W+'" height="'+NODE_H+'" rx="6" fill="'+bg+'" stroke="'+border+'" stroke-width="1.5"/>'+
      // Nombre
      '<text x="'+(p2.x+8)+'" y="'+(p2.y+16)+'" font-size="11" font-weight="bold" fill="#fff" font-family="Segoe UI,Arial">'+label+'</text>'+
      // Estado
      '<text x="'+(p2.x+8)+'" y="'+(p2.y+28)+'" font-size="9" fill="'+border+'" font-family="Segoe UI,Arial">'+estado+'</text>'+
      // Operario y peso/avance
      '<text x="'+(p2.x+8)+'" y="'+(p2.y+40)+'" font-size="9" fill="#666" font-family="Segoe UI,Arial">'+(opAsig?opAsig.nombre.slice(0,14):'--')+(peso?'  '+avR+'%/'+peso+'%':'')+'</text>'+
      // Barra avance
      (peso>0?
        '<rect x="'+(p2.x+8)+'" y="'+(p2.y+NODE_H-7)+'" width="'+(NODE_W-16)+'" height="4" rx="2" fill="#333"/>'+
        '<rect x="'+(p2.x+8)+'" y="'+(p2.y+NODE_H-7)+'" width="'+Math.round((NODE_W-16)*avR/100)+'" height="4" rx="2" fill="'+border+'"/>':'')+''+
    '</g>';
  });

  svg+='</svg>';

  // Leyenda
  var leyenda='<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;font-size:11px">'+
    Object.keys(colorDep).map(function(tipo){
      return '<div style="display:flex;align-items:center;gap:4px">'+
        '<div style="width:20px;height:2px;background:'+colorDep[tipo]+'"></div>'+
        '<span style="color:'+colorDep[tipo]+'">'+tipo+'</span>'+
        '<span style="color:var(--text3)">'+tipoDep[tipo]+'</span>'+
      '</div>';
    }).join('')+
    Object.keys(colBorderMap).map(function(est){
      return '<div style="display:flex;align-items:center;gap:4px">'+
        '<div style="width:10px;height:10px;border-radius:2px;background:'+colMap[est]+';border:1px solid '+colBorderMap[est]+'"></div>'+
        '<span style="color:'+colBorderMap[est]+'">'+est+'</span>'+
      '</div>';
    }).join('')+
  '</div>';

  var html=leyenda+'<div style="overflow-x:auto">'+svg+'</div>'+
    (tareas.every(function(t){return !(t.deps&&t.deps.length);})?
      '<div style="font-size:11px;color:var(--text2);margin-top:10px;text-align:center">Sin dependencias definidas. Editá las tareas para agregar dependencias.</div>':'');

  openModal('🕸 Red de tareas — '+p.numero, html, null, true);
}


function renderDashProy(){
  var el=document.getElementById('dashproy-body');
  if(!el) return;
  var hoy=today();
  var lista=proyectosDelOperario().filter(function(p){return p.estado!=='Cancelado';})
    .sort(function(a,b){return (a.fechaInicio||'9999').localeCompare(b.fechaInicio||'9999');});

  var h='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">'+
    '<div style="font-size:16px;font-weight:700">📊 Dashboard de proyectos</div>'+
    '<div style="display:flex;border:1px solid var(--border);border-radius:var(--r);overflow:hidden">'+
      '<button onclick="goTo(\'proyectos\')" style="padding:6px 16px;font-size:12px;border:none;cursor:pointer;background:var(--surface2);color:var(--text2)">☰ Lista</button>'+
      '<button style="padding:6px 16px;font-size:12px;border:none;border-left:1px solid var(--border);cursor:pointer;background:var(--primary);color:#fff;font-weight:700">📊 Dashboard</button>'+
    '</div>'+
  '</div>';

  if(!lista.length){h+='<div class="empty">Sin proyectos registrados.</div>';el.innerHTML=h;return;}

  // ── 1. ESTADO GENERAL ─────────────────────────────────
  var conteos={Planificado:0,'En curso':0,Pausado:0,Finalizado:0,Cancelado:0};
  lista.forEach(function(p){if(conteos[p.estado]!==undefined) conteos[p.estado]++;});
  var colEstado={Planificado:'var(--amber)','En curso':'var(--blue)',Pausado:'#888',Finalizado:'var(--green)',Cancelado:'var(--red)'};
  var bgEstado={Planificado:'#2a1a00','En curso':'#0a1a3a',Pausado:'#1a1a1a',Finalizado:'#0a2a0a',Cancelado:'#2a0a0a'};
  var total=lista.length||1;

  h+='<div class="card" style="margin-bottom:14px"><div class="ch"><div class="ct">Estado general</div></div><div class="card-body">'+
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px">';
  Object.keys(conteos).forEach(function(est){
    var n=conteos[est];
    var pct=Math.round(n/total*100);
    var col=colEstado[est];
    var bg=bgEstado[est];
    h+='<div style="background:'+bg+';border-left:4px solid '+col+';border-radius:0 var(--r) var(--r) 0;padding:12px 14px;opacity:'+(n>0?1:0.4)+'">'+
      '<div style="font-size:32px;font-weight:900;color:'+col+';line-height:1">'+n+'</div>'+
      '<div style="font-size:12px;font-weight:700;color:var(--text);margin-top:4px">'+est+'</div>'+
      '<div style="font-size:10px;color:var(--text2);margin-top:2px">'+pct+'% del total</div>'+
    '</div>';
  });
  h+='</div></div></div>';

  // ── 2. BARRAS DE AVANCE FISICO vs TIEMPO ─────────────
  var activos=lista.filter(function(p){return p.estado==='En curso'||p.estado==='Pausado';});
  if(activos.length){
    h+='<div class="card" style="margin-bottom:14px"><div class="ch"><div class="ct">Avance físico vs tiempo — proyectos activos</div></div><div class="card-body">';
    activos.forEach(function(p){
      var pesoTotal=(p.tareas||[]).reduce(function(a,t){return a+(parseFloat(t.peso)||0);},0);
      var avF=pesoTotal>0?Math.round((p.tareas||[]).reduce(function(a,t){return a+(parseFloat(t.peso)||0)*(parseFloat(t.avanceReal)||0)/100;},0)):null;
      var avT=null;
      if(p.fechaInicio&&p.fechaEstFin){
        var ini=new Date(p.fechaInicio),fin=new Date(p.fechaEstFin),hoyD=new Date(hoy);
        avT=Math.min(100,Math.max(0,Math.round((hoyD-ini)/(fin-ini)*100)));
      }
      var diff=avF!==null&&avT!==null?avF-avT:null;
      var semColor=diff===null?'var(--text3)':diff>=5?'var(--green)':diff>=-10?'var(--amber)':'var(--red)';
      var semLabel=diff===null?'--':diff>=5?'↑ Adelantado':diff>=-10?'→ En línea':'↓ Atrasado';
      h+='<div style="margin-bottom:14px">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">'+
          '<span style="font-size:12px;font-weight:700;cursor:pointer;color:var(--primary)" onclick="cerrarBusqueda();goTo(\'proyectos\');setTimeout(function(){abrirProyecto('+p.id+');},200)">'+p.nombre+'</span>'+
          '<span style="font-size:11px;font-weight:700;color:'+semColor+'">'+semLabel+'</span>'+
        '</div>'+
        // Barra fisica
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">'+
          '<div style="font-size:10px;color:var(--text2);width:90px;text-align:right;flex-shrink:0">Físico</div>'+
          '<div style="flex:1;background:var(--surface3);border-radius:3px;height:10px;overflow:hidden">'+
            (avF!==null?'<div style="height:100%;background:'+(avF>=100?'var(--green)':'var(--blue)')+';width:'+avF+'%;transition:width .3s"></div>':'')+
          '</div>'+
          '<div style="font-size:11px;font-weight:700;width:36px;color:'+(avF===null?'var(--text3)':'var(--text)')+';">'+(avF===null?'--':avF+'%')+'</div>'+
        '</div>'+
        // Barra tiempo
        '<div style="display:flex;align-items:center;gap:8px">'+
          '<div style="font-size:10px;color:var(--text2);width:90px;text-align:right;flex-shrink:0">Tiempo</div>'+
          '<div style="flex:1;background:var(--surface3);border-radius:3px;height:10px;overflow:hidden">'+
            (avT!==null?'<div style="height:100%;background:'+(avT>=100?'var(--red)':'#555')+';width:'+avT+'%;transition:width .3s"></div>':'')+
          '</div>'+
          '<div style="font-size:11px;font-weight:700;width:36px;color:'+(avT===null?'var(--text3)':avT>=100?'var(--red)':'var(--text2)')+';">'+(avT===null?'--':avT+'%')+'</div>'+
        '</div>'+
      '</div>';
    });
    h+='</div></div>';
  }

  // ── 3. GANTT SIMPLIFICADO ─────────────────────────────
  var conFechas=lista.filter(function(p){return p.fechaInicio&&p.fechaEstFin;});
  if(conFechas.length){
    // Calcular rango total
    var fechaMin=conFechas.reduce(function(a,p){return p.fechaInicio<a?p.fechaInicio:a;},conFechas[0].fechaInicio);
    var fechaMax=conFechas.reduce(function(a,p){
      var f=p.fechaFinReal||p.fechaEstFin;
      return f>a?f:a;
    },conFechas[0].fechaEstFin);
    var tMin=new Date(fechaMin).getTime();
    var tMax=new Date(fechaMax).getTime();
    var rango=tMax-tMin||1;
    var hoyPct=Math.min(100,Math.max(0,Math.round((new Date(hoy).getTime()-tMin)/rango*100)));

    h+='<div class="card" style="margin-bottom:14px"><div class="ch"><div class="ct">Gantt — línea de tiempo</div></div><div class="card-body">';

    // Cabecera con eje de fechas alineado con las barras
    var NAME_W=180, DATE_W=76;
    h+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'+
      '<div style="width:'+NAME_W+'px;flex-shrink:0"></div>'+
      '<div style="flex:1;position:relative;height:16px">'+
        '<span style="position:absolute;left:0;font-size:9px;color:var(--text3)">'+fechaMin+'</span>'+
        '<span style="position:absolute;right:0;font-size:9px;color:var(--text3)">'+fechaMax+'</span>'+
        // Línea HOY en el eje
        (hoyPct>0&&hoyPct<100?'<div style="position:absolute;left:'+hoyPct+'%;top:0;bottom:0;display:flex;flex-direction:column;align-items:center">'+
          '<span style="font-size:9px;color:var(--primary);font-weight:700;white-space:nowrap;transform:translateX(-50%)">HOY</span>'+
        '</div>':'')+
      '</div>'+
      '<div style="width:'+DATE_W+'px;flex-shrink:0"></div>'+
    '</div>';

    // Filas de proyectos
    conFechas.forEach(function(p){
      var ini=new Date(p.fechaInicio).getTime();
      var fin=new Date(p.fechaFinReal||p.fechaEstFin).getTime();
      var left=Math.round((ini-tMin)/rango*100);
      var width=Math.max(1,Math.round((fin-ini)/rango*100));
      var colEstadoG={Planificado:'var(--amber)','En curso':'var(--blue)',Pausado:'#666',Finalizado:'var(--green)',Cancelado:'var(--red)'};
      var col=colEstadoG[p.estado]||'var(--text3)';

      h+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">'+
        // Nombre — ancho fijo, fuera del contenedor de barras
        '<div style="font-size:11px;width:'+NAME_W+'px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;color:var(--text)" onclick="cerrarBusqueda();goTo(\'proyectos\');setTimeout(function(){abrirProyecto('+p.id+');},200)" title="'+p.nombre+'">'+
          '<span style="color:var(--text3);font-size:10px;font-family:monospace;margin-right:4px">'+p.numero+'</span>'+p.nombre+
        '</div>'+
        // Barra con línea HOY superpuesta
        '<div style="flex:1;position:relative;height:18px;background:var(--surface3);border-radius:3px;overflow:hidden">'+
          '<div style="position:absolute;left:'+left+'%;width:'+width+'%;height:100%;background:'+col+';border-radius:3px;opacity:0.85;min-width:3px" title="'+p.fechaInicio+' → '+(p.fechaFinReal||p.fechaEstFin)+'"></div>'+
          // Línea HOY sobre la barra
          (hoyPct>0&&hoyPct<100?'<div style="position:absolute;left:'+hoyPct+'%;top:0;bottom:0;width:2px;background:var(--primary);z-index:2"></div>':'')+
        '</div>'+
        // Fecha fin alineada a la derecha
        '<div style="font-size:10px;color:var(--text2);width:'+DATE_W+'px;flex-shrink:0;text-align:right">'+(p.fechaFinReal||p.fechaEstFin)+'</div>'+
      '</div>';
    });

    h+='</div></div>';
  }

  // ── 4. LÍNEA DE TIEMPO DE VENCIMIENTOS ───────────────
  var tareasFuturas=[];
  lista.filter(function(p){return p.estado==='En curso'||p.estado==='Planificado';}).forEach(function(p){
    (p.tareas||[]).forEach(function(t){
      if(!t.fechaCumplimiento) return;
      if(tareaEstadoCached(t)==='OK'||tareaEstadoCached(t)==='Cancelado') return;
      tareasFuturas.push({proy:p,tarea:t,estado:tareaEstadoCached(t),fecha:t.fechaCumplimiento});
    });
  });
  tareasFuturas.sort(function(a,b){return a.fecha.localeCompare(b.fecha);});

  if(tareasFuturas.length){
    h+='<div class="card"><div class="ch"><div class="ct">Próximos vencimientos de tareas</div></div><div class="card-body">';
    // Agrupar por semana
    var semanas={};
    tareasFuturas.forEach(function(x){
      var d=new Date(x.fecha);
      // Lunes de esa semana
      var day=d.getDay()||7;
      var lunes=new Date(d);lunes.setDate(d.getDate()-day+1);
      var key=lunes.toISOString().slice(0,10);
      if(!semanas[key]) semanas[key]=[];
      semanas[key].push(x);
    });

    Object.keys(semanas).sort().forEach(function(semKey){
      var items=semanas[semKey];
      var esPassada=semKey<hoy;
      var esSemanaActual=semKey<=hoy&&new Date(semKey).getTime()+7*86400000>new Date(hoy).getTime();
      h+='<div style="margin-bottom:12px">'+
        '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:'+(esPassada?'var(--red)':esSemanaActual?'var(--amber)':'var(--text2)')+';margin-bottom:6px;padding:3px 0;border-bottom:1px solid var(--border)">'+
          (esSemanaActual?'⚡ ':esPassada?'⚠️ ':'')+
          'Semana del '+semKey+
        '</div>'+
        items.map(function(x){
          var col=x.estado==='Atrasado'?'var(--red)':x.estado==='Pendiente confirmacion'?'#ce93d8':'var(--text2)';
          var opAsig=x.tarea.operario?(DB.operarios||[]).find(function(o){return o.id===x.tarea.operario;}):null;
          return '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="cerrarBusqueda();goTo(\'proyectos\');setTimeout(function(){abrirProyecto('+x.proy.id+');},200)">'+
            '<div style="width:8px;height:8px;border-radius:50%;background:'+col+';flex-shrink:0"></div>'+
            '<div style="flex:1;min-width:0">'+
              '<div style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+x.tarea.desc+'</div>'+
              '<div style="font-size:10px;color:var(--text2)">'+x.proy.numero+' '+x.proy.nombre.slice(0,25)+(opAsig?' &middot; '+opAsig.nombre:'')+'</div>'+
            '</div>'+
            '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0">'+
              '<span style="font-size:10px;color:'+col+'">'+x.fecha+'</span>'+
              tareaPill(x.estado)+
            '</div>'+
          '</div>';
        }).join('')+
      '</div>';
    });
    h+='</div></div>';
  }

  el.innerHTML=h;
}

// =======================================================
// CONFIG
// =======================================================
var _saveTimer = null;
function actualizarTC(){
  var btn=document.getElementById('btn-tc');
  var info=document.getElementById('cfg-tc-info');
  if(btn) btn.textContent='...';
  if(info) info.textContent='Consultando...';
  fetch('https://api.bluelytics.com.ar/v2/latest')
    .then(function(r){return r.json();})
    .then(function(data){
      if(data&&data.oficial&&data.oficial.value_sell){
        var venta=Math.round(data.oficial.value_sell);
        var el=document.getElementById('cfg-tc');
        if(el) el.value=venta;
        if(btn) btn.textContent='BNA';
        var fecha=data.last_update?new Date(data.last_update).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
        if(info) info.textContent='Venta oficial: $'+venta.toLocaleString('es-AR')+(fecha?' - '+fecha:'');
        DB.config.tipoCambio=venta;
        save();
        setTimeout(function(){if(btn) btn.textContent='BNA';},3000);
      } else { throw new Error('Sin datos'); }
    })
    .catch(function(err){
      if(btn) btn.textContent='BNA';
      if(info) info.textContent='Error al consultar. Ingresa manualmente.';
    });
}

function renderConfig(){
  var cfg=DB.config||{};
  var el=document.getElementById('config-body');if(!el) return;
  el.innerHTML=
    '<div class="fg2">'+
      '<div class="fg"><label>Empresa</label><input id="cfg-empresa" value="'+(cfg.empresa||'')+'" oninput="saveConfig()"></div>'+
      '<div class="fg"><label>Email</label><input id="cfg-email" value="'+(cfg.email||'')+'" oninput="saveConfig()"></div>'+
      '<div class="fg"><label>Telefono</label><input id="cfg-tel" value="'+(cfg.tel||'')+'" oninput="saveConfig()"></div>'+
      '<div class="fg"><label>Tipo de cambio U$S -- vendedor BNA</label>'+
        '<div style="display:flex;gap:6px;align-items:center">'+
          '<input id="cfg-tc" type="number" min="1" value="'+(cfg.tipoCambio||1)+'" style="flex:1;padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;background:var(--surface2);color:var(--text)" oninput="saveConfig()">'+
          '<button id="btn-tc" class="btn btn-sm" onclick="actualizarTC()" title="Obtener cotizacion BNA">BNA</button>'+
          '<span id="cfg-tc-info" style="font-size:10px;color:var(--text2)"></span>'+
        '</div></div>'+
    '</div>'+
    '<hr class="div"><div class="sectitle" style="margin-bottom:10px">Motivos de salida</div>'+
    '<div style="font-size:11px;color:var(--text2);margin-bottom:8px">Estos son los motivos disponibles al registrar una salida manual.</div>'+
    '<div id="motivos-list" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">'+
      (cfg.motivosSalida||[]).map(function(m,i){return '<div style="display:inline-flex;align-items:center;gap:6px;background:var(--surface2);border:1px solid var(--border);border-radius:20px;padding:4px 12px;font-size:12px">'+m+'<button style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px;line-height:1;padding:0" onclick="eliminarMotivo('+i+')">x</button></div>';}).join('')+
    '</div>'+
    '<div style="display:flex;gap:8px"><input id="nuevo-motivo" placeholder="Nuevo motivo..." style="flex:1"><button class="btn" onclick="agregarMotivo()">+ Agregar</button></div>'+
    '<hr class="div"><div class="sectitle" style="margin-bottom:10px">Origenes de entrada</div>'+
    '<div id="origenes-list" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">'+
      (cfg.origenesEntrada||[]).map(function(o,i){return '<div style="display:inline-flex;align-items:center;gap:6px;background:var(--surface2);border:1px solid var(--border);border-radius:20px;padding:4px 12px;font-size:12px">'+o+'<button style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px;line-height:1;padding:0" onclick="eliminarOrigen('+i+')">x</button></div>';}).join('')+
    '</div>'+
    '<div style="display:flex;gap:8px"><input id="nuevo-origen" placeholder="Nuevo origen..." style="flex:1"><button class="btn" onclick="agregarOrigen()">+ Agregar</button></div>'+
    // SECCION CONTROL DE ACCESO
    '<hr class="div"><div class="sectitle" style="margin-bottom:10px">Control de acceso</div>'+
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;background:var(--surface2);border-radius:var(--r);padding:10px 14px">'+
      '<input type="checkbox" id="cfg-login-off" '+(DB.config.loginDeshabilitado?'checked':'')+' onchange="toggleLogin(this.checked)" style="width:16px;height:16px;cursor:pointer">'+
      '<div>'+
        '<div style="font-size:12px;font-weight:700">Deshabilitar login <span style="background:#2a1a00;color:#ffb74d;padding:1px 7px;border-radius:8px;font-size:9px">DESARROLLO</span></div>'+
        '<div style="font-size:11px;color:var(--text2);margin-top:2px">Cuando está activado entra directo como Administrador sin pedir credenciales.</div>'+
      '</div>'+
    '</div>'+
    '<div style="font-size:11px;color:var(--text2);margin-bottom:8px">Usuarios registrados:</div>'+
    '<table style="width:100%;border-collapse:collapse;margin-bottom:12px">'+
      '<thead><tr style="background:var(--surface2)">'+
        '<th style="padding:5px 10px;font-size:10px;text-align:left">Usuario</th>'+
        '<th style="padding:5px 10px;font-size:10px;text-align:left">Rol</th>'+
        '<th style="padding:5px 10px;font-size:10px"></th>'+
      '</tr></thead><tbody>'+
      (DB.config.usuarios||[]).map(function(u,i){
        return '<tr style="border-bottom:1px solid var(--border)">'+
          '<td style="padding:6px 10px;font-size:12px;font-weight:700">'+u.nombre+'</td>'+
          '<td style="padding:6px 10px"><span style="background:'+(u.rol==='Administrador'?'#3a0000':'#2a1a00')+';color:'+(u.rol==='Administrador'?'var(--primary)':'var(--amber)')+';padding:2px 8px;border-radius:8px;font-size:10px;font-weight:700">'+u.rol+'</span></td>'+
          '<td style="padding:6px 10px;display:flex;gap:4px">'+
            '<button class="btn btn-sm" onclick="editarUsuario('+i+')">Editar</button>'+
            (DB.config.usuarios.length>1?'<button class="btn btn-sm" style="color:var(--red)" onclick="eliminarUsuario('+i+')">X</button>':'')+
          '</td>'+
        '</tr>';
      }).join('')+
      '</tbody></table>'+
    '<button class="btn btn-p" onclick="nuevoUsuario()">+ Nuevo usuario</button>';
}
function saveConfig(){
  if(!DB.config) DB.config={};
  var g=function(id){var el=document.getElementById(id);return el?el.value:'';};
  DB.config.empresa=g('cfg-empresa');
  DB.config.email=g('cfg-email');
  DB.config.tel=g('cfg-tel');
  DB.config.tipoCambio=parseFloat(g('cfg-tc'))||1;
  if(_saveTimer) clearTimeout(_saveTimer);
  _saveTimer=setTimeout(function(){save();},800);
}
function agregarMotivo(){
  var inp=document.getElementById('nuevo-motivo');var v=inp.value.trim();
  if(!v) return;
  if(!DB.config.motivosSalida) DB.config.motivosSalida=[];
  if(DB.config.motivosSalida.indexOf(v)>=0){alert('Ya existe ese motivo.');return;}
  DB.config.motivosSalida.push(v);save();inp.value='';renderConfig();
}
function eliminarMotivo(i){
  if(!confirm('Eliminar este motivo?')) return;
  DB.config.motivosSalida.splice(i,1);save();renderConfig();
}
function agregarOrigen(){
  var inp=document.getElementById('nuevo-origen');var v=inp.value.trim();
  if(!v) return;
  if(!DB.config.origenesEntrada) DB.config.origenesEntrada=[];
  if(DB.config.origenesEntrada.indexOf(v)>=0){alert('Ya existe ese origen.');return;}
  DB.config.origenesEntrada.push(v);save();inp.value='';renderConfig();
}
function eliminarOrigen(i){
  if(!confirm('Eliminar este origen?')) return;
  DB.config.origenesEntrada.splice(i,1);save();renderConfig();
}

function toggleLogin(val){
  DB.config.loginDeshabilitado = val === true || val === 'true';
  save();
  var msg = DB.config.loginDeshabilitado ? 'Login deshabilitado. Al recargar entrará directo como Administrador.' : 'Login habilitado. Al recargar pedirá usuario y contraseña.';
  alert(msg);
}

function nuevoUsuario(){
  var operariosActivos=(DB.operarios||[]).filter(function(o){return o.activo!==false;});
  openModal('Nuevo usuario',
    '<div class="fg2">'+
      '<div class="fg"><label>Usuario *</label><input id="nu-nombre" placeholder="nombre de usuario"></div>'+
      '<div class="fg"><label>Contraseña *</label><input id="nu-pass" type="password" placeholder="contraseña"></div>'+
      '<div class="fg"><label>Rol</label>'+
        '<select id="nu-rol" onchange="document.getElementById(\'nu-op-wrap\').style.display=this.value===\'Operador\'?\'block\':\'none\'" style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;background:var(--surface2);color:var(--text)">'+
          '<option>Operador</option><option>Administrador</option>'+
        '</select></div>'+
      '<div class="fg" id="nu-op-wrap"><label>Operario vinculado</label>'+
        '<select id="nu-operario" style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;background:var(--surface2);color:var(--text)">'+
          '<option value="">-- Sin vincular --</option>'+
          operariosActivos.map(function(o){return '<option value="'+o.id+'">'+o.nombre+(o.especialidad?' ('+o.especialidad+')':'')+'</option>';}).join('')+
        '</select>'+
        '<div style="font-size:10px;color:var(--text2);margin-top:3px">El operario vinculado solo verá los proyectos donde tiene tareas asignadas.</div>'+
      '</div>'+
    '</div>',
    function(){
      var nombre=document.getElementById('nu-nombre').value.trim();
      var pass=document.getElementById('nu-pass').value;
      var rol=document.getElementById('nu-rol').value;
      if(!nombre||!pass){alert('Usuario y contraseña son obligatorios.');return false;}
      if((DB.config.usuarios||[]).find(function(u){return u.nombre===nombre;})){alert('Ya existe un usuario con ese nombre.');return false;}
      if(!DB.config.usuarios) DB.config.usuarios=[];
      var opId=parseInt(document.getElementById('nu-operario')?document.getElementById('nu-operario').value:0)||null;
      DB.config.usuarios.push({nombre:nombre,password:pass,rol:rol,operarioId:opId});
      save();renderConfig();return true;
    });
}

function editarUsuario(idx){
  var u=(DB.config.usuarios||[])[idx];
  if(!u) return;
  var operariosActivos=(DB.operarios||[]).filter(function(o){return o.activo!==false;});
  openModal('Editar usuario -- '+u.nombre,
    '<div class="fg2">'+
      '<div class="fg"><label>Nueva contraseña</label><input id="eu-pass" type="password" placeholder="dejar vacio para no cambiar"></div>'+
      '<div class="fg"><label>Rol</label>'+
        '<select id="eu-rol" onchange="document.getElementById(\'eu-op-wrap\').style.display=this.value===\'Operador\'?\'block\':\'none\'" style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;background:var(--surface2);color:var(--text)">'+
          '<option'+(u.rol==='Operador'?' selected':'')+'>Operador</option>'+
          '<option'+(u.rol==='Administrador'?' selected':'')+'>Administrador</option>'+
        '</select></div>'+
      '<div class="fg" id="eu-op-wrap" style="display:'+(u.rol==='Operador'?'block':'none')+'"><label>Operario vinculado</label>'+
        '<select id="eu-operario" style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;background:var(--surface2);color:var(--text)">'+
          '<option value="">-- Sin vincular --</option>'+
          operariosActivos.map(function(o){return '<option value="'+o.id+'"'+(u.operarioId===o.id?' selected':'')+'>'+o.nombre+(o.especialidad?' ('+o.especialidad+')':'')+'</option>';}).join('')+
        '</select>'+
        '<div style="font-size:10px;color:var(--text2);margin-top:3px">El operario vinculado solo verá los proyectos donde tiene tareas asignadas.</div>'+
      '</div>'+
    '</div>',
    function(){
      var pass=document.getElementById('eu-pass').value;
      var rol=document.getElementById('eu-rol').value;
      if(pass) u.password=pass;
      u.rol=rol;
      u.operarioId=parseInt(document.getElementById('eu-operario')?document.getElementById('eu-operario').value:0)||null;
      save();renderConfig();return true;
    });
}

function eliminarUsuario(idx){
  var u=(DB.config.usuarios||[])[idx];
  if(!u) return;
  if(!confirm('Eliminar usuario "'+u.nombre+'"?')) return;
  DB.config.usuarios.splice(idx,1);
  save();renderConfig();
}

// =======================================================
// BACKUP / MIGRAR
// =======================================================
function renderBackupInfo(){
  var el=document.getElementById('backup-info');if(!el) return;
  var kb=Math.round(JSON.stringify(DB).length/1024);
  el.innerHTML=
    fbox('Componentes',DB.componentes.length)+
    fbox('Movimientos activos',DB.movimientos.length)+
    fbox('Movimientos archivados',(DB.movimientosArchivados||[]).length)+
    fbox('Ordenes de compra',DB.ordenes.length)+
    fbox('Proveedores',DB.proveedores.length)+
    fbox('Tamano de datos',kb+' KB')+
    '<div style="margin-top:14px;padding:12px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r)">'+
      '<div style="font-size:11px;font-weight:700;margin-bottom:8px">Archivar movimientos viejos</div>'+
      '<div style="font-size:11px;color:var(--text2);margin-bottom:10px">Mueve movimientos anteriores a X meses al archivo historico. No afecta el stock (el cache lo recalcula desde ambas fuentes).</div>'+
      '<div style="display:flex;align-items:center;gap:8px">'+
        '<label style="font-size:12px">Archivar movimientos de mas de</label>'+
        '<input id="arch-meses" type="number" min="1" max="60" value="6" style="width:60px;padding:5px 8px;border:1px solid var(--border);border-radius:var(--r);background:var(--surface2);color:var(--text);font-size:12px">'+
        '<label style="font-size:12px">meses</label>'+
        '<button class="btn btn-p" onclick="archivarMovimientos()">Archivar</button>'+
        ((DB.movimientosArchivados||[]).length?'<button class="btn" onclick="verMovimientosArchivados()">Ver archivados ('+DB.movimientosArchivados.length+')</button>':'')+''+
      '</div>'+
    '</div>';
}

function archivarMovimientos(){
  var meses=parseInt(document.getElementById('arch-meses')?document.getElementById('arch-meses').value:6)||6;
  var corte=new Date();
  corte.setMonth(corte.getMonth()-meses);
  var fechaCorte=corte.getFullYear()+'-'+String(corte.getMonth()+1).padStart(2,'0')+'-'+String(corte.getDate()).padStart(2,'0');
  var aArchivar=DB.movimientos.filter(function(m){return (m.fecha||'')<fechaCorte;});
  if(!aArchivar.length){alert('No hay movimientos anteriores a '+meses+' meses para archivar.');return;}
  if(!confirm('Archivar '+aArchivar.length+' movimientos anteriores al '+fechaCorte+'?\nQuedan accesibles en "Ver archivados" y en los backups.')) return;
  if(!DB.movimientosArchivados) DB.movimientosArchivados=[];
  DB.movimientosArchivados=DB.movimientosArchivados.concat(aArchivar);
  DB.movimientos=DB.movimientos.filter(function(m){return (m.fecha||'')>=fechaCorte;});
  save();
  alert('Archivados '+aArchivar.length+' movimientos. Stock no modificado.');
  renderBackupInfo();
}

function verMovimientosArchivados(){
  var arch=DB.movimientosArchivados||[];
  if(!arch.length){alert('No hay movimientos archivados.');return;}
  var list=[...arch].sort(function(a,b){return (b.fecha||'').localeCompare(a.fecha||'');});
  var h='<div style="font-size:11px;color:var(--text2);margin-bottom:10px">'+arch.length+' movimientos archivados. Solo lectura.</div>'+
    '<table style="width:100%;border-collapse:collapse">'+
      '<thead><tr style="background:var(--surface2)">'+
        '<th style="padding:5px 8px;font-size:10px">Fecha</th>'+
        '<th style="padding:5px 8px;font-size:10px">Componente</th>'+
        '<th style="padding:5px 8px;font-size:10px">Tipo</th>'+
        '<th style="padding:5px 8px;font-size:10px;text-align:center">Cant</th>'+
        '<th style="padding:5px 8px;font-size:10px">Nota</th>'+
      '</tr></thead><tbody>'+
      list.slice(0,200).map(function(m){
        var comp=DB.componentes.find(function(c){return c.id===(m.cid||m.compId);})||{desc:'?',unidad:''};
        var esEnt=m.tipo==='Entrada';
        return '<tr style="border-bottom:1px solid var(--border)">'+
          '<td style="padding:4px 8px;font-size:11px;color:var(--text2)">'+m.fecha+'</td>'+
          '<td style="padding:4px 8px;font-size:11px">'+comp.desc+'</td>'+
          '<td style="padding:4px 8px;font-size:11px">'+m.tipo+'</td>'+
          '<td style="padding:4px 8px;text-align:center;font-size:11px;font-weight:700;color:'+(esEnt?'var(--green)':'var(--red)')+'">'+
            (esEnt?'+':'-')+(m.cant||0)+'</td>'+
          '<td style="padding:4px 8px;font-size:10px;color:var(--text2)">'+(m.nota||m.origen||'--')+'</td>'+
        '</tr>';
      }).join('')+
      (list.length>200?'<tr><td colspan="5" style="padding:8px;text-align:center;color:var(--text2);font-size:11px">...y '+(list.length-200)+' mas</td></tr>':'')+
      '</tbody></table>';
  openModal('Movimientos archivados',h,null,true);
}

function migrarDesdeVSS4(){
  if(!confirm('Esto reemplazara todos los datos de logistica actuales con los del CRM (vss4). Confirmar?')) return;
  try {
    var vss4 = JSON.parse(localStorage.getItem('vss4'));
    if(!vss4||!vss4.componentes){alert('No se encontro el CRM (vss4) en este dispositivo.');return;}
    DB.componentes  = vss4.componentes  || [];
    DB.movimientos  = vss4.movimientos  || [];
    DB.ordenes      = vss4.ordenes      || [];
    DB.proveedores  = vss4.proveedores  || [];
    if(vss4.config){
      DB.config.empresa     = vss4.config.empresa     || DB.config.empresa;
      DB.config.tipoCambio  = vss4.config.tipoCambio  || DB.config.tipoCambio;
      DB.config.email       = vss4.config.email       || DB.config.email;
      DB.config.tel         = vss4.config.tel         || DB.config.tel;
    }
    // Reasignar IDs para evitar colisiones
    DB.nid = Math.max(
      DB.componentes.reduce(function(a,c){return Math.max(a,c.id||0);},0),
      DB.movimientos.reduce(function(a,m){return Math.max(a,m.id||0);},0),
      DB.ordenes.reduce(function(a,o){return Math.max(a,o.id||0);},0),
      DB.proveedores.reduce(function(a,p){return Math.max(a,p.id||0);},0)
    ) + 1;
    save();
    alert('Migracion completada.\n- Componentes: '+DB.componentes.length+'\n- Movimientos: '+DB.movimientos.length+'\n- Ordenes: '+DB.ordenes.length+'\n- Proveedores: '+DB.proveedores.length);
    renderBackupInfo();
    renderStock();
  } catch(e){
    alert('Error al migrar: '+e.message);
  }
}

function exportarJSON(){
  var json=JSON.stringify(DB,null,2);
  var blob=new Blob([json],{type:'application/json'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');a.href=url;a.download='vss_logistica_backup_'+today()+'.json';a.click();
  URL.revokeObjectURL(url);
}

function exportarExcel(){
  if(typeof XLSX==='undefined'){alert('SheetJS no disponible. Recarga la app e intenta de nuevo.');return;}
  var wb=XLSX.utils.book_new();
  var tc=(DB.config&&DB.config.tipoCambio)||1;

  // HOJA 1: STOCK
  var stockRows=[['Codigo','Descripcion','Categoria','Unidad','Stock','Minimo','Costo $','Costo U$S','Valor total $','Cajonera','N° Cajon','Proveedor','Estado']];
  DB.componentes.forEach(function(c){
    var qty=stockActual(c.id);
    var costo=parseFloat(c.costo)||0;
    stockRows.push([
      c.codigo,c.desc,c.categoria,c.unidad,qty,
      parseFloat(c.min)||0,costo,
      parseFloat(c.costo_usd)||(tc>1?Math.round(costo/tc):0),
      qty*costo,
      c.ubicacion||'',c.nroCajon||'',
      c.proveedor||'',c.estadoMat||'N'
    ]);
  });
  var wsStock=XLSX.utils.aoa_to_sheet(stockRows);
  wsStock['!cols']=[{wch:14},{wch:35},{wch:16},{wch:8},{wch:8},{wch:8},{wch:12},{wch:12},{wch:14},{wch:14},{wch:10},{wch:20},{wch:8}];
  XLSX.utils.book_append_sheet(wb,wsStock,'Stock');

  // HOJA 2: MOVIMIENTOS
  var movRows=[['Fecha','Componente','Codigo','Tipo','Cantidad','Unidad','Origen','Nota','Referencia']];
  var todosMovs=[...(DB.movimientosArchivados||[]),...DB.movimientos]
    .sort(function(a,b){return (b.fecha||'').localeCompare(a.fecha||'');});
  todosMovs.forEach(function(m){
    var comp=DB.componentes.find(function(c){return c.id===(m.cid||m.compId);})||{desc:'?',codigo:'',unidad:''};
    movRows.push([
      m.fecha,comp.desc,comp.codigo,m.tipo,
      parseFloat(m.cant)||0,comp.unidad||'',
      m.origen||'',m.nota||'',m.ref||''
    ]);
  });
  var wsMov=XLSX.utils.aoa_to_sheet(movRows);
  wsMov['!cols']=[{wch:12},{wch:35},{wch:14},{wch:18},{wch:10},{wch:8},{wch:16},{wch:30},{wch:16}];
  XLSX.utils.book_append_sheet(wb,wsMov,'Movimientos');

  // HOJA 3: PROYECTOS
  var proyRows=[['N°','Nombre','Estado','Prioridad','Fecha inicio','Fecha est. fin','Fecha fin real','Presupuesto $','Costo materiales $','MO planif. $','MO ejecutada $','Total erogado $','Dif. presupuesto $','% Avance MO','Tareas total','Tareas OK','Tareas atrasadas']];
  (DB.proyectos||[]).forEach(function(p){
    var matCosto=(p.materiales||[]).reduce(function(a,m){
      var comp=(compById(m.compId)||{costo:0});
      return a+(parseFloat(m.cant)||0)*(parseFloat(comp.costo)||0);
    },0);
    var moEstim=(p.tareas||[]).reduce(function(a,t){return a+(parseFloat(t.costoMO)||0);},0);
    var moReal=(p.tareas||[]).filter(function(t){return tareaEstadoCached(t)==='OK';}).reduce(function(a,t){return a+(parseFloat(t.costoMO)||0);},0);
    var totalErog=matCosto+moReal;
    var presup=parseFloat(p.presupuesto)||0;
    var pesoTotal=(p.tareas||[]).reduce(function(a,t){return a+(parseFloat(t.peso)||0);},0);
    var avMO=pesoTotal>0?Math.round((p.tareas||[]).reduce(function(a,t){return a+(parseFloat(t.peso)||0)*(parseFloat(t.avanceReal)||0)/100;},0)):0;
    var tOK=(p.tareas||[]).filter(function(t){return tareaEstadoCached(t)==='OK';}).length;
    var tAt=(p.tareas||[]).filter(function(t){return tareaEstadoCached(t)==='Atrasado';}).length;
    proyRows.push([
      p.numero,p.nombre,p.estado,p.prioridad||'',
      p.fechaInicio||'',p.fechaEstFin||'',p.fechaFinReal||'',
      presup,Math.round(matCosto),Math.round(moEstim),Math.round(moReal),
      Math.round(totalErog),presup?Math.round(presup-totalErog):0,
      avMO,(p.tareas||[]).length,tOK,tAt
    ]);
  });
  var wsProy=XLSX.utils.aoa_to_sheet(proyRows);
  wsProy['!cols']=[{wch:10},{wch:35},{wch:12},{wch:10},{wch:12},{wch:14},{wch:14},{wch:14},{wch:16},{wch:14},{wch:14},{wch:14},{wch:16},{wch:12},{wch:12},{wch:10},{wch:14}];
  XLSX.utils.book_append_sheet(wb,wsProy,'Proyectos');

  // HOJA 4: TAREAS
  var tareasRows=[['Proyecto N°','Proyecto','Tarea','Estado','Fecha venc.','Costo MO $','Peso %','Avance %']];
  (DB.proyectos||[]).forEach(function(p){
    (p.tareas||[]).forEach(function(t){
      tareasRows.push([
        p.numero,p.nombre,t.desc,tareaEstadoCached(t),
        t.fechaCumplimiento||'',parseFloat(t.costoMO)||0,
        parseFloat(t.peso)||0,parseFloat(t.avanceReal)||0
      ]);
    });
  });
  var tareas=XLSX.utils.aoa_to_sheet(tareasRows);
  tareas['!cols']=[{wch:10},{wch:30},{wch:40},{wch:12},{wch:12},{wch:12},{wch:8},{wch:8}];
  XLSX.utils.book_append_sheet(wb,tareas,'Tareas');

  // HOJA 5: OPERARIOS con carga de trabajo
  var opRows=[['Nombre','Especialidad','Telefono','Estado','Tareas pendientes','Tareas atrasadas','Total asignadas','MO asignada $']];
  (DB.operarios||[]).forEach(function(o){
    var tareasAsig=[];
    (DB.proyectos||[]).forEach(function(p){
      if(p.estado==='Cancelado'||p.estado==='Finalizado') return;
      (p.tareas||[]).forEach(function(t){
        if(t.operario===o.id) tareasAsig.push({proy:p,tarea:t,estado:tareaEstadoCached(t)});
      });
    });
    var pend=tareasAsig.filter(function(x){return x.estado!=='OK'&&x.estado!=='Cancelado';});
    var atr=pend.filter(function(x){return x.estado==='Atrasado';});
    var mo=pend.reduce(function(a,x){return a+(parseFloat(x.tarea.costoMO)||0);},0);
    opRows.push([o.nombre,o.especialidad||'',o.tel||'',o.activo===false?'Inactivo':'Activo',pend.length,atr.length,tareasAsig.length,Math.round(mo)]);
  });
  var wsOp=XLSX.utils.aoa_to_sheet(opRows);
  wsOp['!cols']=[{wch:25},{wch:18},{wch:16},{wch:10},{wch:16},{wch:16},{wch:16},{wch:14}];
  XLSX.utils.book_append_sheet(wb,wsOp,'Operarios');

  // HOJA 6: TAREAS POR OPERARIO
  var opTareasRows=[['Operario','Proyecto','Tarea','Estado','Fecha venc.','Costo MO $','Peso %','Avance %']];
  (DB.operarios||[]).forEach(function(o){
    (DB.proyectos||[]).forEach(function(p){
      (p.tareas||[]).forEach(function(t){
        if(t.operario!==o.id) return;
        opTareasRows.push([o.nombre,p.numero+' -- '+p.nombre,t.desc,tareaEstadoCached(t),t.fechaCumplimiento||'',parseFloat(t.costoMO)||0,parseFloat(t.peso)||0,parseFloat(t.avanceReal)||0]);
      });
    });
  });
  var wsOpT=XLSX.utils.aoa_to_sheet(opTareasRows);
  wsOpT['!cols']=[{wch:20},{wch:35},{wch:40},{wch:22},{wch:12},{wch:12},{wch:8},{wch:8}];
  XLSX.utils.book_append_sheet(wb,wsOpT,'Tareas por operario');

  XLSX.writeFile(wb,'vss_logistica_'+today()+'.xlsx');
}
function exportarADrive(){
  var json=JSON.stringify(DB,null,2);
  var blob=new Blob([json],{type:'application/json'});
  var file=new File([blob],'vss_logistica_backup_'+today()+'.json',{type:'application/json'});
  if(navigator.canShare&&navigator.canShare({files:[file]})){
    navigator.share({files:[file],title:'VSS Logistica Backup '+today()}).catch(function(e){if(e.name!=='AbortError') exportarJSON();});
  } else { exportarJSON(); }
}
function importarJSON(input){
  var file=input.files[0];if(!file) return;
  if(!confirm('Esto reemplazara TODOS los datos actuales. Confirmar?')) return;
  var reader=new FileReader();
  reader.onload=function(e){
    try{
      var data=JSON.parse(e.target.result);
      if(!data.componentes){alert('Archivo invalido.');return;}
      DB=data;save();
      alert('Backup restaurado correctamente.');
      location.reload();
    }catch(err){alert('Error al leer el archivo: '+err.message);}
  };
  reader.readAsText(file);
}
function borrarTodo(){
  if(!confirm('Borrar TODOS los datos? Esta accion no se puede deshacer.')) return;
  if(!confirm('Ultima confirmacion. Seguro?')) return;
  localStorage.removeItem(SKEY);
  alert('Datos borrados.');location.reload();
}

// =======================================================
// INIT
// =======================================================
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').then(function(){console.log('SW OK');}).catch(function(e){console.log('SW error:',e);});
}

// =======================================================
// DASHBOARD
// =======================================================
function irAStockCritico(){
  _stockSort={col:'cant',dir:1};
  _stockSoloCritico=true;
  goTo('stock');
}

function togglePanel(id){
  var el=document.getElementById(id);
  var ico=document.getElementById(id+'-ico');
  if(!el) return;
  var abierto=el.style.display!=='none';
  el.style.display=abierto?'none':'block';
  if(ico) ico.textContent=abierto?'▼':'▲';
}
function renderDashboard(){
  var el = document.getElementById('dashboard-body');
  if(!el) return;
  var hoy = today();

  // Banner operario vinculado
  var opActual=operarioDelUsuario();
  var bannerOp='';
  if(opActual){
    var misProys=proyectosDelOperario();
    var misTareas=[];
    misProys.forEach(function(p){
      (p.tareas||[]).forEach(function(t){
        if(t.operario===opActual.id&&tareaEstadoCached(t)!=='OK'&&tareaEstadoCached(t)!=='Cancelado')
          misTareas.push({proy:p,tarea:t,estado:tareaEstadoCached(t)});
      });
    });
    var atrasadas=misTareas.filter(function(x){return x.estado==='Atrasado';}).length;
    bannerOp='<div style="background:#0a1a2a;border:1px solid #1565C0;border-radius:var(--r);padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:12px">'+
      '<div style="display:flex;align-items:center;gap:10px">'+
        '<div style="width:32px;height:32px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;color:#fff">'+opActual.nombre[0].toUpperCase()+'</div>'+
        '<div>'+
          '<div style="font-weight:700;font-size:12px">'+opActual.nombre+(opActual.especialidad?' &middot; '+opActual.especialidad:'')+'</div>'+
          '<div style="font-size:11px;color:var(--text2);margin-top:1px">'+misTareas.length+' tarea'+(misTareas.length!==1?'s':'')+' pendiente'+(misTareas.length!==1?'s':'')+(atrasadas>0?' &middot; <span style="color:var(--red);font-weight:700">'+atrasadas+' atrasada'+(atrasadas>1?'s':'')+'</span>':'')+'</div>'+
        '</div>'+
      '</div>'+
      '<button class="btn btn-sm" onclick="goTo(\'proyectos\')">Mis proyectos</button>'+
    '</div>';
  }

  var tareasVencidas = [];
  (proyectosDelOperario()).filter(function(p){return p.estado==='En curso'||p.estado==='Planificado';}).forEach(function(p){
    (p.tareas||[]).forEach(function(t,ti){
      if(tareaEstadoCached(t)==='Atrasado') tareasVencidas.push({proj:p,tarea:t,idx:ti});
    });
  });

  var _baseProys=proyectosDelOperario();
  var proyActivos = _baseProys.filter(function(p){return p.estado==='En curso';});
  var proyPlanif  = _baseProys.filter(function(p){return p.estado==='Planificado';});
  var proyPausados = _baseProys.filter(function(p){return p.estado==='Pausado';});
  var stockCritico = DB.componentes.filter(function(c){
    return stockActual(c.id)<=(parseFloat(c.min)||0)&&(parseFloat(c.min)||0)>0;
  });
  var ocPendientes = (DB.ordenes||[]).filter(function(o){return !o.ocReserva&&(o.estado==='Pendiente'||o.estado==='Enviada');});
  var ultMovs = [...(DB.movimientos||[])].sort(function(a,b){return (b.fecha||'').localeCompare(a.fecha||'');}).slice(0,5);

  // Depositos transitorios: proyectos planificados con materiales reservados
  var depositosTransitorios=(DB.proyectos||[]).filter(function(p){
    return p.estado==='Planificado'&&(p.materiales||[]).some(function(m){return m.reservado;});
  });
  // Entregas parciales: proyectos En curso con cantPendienteOC > 0 en algun material
  var entregasParciales=(DB.proyectos||[]).filter(function(p){
    return p.estado==='En curso'&&(p.materiales||[]).some(function(m){return (parseFloat(m.cantPendienteOC)||0)>0;});
  });

  var h = bannerOp;

  if(tareasVencidas.length){
    h += '<div style="background:#7f0000;border-radius:var(--r);padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:12px">'+
      '<div style="display:flex;align-items:center;gap:10px">'+
        '<span style="font-size:20px">&#9888;&#65039;</span>'+
        '<div>'+
          '<div style="font-weight:700;color:#fff;font-size:13px">'+tareasVencidas.length+' tarea'+(tareasVencidas.length>1?'s':'')+' vencida'+(tareasVencidas.length>1?'s':'')+' en proyectos activos</div>'+
          '<div style="font-size:11px;color:#ffaaaa;margin-top:2px">'+tareasVencidas.slice(0,3).map(function(tv){return tv.proj.numero+': '+tv.tarea.desc.slice(0,30);}).join(' &middot; ')+'</div>'+
        '</div>'+
      '</div>'+
      '<button class="btn btn-sm" style="background:#fff;color:#7f0000;font-weight:700" onclick="goTo(\'proyectos\')">Ver proyectos</button>'+
    '</div>';
  }

  h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-bottom:20px">'+
    '<div class="stat" style="cursor:pointer" onclick="goTo(\'proyectos\')"><div class="stat-n blue">'+proyActivos.length+'</div><div class="stat-l">En curso</div></div>'+
    '<div class="stat" style="cursor:pointer" onclick="goTo(\'proyectos\')"><div class="stat-n amber">'+proyPlanif.length+'</div><div class="stat-l">Planificados</div></div>'+
    (proyPausados.length?'<div class="stat" style="cursor:pointer;border-color:#555" onclick="goTo(\'proyectos\')"><div class="stat-n" style="color:#aaa">'+proyPausados.length+'</div><div class="stat-l">Pausados</div></div>':'')+
    (tareasVencidas.length?'<div class="stat" style="cursor:pointer;border-color:#7f0000" onclick="goTo(\'proyectos\')"><div class="stat-n red">'+tareasVencidas.length+'</div><div class="stat-l">Tareas vencidas</div></div>':'')+
    '<div class="stat" style="cursor:pointer" onclick="irAStockCritico()"><div class="stat-n '+(stockCritico.length>0?'red':'green')+'">'+stockCritico.length+'</div><div class="stat-l">Stock critico</div></div>'+
    '<div class="stat" style="cursor:pointer;border-color:#1565C0" onclick="togglePanel(\'dash-oc-pend\')"><div class="stat-n" style="color:#4fc3f7">'+ocPendientes.length+'</div><div class="stat-l">OC pendientes</div></div>'+
    '<div class="stat" style="cursor:pointer;border-color:#6a1b9a" onclick="togglePanel(\'dash-dep-trans\')"><div class="stat-n" style="color:#ce93d8">'+depositosTransitorios.length+'</div><div class="stat-l">Dep. transitorios</div></div>'+
    '<div class="stat" style="cursor:pointer;border-color:#E65100" onclick="togglePanel(\'dash-ent-parc\')"><div class="stat-n" style="color:#ffa726">'+entregasParciales.length+'</div><div class="stat-l">Entregas parciales</div></div>'+
    '<div class="stat"><div class="stat-n">'+DB.componentes.length+'</div><div class="stat-l">Componentes</div></div>'+
  '</div>';

  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">';

  // Panel proyectos activos + pausados
  h += '<div class="card">'+
    '<div class="ch"><div class="ct">Proyectos activos</div><button class="btn btn-sm" onclick="goTo(\'proyectos\')">Ver todos</button></div>'+
    '<div class="card-body">';

  function filaProyecto(p, esPausado){
    var tareasP=(p.tareas||[]);
    var venc=tareasP.filter(function(t){return tareaEstadoCached(t)==='Atrasado';}).length;
    var ok=tareasP.filter(function(t){return tareaEstadoCached(t)==='OK';}).length;
    var pct=p.fechaInicio&&p.fechaEstFin?Math.min(100,Math.max(0,Math.round((new Date(hoy)-new Date(p.fechaInicio))/(new Date(p.fechaEstFin)-new Date(p.fechaInicio))*100))):0;
    var tieneEntregaParcial=(p.materiales||[]).some(function(m){return (parseFloat(m.cantPendienteOC)||0)>0;});
    var color=esPausado?'var(--text2)':'var(--primary)';
    var barColor=esPausado?'#555':(pct>=100?'var(--red)':'var(--blue)');
    return '<div style="margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid var(--border)">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'+
        '<span style="font-size:12px;font-weight:700;cursor:pointer;color:'+color+'" onclick="cerrarBusqueda();goTo(\'proyectos\');setTimeout(function(){abrirProyecto('+p.id+');},200)">'+p.nombre+'</span>'+
        '<span style="font-family:monospace;font-size:10px;color:var(--text2)">'+p.numero+'</span>'+
      '</div>'+
      (tareasP.length||tieneEntregaParcial?
        '<div style="display:flex;gap:6px;margin-bottom:4px;flex-wrap:wrap">'+
          (venc?'<span style="background:var(--red);color:#fff;padding:1px 6px;border-radius:8px;font-size:10px">'+venc+' vencida'+(venc>1?'s':'')+'</span>':'')+
          (ok?'<span style="background:var(--green);color:#fff;padding:1px 6px;border-radius:8px;font-size:10px">'+ok+' OK</span>':'')+
          (tareasP.length?'<span style="color:var(--text2);font-size:10px">'+tareasP.length+' tareas</span>':'')+
          (tieneEntregaParcial?'<span style="background:#3a1a00;color:#ffa726;padding:1px 6px;border-radius:8px;font-size:10px">entrega parcial</span>':'')+
        '</div>':'')+
      (p.fechaInicio&&p.fechaEstFin?
        '<div style="background:var(--surface2);border-radius:3px;height:4px;overflow:hidden"><div style="height:100%;background:'+barColor+';width:'+pct+'%"></div></div>'+
        '<div style="font-size:10px;color:var(--text2);margin-top:2px">'+pct+'% tiempo &middot; fin: '+p.fechaEstFin+(esPausado&&p.fechaPausa?' &middot; pausado: '+p.fechaPausa:'')+'</div>':'')+
      (esPausado&&p.razonPausa?'<div style="margin-top:4px"><span style="background:#2a2000;border:1px solid #665500;color:#ffcc44;padding:2px 8px;border-radius:8px;font-size:10px;font-weight:700">⏸ '+p.razonPausa+'</span></div>':'')+
      '</div>';
  }

  if(!proyActivos.length && !proyPausados.length){
    h += '<div class="empty">Sin proyectos en curso.</div>';
  } else {
    proyActivos.slice(0,3).forEach(function(p){ h += filaProyecto(p, false); });
    if(proyPausados.length){
      h += '<div style="display:flex;align-items:center;gap:8px;margin:10px 0 8px">'+
        '<div style="flex:1;height:1px;background:var(--border)"></div>'+
        '<span style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap">⏸ Pausados</span>'+
        '<div style="flex:1;height:1px;background:var(--border)"></div>'+
      '</div>';
      proyPausados.slice(0,2).forEach(function(p){ h += filaProyecto(p, true); });
    }
  }
  h += '</div></div>';

  // Panel stock critico
  h += '<div class="card">'+
    '<div class="ch"><div class="ct">Stock critico</div><button class="btn btn-sm" onclick="irAStockCritico()">Ver stock</button></div>'+
    '<div class="card-body">';
  if(!stockCritico.length){
    h += '<div class="empty" style="color:var(--green)">Sin componentes criticos.</div>';
  } else {
    h += '<table style="width:100%;border-collapse:collapse">'+
      '<thead><tr>'+
        '<th style="font-size:10px;color:var(--text2);padding:3px 0;border-bottom:1px solid var(--border)">Componente</th>'+
        '<th style="font-size:10px;color:var(--text2);padding:3px 4px;text-align:center;border-bottom:1px solid var(--border)">Stock</th>'+
        '<th style="font-size:10px;color:#ce93d8;padding:3px 4px;text-align:center;border-bottom:1px solid var(--border)">Reserva</th>'+
        '<th style="font-size:10px;color:var(--text2);padding:3px 0;border-bottom:1px solid var(--border)">Min</th>'+
      '</tr></thead>';
    stockCritico.slice(0,4).forEach(function(c){
      var cant=stockActual(c.id);
      var reserva=stockReservado(c.id);
      h += '<tr style="border-bottom:1px solid var(--border)">'+
        '<td style="padding:3px 0;font-size:11px">'+c.desc+'</td>'+
        '<td style="padding:3px 4px;text-align:center;font-weight:700;color:'+(cant<=0?'var(--red)':'var(--amber)')+'">'+cant+'</td>'+
        '<td style="padding:3px 4px;text-align:center;font-size:10px;color:#ce93d8">'+(reserva>0?reserva:'--')+'</td>'+
        '<td style="padding:3px 0;font-size:10px;color:var(--text2)">'+( c.min||0)+'</td>'+
      '</tr>';
    });
    h += '</table>';
    if(stockCritico.length>4) h += '<div style="font-size:11px;color:var(--primary);margin-top:6px;cursor:pointer;text-decoration:underline" onclick="irAStockCritico()">...y '+(stockCritico.length-4)+' más — ver todos ↓</div>';
  }
  h += '</div></div>';

  h += '</div>';

  // Panel depositos transitorios
  // Panel depósitos transitorios — colapsable
  h += '<div class="card" style="margin-top:14px;border-color:#6a1b9a">';
      '<div class="ch" style="border-color:#6a1b9a;cursor:pointer" onclick="togglePanel(\'dash-dep-trans\')">'+
        '<div class="ct" style="color:#ce93d8">📦 Depósitos transitorios ('+depositosTransitorios.length+')</div>'+
        '<span id="dash-dep-trans-ico" style="color:#ce93d8;font-size:14px">▼</span>'+
      '</div>'+
      '<div id="dash-dep-trans" style="display:none"><div class="card-body">';
    if(!depositosTransitorios.length){
      h += '<div class="card-body"><div class="empty">Sin depósitos transitorios.</div></div>';
    } else {
    depositosTransitorios.forEach(function(p,idx){
      var itemsReservados=(p.materiales||[]).filter(function(m){return m.reservado;});
      var valorReserva=itemsReservados.reduce(function(a,m){
        var comp=(compById(m.compId)||{costo:0});
        return a+(parseFloat(m.cant)||0)*(parseFloat(comp.costo)||0);
      },0);
      var tieneOC=DB.ordenes.some(function(o){return o.ocReserva&&o.proyId===p.id&&o.estado!=='Cancelada'&&o.estado!=='Recibida';});
      var ocVinculadas=DB.ordenes.filter(function(o){return o.ocReserva&&o.proyId===p.id&&o.estado!=='Cancelada'&&o.estado!=='Recibida';});
      h += '<div style="'+(idx>0?'margin-top:12px;padding-top:12px;border-top:1px solid var(--border)':'')+'">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'+
          '<span style="font-size:12px;font-weight:700;color:#ce93d8;cursor:pointer" onclick="cerrarBusqueda();goTo(\'proyectos\');setTimeout(function(){abrirProyecto('+p.id+');},200)">'+p.numero+' — '+p.nombre+'</span>'+
          (tieneOC?'<span style="background:#2a0a3a;color:#ce93d8;padding:2px 8px;border-radius:8px;font-size:10px;font-weight:700">OC pendiente</span>':'<span style="background:#0a2a0a;color:#66bb6a;padding:2px 8px;border-radius:8px;font-size:10px">stock OK</span>')+
        '</div>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:11px">'+
          '<div style="background:var(--surface3);border-radius:5px;padding:6px 10px">'+
            '<div style="color:var(--text2);font-size:10px">Items reservados</div>'+
            '<div style="font-weight:700;font-size:14px;color:#ce93d8">'+itemsReservados.length+'</div>'+
          '</div>'+
          '<div style="background:var(--surface3);border-radius:5px;padding:6px 10px">'+
            '<div style="color:var(--text2);font-size:10px">Valor reserva</div>'+
            '<div style="font-weight:700;font-size:13px">$'+Math.round(valorReserva).toLocaleString('es-AR')+'</div>'+
          '</div>'+
        '</div>'+
        (tieneOC?
          '<div style="margin-top:6px;font-size:10px;color:var(--text2)">'+
            ocVinculadas.map(function(oc){
              return '<div style="display:flex;align-items:center;gap:6px;margin-top:3px">'+
                '<span style="color:#ce93d8">'+oc.numero+'</span>'+
                '<span>'+oc.proveedor+'</span>'+
                '<span style="background:#3a0000;color:#ef5350;padding:1px 6px;border-radius:8px;font-size:9px;font-weight:700">'+oc.estado+'</span>'+
              '</div>';
            }).join('')+
          '</div>':'')+
      '</div>';
    });
    }
  h += '</div></div></div>';

  // Panel OC pendientes — colapsable
  var todasOCPend=(DB.ordenes||[]).filter(function(o){return o.estado==='Pendiente'||o.estado==='Enviada'||o.estado==='Pendiente de compra'||o.estado==='Pendiente de entrega';});
  h += '<div class="card" style="margin-top:14px;border-color:#1565C0">'+
    '<div class="ch" style="border-color:#1565C0;cursor:pointer" onclick="togglePanel(\'dash-oc-pend\')">'+
      '<div class="ct" style="color:#4fc3f7">🛒 OC pendientes ('+todasOCPend.length+')</div>'+
      '<span id="dash-oc-pend-ico" style="color:#4fc3f7;font-size:14px">▼</span>'+
    '</div>'+
    '<div id="dash-oc-pend" style="display:none"><div class="card-body">';
  if(!todasOCPend.length){
    h += '<div class="empty">Sin órdenes de compra pendientes.</div>';
  } else {
  h += '<table style="width:100%;border-collapse:collapse">'+
        '<thead><tr style="background:var(--surface2)">'+
          '<th style="padding:5px 10px;font-size:10px">N°</th>'+
          '<th style="padding:5px 10px;font-size:10px">Proveedor</th>'+
          '<th style="padding:5px 10px;font-size:10px">Tipo</th>'+
          '<th style="padding:5px 10px;font-size:10px">Proyecto</th>'+
          '<th style="padding:5px 10px;font-size:10px;text-align:center">Estado</th>'+
          '<th style="padding:5px 10px;font-size:10px;text-align:right">Total $</th>'+
          '<th style="padding:5px 10px;font-size:10px"></th>'+
        '</tr></thead><tbody>'+
        todasOCPend.map(function(oc){
          var proy=oc.proyId?(DB.proyectos||[]).find(function(p){return p.id===oc.proyId;}):null;
          var total=(oc.items||[]).reduce(function(a,item){return a+(parseFloat(item.cant)||0)*(parseFloat(item.precio)||0);},0);
          var esReserva=!!oc.ocReserva;
          var estColor=oc.estado==='Pendiente'||oc.estado==='Pendiente de compra'?'var(--red)':'var(--amber)';
          return '<tr style="border-bottom:1px solid var(--border)">'+
            '<td style="padding:6px 10px;font-size:11px;font-family:monospace;color:var(--text2)">'+oc.numero+'</td>'+
            '<td style="padding:6px 10px;font-size:12px;font-weight:600">'+oc.proveedor+'</td>'+
            '<td style="padding:6px 10px">'+
              (esReserva?'<span style="background:#2a0a3a;color:#ce93d8;padding:1px 7px;border-radius:8px;font-size:10px">Reserva</span>':'<span style="background:var(--surface3);color:var(--text2);padding:1px 7px;border-radius:8px;font-size:10px">Normal</span>')+
            '</td>'+
            '<td style="padding:6px 10px;font-size:11px;color:var(--text2)">'+(proy?proy.numero:'--')+'</td>'+
            '<td style="padding:6px 10px;text-align:center">'+
              '<span style="background:var(--surface2);color:'+estColor+';padding:2px 8px;border-radius:8px;font-size:10px;font-weight:700;border:1px solid '+estColor+'">'+oc.estado+'</span>'+
            '</td>'+
            '<td style="padding:6px 10px;text-align:right;font-size:11px;font-weight:700">'+(total>0?'$'+Math.round(total).toLocaleString('es-AR'):'--')+'</td>'+
            '<td style="padding:6px 10px">'+
              '<button class="btn btn-sm" onclick="cambiarEstadoOrden('+oc.id+')">Estado</button>'+
            '</td>'+
          '</tr>';
        }).join('')+
        '</tbody></table>';
  }
  h += '</div></div></div>';

  // Panel entregas parciales — colapsable
  if(entregasParciales.length){
    h += '<div class="card" style="margin-top:14px;border-color:#E65100">'+
      '<div class="ch" style="border-color:#E65100;cursor:pointer" onclick="togglePanel(\'dash-ent-parc\')">'+
        '<div class="ct" style="color:#ffa726">📬 Entregas parciales ('+entregasParciales.length+')</div>'+
        '<span id="dash-ent-parc-ico" style="color:#ffa726;font-size:14px">▼</span>'+
      '</div>'+
      '<div id="dash-ent-parc" style="display:none"><div class="card-body">';
    entregasParciales.forEach(function(p,idx){
      var matPendientes=(p.materiales||[]).filter(function(m){return (parseFloat(m.cantPendienteOC)||0)>0;});
      var ocVinculadas=DB.ordenes.filter(function(o){return o.ocReserva&&o.proyId===p.id&&o.estado!=='Cancelada'&&o.estado!=='Recibida';});
      h += '<div style="'+(idx>0?'margin-top:14px;padding-top:14px;border-top:1px solid var(--border)':'')+'">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'+
          '<span style="font-size:12px;font-weight:700;color:#ffa726;cursor:pointer" onclick="cerrarBusqueda();goTo(\'proyectos\');setTimeout(function(){abrirProyecto('+p.id+');},200)">'+p.numero+' — '+p.nombre+'</span>'+
        '</div>'+
        '<table style="width:100%;border-collapse:collapse;margin-bottom:8px">'+
          '<thead><tr>'+
            '<th style="font-size:10px;color:var(--text2);padding:3px 0;border-bottom:1px solid var(--border)">Material pendiente</th>'+
            '<th style="font-size:10px;color:#66bb6a;text-align:center;padding:3px 4px;border-bottom:1px solid var(--border)">Entregado</th>'+
            '<th style="font-size:10px;color:#ef5350;text-align:center;padding:3px 4px;border-bottom:1px solid var(--border)">Pendiente</th>'+
          '</tr></thead><tbody>'+
          matPendientes.map(function(m){
            var comp=(compById(m.compId)||{desc:'?',unidad:''});
            return '<tr style="border-bottom:1px solid var(--border)">'+
              '<td style="padding:4px 0;font-size:11px">'+comp.desc+'</td>'+
              '<td style="padding:4px 4px;text-align:center;font-weight:700;color:#66bb6a">'+(parseFloat(m.entregado)||0)+' '+(comp.unidad||'')+'</td>'+
              '<td style="padding:4px 4px;text-align:center;font-weight:700;color:#ef5350">'+(parseFloat(m.cantPendienteOC)||0)+' '+(comp.unidad||'')+'</td>'+
            '</tr>';
          }).join('')+
          '</tbody></table>'+
        (ocVinculadas.length?
          '<div style="display:flex;flex-direction:column;gap:4px">'+
          ocVinculadas.map(function(oc){
            return '<div style="background:#1a1a00;border:1px solid #E65100;border-radius:5px;padding:6px 10px;display:flex;justify-content:space-between;align-items:center">'+
              '<div>'+
                '<span style="font-size:11px;color:#ffa726;font-weight:700">'+oc.numero+'</span>'+
                '<span style="font-size:10px;color:var(--text2);margin-left:8px">'+oc.proveedor+'</span>'+
              '</div>'+
              '<div style="display:flex;align-items:center;gap:6px">'+
                '<span style="background:'+(oc.estado==='Pendiente de compra'?'#3a0000':'#3a2000')+';color:'+(oc.estado==='Pendiente de compra'?'#ef5350':'#ffb74d')+';padding:2px 7px;border-radius:8px;font-size:9px;font-weight:700">'+oc.estado+'</span>'+
                '<button class="btn btn-sm" onclick="cambiarEstadoOrden('+oc.id+')">Estado</button>'+
              '</div>'+
            '</div>';
          }).join('')+
          '</div>':'')+
      '</div>';
    });
    h += '</div></div></div>';
  }

  // Control de proyectos
  var hoy2=today();
  var proyControl=(DB.proyectos||[]).filter(function(p){return p.estado==='En curso'||p.estado==='Pausado'||p.estado==='Planificado';});

  h += '<div class="card" style="margin-top:14px">'+
    '<div class="ch"><div class="ct">Control de proyectos</div><button class="btn btn-sm" onclick="goTo(\'proyectos\')">Ver todos</button></div>'+
    '<div class="card-body">';

  if(!proyControl.length){
    h += '<div class="empty">Sin proyectos activos.</div>';
  } else {
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px">';

    proyControl.forEach(function(p){
      var pesoTotal=(p.tareas||[]).reduce(function(a,t){return a+(parseFloat(t.peso)||0);},0);
      var avFisico=pesoTotal>0?Math.round((p.tareas||[]).reduce(function(a,t){
        return a+(parseFloat(t.peso)||0)*(parseFloat(t.avanceReal)||0)/100;
      },0)):null;
      var avTiempo=null,diasRestantes=null;
      if(p.fechaInicio&&p.fechaEstFin){
        var ini=new Date(p.fechaInicio);
        var fin=new Date(p.fechaEstFin);
        var hoyD=new Date(hoy2);
        avTiempo=Math.min(100,Math.max(0,Math.round((hoyD-ini)/(fin-ini)*100)));
        diasRestantes=Math.round((fin-hoyD)/86400000);
      }
      var semColor='var(--green)',semLabel='Adelantado',semBg='#0a2a0a';
      if(avFisico===null||avTiempo===null){semColor='var(--text2)';semLabel='Sin datos';semBg='var(--surface2)';}
      else{var diff=avFisico-avTiempo;if(diff<-10){semColor='var(--red)';semLabel='Atrasado';semBg='rgba(239,83,80,0.06)';}else if(diff<5){semColor='var(--amber)';semLabel='En línea';semBg='rgba(255,167,38,0.06)';}}
      var tareasOK=(p.tareas||[]).filter(function(t){return tareaEstadoCached(t)==='OK';}).length;
      var tareasAt=(p.tareas||[]).filter(function(t){return tareaEstadoCached(t)==='Atrasado';}).length;
      var tareasTot=(p.tareas||[]).length;
      var presup=parseFloat(p.presupuesto)||0;
      var erogMat=(p.materiales||[]).reduce(function(a,m){var comp=(compById(m.compId)||{});var ent=m.reservado?0:(parseFloat(m.entregado)||parseFloat(m.cant)||0);return a+ent*(parseFloat(comp.costo)||0);},0);
      var erogMO=(p.tareas||[]).filter(function(t){return tareaEstadoCached(t)==='OK';}).reduce(function(a,t){return a+(parseFloat(t.costoMO)||0);},0);
      var erogTotal=erogMat+erogMO;
      var pctPresup=presup>0?Math.min(200,Math.round(erogTotal/presup*100)):null;
      var superaPresup=presup>0&&erogTotal>presup;
      var diasColor=diasRestantes===null?'var(--text2)':diasRestantes<0?'var(--red)':diasRestantes<=7?'var(--amber)':'var(--green)';

      h += '<div class="card" style="background:'+semBg+'">'+
        // CH igual que operarios
        '<div class="ch" style="gap:8px;overflow:hidden">'+
          '<div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1;overflow:hidden">'+
            '<div style="width:36px;height:36px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;color:#fff;flex-shrink:0">'+
              (p.numero||'').slice(-2)+
            '</div>'+
            '<div style="min-width:0;flex:1">'+
              '<div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+p.nombre.slice(0,35)+(p.nombre.length>35?'...':'')+'</div>'+
              '<div style="font-size:11px;color:var(--text2);margin-top:2px">'+p.numero+(p.prioridad?' &middot; '+p.prioridad:'')+'</div>'+
            '</div>'+
          '</div>'+
          '<div style="display:flex;flex-direction:column;gap:3px;align-items:flex-end;flex-shrink:0">'+
            proyEstadoPill(p.estado)+
            '<span style="color:'+semColor+';font-size:10px;font-weight:700;white-space:nowrap">'+semLabel+'</span>'+
          '</div>'+
        '</div>'+
        // BODY
        '<div class="card-body">'+
          // Stats 4 cajas
          '<div style="display:flex;gap:8px;margin-bottom:10px">'+
            '<div style="background:var(--surface3);border-radius:5px;padding:6px 10px;text-align:center;flex:1">'+
              '<div style="font-size:14px;font-weight:700;color:'+(avFisico===null?'var(--text2)':avFisico>=100?'var(--green)':'var(--blue)')+'">'+
                (avFisico===null?'--':avFisico+'%')+
              '</div>'+
              '<div style="font-size:9px;color:var(--text2)">Físico</div>'+
            '</div>'+
            '<div style="background:var(--surface3);border-radius:5px;padding:6px 10px;text-align:center;flex:1">'+
              '<div style="font-size:14px;font-weight:700;color:'+(avTiempo===null?'var(--text2)':avTiempo>=100?'var(--red)':'var(--text2)')+'">'+
                (avTiempo===null?'--':avTiempo+'%')+
              '</div>'+
              '<div style="font-size:9px;color:var(--text2)">Tiempo</div>'+
            '</div>'+
            '<div style="background:var(--surface3);border-radius:5px;padding:6px 10px;text-align:center;flex:1">'+
              '<div style="font-size:14px;font-weight:700;color:'+(tareasAt>0?'var(--red)':tareasOK===tareasTot&&tareasTot>0?'var(--green)':'var(--text)')+'">'+tareasOK+'/'+tareasTot+'</div>'+
              '<div style="font-size:9px;color:var(--text2)">Tareas</div>'+
            '</div>'+
            '<div style="background:var(--surface3);border-radius:5px;padding:6px 10px;text-align:center;flex:1">'+
              '<div style="font-size:14px;font-weight:700;color:'+diasColor+'">'+
                (diasRestantes===null?'--':Math.abs(diasRestantes))+
              '</div>'+
              '<div style="font-size:9px;color:var(--text2)">'+(diasRestantes!==null&&diasRestantes<0?'vencido':'días')+' </div>'+
            '</div>'+
          '</div>'+
          // Barra fisica
          '<div style="font-size:10px;color:var(--text2);margin-bottom:3px;display:flex;justify-content:space-between">'+
            '<span>Avance físico</span><span style="font-weight:700;color:var(--text)">'+(avFisico===null?'--':avFisico+'%')+'</span>'+
          '</div>'+
          '<div style="background:var(--surface3);border-radius:3px;height:6px;overflow:hidden;margin-bottom:8px">'+
            (avFisico!==null?'<div style="height:100%;background:'+(avFisico>=100?'var(--green)':'var(--blue)')+';width:'+avFisico+'%"></div>':'')+
          '</div>'+
          // Barra tiempo
          '<div style="font-size:10px;color:var(--text2);margin-bottom:3px;display:flex;justify-content:space-between">'+
            '<span>Avance tiempo</span><span style="font-weight:700;color:var(--text)">'+(avTiempo===null?'--':avTiempo+'%')+'</span>'+
          '</div>'+
          '<div style="background:var(--surface3);border-radius:3px;height:6px;overflow:hidden'+(presup?';margin-bottom:8px':'')+'">'+
            (avTiempo!==null?'<div style="height:100%;background:'+(avTiempo>=100?'var(--red)':'#555')+';width:'+avTiempo+'%"></div>':'')+
          '</div>'+
          // Presupuesto si tiene
          (presup?
            '<div style="font-size:10px;color:var(--text2);margin-bottom:3px;display:flex;justify-content:space-between">'+
              '<span>Ejecución presup.</span>'+
              '<span style="font-weight:700;color:'+(superaPresup?'var(--red)':'var(--green)')+'">'+(pctPresup||0)+'% &mdash; $'+Math.round(erogTotal).toLocaleString('es-AR')+'</span>'+
            '</div>'+
            '<div style="background:var(--surface3);border-radius:3px;height:6px;overflow:hidden">'+
              '<div style="height:100%;background:'+(superaPresup?'var(--red)':pctPresup>=80?'var(--amber)':'var(--green)')+';width:'+Math.min(100,pctPresup||0)+'%"></div>'+
            '</div>':'')+
        '</div>'+
      '</div>';
    });

    h += '</div>';
  }
  h += '</div></div>';

  el.innerHTML = h;
}


// =======================================================
// BUSQUEDA GLOBAL
// =======================================================
function busquedaGlobal(q){
  var el=document.getElementById('search-results');
  if(!el) return;
  if(!q||q.length<2){el.style.display='none';el.innerHTML='';return;}
  var ql=q.toLowerCase();
  var results=[];

  (DB.proyectos||[]).forEach(function(p){
    if((p.nombre+p.numero+(p.descripcion||'')).toLowerCase().includes(ql))
      results.push({tipo:'Proyecto',icon:'📁',label:p.nombre,sub:p.numero+' · '+p.estado,
        action:function(){goTo('proyectos');setTimeout(function(){abrirProyecto(p.id);},200);}});
  });
  DB.componentes.forEach(function(c){
    if((c.codigo+c.desc+(c.proveedor||'')+(c.ubicacion||'')).toLowerCase().includes(ql))
      results.push({tipo:'Componente',icon:'📦',label:c.codigo+' -- '+c.desc,
        sub:(c.categoria||'')+(c.ubicacion?' · '+c.ubicacion:''),
        action:function(){goTo('catalogo');}});
  });
  DB.proveedores.forEach(function(p){
    if((p.empresa+(p.contacto||'')+(p.rubro||'')).toLowerCase().includes(ql))
      results.push({tipo:'Proveedor',icon:'🏭',label:p.empresa,
        sub:(p.rubro||'')+(p.contacto?' · '+p.contacto:''),
        action:function(){goTo('proveedores');}});
  });
  DB.movimientos.filter(function(m){
    var comp=DB.componentes.find(function(c){return c.id===(m.cid||m.compId);})||{};
    return (comp.desc+comp.codigo+(m.ref||'')+(m.nota||'')+(m.origen||'')).toLowerCase().includes(ql);
  }).slice(0,3).forEach(function(m){
    var comp=DB.componentes.find(function(c){return c.id===(m.cid||m.compId);})||{desc:'?'};
    results.push({tipo:'Movimiento',icon:'🔄',label:m.tipo+' -- '+comp.desc,
      sub:m.fecha+(m.nota?' · '+m.nota:''),
      action:function(){goTo('movimientos');}});
  });
  DB.ordenes.forEach(function(o){
    if(((o.numero||'')+(o.proveedor||'')).toLowerCase().includes(ql))
      results.push({tipo:'OC',icon:'🛒',label:(o.numero||'OC')+' -- '+(o.proveedor||''),
        sub:o.estado+' · '+o.fecha,
        action:function(){goTo('ordenes');}});
  });

  if(!results.length){
    el.innerHTML='<div style="padding:10px 14px;color:var(--text2);font-size:12px">Sin resultados para "'+q+'"</div>';
  } else {
    el.innerHTML=results.slice(0,10).map(function(r,i){
      return '<div id="sri-'+i+'" style="padding:8px 14px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px">'+
        '<span style="font-size:16px">'+r.icon+'</span>'+
        '<div style="min-width:0">'+
          '<div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+r.label+'</div>'+
          '<div style="font-size:10px;color:var(--text2)">'+r.tipo+' · '+r.sub+'</div>'+
        '</div>'+
      '</div>';
    }).join('');
    results.slice(0,10).forEach(function(r,i){
      var d=document.getElementById('sri-'+i);
      if(d) d.onclick=function(){r.action();cerrarBusqueda();};
    });
  }
  el.style.display='block';
}

function mostrarResultados(){
  var q=document.getElementById('global-search');
  if(q&&q.value.length>=2) busquedaGlobal(q.value);
}

function cerrarBusqueda(){
  var el=document.getElementById('search-results');
  if(el){el.innerHTML='';el.style.display='none';}
  var inp=document.getElementById('global-search');
  if(inp) inp.value='';
}

document.addEventListener('click',function(e){
  var sr=document.getElementById('search-results');
  var gs=document.getElementById('global-search');
  if(sr&&gs&&!sr.contains(e.target)&&e.target!==gs) cerrarBusqueda();
});

// ALERTA TAREAS PROXIMAS =====================================
function diasHabilesEntre(desde, hasta){
  var d = new Date(desde);
  var h = new Date(hasta);
  var count = 0;
  var cur = new Date(d);
  cur.setDate(cur.getDate()+1); // no contar hoy
  while(cur <= h){
    var dow = cur.getDay();
    if(dow !== 0 && dow !== 6) count++;
    cur.setDate(cur.getDate()+1);
  }
  return count;
}

function alertaTareasProximas(){
  var hoy = today();
  var MARGEN = 5; // dias habiles
  var items = [];
  var proyPorIniciar = [];

  (DB.proyectos||[]).forEach(function(p){
    // Proyectos planificados proximos a iniciar (1 dia habil)
    if(p.estado==='Planificado' && p.fechaInicio){
      var dhInicio = diasHabilesEntre(hoy, p.fechaInicio);
      var yaVencioInicio = p.fechaInicio <= hoy;
      if(yaVencioInicio || dhInicio <= 1){
        proyPorIniciar.push({proy: p, dh: dhInicio, vencida: yaVencioInicio});
      }
    }
    if(p.estado==='Cancelado'||p.estado==='Finalizado') return;
    (p.tareas||[]).forEach(function(t){
      if(!t.fechaCumplimiento) return;
      if(tareaEstadoCached(t)==='OK'||tareaEstadoCached(t)==='Cancelado') return;
      var dh = diasHabilesEntre(hoy, t.fechaCumplimiento);
      var vencida = t.fechaCumplimiento < hoy;
      if(vencida || dh <= MARGEN){
        items.push({proy: p, tarea: t, dh: dh, vencida: vencida});
      }
    });
  });

  if(!items.length && !proyPorIniciar.length) return;

  // Ordenar tareas: vencidas primero, luego por fecha
  items.sort(function(a,b){
    if(a.vencida && !b.vencida) return -1;
    if(!a.vencida && b.vencida) return 1;
    return (a.tarea.fechaCumplimiento||'').localeCompare(b.tarea.fechaCumplimiento||'');
  });

  var html = '';

  // Seccion proyectos por iniciar
  if(proyPorIniciar.length){
    html += '<div style="margin-bottom:14px">'+
      '<div style="font-size:10px;color:#4fc3f7;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Proyectos por iniciar</div>'+
      '<table style="width:100%;border-collapse:collapse">'+
        '<thead><tr style="background:var(--surface2)">'+
          '<th style="padding:5px 10px;font-size:10px;text-align:left">Proyecto</th>'+
          '<th style="padding:5px 10px;font-size:10px;text-align:center">Fecha inicio</th>'+
          '<th style="padding:5px 10px;font-size:10px;text-align:center">Estado</th>'+
        '</tr></thead><tbody>'+
        proyPorIniciar.map(function(it){
          var badge = it.vencida ?
            '<span style="background:#3a0000;color:#ef5350;padding:1px 8px;border-radius:8px;font-size:10px;font-weight:700">Inicio vencido</span>' :
            '<span style="background:#0a1a3a;color:#4fc3f7;padding:1px 8px;border-radius:8px;font-size:10px;font-weight:700">'+(it.dh===0?'Hoy':'1 dia habil')+'</span>';
          return '<tr style="border-bottom:1px solid var(--border)'+(it.vencida?';background:rgba(239,83,80,0.05)':';background:rgba(79,195,247,0.04)')+'">' +
            '<td style="padding:6px 10px;font-size:11px;color:var(--primary);cursor:pointer" onclick="cerrarModal();goTo(\'proyectos\');setTimeout(function(){abrirProyecto('+it.proy.id+');},200)">'+it.proy.numero+'<br><span style="font-size:10px;color:var(--text2)">'+it.proy.nombre+'</span></td>'+
            '<td style="padding:6px 10px;text-align:center;font-size:11px;color:'+(it.vencida?'var(--red)':'#4fc3f7')+'">'+it.proy.fechaInicio+'</td>'+
            '<td style="padding:6px 10px;text-align:center">'+badge+'</td>'+
          '</tr>';
        }).join('')+
        '</tbody></table>'+
    '</div>';
  }

  // Seccion tareas proximas
  if(items.length){
    html += '<div>'+
      '<div style="font-size:10px;color:var(--amber);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Tareas proximas a vencer</div>'+
      '<div style="font-size:11px;color:var(--text2);margin-bottom:8px">Margen: <strong>5 dias habiles</strong></div>'+
      '<table style="width:100%;border-collapse:collapse">'+
        '<thead><tr style="background:var(--surface2)">'+
          '<th style="padding:5px 10px;font-size:10px;text-align:left">Proyecto</th>'+
          '<th style="padding:5px 10px;font-size:10px;text-align:left">Tarea</th>'+
          '<th style="padding:5px 10px;font-size:10px;text-align:center">Vencimiento</th>'+
          '<th style="padding:5px 10px;font-size:10px;text-align:center">Estado</th>'+
        '</tr></thead><tbody>'+
        items.map(function(it){
          var color = it.vencida ? 'var(--red)' : it.dh <= 2 ? 'var(--amber)' : 'var(--text2)';
          var badge = it.vencida ?
            '<span style="background:#3a0000;color:#ef5350;padding:1px 8px;border-radius:8px;font-size:10px;font-weight:700">Vencida</span>' :
            '<span style="background:#2a1a00;color:#ffb74d;padding:1px 8px;border-radius:8px;font-size:10px;font-weight:700">'+it.dh+' d. habil'+(it.dh!==1?'es':'')+'</span>';
          return '<tr style="border-bottom:1px solid var(--border)'+(it.vencida?';background:rgba(239,83,80,0.05)':'')+'">' +
            '<td style="padding:6px 10px;font-size:11px;color:var(--primary);cursor:pointer" onclick="cerrarModal();goTo(\'proyectos\');setTimeout(function(){abrirProyecto('+it.proy.id+');},200)">'+it.proy.numero+'<br><span style="font-size:10px;color:var(--text2)">'+it.proy.nombre+'</span></td>'+
            '<td style="padding:6px 10px;font-size:11px">'+it.tarea.desc+'</td>'+
            '<td style="padding:6px 10px;text-align:center;font-size:11px;color:'+color+'">'+it.tarea.fechaCumplimiento+'</td>'+
            '<td style="padding:6px 10px;text-align:center">'+badge+'</td>'+
          '</tr>';
        }).join('')+
        '</tbody></table>'+
    '</div>';
  }

  var total = items.length + proyPorIniciar.length;
  openModal('⚠️ Alertas de agenda ('+total+')', html, null, true);
}
