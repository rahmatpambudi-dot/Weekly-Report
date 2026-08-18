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

// Compares against the SAME day-of-month range in the previous calendar month
// (e.g. 1-14 Aug -> 1-14 Jul), not just "N days before". Clamps to the previous
// month's last day when the current month has more days (e.g. 31 Aug -> 30 Apr... etc).
function prevPeriod(fromDate, toDate){
  function subMonth(d){
    const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
    let newMonth = m - 1, newYear = y;
    if(newMonth < 0){ newMonth = 11; newYear -= 1; }
    const daysInNewMonth = new Date(Date.UTC(newYear, newMonth+1, 0)).getUTCDate();
    const newDay = Math.min(day, daysInNewMonth);
    return new Date(Date.UTC(newYear, newMonth, newDay));
  }
  return [subMonth(fromDate), subMonth(toDate)];
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
  const prevMonths = monthsOverlapping(pf, pt);
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
    autoGrowTextarea(ta);
    let debounce;
    ta.addEventListener('input', () => {
      autoGrowTextarea(ta);
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

// Grows a textarea's height to fit its content (no internal scrollbar), with a sensible floor.
function autoGrowTextarea(ta){
  ta.style.height = 'auto';
  ta.style.height = Math.max(ta.scrollHeight, 60) + 'px';
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

// ===== Trend chart (adaptive: daily when range is short, monthly otherwise) =====
let trendChartObj = null;
function renderTrend(){
  const fromISO = toISO(state.from), toISOs = toISO(state.to);
  const daySpan = Math.round((state.to - state.from) / 86400000) + 1;
  const useDaily = daySpan <= 31 && typeof DAILY_INS_DATA !== 'undefined';

  let labels, values, chartLabel, prevValues=null, prevLabel=null;

  if(useDaily){
    const rows = DAILY_INS_DATA.filter(r => r.date >= fromISO && r.date <= toISOs);
    const byDate = {};
    rows.forEach(r => { byDate[r.date] = (byDate[r.date]||0) + r.ins; });
    const dates = Object.keys(byDate).sort();
    labels = dates.map(d => {
      const [y,m,day] = d.split('-');
      return parseInt(day) + ' ' + MONTH_SHORT[m];
    });
    values = dates.map(d => byDate[d]/1e6);
    chartLabel = 'Insentif ' + (dates.length ? MONTH_SHORT[dates[0].split('-')[1]] : 'bulan ini') + ' 2026';

    // Comparison: same day-range, previous calendar month
    const [pf, pt] = prevPeriod(state.from, state.to);
    const pfISO = toISO(pf), ptISO = toISO(pt);
    const prevRows = DAILY_INS_DATA.filter(r => r.date >= pfISO && r.date <= ptISO);
    const byPrevDate = {};
    prevRows.forEach(r => { byPrevDate[r.date] = (byPrevDate[r.date]||0) + r.ins; });
    const prevDates = Object.keys(byPrevDate).sort();
    if(prevDates.length){
      prevValues = labels.map((_, i) => prevDates[i]!==undefined ? byPrevDate[prevDates[i]]/1e6 : null);
      prevLabel = 'Insentif ' + MONTH_SHORT[prevDates[0].split('-')[1]] + ' 2026 (bulan lalu)';
    }
  } else {
    const months = monthsOverlapping(state.from, state.to);
    values = months.map(m => {
      const f = MPP_MONTH_FIELD[m];
      return INS_DATA.reduce((a,r)=>a+(r[f]||0),0)/1e6;
    });
    labels = months.map(m => MONTH_SHORT[m.slice(5)] + (m==='2026-08' ? '*' : ''));
    chartLabel = 'Total Insentif NDC (Rp Jt)';
  }

  const ctx = document.getElementById('trendChart').getContext('2d');
  document.getElementById('trendNote').textContent = useDaily
    ? `Total insentif harian NDC (${fromISO} – ${toISOs})`
    : 'Total insentif bulanan pada periode terpilih';
  if(trendChartObj) trendChartObj.destroy();

  const datasets = [{ label:chartLabel, data: values,
    borderColor:'#1c7293', backgroundColor:'rgba(28,114,147,.08)', fill:true,
    tension:.3, borderWidth: useDaily?2:3, pointRadius: useDaily?(values.length>20?0:3):5, pointBackgroundColor:'#1c7293' }];
  if(prevValues){
    datasets.push({ label:prevLabel, data: prevValues,
      borderColor:'#94a1c2', borderDash:[5,4], fill:false,
      tension:.3, borderWidth:2, pointRadius: prevValues.length>20?0:3, pointBackgroundColor:'#94a1c2' });
  }

  trendChartObj = new Chart(ctx, {
    type:'line',
    data:{ labels, datasets },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display: !!prevValues, position:'top', align:'end'},
        tooltip:{callbacks:{label: ctx => ctx.dataset.label + ': Rp ' + ctx.parsed.y.toFixed(1) + ' Jt'}} },
      scales:{
        y:{ beginAtZero:true, title:{display:true,text:'Rp Juta'}, grid:{color:'#e3e8f2'} },
        x:{ grid:{display:false}, ticks:{ maxRotation:0, autoSkip:true, maxTicksLimit: useDaily?10:12 } }
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
      const pct = pv > 0 ? (delta / pv * 100) : (v.trips > 0 ? 100 : 0);
      const deltaStr = (delta >= 0 ? '▲ +' : '▼ ') + Math.abs(pct).toFixed(1) + '%';
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

// ===== Efisiensi Operasional — MoM & YoY (from INSIGHT_DATA, sourced from Insentif 2026 dashboard) =====
const MONTH_ORDER_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_SHORT_EN = {January:'Jan',February:'Feb',March:'Mar',April:'Apr',May:'Mei',June:'Jun',July:'Jul',August:'Agu',September:'Sep',October:'Okt',November:'Nov',December:'Des'};

const EFF_METRICS = [
  {key:'DO',   label:'Total Delivery Order (DO)', icon:'📦', kind:'neutral', fmt:v=>fmtNum(v)},
  {key:'DP',   label:'Total Drop Point (DP)',      icon:'📍', kind:'neutral', fmt:v=>fmtNum(v)},
  {key:'CBM',  label:'Total CBM',                   icon:'📦', kind:'neutral', fmt:v=>fmtNum(v,2)+' m³'},
  {key:'Trip', label:'Total Trip',                  icon:'🚚', kind:'neutral', fmt:v=>fmtNum(v)},
  {key:'DO/Trip', label:'Produktivitas DO/Trip',    icon:'📈', kind:'higher', fmt:v=>v.toFixed(2)},
  {key:'DP/Trip', label:'Produktivitas DP/Trip',    icon:'📊', kind:'higher', fmt:v=>v.toFixed(2)},
  {key:'DO/DP',   label:'Produktivitas DO/DP',      icon:'📦', kind:'higher', fmt:v=>v.toFixed(2)},
  {key:'CBM/DP',  label:'Produktivitas CBM/DP',     icon:'📐', kind:'higher', fmt:v=>v.toFixed(2)},
  {key:'UJP/Trip', label:'Biaya UJP/Trip',          icon:'💰', kind:'lower', fmt:v=>fmtRp(v)},
  {key:'UJP/DO',   label:'Biaya UJP/DO',            icon:'⚖️', kind:'lower', fmt:v=>fmtRp(v)},
  {key:'UJP/DP',   label:'Biaya UJP/DP',            icon:'🎯', kind:'lower', fmt:v=>fmtRp(v)},
  {key:'UJP',      label:'Total Biaya UJP',         icon:'🧮', kind:'lower', fmt:v=>fmtRpJt(v)},
  {key:'Insentif', label:'Biaya Insentif MPP',      icon:'💹', kind:'lower', fmt:v=>fmtRpJt(v)},
];

function latestInsightMonth(){
  // last month key (in order) that has cur26 data
  const keys = MONTH_ORDER_EN.filter(m => INSIGHT_DATA[m] && INSIGHT_DATA[m].cur26);
  return keys[keys.length-1];
}

function effBadge(kind, pct){
  if(kind === 'neutral'){
    return {label: pct>=0?'NAIK':'TURUN', cls:'gray'};
  }
  if(kind === 'higher'){
    return {label: pct>=0?'MEMBAIK':'MENURUN', cls: pct>=0?'green':'red'};
  }
  // lower-is-better (cost)
  return {label: pct<=0?'MEMBAIK':'NAIK', cls: pct<=0?'green':'red'};
}

function renderEffCompare(containerId, from, to){
  const body = document.getElementById(containerId);
  if(!from || !to){ body.innerHTML = '<div class="empty">Data pembanding tidak tersedia.</div>'; return; }
  let html = '';
  EFF_METRICS.forEach(m => {
    const a = from[m.key], b = to[m.key];
    if(a===undefined || b===undefined || a===null || b===null) return;
    const pct = a !== 0 ? ((b - a) / a * 100) : 0;
    const badge = effBadge(m.kind, pct);
    html += `<div class="eff-row">
      <div class="eff-icon">${m.icon}</div>
      <div class="eff-main">
        <div class="eff-label">${m.label}</div>
        <div class="eff-values">${m.fmt(a)} → <b>${m.fmt(b)}</b></div>
      </div>
      <div class="eff-right">
        <span class="eff-pct ${pct>=0?'up':'down'}">${pct>=0?'▲':'▼'} ${Math.abs(pct).toFixed(1)}%</span>
        <span class="badge ${badge.cls}">${badge.label}</span>
      </div>
    </div>`;
  });
  body.innerHTML = html;
}

function effConclusion(from, to){
  const pct = k => from[k] ? (to[k]-from[k])/from[k]*100 : 0;
  const pDO = pct('DO'), pDP = pct('DP'), pTrip = pct('Trip'), pDPTrip = pct('DP/Trip'),
        pUJP = pct('UJP'), pIns = pct('Insentif');
  const items = [];
  items.push(`📦 Demand: DO ${pDO>=0?'+':''}${pDO.toFixed(1)}% &amp; DP ${pDP>=0?'+':''}${pDP.toFixed(1)}% (${(pDO<0&&pDP<0)?'↓ demand turun':(pDO>=0&&pDP>=0)?'↑ demand naik':'demand campuran'})`);
  items.push(`📊 DP/Trip ${pDPTrip>=0?'+':''}${pDPTrip.toFixed(1)}% — armada makin ${pDPTrip>=0?'padat':'longgar'}`);
  items.push(`🚚 Trip ${pTrip>=0?'naik':'turun'} ${Math.abs(pTrip).toFixed(1)}% ${((pTrip<0&&pDPTrip>=0)||(pTrip>=0&&pDPTrip>=0))?'— efisiensi armada meningkat':'— perlu ditelusuri'}`);
  items.push(`💰 Biaya UJP ${pUJP.toFixed(1)}% &amp; Insentif ${pIns.toFixed(1)}% — ${(pUJP<=0&&pIns<=0)?'cost terkendali':'cost naik, perlu ditelusuri'}`);
  return items;
}

function renderEfficiency(){
  if(typeof INSIGHT_DATA === 'undefined') return;
  const latest = latestInsightMonth();
  if(!latest) return;
  const d = INSIGHT_DATA[latest];
  document.getElementById('effNote').textContent = `berdasarkan data ${MONTH_SHORT_EN[latest]} 2026 terbaru${d.cutoff_day?' (s.d. tgl '+d.cutoff_day+')':''}`;

  // MoM
  const prevMonthIdx = MONTH_ORDER_EN.indexOf(latest) - 1;
  const prevMonthName = prevMonthIdx >= 0 ? MONTH_ORDER_EN[prevMonthIdx] : null;
  const momFrom = d.prev26 || (prevMonthName && INSIGHT_DATA[prevMonthName] ? INSIGHT_DATA[prevMonthName].cur26 : null);
  document.getElementById('effMomTag').textContent = prevMonthName ? `${MONTH_SHORT_EN[prevMonthName]} 2026 vs ${MONTH_SHORT_EN[latest]} 2026` : '-';
  renderEffCompare('effMomBody', momFrom, d.cur26);

  // YoY
  document.getElementById('effYoyTag').textContent = `${MONTH_SHORT_EN[latest]} 2025 vs ${MONTH_SHORT_EN[latest]} 2026`;
  renderEffCompare('effYoyBody', d.cur25, d.cur26);

  // conclusions (append under each panel, once)
  ['effMomBody','effYoyBody'].forEach((id, idx) => {
    const from = idx===0 ? momFrom : d.cur25;
    const panel = document.getElementById(id).closest('.panel');
    let box = panel.querySelector('.conclusion-box');
    if(!box){ box = document.createElement('div'); box.className='conclusion-box'; panel.querySelector('.pb').appendChild(box); }
    if(!from){ box.innerHTML=''; return; }
    const items = effConclusion(from, d.cur26);
    box.innerHTML = `<div class="cb-title">✅ KESIMPULAN: Operasional Efisien</div><ul>${items.map(i=>`<li>${i}</li>`).join('')}</ul>`;
  });

  renderDoTripTrend();
  renderInsUjpTrend();
}

let doTripTrendChartObj = null;
function renderDoTripTrend(){
  const fromISO = toISO(state.from), toISOs = toISO(state.to);
  const daySpan = Math.round((state.to - state.from) / 86400000) + 1;
  const useDaily = daySpan <= 31 && typeof DAILY_INS_DATA !== 'undefined';
  document.getElementById('doTripTrendTag').textContent = useDaily ? 'volume harian (2026)' : 'volume per bulan';

  let labels, do26, do25, trip26, trip25, showPrevYear;

  if(useDaily){
    const rows = DAILY_INS_DATA.filter(r => r.date >= fromISO && r.date <= toISOs);
    const byDate = {};
    rows.forEach(r => {
      if(!byDate[r.date]) byDate[r.date] = {do:0, trips:0};
      byDate[r.date].do += r.do;
      byDate[r.date].trips += r.trips;
    });
    const dates = Object.keys(byDate).sort();
    labels = dates.map(d => { const [y,m,day] = d.split('-'); return parseInt(day)+' '+MONTH_SHORT[m]; });
    do26 = dates.map(d => byDate[d].do);
    trip26 = dates.map(d => byDate[d].trips);
    do25 = null; trip25 = null; showPrevYear = false;
  } else {
    const months = MONTH_ORDER_EN.filter(m => INSIGHT_DATA[m] && INSIGHT_DATA[m].cur26);
    labels = months.map(m => MONTH_SHORT_EN[m]);
    do26 = months.map(m => INSIGHT_DATA[m].cur26.DO);
    do25 = months.map(m => INSIGHT_DATA[m].cur25 ? INSIGHT_DATA[m].cur25.DO : null);
    trip26 = months.map(m => INSIGHT_DATA[m].cur26.Trip);
    trip25 = months.map(m => INSIGHT_DATA[m].cur25 ? INSIGHT_DATA[m].cur25.Trip : null);
    showPrevYear = true;
  }

  const datasets = [
    { label:'DO 2026', data:do26, borderColor:'#1a2e6b', backgroundColor:'rgba(26,46,107,.08)', borderWidth:useDaily?2:3, pointRadius:useDaily?(do26.length>20?0:3):4, tension:.3, yAxisID:'yDo' },
  ];
  if(showPrevYear) datasets.push({ label:'DO 2025', data:do25, borderColor:'#94a1c2', borderDash:[5,4], borderWidth:2, pointRadius:3, tension:.3, fill:false, yAxisID:'yDo' });
  datasets.push({ label:'Trip 2026', data:trip26, borderColor:'#f5a623', backgroundColor:'rgba(245,166,35,.08)', borderWidth:useDaily?2:3, pointRadius:useDaily?(trip26.length>20?0:3):4, tension:.3, yAxisID:'yTrip' });
  if(showPrevYear) datasets.push({ label:'Trip 2025', data:trip25, borderColor:'#f7d38a', borderDash:[5,4], borderWidth:2, pointRadius:3, tension:.3, fill:false, yAxisID:'yTrip' });

  const ctx = document.getElementById('doTripTrendChart').getContext('2d');
  if(doTripTrendChartObj) doTripTrendChartObj.destroy();
  doTripTrendChartObj = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:true, position:'top', align:'end'} },
      scales:{
        yDo:{ type:'linear', position:'left', beginAtZero:true, title:{display:true,text:'DO'}, grid:{color:'#e3e8f2'} },
        yTrip:{ type:'linear', position:'right', beginAtZero:true, title:{display:true,text:'Trip'}, grid:{display:false} },
        x:{ grid:{display:false}, ticks:{ maxRotation:0, autoSkip:true, maxTicksLimit: useDaily?10:12 } }
      }
    }
  });
}

let insUjpTrendChartObj = null;
function renderInsUjpTrend(){
  const fromISO = toISO(state.from), toISOs = toISO(state.to);
  const daySpan = Math.round((state.to - state.from) / 86400000) + 1;
  const useDaily = daySpan <= 31 && typeof DAILY_INS_DATA !== 'undefined';
  document.getElementById('insUjpTrendTag').textContent = useDaily ? 'total harian (2026)' : 'total per bulan';

  let labels, ins26, ins25, ujp26, ujp25, showPrevYear;

  if(useDaily){
    const rows = DAILY_INS_DATA.filter(r => r.date >= fromISO && r.date <= toISOs);
    const byDate = {};
    rows.forEach(r => {
      if(!byDate[r.date]) byDate[r.date] = {ins:0, ujp:0};
      byDate[r.date].ins += r.ins;
      byDate[r.date].ujp += r.ujp;
    });
    const dates = Object.keys(byDate).sort();
    labels = dates.map(d => { const [y,m,day] = d.split('-'); return parseInt(day)+' '+MONTH_SHORT[m]; });
    ins26 = dates.map(d => byDate[d].ins/1e6);
    ujp26 = dates.map(d => byDate[d].ujp/1e6);
    ins25 = null; ujp25 = null; showPrevYear = false;
  } else {
    const months = MONTH_ORDER_EN.filter(m => INSIGHT_DATA[m] && INSIGHT_DATA[m].cur26);
    labels = months.map(m => MONTH_SHORT_EN[m]);
    ins26 = months.map(m => INSIGHT_DATA[m].cur26.Insentif/1e6);
    ins25 = months.map(m => INSIGHT_DATA[m].cur25 ? INSIGHT_DATA[m].cur25.Insentif/1e6 : null);
    ujp26 = months.map(m => INSIGHT_DATA[m].cur26.UJP/1e6);
    ujp25 = months.map(m => INSIGHT_DATA[m].cur25 ? INSIGHT_DATA[m].cur25.UJP/1e6 : null);
    showPrevYear = true;
  }

  const datasets = [
    { label:'Insentif 2026', data:ins26, borderColor:'#1a2e6b', backgroundColor:'rgba(26,46,107,.08)', borderWidth:useDaily?2:3, pointRadius:useDaily?(ins26.length>20?0:3):4, tension:.3, yAxisID:'yIns' },
  ];
  if(showPrevYear) datasets.push({ label:'Insentif 2025', data:ins25, borderColor:'#94a1c2', borderDash:[5,4], borderWidth:2, pointRadius:3, tension:.3, fill:false, yAxisID:'yIns' });
  datasets.push({ label:'UJP 2026', data:ujp26, borderColor:'#00c49a', backgroundColor:'rgba(0,196,154,.08)', borderWidth:useDaily?2:3, pointRadius:useDaily?(ujp26.length>20?0:3):4, tension:.3, yAxisID:'yUjp' });
  if(showPrevYear) datasets.push({ label:'UJP 2025', data:ujp25, borderColor:'#8fe3d1', borderDash:[5,4], borderWidth:2, pointRadius:3, tension:.3, fill:false, yAxisID:'yUjp' });

  const ctx = document.getElementById('insUjpTrendChart').getContext('2d');
  if(insUjpTrendChartObj) insUjpTrendChartObj.destroy();
  insUjpTrendChartObj = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:true, position:'top', align:'end'},
        tooltip:{callbacks:{label: ctx => ctx.dataset.label + ': Rp ' + ctx.parsed.y.toFixed(1) + ' Jt'}} },
      scales:{
        yIns:{ type:'linear', position:'left', beginAtZero:true, title:{display:true,text:'Insentif (Rp Jt)'}, grid:{color:'#e3e8f2'} },
        yUjp:{ type:'linear', position:'right', beginAtZero:true, title:{display:true,text:'UJP (Rp Jt)'}, grid:{display:false} },
        x:{ grid:{display:false}, ticks:{ maxRotation:0, autoSkip:true, maxTicksLimit: useDaily?10:12 } }
      }
    }
  });
}

function render(){
  renderOverview();
  renderProductivity();
  renderEfficiency();
  renderTrend();
  renderFleet();
}

render();
