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
    proyNid: 1
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

DB.ordenes.forEach(function(o,i){
  if(!o.numero) o.numero = 'OC-'+( o.fecha?o.fecha.slice(0,4):new Date().getFullYear())+'-'+String(i+1).padStart(4,'0');
});
DB.componentes.forEach(function(c){ if(!c.area) c.area='Fabrica'; });

// Stock cache
var _stockCache = null;
function _buildStockCache(){
  _stockCache = {};
  DB.movimientos.forEach(function(m){
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
function save(){ invalidarStockCache(); localStorage.setItem(SKEY, JSON.stringify(DB)); }

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
const PANELS = ['dashboard','stock','catalogo','movimientos','proyectos','ordenes','proveedores','reportes','config','backup'];

function goTo(p){
  PANELS.forEach(function(x){
    var panel = document.getElementById('panel-'+x);
    if(panel) panel.classList.toggle('on', x===p);
    var n = document.getElementById('nav-'+x);
    if(n) n.classList.toggle('on', x===p);
  });
  var titles = {dashboard:'Dashboard',stock:'Stock actual',catalogo:'Catalogo',movimientos:'Movimientos de stock',proyectos:'Proyectos',ordenes:'Ordenes de compra',proveedores:'Proveedores',reportes:'Reportes',config:'Configuracion',backup:'Backup / Migrar'};
  document.getElementById('ptitle').textContent = titles[p]||p;
  var pa = document.getElementById('pacts'); pa.innerHTML = '';
  if(p==='stock')       renderStock();
  if(p==='catalogo')    renderCatalogo();
  if(p==='movimientos') renderMovimientos();
  if(p==='dashboard')   renderDashboard();
  if(p==='proyectos')   renderProyectos();
  if(p==='ordenes')     renderOrdenes();
  if(p==='proveedores') renderProveedores();
  if(p==='reportes')    cerrarReporte();
  if(p==='config')      renderConfig();
  if(p==='backup')      renderBackupInfo();
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
var stockSoloCritico = false;
var _stockSort = {col:'desc', dir:1};


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
  stockSoloCritico = !stockSoloCritico;
  var btn = document.getElementById('btn-critico');
  btn.style.background = stockSoloCritico ? 'var(--amber)' : '';
  btn.style.color = stockSoloCritico ? '#000' : '';
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
  if(stockSoloCritico) list = list.filter(function(c){return stockActual(c.id)<=(parseFloat(c.min)||0);});

  list.sort(function(a,b){
    var va='',vb='';
    if(_stockSort.col==='desc'){va=a.desc||'';vb=b.desc||'';}
    else if(_stockSort.col==='codigo'){va=a.codigo||'';vb=b.codigo||'';}
    else if(_stockSort.col==='categoria'){va=a.categoria||'';vb=b.categoria||'';}
    else if(_stockSort.col==='area'){va=a.area||'';vb=b.area||'';}
    else if(_stockSort.col==='ubicacion'){va=a.ubicacion||'';vb=b.ubicacion||'';}
    else if(_stockSort.col==='cant'){va=stockActual(a.id);vb=stockActual(b.id);return _stockSort.dir*(va-vb);}
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

  var scols = {codigo:'Codigo',desc:'Descripcion',categoria:'Categoria',cant:'Cantidad',area:'Area',ubicacion:'Cajonera / Cajon'};
  Object.keys(scols).forEach(function(col){
    var th = document.getElementById('sth-'+col);
    if(!th) return;
    th.innerHTML = scols[col]+(col===_stockSort.col?(_stockSort.dir===1?' A':' D'):'');
  });

  var tb = document.getElementById('tbody-stock');
  if(!list.length){tb.innerHTML='<tr><td colspan="12" class="empty">Sin componentes.</td></tr>';return;}
  tb.innerHTML = list.map(function(c){
    var cant = stockActual(c.id);
    var min  = parseFloat(c.min)||0;
    var eMat = c.estadoMat==='R'?'<span class="pill p-a">R</span>':'<span class="pill p-g">N</span>';
    var ubic = cajonBadge(c.ubicacion, c.nroCajon);
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
      '<td style="text-align:right;font-size:11px">'+(c.costo?'$'+Math.round(parseFloat(c.costo)).toLocaleString('es-AR'):'--')+'</td>'+
      '<td style="text-align:right;font-size:11px">'+((c.costo_usd||c.costoUSD)?'U$S '+parseFloat(c.costo_usd||c.costoUSD).toFixed(1):(c.costo&&tc>1?'U$S '+Math.round(parseFloat(c.costo)/tc):'--'))+'</td>'+
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
        c.costo=parseFloat(document.getElementById('cp-costo').value)||0;
        c.precio=c.costo;
        c.costo_usd=parseFloat(document.getElementById('cp-costo-usd').value)||0;
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
  var comp=DB.componentes.find(function(c){return c.id===m.cid;})||{desc:'?'};
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

function tareaEstado(t){
  // Si tiene estado manual (OK o Cancelado) respetarlo
  if(t.estadoManual==='OK') return 'OK';
  if(t.estadoManual==='Cancelado') return 'Cancelado';
  // Atrasado automático
  if(t.fechaCumplimiento && t.fechaCumplimiento < today()) return 'Atrasado';
  return 'En curso';
}

function tareaPill(estado){
  var map={
    'En curso': {bg:'var(--blue)',   label:'En curso'},
    'OK':       {bg:'var(--green)',  label:'OK'},
    'Atrasado': {bg:'var(--red)',    label:'Atrasado'},
    'Cancelado':{bg:'var(--text3)', label:'Cancelado'}
  };
  var s=map[estado]||map['En curso'];
  return '<span style="background:'+s.bg+';color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">'+s.label+'</span>';
}

function getNumProj(){
  var yr = new Date().getFullYear();
  var max = 0;
  (DB.proyectos||[]).forEach(function(p){
    if(p.numero&&p.numero.startsWith('PROJ-'+yr)){
      var n=parseInt((p.numero||'').split('-')[2]||'0');
      if(n>max) max=n;
    }
  });
  return 'PROJ-'+yr+'-'+String(max+1).padStart(4,'0');
}

function proyEstadoPill(e){
  var mp={Planificado:'p-a','En curso':'p-b',Pausado:'p-x',Finalizado:'p-g',Cancelado:'p-r'};
  return '<span class="pill '+(mp[e]||'p-x')+'">'+e+'</span>';
}

function renderProyectos(){
  var q=(document.getElementById('q-proj')?document.getElementById('q-proj').value||'':'').toLowerCase();
  var fest=document.getElementById('proj-estado-filter')?document.getElementById('proj-estado-filter').value:'';
  var list=(DB.proyectos||[]).filter(function(p){
    return (!q||((p.numero||'')+(p.nombre||'')).toLowerCase().includes(q))
      &&(!fest||p.estado===fest);
  }).sort(function(a,b){return (b.numero||'').localeCompare(a.numero||'');});

  var activos=(DB.proyectos||[]).filter(function(p){return p.estado==='En curso';}).length;
  var planif=(DB.proyectos||[]).filter(function(p){return p.estado==='Planificado';}).length;
  var fin=(DB.proyectos||[]).filter(function(p){return p.estado==='Finalizado';}).length;
  var valorActivo=(DB.proyectos||[]).filter(function(p){return p.estado!=='Cancelado'&&p.estado!=='Finalizado';}).reduce(function(a,p){
    return a+(p.materiales||[]).reduce(function(b,m){
      var comp=DB.componentes.find(function(c){return c.id===m.compId;})||{};
      return b+(parseFloat(m.cant)||0)*(parseFloat(comp.costo)||0);
    },0);
  },0);
  var valorHistorico=(DB.proyectos||[]).filter(function(p){return p.estado!=='Cancelado';}).reduce(function(a,p){
    return a+(p.materiales||[]).reduce(function(b,m){
      var comp=DB.componentes.find(function(c){return c.id===m.compId;})||{};
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
  tb.innerHTML=list.map(function(p){
    var nMat=(p.materiales||[]).length;
    var valor=(p.materiales||[]).reduce(function(a,m){
      var comp=DB.componentes.find(function(c){return c.id===m.compId;})||{};
      return a+(parseFloat(m.cant)||0)*(parseFloat(comp.costo)||0);
    },0);
    var sobrantes=(p.materiales||[]).filter(function(m){return (parseFloat(m.cant)||0)>(parseFloat(m.devuelto)||0);}).length;
    return '<tr>'+
      '<td class="mono" style="font-size:11px">'+p.numero+'</td>'+
      '<td><strong>'+p.nombre+'</strong>'+(p.descripcion?'<br><span style="font-size:10px;color:var(--text2)">'+p.descripcion.slice(0,50)+(p.descripcion.length>50?'...':'')+'</span>':'')+'</td>'+
      '<td>'+proyEstadoPill(p.estado)+'</td>'+
      '<td style="font-size:11px">'+(p.fechaInicio||'--')+'</td>'+
      '<td style="font-size:11px">'+(p.fechaEstFin||'--')+'</td>'+
      '<td style="text-align:center">'+nMat+(sobrantes>0&&p.estado==='Finalizado'?'<br><span style="font-size:10px;color:var(--amber)">'+sobrantes+' c/sobrante</span>':'')+'</td>'+
      '<td style="text-align:right;font-size:12px;font-weight:700;white-space:nowrap">'+(valor>0?'$'+Math.round(valor).toLocaleString('es-AR'):'--')+'</td>'+
      '<td style="display:flex;gap:3px">'+
        '<button class="btn btn-sm btn-p" onclick="abrirProyecto('+p.id+')">Ver</button>'+
        '<button class="btn btn-sm" style="color:var(--red)" onclick="borrarProyecto('+p.id+')">X</button>'+
      '</td>'+
    '</tr>';
  }).join('');
}

function modalNuevoProyecto(){
  var num=getNumProj();
  openModal('Nuevo proyecto',
    '<div class="fg2">'+
      '<div class="fg"><label>N° Proyecto</label><div style="padding:7px 9px;font-family:monospace;font-weight:700;color:var(--primary)">'+num+'</div></div>'+
      '<div class="fg"><label>Estado inicial</label><div style="padding:7px 9px;font-size:12px;color:var(--text2)">Planificado</div></div>'+
      '<div class="fg full"><label>Nombre *</label><input id="np-nombre" placeholder="Nombre del proyecto"></div>'+
      '<div class="fg full"><label>Descripcion</label><textarea id="np-desc" rows="3" placeholder="Descripcion del proyecto..."></textarea></div>'+
      '<div class="fg"><label>Fecha inicio</label><input id="np-finicio" type="date" value="'+today()+'"></div>'+
      '<div class="fg"><label>Fecha estimada fin</label><input id="np-festfin" type="date"></div>'+
      '<div class="fg"><label>Presupuesto total ($)</label><input id="np-presupuesto" type="number" min="0" value="0" placeholder="0"></div>'+
      '<div class="fg full"><label>OneDrive — link carpeta de fotos/docs</label>'+
        '<input id="np-onedrive" placeholder="https://onedrive.live.com/..." type="url"></div>'+
    '</div>',
    function(){
      var nombre=document.getElementById('np-nombre').value.trim();
      if(!nombre){alert('El nombre es obligatorio.');return false;}
      var proj={
        id:DB.proyNid++,
        numero:num,
        nombre:nombre,
        descripcion:document.getElementById('np-desc').value,
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
      // Abrir directamente para agregar materiales
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
    var comp=DB.componentes.find(function(c){return c.id===m.compId;})||{};
    return a+(parseFloat(m.cant)||0)*(parseFloat(comp.costo)||0);
  },0);

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
    // Presupuesto y avance
    '<hr class="div">'+
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px">'+
      // Presupuesto
      '<div style="background:var(--surface2);border-radius:var(--r);padding:10px 12px">'+
        '<div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Presupuesto</div>'+
        '<div style="font-size:16px;font-weight:700">$'+(Math.round(p.presupuesto||0).toLocaleString('es-AR'))+'</div>'+
        (!esFin?'<button class="btn btn-sm" style="margin-top:6px;font-size:10px" onclick="editarPresupuestoProyecto('+id+')">Editar</button>':'')+
      '</div>'+
      // Costo materiales
      '<div style="background:var(--surface2);border-radius:var(--r);padding:10px 12px">'+
        '<div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Costo materiales</div>'+
        '<div style="font-size:16px;font-weight:700;color:'+(valor>(p.presupuesto||0)&&(p.presupuesto||0)>0?'var(--red)':'var(--text)')+'">$'+Math.round(valor).toLocaleString('es-AR')+'</div>'+
        ((p.presupuesto||0)>0?'<div style="font-size:10px;color:var(--text2);margin-top:2px">'+(valor>(p.presupuesto||0)?'⚠️ ':'')+Math.round(valor/(p.presupuesto||1)*100)+'% del presupuesto</div>':'')+
      '</div>'+
      // Costo MO (suma de tareas)
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

    // Acciones de estado
    (!esFin?
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">'+
        (esPlanif?
          '<button class="btn btn-p" onclick="confirmarPlanificacion('+id+')">✅ Confirmar planificacion y reservar stock</button>':'')+
        (esEnCurso?
          '<button class="btn" onclick="agregarMaterialProyecto('+id+')">➕ Agregar material</button>'+
          '<button class="btn" onclick="iniciarCierreProyecto('+id+')">🏁 Iniciar cierre</button>'+
          '<button class="btn" style="color:var(--amber)" onclick="pausarProyecto('+id+')">⏸ Pausar</button>':'')+
        (p.estado==='Pausado'?
          '<button class="btn btn-p" onclick="cambiarEstadoProyecto('+id+',\'En curso\')">▶ Reanudar</button>':'')+
        (esPlanif||esEnCurso||p.estado==='Pausado'?
          '<button class="btn" style="color:var(--red)" onclick="cancelarProyecto('+id+')">❌ Cancelar</button>':'')+
      '</div>':'');

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
      body+='<table style="width:100%;border-collapse:collapse;margin-bottom:12px">'+
        '<thead><tr style="background:var(--surface2)">'+
          '<th style="padding:5px 10px;font-size:10px">Tarea</th>'+
          '<th style="padding:5px 10px;font-size:10px;text-align:center">Vencimiento</th>'+
          '<th style="padding:5px 10px;font-size:10px;text-align:center">Estado</th>'+
          (!esFin?'<th style="padding:5px 10px;font-size:10px"></th>':'')+
        '</tr></thead><tbody>'+
        (p.tareas||[]).map(function(t,ti){
          var estado=tareaEstado(t);
          var vencColor=estado==='Atrasado'?'var(--red)':estado==='OK'?'var(--green)':'var(--text2)';
          return '<tr style="border-bottom:1px solid var(--border)'+(estado==='Atrasado'?';background:rgba(239,83,80,0.06)':'')+'">'+
            '<td style="padding:6px 10px;font-size:12px'+(estado==='OK'?';color:var(--text2);text-decoration:line-through':'')+'">'+t.desc+'</td>'+
            '<td style="padding:6px 10px;text-align:center;font-size:11px;color:'+vencColor+'">'+(t.fechaCumplimiento||'--')+'</td>'+
            '<td style="padding:6px 10px;text-align:center">'+tareaPill(estado)+'</td>'+
            (!esFin?'<td style="padding:6px 10px;display:flex;gap:3px">'+
              '<button class="btn btn-sm" onclick="editarTareaProyecto('+id+','+ti+')" title="Editar">✏️</button>'+
              '<button class="btn btn-sm" onclick="marcarTareaOK('+id+','+ti+')" title="Marcar OK" style="color:var(--green)">✔</button>'+
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
        '<th style="padding:5px 10px;font-size:10px;text-align:right">Valor $</th>'+
        (esFin?'':'<th style="padding:5px 10px;font-size:10px"></th>')+
      '</tr></thead><tbody>'+
      (p.materiales||[]).map(function(m,mi){
        var comp=DB.componentes.find(function(c){return c.id===m.compId;})||{codigo:'?',desc:'?'};
        var val=(parseFloat(m.cant)||0)*(parseFloat(comp.costo)||0);
        var sobrante=(parseFloat(m.cant)||0)-(parseFloat(m.devuelto)||0);
        return '<tr style="border-bottom:1px solid var(--border)">'+
          '<td style="padding:5px 10px;font-size:11px;font-family:monospace">'+comp.codigo+'</td>'+
          '<td style="padding:5px 10px;font-size:11px">'+comp.desc+'</td>'+
          '<td style="padding:5px 10px;text-align:center;font-weight:700">'+m.cant+' '+(comp.unidad||'')+'</td>'+
          '<td style="padding:5px 10px;text-align:center;color:var(--text2)">'+(m.devuelto||0)+(sobrante>0&&!esFin?'<span style="font-size:10px;color:var(--amber)"> ('+sobrante+' en proyecto)</span>':'')+'</td>'+
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

  openModal('Proyecto '+p.numero, body, null, true);
}

function agregarTareaProyecto(id){
  var p=(DB.proyectos||[]).find(function(x){return x.id===id;});
  if(!p) return;
  openModal('Nueva tarea',
    '<div class="fg2">'+
      '<div class="fg full"><label>Descripcion *</label><input id="nt-desc" placeholder="Descripcion de la tarea..."></div>'+
      '<div class="fg"><label>Fecha de cumplimiento</label><input id="nt-fecha" type="date"></div>'+
      '<div class="fg"><label>Costo MO ($)</label><input id="nt-costo" type="number" min="0" value="0" placeholder="Monto de mano de obra"></div>'+
    '</div>',
    function(){
      var desc=document.getElementById('nt-desc').value.trim();
      if(!desc){alert('La descripcion es obligatoria.');return false;}
      if(!p.tareas) p.tareas=[];
      p.tareas.push({
        desc:desc,
        fechaCumplimiento:document.getElementById('nt-fecha').value,
        costoMO:parseFloat(document.getElementById('nt-costo')?document.getElementById('nt-costo').value:0)||0,
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
  var estadoActual=tareaEstado(t);
  openModal('Editar tarea',
    '<div class="fg2">'+
      '<div class="fg full"><label>Descripcion *</label><input id="et-desc" value="'+t.desc.replace(/"/g,"'")+'" placeholder="Descripcion de la tarea..."></div>'+
      '<div class="fg"><label>Fecha de cumplimiento</label><input id="et-fecha" type="date" value="'+(t.fechaCumplimiento||'')+'"></div>'+
      '<div class="fg"><label>Costo MO ($)</label><input id="et-costo" type="number" min="0" value="'+(t.costoMO||0)+'"></div>'+
      '<div class="fg"><label>Estado (manual)</label>'+
        '<select id="et-estado" style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;background:var(--surface2);color:var(--text)">'+
          '<option value="">Automatico ('+(estadoActual)+')</option>'+
          '<option value="OK"'+(t.estadoManual==='OK'?' selected':'')+'>OK</option>'+
          '<option value="Cancelado"'+(t.estadoManual==='Cancelado'?' selected':'')+'>Cancelado</option>'+
        '</select></div>'+
    '</div>',
    function(){
      var desc=document.getElementById('et-desc').value.trim();
      if(!desc){alert('La descripcion es obligatoria.');return false;}
      t.desc=desc;
      t.fechaCumplimiento=document.getElementById('et-fecha').value;
      t.costoMO=parseFloat(document.getElementById('et-costo')?document.getElementById('et-costo').value:0)||0;
      var est=document.getElementById('et-estado').value;
      t.estadoManual=est||null;
      save();cerrarModal();setTimeout(function(){abrirProyecto(projId);},100);return true;
    });
}

function marcarTareaOK(projId, idx){
  var p=(DB.proyectos||[]).find(function(x){return x.id===projId;});
  if(!p||!p.tareas[idx]) return;
  p.tareas[idx].estadoManual='OK';
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
  openModal('Presupuesto del proyecto',
    '<div class="fg">'+
      '<label>Presupuesto total ($)</label>'+
      '<input id="ep-pres" type="number" min="0" value="'+(p.presupuesto||0)+'" style="width:100%">'+
    '</div>',
    function(){
      p.presupuesto=parseFloat(document.getElementById('ep-pres').value)||0;
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
  var compOpts=[...DB.componentes].sort(function(a,b){return (a.desc||'').localeCompare(b.desc||'','es');}).map(function(c){
    var stock=stockActual(c.id);
    return '<option value="'+c.id+'">[Stock: '+stock+'] '+c.codigo+' -- '+c.desc+'</option>';
  }).join('');
  openModal('Agregar material -- '+p.numero,
    '<div class="fg2">'+
      '<div class="fg full"><label>Componente *</label>'+
        '<select id="am-comp" style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;width:100%;background:var(--surface2);color:var(--text)">'+
          '<option value="">-- seleccionar --</option>'+compOpts+'</select></div>'+
      '<div class="fg"><label>Cantidad *</label><input id="am-cant" type="number" min="1" value="1"></div>'+
    '</div>',
    function(){
      var compId=parseInt(document.getElementById('am-comp').value)||0;
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
        var accion2='Material adicional: '+comp.desc+' x'+cant;
        if(cantAEntregar>0) accion2+=' -- entregado al proyecto: '+cantAEntregar;
        if(cantFaltante2>0) accion2+=' -- OC generada por faltante: '+cantFaltante2;
        p.historial.push({fecha:today(),accion:accion2});
      }
      save();cerrarModal();
      setTimeout(function(){abrirProyecto(projId);},100);
      return true;
    });
}

function quitarMaterialProyecto(projId, idx){
  var p=(DB.proyectos||[]).find(function(x){return x.id===projId;});
  if(!p||!p.materiales[idx]) return;
  var m=p.materiales[idx];
  var comp=DB.componentes.find(function(c){return c.id===m.compId;})||{desc:'?'};
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
  var p=(DB.proyectos||[]).find(function(x){return x.id===id;});
  if(!p) return;
  if(!(p.materiales||[]).length){alert('Agrega materiales antes de confirmar.');return;}
  if(!confirm('Aprobar planificacion de '+p.numero+'?\nLos materiales reservados pasan al proyecto. Se emitiran OC para los faltantes.')) return;

  // Buscar items con faltante (cantPendienteOC > 0)
  var faltantesPorProv={};
  p.materiales.forEach(function(m){
    var faltante=parseFloat(m.cantPendienteOC)||0;
    if(faltante<=0) return;
    var comp=DB.componentes.find(function(c){return c.id===m.compId;})||{};
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
  var p=(DB.proyectos||[]).find(function(x){return x.id===id;});
  if(!p) return;
  var sobrantes=p.materiales.filter(function(m){return (parseFloat(m.cant)||0)>(parseFloat(m.devuelto)||0);});
  if(!sobrantes.length){
    if(confirm('No hay sobrantes. Finalizar el proyecto?')){
      p.estado='Finalizado';p.fechaFinReal=today();
      p.historial.push({fecha:today(),accion:'Proyecto finalizado',estado:'Finalizado'});
      save();cerrarModal();renderProyectos();
    }
    return;
  }
  // Modal devolución de sobrantes
  var compOpts=sobrantes.map(function(m){
    var comp=DB.componentes.find(function(c){return c.id===m.compId;})||{desc:'?',unidad:''};
    var enProyecto=(parseFloat(m.cant)||0)-(parseFloat(m.devuelto)||0);
    return '<tr style="border-bottom:1px solid var(--border)">'+
      '<td style="padding:6px 10px;font-size:12px">'+comp.desc+'</td>'+
      '<td style="padding:6px 10px;text-align:center">'+enProyecto+' '+(comp.unidad||'')+'</td>'+
      '<td style="padding:6px 10px"><input type="number" class="dev-cant" data-compid="'+m.compId+'" min="0" max="'+enProyecto+'" value="'+enProyecto+'" style="width:70px;padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:12px;text-align:center;background:var(--surface2);color:var(--text)"></td>'+
    '</tr>';
  }).join('');
  openModal('Cierre de proyecto -- '+p.numero,
    '<p style="font-size:12px;color:var(--text2);margin-bottom:12px">Indica cuanto devolver al stock de cada material sobrante. Pone 0 para no devolver.</p>'+
    '<table style="width:100%;border-collapse:collapse">'+
    '<thead><tr style="background:var(--surface2)"><th style="padding:6px 10px;font-size:10px">Componente</th><th style="padding:6px 10px;font-size:10px;text-align:center">En proyecto</th><th style="padding:6px 10px;font-size:10px;text-align:center">A devolver</th></tr></thead>'+
    '<tbody>'+compOpts+'</tbody></table>',
    function(){
      var inputs=document.querySelectorAll('.dev-cant');
      inputs.forEach(function(inp){
        var compId=parseInt(inp.dataset.compid);
        var cantDev=parseFloat(inp.value)||0;
        if(cantDev<=0) return;
        var mat=p.materiales.find(function(m){return m.compId===compId;});
        if(!mat) return;
        mat.devuelto=(parseFloat(mat.devuelto)||0)+cantDev;
        DB.movimientos.push({
          id:DB.nid++,cid:compId,tipo:'Entrada',cant:cantDev,
          fecha:today(),ref:p.numero,nota:'Devolucion proyecto '+p.numero,origen:'Devolucion proyecto'
        });
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
        if(tareaEstado(t)==='OK') return;
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

  var activos=lista.filter(function(p){return p.estado==='En curso';}).length;
  var planif=lista.filter(function(p){return p.estado==='Planificado';}).length;
  var fin=lista.filter(function(p){return p.estado==='Finalizado';}).length;
  var totalValor=lista.filter(function(p){return p.estado!=='Cancelado';}).reduce(function(a,p){
    return a+(p.materiales||[]).reduce(function(b,m){
      var comp=DB.componentes.find(function(c){return c.id===m.compId;})||{};
      return b+(parseFloat(m.cant)||0)*(parseFloat(comp.costo)||0);
    },0);
  },0);

  var h='<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px">'+
    '<div class="stat"><div class="stat-n amber">'+planif+'</div><div class="stat-l">Planificados</div></div>'+
    '<div class="stat"><div class="stat-n blue">'+activos+'</div><div class="stat-l">En curso</div></div>'+
    '<div class="stat"><div class="stat-n green">'+fin+'</div><div class="stat-l">Finalizados</div></div>'+
    '<div class="stat"><div class="stat-n">$'+Math.round(totalValor).toLocaleString('es-AR')+'</div><div class="stat-l">Valor total</div></div>'+
  '</div>';

  lista.forEach(function(p){
    var valor=(p.materiales||[]).reduce(function(a,m){
      var comp=DB.componentes.find(function(c){return c.id===m.compId;})||{};
      return a+(parseFloat(m.cant)||0)*(parseFloat(comp.costo)||0);
    },0);
    var valorDev=(p.materiales||[]).reduce(function(a,m){
      var comp=DB.componentes.find(function(c){return c.id===m.compId;})||{};
      return a+(parseFloat(m.devuelto)||0)*(parseFloat(comp.costo)||0);
    },0);
    var sobrantes=(p.materiales||[]).filter(function(m){return (parseFloat(m.cant)||0)>(parseFloat(m.devuelto)||0);});

    // Barra de tiempo
    var pctTiempo=0;
    if(p.fechaInicio&&p.fechaEstFin){
      var total=new Date(p.fechaEstFin)-new Date(p.fechaInicio);
      var trans=new Date(hoy)-new Date(p.fechaInicio);
      pctTiempo=total>0?Math.min(100,Math.max(0,Math.round(trans/total*100))):0;
    }
    var diasRestantes='';
    if(p.fechaEstFin&&p.estado!=='Finalizado'&&p.estado!=='Cancelado'){
      var diff=Math.round((new Date(p.fechaEstFin)-new Date())/86400000);
      diasRestantes=diff<0?'<span style="color:var(--red);font-size:11px">'+Math.abs(diff)+' dias de atraso</span>':
                           '<span style="color:var(--text2);font-size:11px">'+diff+' dias restantes</span>';
    }

    h+='<div class="card" style="margin-bottom:10px">'+
      '<div class="ch">'+
        '<div style="display:flex;align-items:center;gap:8px">'+
          '<span class="mono" style="font-size:11px;color:var(--primary)">'+p.numero+'</span>'+
          '<strong>'+p.nombre+'</strong>'+
        '</div>'+
        '<div style="display:flex;gap:8px;align-items:center">'+
          proyEstadoPill(p.estado)+
          (diasRestantes?diasRestantes:'')+
        '</div>'+
      '</div>'+
      '<div class="card-body">'+
        (p.descripcion?'<p style="font-size:12px;color:var(--text2);margin-bottom:10px">'+p.descripcion+'</p>':'')+
        // Barra de tiempo
        (p.fechaInicio&&p.fechaEstFin?
          '<div style="margin-bottom:10px">'+
            '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text2);margin-bottom:4px">'+
              '<span>'+p.fechaInicio+'</span>'+
              '<span>'+pctTiempo+'% del tiempo</span>'+
              '<span>'+(p.fechaFinReal||p.fechaEstFin)+'</span>'+
            '</div>'+
            '<div style="background:var(--surface2);border-radius:3px;height:6px;overflow:hidden">'+
              '<div style="height:100%;background:'+(pctTiempo>=100?'var(--red)':'var(--blue)')+';width:'+pctTiempo+'%;transition:width .3s"></div>'+
            '</div>'+
          '</div>':'');

    // Materiales
    if((p.materiales||[]).length){
      h+='<table style="width:100%;border-collapse:collapse;margin-bottom:8px">'+
        '<thead><tr style="background:var(--surface2)">'+
          '<th style="padding:4px 8px;font-size:10px">Componente</th>'+
          '<th style="padding:4px 8px;font-size:10px;text-align:center">Cant.</th>'+
          '<th style="padding:4px 8px;font-size:10px;text-align:center">Devuelto</th>'+
          '<th style="padding:4px 8px;font-size:10px;text-align:center">En uso</th>'+
          '<th style="padding:4px 8px;font-size:10px;text-align:right">Valor $</th>'+
        '</tr></thead><tbody>'+
        (p.materiales||[]).map(function(m){
          var comp=DB.componentes.find(function(c){return c.id===m.compId;})||{desc:'?',unidad:''};
          var enUso=(parseFloat(m.cant)||0)-(parseFloat(m.devuelto)||0);
          var val=(parseFloat(m.cant)||0)*(parseFloat(comp.costo)||0);
          return '<tr style="border-bottom:1px solid var(--border)">'+
            '<td style="padding:4px 8px;font-size:11px">'+comp.desc+'</td>'+
            '<td style="padding:4px 8px;text-align:center;font-size:11px">'+m.cant+' '+(comp.unidad||'')+'</td>'+
            '<td style="padding:4px 8px;text-align:center;font-size:11px;color:var(--text2)">'+(m.devuelto||0)+'</td>'+
            '<td style="padding:4px 8px;text-align:center;font-size:11px;font-weight:700;color:'+(enUso>0?'var(--blue)':'var(--text2)')+'">'+enUso+'</td>'+
            '<td style="padding:4px 8px;text-align:right;font-size:11px">$'+Math.round(val).toLocaleString('es-AR')+'</td>'+
          '</tr>';
        }).join('')+
        '</tbody></table>';
      h+='<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text2);margin-bottom:8px">'+
        '<span>Valor comprometido: <strong style="color:var(--text)">$'+Math.round(valor).toLocaleString('es-AR')+'</strong></span>'+
        (valorDev>0?'<span>Devuelto: <strong style="color:var(--green)">$'+Math.round(valorDev).toLocaleString('es-AR')+'</strong></span>':'')+
        (sobrantes.length&&p.estado!=='Finalizado'?'<span style="color:var(--amber)">'+sobrantes.length+' item(s) con sobrante</span>':'')+
      '</div>';
    } else {
      h+='<p style="font-size:12px;color:var(--text2)">Sin materiales registrados.</p>';
    }

    // Tareas en reporte
    if((p.tareas||[]).length){
      var ok=(p.tareas||[]).filter(function(t){return tareaEstado(t)==='OK';}).length;
      var atrasadas=(p.tareas||[]).filter(function(t){return tareaEstado(t)==='Atrasado';}).length;
      var enCurso=(p.tareas||[]).filter(function(t){return tareaEstado(t)==='En curso';}).length;
      var canceladas=(p.tareas||[]).filter(function(t){return tareaEstado(t)==='Cancelado';}).length;
      h+='<div style="margin-bottom:8px">'+
        '<div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Tareas</div>'+
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">'+
          (ok?'<span style="background:var(--green);color:#fff;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:700">'+ok+' OK</span>':'')+
          (atrasadas?'<span style="background:var(--red);color:#fff;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:700">'+atrasadas+' Atrasada'+(atrasadas>1?'s':'')+'</span>':'')+
          (enCurso?'<span style="background:var(--blue);color:#fff;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:700">'+enCurso+' En curso</span>':'')+
          (canceladas?'<span style="background:var(--text3);color:#fff;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:700">'+canceladas+' Cancelada'+(canceladas>1?'s':'')+'</span>':'')+
        '</div>'+
        '<table style="width:100%;border-collapse:collapse">'+
        (p.tareas||[]).map(function(t){
          var estado=tareaEstado(t);
          var vc=estado==='Atrasado'?'var(--red)':estado==='OK'?'var(--green)':'var(--text2)';
          return '<tr style="border-bottom:1px solid var(--border)'+(estado==='Atrasado'?';background:rgba(239,83,80,0.06)':'')+'">'+
            '<td style="padding:4px 8px;font-size:11px'+(estado==='OK'?';color:var(--text2);text-decoration:line-through':'')+'">'+t.desc+'</td>'+
            '<td style="padding:4px 8px;font-size:11px;color:'+vc+';text-align:center">'+(t.fechaCumplimiento||'--')+'</td>'+
            '<td style="padding:4px 8px;text-align:center">'+tareaPill(estado)+'</td>'+
          '</tr>';
        }).join('')+
        '</table></div>';
    }

    h+='</div></div>';
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
    if(!confirm('Cambiar estado a "'+sigR+'"?')) return;
    o.estado=sigR;
    if(sigR==='Recibida'){
      var p=o.proyId?(DB.proyectos||[]).find(function(x){return x.id===o.proyId;}):null;
      o.items.forEach(function(item){
        var comp=DB.componentes.find(function(x){return x.id===item.cid;})||{desc:'?',unidad:''};
        // Registrar entrada al stock
        DB.movimientos.push({id:DB.nid++,cid:item.cid,tipo:'Entrada',cant:item.cant,fecha:today(),ref:'Orden #'+(o.numero||o.id),nota:'Recepcion OC reserva',origen:'Compra'});
        // Si hay proyecto vinculado, asignar el saldo pendiente
        if(p){
          var mat=p.materiales.find(function(m){return m.compId===item.cid;});
          var pendiente=mat?parseFloat(mat.cantPendienteOC)||0:0;
          if(pendiente>0){
            var aAsignar=Math.min(pendiente,item.cant);
            var remanente=item.cant-aAsignar;
            // Salida del stock hacia el proyecto por el saldo pendiente
            DB.movimientos.push({id:DB.nid++,cid:item.cid,tipo:'Salida instalacion',cant:aAsignar,fecha:today(),nota:'Asignacion saldo OC '+o.numero+' a proyecto '+p.numero,origen:'Proyecto',estadoMat:'N',proyId:p.id});
            if(mat){
              mat.cantPendienteOC=Math.max(0,pendiente-aAsignar);
              mat.entregado=(parseFloat(mat.entregado)||0)+aAsignar;
            }
            p.historial.push({fecha:today(),accion:'Recibida OC '+o.numero+': '+aAsignar+' '+comp.unidad+' '+comp.desc+' asignados al proyecto'+(remanente>0?' -- '+remanente+' en stock':' -- sin remanente')});
          }
        }
      });
      if(p) alert('Stock actualizado.\nEl saldo pendiente fue asignado al proyecto '+p.numero+'.');
      else alert('Stock actualizado con los items recibidos.');
    }
    save();renderOrdenes();renderStock();
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
    var c=DB.componentes.find(function(x){return x.id===item.cid;})||{codigo:'?',desc:'?',unidad:'u',costo:0};
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
    '<div style="display:flex;gap:8px"><input id="nuevo-origen" placeholder="Nuevo origen..." style="flex:1"><button class="btn" onclick="agregarOrigen()">+ Agregar</button></div>';
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

// =======================================================
// BACKUP / MIGRAR
// =======================================================
function renderBackupInfo(){
  var el=document.getElementById('backup-info');if(!el) return;
  var kb=Math.round(JSON.stringify(DB).length/1024);
  el.innerHTML=
    fbox('Componentes',DB.componentes.length)+
    fbox('Movimientos',DB.movimientos.length)+
    fbox('Ordenes de compra',DB.ordenes.length)+
    fbox('Proveedores',DB.proveedores.length)+
    fbox('Tamano de datos',kb+' KB');
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
goTo('dashboard');

// =======================================================
// DASHBOARD
// =======================================================
function renderDashboard(){
  var el = document.getElementById('dashboard-body');
  if(!el) return;
  var hoy = today();

  var tareasVencidas = [];
  (DB.proyectos||[]).filter(function(p){return p.estado==='En curso'||p.estado==='Planificado';}).forEach(function(p){
    (p.tareas||[]).forEach(function(t,ti){
      if(tareaEstado(t)==='Atrasado') tareasVencidas.push({proj:p,tarea:t,idx:ti});
    });
  });

  var proyActivos = (DB.proyectos||[]).filter(function(p){return p.estado==='En curso';});
  var proyPlanif  = (DB.proyectos||[]).filter(function(p){return p.estado==='Planificado';});
  var proyPausados = (DB.proyectos||[]).filter(function(p){return p.estado==='Pausado';});
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

  var h = '';

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
    '<div class="stat" style="cursor:pointer" onclick="goTo(\'stock\')"><div class="stat-n '+(stockCritico.length>0?'red':'green')+'">'+stockCritico.length+'</div><div class="stat-l">Stock critico</div></div>'+
    '<div class="stat" style="cursor:pointer" onclick="goTo(\'ordenes\')"><div class="stat-n">'+ocPendientes.length+'</div><div class="stat-l">OC pendientes</div></div>'+
    (depositosTransitorios.length?'<div class="stat" style="cursor:pointer;border-color:#6a1b9a" onclick="goTo(\'proyectos\')"><div class="stat-n" style="color:#ce93d8">'+depositosTransitorios.length+'</div><div class="stat-l">Dep. transitorios</div></div>':'')+
    (entregasParciales.length?'<div class="stat" style="cursor:pointer;border-color:#E65100" onclick="goTo(\'proyectos\')"><div class="stat-n" style="color:#ffa726">'+entregasParciales.length+'</div><div class="stat-l">Entregas parciales</div></div>':'')+
    '<div class="stat"><div class="stat-n">'+DB.componentes.length+'</div><div class="stat-l">Componentes</div></div>'+
  '</div>';

  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">';

  // Panel proyectos activos + pausados
  h += '<div class="card">'+
    '<div class="ch"><div class="ct">Proyectos activos</div><button class="btn btn-sm" onclick="goTo(\'proyectos\')">Ver todos</button></div>'+
    '<div class="card-body">';

  function filaProyecto(p, esPausado){
    var tareasP=(p.tareas||[]);
    var venc=tareasP.filter(function(t){return tareaEstado(t)==='Atrasado';}).length;
    var ok=tareasP.filter(function(t){return tareaEstado(t)==='OK';}).length;
    var pct=p.fechaInicio&&p.fechaEstFin?Math.min(100,Math.max(0,Math.round((new Date(hoy)-new Date(p.fechaInicio))/(new Date(p.fechaEstFin)-new Date(p.fechaInicio))*100))):0;
    var tieneEntregaParcial=(p.materiales||[]).some(function(m){return (parseFloat(m.cantPendienteOC)||0)>0;});
    var color=esPausado?'var(--text2)':'var(--primary)';
    var barColor=esPausado?'#555':(pct>=100?'var(--red)':'var(--blue)');
    return '<div style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--border)">'+
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
    proyActivos.slice(0,5).forEach(function(p){ h += filaProyecto(p, false); });
    if(proyPausados.length){
      h += '<div style="display:flex;align-items:center;gap:8px;margin:10px 0 8px">'+
        '<div style="flex:1;height:1px;background:var(--border)"></div>'+
        '<span style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap">⏸ Pausados</span>'+
        '<div style="flex:1;height:1px;background:var(--border)"></div>'+
      '</div>';
      proyPausados.slice(0,5).forEach(function(p){ h += filaProyecto(p, true); });
    }
  }
  h += '</div></div>';

  // Panel stock critico
  h += '<div class="card">'+
    '<div class="ch"><div class="ct">Stock critico</div><button class="btn btn-sm" onclick="goTo(\'stock\')">Ver stock</button></div>'+
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
    stockCritico.slice(0,8).forEach(function(c){
      var cant=stockActual(c.id);
      var reserva=stockReservado(c.id);
      h += '<tr style="border-bottom:1px solid var(--border)">'+
        '<td style="padding:5px 0;font-size:11px">'+c.desc+'</td>'+
        '<td style="padding:5px 4px;text-align:center;font-weight:700;color:'+(cant<=0?'var(--red)':'var(--amber)')+'">'+cant+'</td>'+
        '<td style="padding:5px 4px;text-align:center;font-size:10px;color:#ce93d8">'+(reserva>0?reserva:'--')+'</td>'+
        '<td style="padding:5px 0;font-size:10px;color:var(--text2)">'+( c.min||0)+'</td>'+
      '</tr>';
    });
    h += '</table>';
    if(stockCritico.length>8) h += '<div style="font-size:11px;color:var(--text2);margin-top:6px">...y '+(stockCritico.length-8)+' mas</div>';
  }
  h += '</div></div>';

  h += '</div>';

  // Panel depositos transitorios
  if(depositosTransitorios.length){
    h += '<div class="card" style="margin-top:14px;border-color:#6a1b9a">'+
      '<div class="ch" style="border-color:#6a1b9a"><div class="ct" style="color:#ce93d8">Depositos transitorios</div><button class="btn btn-sm" onclick="goTo(\'proyectos\')">Ver proyectos</button></div>'+
      '<div class="card-body">';
    depositosTransitorios.forEach(function(p,idx){
      var itemsReservados=(p.materiales||[]).filter(function(m){return m.reservado;});
      var valorReserva=itemsReservados.reduce(function(a,m){
        var comp=DB.componentes.find(function(c){return c.id===m.compId;})||{costo:0};
        return a+(parseFloat(m.cant)||0)*(parseFloat(comp.costo)||0);
      },0);
      var tieneOC=DB.ordenes.some(function(o){return o.ocReserva&&o.proyId===p.id&&o.estado!=='Cancelada'&&o.estado!=='Recibida';});
      var ocVinculadas=DB.ordenes.filter(function(o){return o.ocReserva&&o.proyId===p.id&&o.estado!=='Cancelada'&&o.estado!=='Recibida';});
      h += '<div style="'+(idx>0?'margin-top:12px;padding-top:12px;border-top:1px solid var(--border)':'')+'">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'+
          '<span style="font-size:12px;font-weight:700;color:#ce93d8;cursor:pointer" onclick="cerrarBusqueda();goTo(\'proyectos\');setTimeout(function(){abrirProyecto('+p.id+');},200)">'+p.numero+' -- '+p.nombre+'</span>'+
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
    h += '</div></div>';
  }

  // Panel entregas parciales
  if(entregasParciales.length){
    h += '<div class="card" style="margin-top:14px;border-color:#E65100">'+
      '<div class="ch" style="border-color:#E65100"><div class="ct" style="color:#ffa726">Entregas parciales</div><button class="btn btn-sm" onclick="goTo(\'ordenes\')">Ver OC</button></div>'+
      '<div class="card-body">';
    entregasParciales.forEach(function(p,idx){
      var matPendientes=(p.materiales||[]).filter(function(m){return (parseFloat(m.cantPendienteOC)||0)>0;});
      var ocVinculadas=DB.ordenes.filter(function(o){return o.ocReserva&&o.proyId===p.id&&o.estado!=='Cancelada'&&o.estado!=='Recibida';});
      h += '<div style="'+(idx>0?'margin-top:14px;padding-top:14px;border-top:1px solid var(--border)':'')+'">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'+
          '<span style="font-size:12px;font-weight:700;color:#ffa726;cursor:pointer" onclick="cerrarBusqueda();goTo(\'proyectos\');setTimeout(function(){abrirProyecto('+p.id+');},200)">'+p.numero+' -- '+p.nombre+'</span>'+
        '</div>'+
        '<table style="width:100%;border-collapse:collapse;margin-bottom:8px">'+
          '<thead><tr>'+
            '<th style="font-size:10px;color:var(--text2);padding:3px 0;border-bottom:1px solid var(--border)">Material pendiente</th>'+
            '<th style="font-size:10px;color:#66bb6a;text-align:center;padding:3px 4px;border-bottom:1px solid var(--border)">Entregado</th>'+
            '<th style="font-size:10px;color:#ef5350;text-align:center;padding:3px 4px;border-bottom:1px solid var(--border)">Pendiente</th>'+
          '</tr></thead><tbody>'+
          matPendientes.map(function(m){
            var comp=DB.componentes.find(function(c){return c.id===m.compId;})||{desc:'?',unidad:''};
            var entregado=parseFloat(m.entregado)||0;
            var pendiente=parseFloat(m.cantPendienteOC)||0;
            return '<tr style="border-bottom:1px solid var(--border)">'+
              '<td style="padding:4px 0;font-size:11px">'+comp.desc+'</td>'+
              '<td style="padding:4px 4px;text-align:center;font-weight:700;color:#66bb6a">'+entregado+' '+(comp.unidad||'')+'</td>'+
              '<td style="padding:4px 4px;text-align:center;font-weight:700;color:#ef5350">'+pendiente+' '+(comp.unidad||'')+'</td>'+
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
          '</div>':'')+'</div>';
    });
    h += '</div></div>';
  }

  // Ultimos movimientos
  h += '<div class="card" style="margin-top:14px">'+
    '<div class="ch"><div class="ct">Ultimos movimientos</div><button class="btn btn-sm" onclick="goTo(\'movimientos\')">Ver todos</button></div>'+
    '<div class="card-body">';
  if(!ultMovs.length){
    h += '<div class="empty">Sin movimientos.</div>';
  } else {
    h += '<table style="width:100%;border-collapse:collapse">';
    ultMovs.forEach(function(m){
      var comp=DB.componentes.find(function(c){return c.id===(m.cid||m.compId);})||{desc:'?',unidad:''};
      var esEnt=m.tipo==='Entrada';
      var esReserva=m.tipo==='Reserva';
      var color=esEnt?'var(--green)':esReserva?'#ce93d8':'var(--red)';
      var signo=esEnt?'+':'-';
      h += '<tr style="border-bottom:1px solid var(--border)">'+
        '<td style="padding:5px 0;font-size:11px;color:var(--text2)">'+m.fecha+'</td>'+
        '<td style="padding:5px 8px;font-size:11px">'+comp.desc+'</td>'+
        '<td style="padding:5px 0;font-size:11px;font-weight:700;color:'+color+'">'+
          signo+(m.cant||0)+' '+(comp.unidad||'')+'</td>'+
        '<td style="padding:5px 0;font-size:10px;color:var(--text2)">'+(m.nota||m.origen||'')+'</td>'+
      '</tr>';
    });
    h += '</table>';
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
