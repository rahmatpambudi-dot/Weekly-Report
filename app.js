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
// dataMax is derived from the latest date actually present in FLEET_DATA (daily-granularity
// data), so the date picker automatically follows whatever's in data_embed.js instead of
// needing a manual edit here every time the source data is refreshed.
const dataMin = '2026-01-01';
const dataMax = FLEET_DATA.reduce((max, r) => r.date > max ? r.date : max, FLEET_DATA[0].date);
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
    out[site] = { olf: avg('olf')*100, ritase: avg('ritase'), doTrip: avg('doTrip'), tatDirect: avg('tatDirect'), dpReg: avg('dpReg') };
  });
  return out;
}

// Combined NDC-RDC average across all 5 routes (simple mean of route-level metrics)
function combinedProdAvg(months){
  const perSite = avgProdForRange(months);
  const valid = ROUTE_ORDER.map(s => perSite[s]).filter(Boolean);
  if(valid.length===0) return null;
  const avg = k => valid.reduce((a,d)=>a+d[k],0)/valid.length;
  return {
    olf: avg('olf'), ritase: avg('ritase'), doTrip: avg('doTrip'), dpReg: avg('dpReg'), tatDirect: avg('tatDirect'),
    routeCount: valid.length
  };
}

function renderProductivity(){
  const months = monthsOverlapping(state.from, state.to);
  const [pf, pt] = prevPeriod(state.from, state.to);
  const prevMonths = monthsOverlapping(pf, pt).filter(m => !months.includes(m));
  const cur = avgProdForRange(months);
  const prev = avgProdForRange(prevMonths.length ? prevMonths : months);

  // NDC-RDC combined average card
  const combo = combinedProdAvg(months);
  if(combo){
    document.getElementById('avgOlfVal').textContent = combo.olf.toFixed(1) + '%';
    document.getElementById('avgRitaseVal').textContent = combo.ritase.toFixed(2);
    document.getElementById('avgDoTripVal').textContent = combo.doTrip.toFixed(1);
    document.getElementById('avgDpTripVal').textContent = combo.dpReg.toFixed(1);
  } else {
    ['avgOlfVal','avgRitaseVal','avgDoTripVal','avgDpTripVal'].forEach(id => document.getElementById(id).textContent = '-');
  }

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

  renderProdInsight(cur, prev);
}

// Target OLF perusahaan
const OLF_TARGET = 85;

function renderProdInsight(cur, prev){
  const box = document.getElementById('prodInsight');
  const sitesWithData = ROUTE_ORDER.filter(s => cur[s]);
  if(sitesWithData.length === 0){
    box.className = 'insight-box';
    box.innerHTML = '<b>Insight:</b><p>Tidak ada data produktivitas pada periode ini.</p>';
    renderNotesGrid(cur, new Set());
    return;
  }

  // lowest OLF site (weakest performer) — used for context even when it's still above target
  const worstOlf = sitesWithData.reduce((a,b) => cur[a].olf <= cur[b].olf ? a : b);
  const bestOlf = sitesWithData.reduce((a,b) => cur[a].olf >= cur[b].olf ? a : b);

  // sites currently below the OLF target — the ONLY thing that drives "Perlu Perhatian" now
  const belowTarget = sitesWithData
    .filter(s => cur[s].olf < OLF_TARGET)
    .sort((a,b) => cur[a].olf - cur[b].olf);

  const hasRedFlag = belowTarget.length > 0;
  box.className = 'insight-box' + (hasRedFlag ? ' red' : '');

  let items = '';
  if(hasRedFlag){
    belowTarget.forEach(site => {
      const d = cur[site], p = prev[site];
      const deltaTxt = p ? `, ${d.olf - p.olf >= 0 ? 'naik' : 'turun'} ${Math.abs(d.olf - p.olf).toFixed(1)} pt dibanding periode sebelumnya` : '';
      items += `<li>🚚 <b>${SITE_LABEL_PROD[site]}</b> — OLF ${d.olf.toFixed(1)}%, di bawah target ${OLF_TARGET}%${deltaTxt}.</li>`;
    });
  } else {
    items += `<li>✅ Semua jalur sudah mencapai target OLF ${OLF_TARGET}%.</li>`;
  }
  items += `<li>${hasRedFlag?'✅':'🏆'} <b>${SITE_LABEL_PROD[bestOlf]}</b> jalur dengan OLF tertinggi (${cur[bestOlf].olf.toFixed(1)}%).</li>`;

  box.innerHTML = `<b>${hasRedFlag ? '⚠️ Perlu Perhatian:' : 'Insight:'}</b><ul>${items}</ul>`;

  // Notes/action-plan cards: only show routes currently below the OLF target
  const flaggedSet = new Set(belowTarget);
  renderNotesGrid(cur, flaggedSet, belowTarget);
}

// ===== Manual notes / action plan (persisted in localStorage, per browser) =====
const NOTES_KEY_PREFIX = 'ndc_notes_v1_';
function loadNote(site, field){
  try{ return localStorage.getItem(NOTES_KEY_PREFIX + site + '_' + field) || ''; }
  catch(e){ return ''; }
}
function saveNote(site, field, val){
  try{ localStorage.setItem(NOTES_KEY_PREFIX + site + '_' + field, val); }
  catch(e){ /* storage unavailable (private mode etc) */ }
}

function renderNotesGrid(cur, flaggedSet, onlySites){
  const grid = document.getElementById('notesGrid');
  grid.innerHTML = '';
  // Only render cards for routes under the OLF target. If onlySites isn't passed
  // (e.g. no data at all), fall back to nothing rather than showing everything.
  const sitesToShow = onlySites ? ROUTE_ORDER.filter(s => onlySites.includes(s)) : [];

  if(sitesToShow.length === 0){
    grid.innerHTML = '<div class="empty" style="padding:12px 4px;">🎉 Semua jalur sudah mencapai target OLF ' + OLF_TARGET + '% pada periode ini.</div>';
    return;
  }

  sitesToShow.forEach(site => {
    const label = SITE_LABEL_PROD[site];
    const isFlagged = flaggedSet.has(site);
    const olfTxt = cur[site] ? cur[site].olf.toFixed(1)+'%' : '—';
    const issueVal = loadNote(site, 'issue');
    const planVal = loadNote(site, 'plan');

    const card = document.createElement('div');
    card.className = 'note-card';
    card.innerHTML = `
      <div class="nc-head">
        <div class="nc-title">${label} <span style="color:var(--t3);font-weight:600;">· OLF ${olfTxt}</span></div>
        <span class="nc-flag ${isFlagged?'red':'ok'}">${isFlagged?'⚠ perlu perhatian':'aman'}</span>
      </div>
      <label>Issue</label>
      <textarea data-site="${site}" data-field="issue" placeholder="Tulis kendala/isu di jalur ini...">${issueVal}</textarea>
      <label>Action Plan</label>
      <textarea data-site="${site}" data-field="plan" placeholder="Tulis rencana tindak lanjutnya...">${planVal}</textarea>
      <div class="nc-saved">✓ tersimpan</div>
    `;
    grid.appendChild(card);
  });

  grid.querySelectorAll('textarea').forEach(ta => {
    let debounce;
    ta.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        saveNote(ta.dataset.site, ta.dataset.field, ta.value);
        const savedTag = ta.closest('.note-card').querySelector('.nc-saved');
        savedTag.classList.add('show');
        setTimeout(()=>savedTag.classList.remove('show'), 1500);
      }, 400);
    });
  });
}

document.getElementById('copyNotesBtn').addEventListener('click', () => {
  let text = 'CATATAN & ACTION PLAN — PRODUCTIVITY PER JALUR\n\n';
  ROUTE_ORDER.forEach(site => {
    const issue = loadNote(site,'issue');
    const plan = loadNote(site,'plan');
    if(!issue && !plan) return;
    text += `${SITE_LABEL_PROD[site]}\n`;
    if(issue) text += `  Issue: ${issue}\n`;
    if(plan) text += `  Action Plan: ${plan}\n`;
    text += '\n';
  });
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copyNotesBtn');
    const orig = btn.textContent;
    btn.textContent = '✓ Tersalin';
    setTimeout(()=>btn.textContent = orig, 1500);
  }).catch(() => alert('Gagal menyalin. Browser mungkin tidak mengizinkan akses clipboard.'));
});

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

function isFullMonth(fromDate, toDate){
  const y = fromDate.getUTCFullYear(), m = fromDate.getUTCMonth();
  const monthStart = new Date(Date.UTC(y, m, 1));
  const monthEnd = new Date(Date.UTC(y, m+1, 0));
  return fromDate.getTime()===monthStart.getTime() && toDate.getTime()===monthEnd.getTime();
}

function sumFleetBySite(rows){
  const bySite = {};
  rows.forEach(r => {
    if(!bySite[r.site]) bySite[r.site] = {trips:0, cbm:0};
    bySite[r.site].trips += r.trips;
    bySite[r.site].cbm += r.cbm;
  });
  return bySite;
}

function renderFleet(){
  const fromISO = toISO(state.from), toISOs = toISO(state.to);
  const rows = FLEET_DATA.filter(r => r.date >= fromISO && r.date <= toISOs);
  const [pf, pt] = prevPeriod(state.from, state.to);
  const prevRows = FLEET_DATA.filter(r => r.date >= toISO(pf) && r.date <= toISO(pt));

  const bySite = sumFleetBySite(rows);
  const prevBySite = sumFleetBySite(prevRows);

  const totalTrips = rows.reduce((a,r)=>a+r.trips,0);
  const totalCbm = rows.reduce((a,r)=>a+r.cbm,0);
  const prevTotalTrips = prevRows.reduce((a,r)=>a+r.trips,0);

  document.getElementById('fleetTag').textContent = fromISO + ' → ' + toISOs;
  document.getElementById('fleetKpiTrip').textContent = fmtNum(totalTrips) + ' trip';
  const tripDelta = totalTrips - prevTotalTrips;
  const tripUp = tripDelta >= 0;
  const tripDeltaEl = document.getElementById('fleetKpiTripDelta');
  tripDeltaEl.innerHTML =
    (prevRows.length ? (tripUp ? '▲ +' : '▼ ') + fmtNum(Math.abs(tripDelta)) + ' trip vs periode lalu (' + fmtNum(prevTotalTrips) + ')' : 'Tidak ada data pembanding');
  tripDeltaEl.style.color = tripUp ? '#86efac' : '#fca5a5';

  document.getElementById('fleetKpiCbm').textContent = fmtNum(totalCbm) + ' CBM';
  document.getElementById('fleetKpiCbmSub').textContent = totalTrips ? ('Rata-rata ' + (totalCbm/totalTrips).toFixed(1) + ' CBM/trip') : '—';

  const tbody = document.querySelector('#fleetTable tbody');
  tbody.innerHTML = '';
  const sites = Object.keys(bySite).sort((a,b)=>bySite[b].trips-bySite[a].trips);
  if(sites.length===0){
    tbody.innerHTML = '<tr><td colspan="5" class="empty">Tidak ada data pada periode ini</td></tr>';
  } else {
    sites.forEach(s => {
      const v = bySite[s];
      const pv = prevBySite[s] ? prevBySite[s].trips : 0;
      const delta = v.trips - pv;
      const deltaCls = delta >= 0 ? 'green' : 'red';
      const deltaStr = (delta >= 0 ? '+' : '') + delta;
      tbody.innerHTML += `<tr><td style="font-weight:700;">${s}</td>
        <td class="mono">${fmtNum(v.trips)}</td>
        <td class="mono">${fmtNum(v.cbm)}</td>
        <td class="mono" style="color:var(--t3);">${fmtNum(pv)}</td>
        <td><span class="badge ${deltaCls}">${deltaStr}</span></td></tr>`;
    });
  }

  // ---- Cost panel: only shown for an exact full-month range ----
  const costPanel = document.getElementById('costPanel');
  const costTag = document.getElementById('costTag');
  const costBody = document.getElementById('costBody');
  if(isFullMonth(state.from, state.to)){
    costTag.textContent = MONTH_SHORT[fromISO.slice(5,7)] + ' ' + fromISO.slice(0,4);
    const costRows = FLEET_COST_DATA.filter(r => r.date >= fromISO && r.date <= toISOs);
    const bySiteCost = {};
    costRows.forEach(r => {
      if(!bySiteCost[r.site]) bySiteCost[r.site] = {trips:0, costInt:0, costExt:0};
      bySiteCost[r.site].trips += r.trips;
      bySiteCost[r.site].costInt += r.costInt;
      bySiteCost[r.site].costExt += r.costExt;
    });
    const totalCI = costRows.reduce((a,r)=>a+r.costInt,0);
    const totalCE = costRows.reduce((a,r)=>a+r.costExt,0);
    const saving = totalCE - totalCI;
    const savingPct = totalCE ? (saving/totalCE*100) : 0;

    let html = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:16px;">
      <div class="kpi" style="box-shadow:none;">
        <div class="lbl">Cost Internal</div><div class="val">${fmtRpJt(totalCI)}</div>
      </div>
      <div class="kpi" style="box-shadow:none;">
        <div class="lbl">Cost Eksternal (jika full via LK)</div><div class="val">${fmtRpJt(totalCE)}</div>
      </div>
      <div class="kpi" style="box-shadow:none;background:${saving>=0?'var(--gbg)':'var(--rbg)'};">
        <div class="lbl">Saving Fleet Internal</div>
        <div class="val" style="color:${saving>=0?'var(--green)':'var(--red)'};">${fmtRpJt(saving)}</div>
        <div class="sub">${savingPct.toFixed(1)}% lebih hemat vs eksternal</div>
      </div>
    </div>
    <table class="dt"><thead><tr><th>Site / BU</th><th>Trip</th><th>Cost Internal</th><th>Cost Eksternal</th><th>Saving</th></tr></thead><tbody>`;
    Object.keys(bySiteCost).sort((a,b)=>bySiteCost[b].costInt-bySiteCost[a].costInt).forEach(s => {
      const v = bySiteCost[s];
      const sv = v.costExt - v.costInt;
      html += `<tr><td style="font-weight:700;">${s}</td>
        <td class="mono">${fmtNum(v.trips)}</td>
        <td class="mono">${fmtRp(v.costInt)}</td>
        <td class="mono">${fmtRp(v.costExt)}</td>
        <td class="mono" style="color:${sv>=0?'var(--green)':'var(--red)'};font-weight:700;">${fmtRp(sv)}</td></tr>`;
    });
    html += '</tbody></table>';
    costBody.innerHTML = html;
    costPanel.style.display = '';
  } else {
    costTag.textContent = 'perlu 1 bulan penuh';
    costBody.innerHTML = `<div class="empty">Data cost hanya ditampilkan kalau rentang tanggal yang dipilih pas satu bulan penuh (misal 1–31 Juli). Rentang saat ini: ${fromISO} → ${toISOs}.</div>`;
  }

  // insight
  const topSite = sites[0];
  const worstDelta = sites.map(s=>({s, d: bySite[s].trips - (prevBySite[s]?prevBySite[s].trips:0)})).sort((a,b)=>a.d-b.d)[0];
  document.getElementById('fleetInsight').innerHTML = `<b>Insight:</b><p>
    ${topSite ? topSite : '-'} mencatat volume trip eksternal tertinggi pada periode ini (${topSite?fmtNum(bySite[topSite].trips):'-'} trip).
    ${worstDelta && worstDelta.d<0 ? worstDelta.s + ' turun paling tajam (' + worstDelta.d + ' trip) dibanding periode sebelumnya — perlu ditelusuri.' : 'Semua site menunjukkan tren stabil atau naik dibanding periode sebelumnya.'}
  </p>`;

  renderYoyTrend();
  renderAreaContrib();
}

// ===== YoY trip trend (2025 vs 2026) — uses fixed pre-computed dataset =====
let yoyTrendChartObj = null;
function renderYoyTrend(){
  const d = SUPPORT_LK_DATA.trend;
  document.getElementById('yoyTrendFooter').textContent =
    `Total 2025 (1 Jan–9 Agu): ${fmtNum(d.total2025)} trip · Total 2026 (1 Jan–9 Agu): ${fmtNum(d.total2026)} trip`;

  const ctx = document.getElementById('yoyTrendChart').getContext('2d');
  if(yoyTrendChartObj) yoyTrendChartObj.destroy();
  yoyTrendChartObj = new Chart(ctx, {
    type: 'line',
    data: {
      labels: d.labels,
      datasets: [
        { label:'2026', data: d.data2026, borderColor:'#1a2e6b', backgroundColor:'rgba(26,46,107,.08)', borderWidth:3, pointRadius:4, tension:.3 },
        { label:'2025', data: d.data2025, borderColor:'#94a1c2', borderDash:[5,4], borderWidth:2, pointRadius:3, tension:.3, fill:false }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:true, position:'top', align:'end'} },
      scales:{ y:{ beginAtZero:true, grid:{color:'#e3e8f2'}, title:{display:true,text:'Trip'} }, x:{ grid:{display:false} } }
    }
  });
}

// ===== Area contribution pies (Internal vs Eksternal, 2026) =====
function renderAreaContrib(){
  const grid = document.getElementById('areaContribGrid');
  grid.innerHTML = '';
  const colors = {'Jawa Barat':'#266CA9','Lampung':'#f5a623','Jawa Timur':'#8b6cf7'};
  SUPPORT_LK_DATA.area_contrib.forEach(a => {
    const tot = a.internal + a.external;
    const pct = tot ? Math.round(a.internal/tot*100) : 0;
    const col = colors[a.area] || 'var(--navy)';
    const card = document.createElement('div');
    card.style.textAlign = 'center';
    card.innerHTML = `
      <div style="font-size:13px;font-weight:800;color:${col};margin-bottom:8px;">${a.area} — ${pct}%</div>
      <svg viewBox="0 0 100 100" style="width:100%;max-width:140px;margin:0 auto;display:block;">
        <circle cx="50" cy="50" r="40" fill="none" stroke="#e3e8f2" stroke-width="20"/>
        <circle cx="50" cy="50" r="40" fill="none" stroke="${col}" stroke-width="20"
          stroke-dasharray="${(pct/100*251.2).toFixed(1)} 251.2" stroke-dashoffset="62.8" transform="rotate(-90 50 50)"/>
      </svg>
      <div style="font-size:11px;color:var(--t3);margin-top:8px;">Internal: ${fmtNum(a.internal)} · Eksternal: ${fmtNum(a.external)}</div>
    `;
    grid.appendChild(card);
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
