// ===== Helpers =====
const SITE_LABEL_PROD = {JABABEKA:'Jababeka',CIKUPA:'Cikupa',SDA:'Sidoarjo',TALLO:'Tallo',TAMORA:'Tamora'};
const ROUTE_ORDER = ['JABABEKA','CIKUPA','SDA','TALLO','TAMORA'];
const MONTH_KEYS = ['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08'];
const MONTH_SHORT = {'01':'Jan','02':'Feb','03':'Mar','04':'Apr','05':'Mei','06':'Jun','07':'Jul','08':'Agu'};
const MPP_MONTH_FIELD = {'2026-01':'jan','2026-02':'feb','2026-03':'mar','2026-04':'apr','2026-05':'may','2026-06':'jun','2026-07':'jul','2026-08':'aug'};

const fmtRp = v => 'Rp ' + Math.round(v).toLocaleString('id-ID');
const fmtRpJt = v => 'Rp ' + (v/1e6).toFixed(1) + ' Jt';
const fmtNum = (v,d=0) => v.toLocaleString('id-ID',{minimumFractionDigits:d,maximumFractionDigits:d});
const pad2 = n => String(n).padStart(2,'0');
const toISO = d => d.toISOString().slice(0,10);

function monthsOverlapping(fromDate, toDate){
  // returns list of 'YYYY-MM' month keys (from MONTH_KEYS) that overlap [fromDate,toDate]
  return MONTH_KEYS.filter(mk => {
    const [y,m] = mk.split('-').map(Number);
    const monthStart = new Date(Date.UTC(y, m-1, 1));
    const monthEnd = new Date(Date.UTC(y, m, 0));
    return monthStart <= toDate && monthEnd >= fromDate;
  });
}

function prevPeriod(fromDate, toDate){
  const days = Math.round((toDate - fromDate)/86400000) + 1;
  const prevTo = new Date(fromDate.getTime() - 86400000);
  const prevFrom = new Date(prevTo.getTime() - (days-1)*86400000);
  return [prevFrom, prevTo];
}

// ===== Global state =====
let state = {
  from: new Date(Date.UTC(2026,5,1)),   // default: Jun 1 2026
  to: new Date(Date.UTC(2026,6,31)),    // default: Jul 31 2026
};

// ===== Init date pickers =====
const dataMin = '2026-01-01', dataMax = '2026-08-09';
document.getElementById('dateFrom').min = dataMin;
document.getElementById('dateFrom').max = dataMax;
document.getElementById('dateTo').min = dataMin;
document.getElementById('dateTo').max = dataMax;
document.getElementById('dateFrom').value = toISO(state.from);
document.getElementById('dateTo').value = toISO(state.to);

document.getElementById('applyBtn').addEventListener('click', () => {
  const f = document.getElementById('dateFrom').value;
  const t = document.getElementById('dateTo').value;
  if(!f || !t){ alert('Pilih tanggal dari & sampai.'); return; }
  const fd = new Date(f+'T00:00:00Z'), td = new Date(t+'T00:00:00Z');
  if(fd > td){ alert('Tanggal "Dari" harus sebelum "Sampai".'); return; }
  state.from = fd; state.to = td;
  render();
});
document.getElementById('resetBtn').addEventListener('click', () => {
  state.from = new Date(Date.UTC(2026,5,1));
  state.to = new Date(Date.UTC(2026,6,31));
  document.getElementById('dateFrom').value = toISO(state.from);
  document.getElementById('dateTo').value = toISO(state.to);
  render();
});
document.getElementById('pdfBtn').addEventListener('click', () => window.print());

document.querySelectorAll('.s-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.s-item').forEach(i=>i.classList.remove('active'));
    item.classList.add('active');
    document.getElementById(item.dataset.scroll).scrollIntoView({behavior:'smooth', block:'start'});
  });
});

// ===== Productivity aggregation =====
function avgProdForRange(months){
  // returns {SITE: {olf,ritase,doTrip,tatDirect}} averaged across given month keys
  const out = {};
  ROUTE_ORDER.forEach(site => {
    const rows = PROD_DATA.monthly.filter(r => r.site===site && months.includes(r.month));
    if(rows.length===0){ out[site]=null; return; }
    const avg = k => rows.reduce((a,r)=>a+r[k],0)/rows.length;
    out[site] = { olf: avg('olf')*100, ritase: avg('ritase'), doTrip: avg('doTrip'), tatDirect: avg('tatDirect') };
  });
  return out;
}

function renderProductivity(){
  const months = monthsOverlapping(state.from, state.to);
  const [pf, pt] = prevPeriod(state.from, state.to);
  const prevMonths = monthsOverlapping(pf, pt).filter(m => !months.includes(m));
  const cur = avgProdForRange(months);
  const prev = avgProdForRange(prevMonths.length ? prevMonths : months);

  document.getElementById('prodNote').textContent =
    months.length + ' bulan terpilih (' + months.map(m=>MONTH_SHORT[m.slice(5)]).join(', ') + ')' +
    (prevMonths.length ? ' vs ' + prevMonths.map(m=>MONTH_SHORT[m.slice(5)]).join(', ') : '');

  const grid = document.getElementById('routeGrid');
  grid.innerHTML = '';
  ROUTE_ORDER.forEach(site => {
    const d = cur[site], p = prev[site];
    const card = document.createElement('div');
    card.className = 'route-card';
    if(!d){
      card.innerHTML = `<div class="route-head">${SITE_LABEL_PROD[site]}</div><div class="empty">Tidak ada data pada periode ini</div>`;
      grid.appendChild(card); return;
    }
    const metrics = [
      {label:'OLF (%)', val:d.olf.toFixed(1)+'%', delta: p? d.olf-p.olf : null, betterUp:true, suffix:' pt'},
      {label:'Ritase', val:d.ritase.toFixed(2), delta: p? d.ritase-p.ritase : null, betterUp:true, suffix:''},
      {label:'DO / Trip', val:d.doTrip.toFixed(1), delta: p? d.doTrip-p.doTrip : null, betterUp:true, suffix:''},
      {label:'TAT Direct (jam)', val:d.tatDirect.toFixed(1)+'j', delta: p? d.tatDirect-p.tatDirect : null, betterUp:false, suffix:'j'},
    ];
    let body = '';
    metrics.forEach(m => {
      let deltaHtml = '';
      if(m.delta!==null && !isNaN(m.delta)){
        const isUp = m.delta >= 0;
        const good = m.betterUp ? isUp : !isUp;
        const cls = Math.abs(m.delta) < 0.005 ? 'flat' : (good ? 'up' : 'down');
        const arrow = Math.abs(m.delta) < 0.005 ? '' : (isUp ? '▲ ' : '▼ ');
        deltaHtml = `<div class="rd ${cls}">${arrow}${Math.abs(m.delta).toFixed(2)}${m.suffix} vs periode lalu</div>`;
      }
      body += `<div class="rm"><div class="rl">${m.label}</div><div class="rv">${m.val}</div>${deltaHtml}</div>`;
    });
    card.innerHTML = `<div class="route-head">${SITE_LABEL_PROD[site]}</div><div class="route-body">${body}</div>`;
    grid.appendChild(card);
  });
}

// ===== Insentif aggregation =====
function insentifForRange(months){
  const fields = months.map(m => MPP_MONTH_FIELD[m]);
  const perDriver = INS_DATA.map(r => {
    const sum = fields.reduce((a,f)=>a+(r[f]||0),0);
    return {name:r.name, site:r.site, role:r.role, sum};
  }).filter(r => r.sum > 0);
  return perDriver;
}

const SITE_LABEL_INS = {JBBK:'Jababeka', CKP:'Cikupa', SDA:'Sidoarjo'};

function renderInsentif(){
  const months = monthsOverlapping(state.from, state.to);
  const drivers = insentifForRange(months);
  const totalAll = drivers.reduce((a,r)=>a+r.sum,0);

  document.getElementById('insTag').textContent = months.map(m=>MONTH_SHORT[m.slice(5)]).join(', ');

  // site totals
  const bySite = {};
  ['JBBK','CKP','SDA'].forEach(s => {
    const rows = drivers.filter(r=>r.site===s);
    bySite[s] = {total: rows.reduce((a,r)=>a+r.sum,0), cnt: rows.length};
  });

  const kpiRow = document.getElementById('insKpiRow');
  kpiRow.innerHTML = '';
  ['JBBK','CKP','SDA'].forEach(s => {
    kpiRow.innerHTML += `<div class="kpi"><div class="lbl">${SITE_LABEL_INS[s]}</div>
      <div class="val">${fmtRpJt(bySite[s].total)}</div>
      <div class="sub">${bySite[s].cnt} penerima</div></div>`;
  });
  kpiRow.innerHTML += `<div class="kpi" style="background:var(--navy);border-color:var(--navy);">
      <div class="lbl" style="color:var(--ice);">Total NDC</div>
      <div class="val" style="color:#fff;">${fmtRpJt(totalAll)}</div>
      <div class="sub" style="color:var(--ice);">${drivers.length} penerima aktif</div></div>`;

  // top 10 table
  const top10 = [...drivers].sort((a,b)=>b.sum-a.sum).slice(0,10);
  const tbody = document.querySelector('#topTable tbody');
  tbody.innerHTML = '';
  if(top10.length===0){
    tbody.innerHTML = '<tr><td colspan="5" class="empty">Tidak ada data pada periode ini</td></tr>';
  } else {
    top10.forEach((r,i)=>{
      tbody.innerHTML += `<tr>
        <td><span class="rank ${i<3?'top':''}">${i+1}</span></td>
        <td style="font-weight:${i<3?'700':'500'};">${r.name}</td>
        <td>${SITE_LABEL_INS[r.site]}</td>
        <td>${r.role}</td>
        <td class="mono" style="font-weight:${i<3?'700':'500'};">${fmtNum(r.sum)}</td>
      </tr>`;
    });
  }

  // category distribution: per driver-month value within range
  let high=0, mid=0, low=0;
  const fields = months.map(m => MPP_MONTH_FIELD[m]);
  INS_DATA.forEach(r => {
    fields.forEach(f => {
      const v = r[f]||0;
      if(v<=0) return;
      if(v>1500000) high++;
      else if(v>=500000) mid++;
      else low++;
    });
  });
  const totCat = high+mid+low;
  const distBox = document.getElementById('distBox');
  if(totCat===0){
    distBox.innerHTML = '<div class="empty">Tidak ada data</div>';
  } else {
    const rows = [
      {label:'High (> Rp 1,5 Jt)', n:high, color:'var(--red)'},
      {label:'Mid (Rp 0,5 – 1,5 Jt)', n:mid, color:'var(--teal)'},
      {label:'Low (< Rp 0,5 Jt)', n:low, color:'var(--t2)'},
    ];
    distBox.innerHTML = rows.map(r => {
      const pct = (r.n/totCat*100);
      return `<div class="dist-bar">
        <div class="db-label"><span>${r.label}</span><span>${pct.toFixed(0)}% (${r.n})</span></div>
        <div class="db-track"><div class="db-fill" style="width:${Math.max(pct,4)}%;background:${r.color};"></div></div>
      </div>`;
    }).join('');
  }

  // insight text
  const topSite = Object.entries(bySite).sort((a,b)=>b[1].total-a[1].total)[0];
  const lowSite = Object.entries(bySite).sort((a,b)=>a[1].total-b[1].total)[0];
  document.getElementById('insInsight').innerHTML = `<b>Insight:</b><p>
    ${topSite ? SITE_LABEL_INS[topSite[0]] : '-'} berkontribusi insentif terbesar (${topSite?fmtRpJt(topSite[1].total):'-'}) pada periode ini.
    ${lowSite ? SITE_LABEL_INS[lowSite[0]] : '-'} memiliki basis penerima paling kecil (${lowSite?lowSite[1].cnt:'-'} orang, ${lowSite?fmtRpJt(lowSite[1].total):'-'}).
  </p>`;
}

// ===== Trend chart =====
let trendChartObj = null;
function renderTrend(){
  const months = monthsOverlapping(state.from, state.to);
  const values = months.map(m => {
    const f = MPP_MONTH_FIELD[m];
    return INS_DATA.reduce((a,r)=>a+(r[f]||0),0)/1e6;
  });
  const labels = months.map(m => MONTH_SHORT[m.slice(5)] + (m==='2026-08' ? '*' : ''));

  const ctx = document.getElementById('trendChart').getContext('2d');
  if(trendChartObj) trendChartObj.destroy();
  trendChartObj = new Chart(ctx, {
    type:'line',
    data:{ labels, datasets:[{ label:'Total Insentif NDC (Rp Jt)', data: values,
      borderColor:'#1c7293', backgroundColor:'rgba(28,114,147,.08)', fill:true,
      tension:.3, borderWidth:3, pointRadius:5, pointBackgroundColor:'#1c7293' }] },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false},
        tooltip:{callbacks:{label: ctx => 'Rp ' + ctx.parsed.y.toFixed(1) + ' Jt'}} },
      scales:{
        y:{ beginAtZero:true, title:{display:true,text:'Rp Juta'}, grid:{color:'#e3e8f2'} },
        x:{ grid:{display:false} }
      }
    }
  });
}

// ===== Fleet =====
const FLEET_SITE_LABEL = {'HCI Jababeka':'HCI Jababeka','AHI Jababeka':'AHI Jababeka','HCI Cikupa':'HCI Cikupa','IND Jababeka':'IND Jababeka','Corp Sidoarjo':'Corp Sidoarjo','Corp Tamora':'Corp Tamora'};
let fleetChartObj = null;

function renderFleet(){
  const fromISO = toISO(state.from), toISOs = toISO(state.to);
  const rows = FLEET_DATA.filter(r => r.date >= fromISO && r.date <= toISOs);

  const bySite = {};
  rows.forEach(r => {
    if(!bySite[r.site]) bySite[r.site] = {trips:0, cbm:0};
    bySite[r.site].trips += r.trips;
    bySite[r.site].cbm += r.cbm;
  });
  const totalTrips = rows.reduce((a,r)=>a+r.trips,0);
  const totalCbm = rows.reduce((a,r)=>a+r.cbm,0);

  const kpiRow = document.getElementById('fleetKpiRow');
  kpiRow.innerHTML = `
    <div class="kpi"><div class="lbl">Total Trip</div><div class="val">${fmtNum(totalTrips)}</div><div class="sub">periode terpilih</div></div>
    <div class="kpi"><div class="lbl">Total CBM</div><div class="val">${fmtNum(totalCbm)}</div><div class="sub">periode terpilih</div></div>
    <div class="kpi"><div class="lbl">Rata CBM/Trip</div><div class="val">${totalTrips? (totalCbm/totalTrips).toFixed(1):'0'}</div><div class="sub">efisiensi muatan</div></div>
  `;

  const tbody = document.querySelector('#fleetTable tbody');
  tbody.innerHTML = '';
  const sites = Object.keys(bySite).sort((a,b)=>bySite[b].trips-bySite[a].trips);
  if(sites.length===0){
    tbody.innerHTML = '<tr><td colspan="4" class="empty">Tidak ada data pada periode ini</td></tr>';
  } else {
    sites.forEach(s => {
      const v = bySite[s];
      tbody.innerHTML += `<tr><td style="font-weight:700;">${s}</td>
        <td class="mono">${fmtNum(v.trips)}</td>
        <td class="mono">${fmtNum(v.cbm)}</td>
        <td class="mono">${v.trips? (v.cbm/v.trips).toFixed(1):'0'}</td></tr>`;
    });
  }

  // trend chart: daily total trips, grouped weekly if range > 45 days
  const dayMap = {};
  rows.forEach(r => { dayMap[r.date] = (dayMap[r.date]||0) + r.trips; });
  const days = Object.keys(dayMap).sort();
  const rangeDays = Math.round((state.to-state.from)/86400000)+1;

  let labels, values;
  if(rangeDays > 45){
    // weekly buckets
    const weekMap = {};
    days.forEach(d => {
      const dt = new Date(d+'T00:00:00Z');
      const weekStart = new Date(dt); weekStart.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
      const wk = toISO(weekStart);
      weekMap[wk] = (weekMap[wk]||0) + dayMap[d];
    });
    labels = Object.keys(weekMap).sort();
    values = labels.map(k=>weekMap[k]);
    labels = labels.map(l => l.slice(5));
  } else {
    labels = days.map(d=>d.slice(5));
    values = days.map(d=>dayMap[d]);
  }

  const ctx = document.getElementById('fleetChart').getContext('2d');
  if(fleetChartObj) fleetChartObj.destroy();
  fleetChartObj = new Chart(ctx, {
    type:'bar',
    data:{ labels, datasets:[{ label:'Total Trip', data: values, backgroundColor:'#1a2e6b', borderRadius:3 }] },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{ y:{beginAtZero:true, grid:{color:'#e3e8f2'}}, x:{grid:{display:false}, ticks:{maxRotation:60,minRotation:60}} }
    }
  });
}

// ===== Overview KPIs =====
function renderOverview(){
  const months = monthsOverlapping(state.from, state.to);
  const chip = document.getElementById('rangeChip');
  chip.textContent = toISO(state.from) + '  →  ' + toISO(state.to);

  const prodCur = avgProdForRange(months);
  const olfVals = ROUTE_ORDER.map(s=>prodCur[s]).filter(Boolean).map(d=>d.olf);
  const avgOlf = olfVals.length ? olfVals.reduce((a,b)=>a+b,0)/olfVals.length : 0;

  const drivers = insentifForRange(months);
  const totalIns = drivers.reduce((a,r)=>a+r.sum,0);

  const fromISO = toISO(state.from), toISOs = toISO(state.to);
  const fleetRows = FLEET_DATA.filter(r => r.date >= fromISO && r.date <= toISOs);
  const totalTrips = fleetRows.reduce((a,r)=>a+r.trips,0);

  document.getElementById('kpiRow').innerHTML = `
    <div class="kpi"><div class="lbl">Rata-rata OLF (5 Jalur)</div><div class="val">${avgOlf.toFixed(1)}%</div><div class="sub">periode terpilih</div></div>
    <div class="kpi"><div class="lbl">Total Insentif NDC</div><div class="val">${fmtRpJt(totalIns)}</div><div class="sub">${drivers.length} penerima</div></div>
    <div class="kpi"><div class="lbl">Total Trip Fleet Eksternal</div><div class="val">${fmtNum(totalTrips)}</div><div class="sub">periode terpilih</div></div>
    <div class="kpi"><div class="lbl">Bulan Tercakup</div><div class="val">${months.length}</div><div class="sub">${months.map(m=>MONTH_SHORT[m.slice(5)]).join(', ')||'-'}</div></div>
  `;
}

function render(){
  renderOverview();
  renderProductivity();
  renderInsentif();
  renderTrend();
  renderFleet();
}

render();
