// ===== Helpers =====
const SITE_LABEL_PROD = {JABABEKA:'Jababeka',CIKUPA:'Cikupa',SDA:'Sidoarjo',TALLO:'Tallo',TAMORA:'Tamora'};
const ROUTE_ORDER = ['JABABEKA','CIKUPA','SDA','TALLO','TAMORA'];

// KPI targets — mirrors TARGETS in the source Productivity dashboard (dashboard_ndc_rdc.html)
const KPI_TARGETS = {
  olf:    { target: 85, fmt: v => v.toFixed(0)+'%' },
  ritase: { targetBySite:{ JABABEKA:1.15, CIKUPA:1.05, SDA:1.07, TALLO:1.25, TAMORA:1.25 }, fmt: v => v.toFixed(2) },
  doTrip: { target: 11.0, fmt: v => v.toFixed(1) },
};
function kpiTarget(key, site){
  const t = KPI_TARGETS[key];
  if(!t) return null;
  return t.targetBySite ? t.targetBySite[site] : t.target;
}
// Achievement badge, styled like the source dashboard's mkBadgeSm(): 🎯target (pct%)
// hit (green) >=100%, warn (amber) 90-99%, miss (red) <90%.
function kpiBadge(key, val, site){
  const t = KPI_TARGETS[key];
  const tgt = kpiTarget(key, site);
  if(!t || tgt==null || val==null) return '';
  const pct = val/tgt*100;
  const cls = pct>=100 ? 'hit' : pct>=90 ? 'warn' : 'miss';
  return `<div class="kpi-badge-sm ${cls}">🎯 Target ${t.fmt(tgt)} (${pct.toFixed(0)}%)</div>`;
}
const MONTH_KEYS = ['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08'];
const MONTH_SHORT = {'01':'Jan','02':'Feb','03':'Mar','04':'Apr','05':'Mei','06':'Jun','07':'Jul','08':'Agu'};
const MPP_MONTH_FIELD = {'2026-01':'jan','2026-02':'feb','2026-03':'mar','2026-04':'apr','2026-05':'may','2026-06':'jun','2026-07':'jul','2026-08':'aug'};

const fmtRp = v => 'Rp ' + Math.round(v).toLocaleString('id-ID');
const fmtRpJt = v => 'Rp ' + (v/1e6).toFixed(1) + ' Jt';
const fmtNum = (v,d=0) => v.toLocaleString('id-ID',{minimumFractionDigits:d,maximumFractionDigits:d});
const pctChange = (cur, prev) => prev ? (cur-prev)/prev*100 : (cur ? 100 : 0);
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
// Chart.js sizes its canvas off the container at creation time; when print CSS shrinks
// .chart-wrap height/width, the canvas doesn't repaint on its own, so charts print blank
// or mis-sized unless we force a resize+redraw right before the print dialog opens.
window.addEventListener('beforeprint', () => {
  [trendChartObj, doTripTrendChartObj, insUjpTrendChartObj].forEach(c => {
    if(c){ c.resize(); c.update('none'); } // 'none' = skip animation, render synchronously so
                                            // Chromium's print/PDF snapshot doesn't catch a mid-redraw frame
  });
  // yoyTrendChartObj is intentionally excluded — it uses a fixed-size canvas (see its
  // creation in renderYoyTrend) so it doesn't need or want a resize here.
});

document.querySelectorAll('.s-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.s-item').forEach(i=>i.classList.remove('active'));
    item.classList.add('active');
    document.getElementById(item.dataset.scroll).scrollIntoView({behavior:'smooth', block:'start'});
  });
});

// ===== Productivity aggregation =====
function avgProdForRange(months){
  // returns {SITE: {olf,ritase,doTrip,tatDirect,...}} — rate-type metrics (olf/ritase/doTrip/
  // tatDirect/dpReg) are averaged across the given months; the Demand/Trip breakdown metrics
  // are volume totals, so they're SUMMED across months instead.
  const out = {};
  ROUTE_ORDER.forEach(site => {
    const rows = PROD_DATA.monthly.filter(r => r.site===site && months.includes(r.month));
    if(rows.length===0){ out[site]=null; return; }
    const avg = k => rows.reduce((a,r)=>a+r[k],0)/rows.length;
    const sum = k => rows.reduce((a,r)=>a+(r[k]||0),0);
    out[site] = {
      olf: avg('olf')*100, ritase: avg('ritase'), doTrip: avg('doTrip'), tatDirect: avg('tatDirect'), dpReg: avg('dpReg'),
      doCustomer: sum('doCustomer'), storeCbm: sum('storeCbm'), tripCustomer: sum('tripCustomer'),
      tripStore: sum('tripStore'), tripSatelite: sum('tripSatelite'), tripHub: sum('tripHub'),
    };
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
      {label:'OLF (%)', val:d.olf.toFixed(1)+'%', delta: p? d.olf-p.olf : null, betterUp:true, suffix:' pt', badge: kpiBadge('olf', d.olf, site)},
      {label:'Ritase', val:d.ritase.toFixed(2), delta: p? d.ritase-p.ritase : null, betterUp:true, suffix:'', badge: kpiBadge('ritase', d.ritase, site)},
      {label:'DO / Trip', val:d.doTrip.toFixed(1), delta: p? d.doTrip-p.doTrip : null, betterUp:true, suffix:'', badge: kpiBadge('doTrip', d.doTrip, site)},
      {label:'TAT Direct (jam)', val:d.tatDirect.toFixed(1)+'j', delta: p? d.tatDirect-p.tatDirect : null, betterUp:false, suffix:'j'},
      {label:'Demand DO Customer', val:fmtNum(d.doCustomer), pctDelta: p? pctChange(d.doCustomer,p.doCustomer) : null, neutral:true},
      {label:'Store CBM', val:fmtNum(d.storeCbm,1)+' m³', pctDelta: p? pctChange(d.storeCbm,p.storeCbm) : null, neutral:true},
      {label:'Trip Customer', val:fmtNum(d.tripCustomer), pctDelta: p? pctChange(d.tripCustomer,p.tripCustomer) : null, neutral:true},
      {label:'Trip Store', val:fmtNum(d.tripStore), pctDelta: p? pctChange(d.tripStore,p.tripStore) : null, neutral:true},
      {label:'Trip Satelite', val:fmtNum(d.tripSatelite), pctDelta: p? pctChange(d.tripSatelite,p.tripSatelite) : null, neutral:true},
      {label:'Trip Hub', val:fmtNum(d.tripHub), pctDelta: p? pctChange(d.tripHub,p.tripHub) : null, neutral:true},
    ];
    let body = '';
    metrics.forEach(m => {
      let deltaHtml = '';
      if(m.neutral){
        if(m.pctDelta!==null && m.pctDelta!==undefined && !isNaN(m.pctDelta)){
          const isUp = m.pctDelta >= 0;
          const cls = Math.abs(m.pctDelta) < 0.05 ? 'flat' : 'gray';
          const arrow = Math.abs(m.pctDelta) < 0.05 ? '' : (isUp ? '▲ ' : '▼ ');
          deltaHtml = `<div class="rd ${cls}">${arrow}${Math.abs(m.pctDelta).toFixed(1)}% vs periode lalu</div>`;
        }
      } else if(m.delta!==null && !isNaN(m.delta)){
        const isUp = m.delta >= 0;
        const good = m.betterUp ? isUp : !isUp;
        const cls = Math.abs(m.delta) < 0.005 ? 'flat' : (good ? 'up' : 'down');
        const arrow = Math.abs(m.delta) < 0.005 ? '' : (isUp ? '▲ ' : '▼ ');
        deltaHtml = `<div class="rd ${cls}">${arrow}${Math.abs(m.delta).toFixed(2)}${m.suffix} vs periode lalu</div>`;
      }
      body += `<div class="rm"><div class="rl">${m.label}</div><div class="rv">${m.val}</div>${deltaHtml}${m.badge||''}</div>`;
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

  document.getElementById('fleetTag').textContent = fromISO + ' → ' + toISOs + '  (vs ' + toISO(pf) + ' → ' + toISO(pt) + ')';
  document.getElementById('fleetKpiTrip').textContent = fmtNum(totalTrips) + ' trip';
  const tripDelta = totalTrips - prevTotalTrips;
  const tripUp = tripDelta >= 0;
  const tripDeltaEl = document.getElementById('fleetKpiTripDelta');
  tripDeltaEl.innerHTML =
    (prevRows.length ? (tripUp ? '▲ +' : '▼ ') + fmtNum(Math.abs(tripDelta)) + ' trip vs periode lalu (' + fmtNum(prevTotalTrips) + ')' : 'Tidak ada data pembanding');
  tripDeltaEl.style.color = tripUp ? '#86efac' : '#fca5a5';

  document.getElementById('fleetKpiCbm').textContent = fmtNum(totalCbm) + ' CBM';
  document.getElementById('fleetKpiCbmSub').textContent = totalTrips ? ('Rata-rata ' + (totalCbm/totalTrips).toFixed(1) + ' CBM/trip') : '—';

  const extRows = EXT_FLEET_DATA.filter(r => r.date >= fromISO && r.date <= toISOs);
  const extBySite = sumFleetBySite(extRows);
  const prevExtRows = EXT_FLEET_DATA.filter(r => r.date >= toISO(pf) && r.date <= toISO(pt));
  const prevExtBySite = sumFleetBySite(prevExtRows);

  const tbody = document.querySelector('#fleetTable tbody');
  tbody.innerHTML = '';
  const allSites = new Set([...Object.keys(bySite), ...Object.keys(extBySite), ...Object.keys(prevBySite), ...Object.keys(prevExtBySite)]);
  const sites = [...allSites].sort((a,b) => {
    const totA = (bySite[a]?.trips||0) + (extBySite[a]?.trips||0);
    const totB = (bySite[b]?.trips||0) + (extBySite[b]?.trips||0);
    return totB - totA;
  });
  // Small delta badge next to a "periode terpilih" value, comparing it to its periode-sebelumnya counterpart.
  const miniBadge = (cur, prev) => {
    const pct = pctChange(cur, prev);
    if(prev === 0 && cur === 0) return `<span class="badge gray cell-badge" style="padding:1px 6px;font-size:9px;">–</span>`;
    const cls = Math.abs(pct) < 0.05 ? 'gray' : (pct >= 0 ? 'green' : 'red');
    const arrow = Math.abs(pct) < 0.05 ? '' : (pct >= 0 ? '▲ ' : '▼ ');
    return `<span class="badge ${cls} cell-badge" style="padding:1px 6px;font-size:9px;">${arrow}${Math.abs(pct).toFixed(1)}%</span>`;
  };
  if(sites.length===0){
    tbody.innerHTML = '<tr><td colspan="9" class="empty">Tidak ada data pada periode ini</td></tr>';
  } else {
    sites.forEach(s => {
      const v = bySite[s] || {trips:0, cbm:0};
      const ev = extBySite[s] || {trips:0, cbm:0};
      const pv = prevBySite[s] || {trips:0, cbm:0};
      const pev = prevExtBySite[s] || {trips:0, cbm:0};

      const totalCur = v.trips + ev.trips;
      const pctIntCur = totalCur ? (v.trips/totalCur*100) : 0;
      const pctExtCur = totalCur ? (ev.trips/totalCur*100) : 0;

      const totalPrev = pv.trips + pev.trips;
      const pctIntPrev = totalPrev ? (pv.trips/totalPrev*100) : 0;
      const pctExtPrev = totalPrev ? (pev.trips/totalPrev*100) : 0;

      tbody.innerHTML += `<tr><td style="font-weight:700;">${s}</td>
        <td class="mono" style="font-weight:700;"><span class="cell-flex">${fmtNum(totalCur)}${miniBadge(totalCur, totalPrev)}</span></td>
        <td class="mono"><span class="cell-flex">${fmtNum(v.trips)}<span class="cell-pct">(${pctIntCur.toFixed(0)}%)</span>${miniBadge(v.trips, pv.trips)}</span></td>
        <td class="mono"><span class="cell-flex">${fmtNum(ev.trips)}<span class="cell-pct">(${pctExtCur.toFixed(0)}%)</span>${miniBadge(ev.trips, pev.trips)}</span></td>
        <td class="mono"><span class="cell-flex">${fmtNum(v.cbm)}${miniBadge(v.cbm, pv.cbm)}</span></td>
        <td class="mono" style="color:var(--t3);font-weight:700;">${fmtNum(totalPrev)}</td>
        <td class="mono" style="color:var(--t3);"><span class="cell-flex"><span>${fmtNum(pv.trips)}</span><span class="cell-pct">(${pctIntPrev.toFixed(0)}%)</span></span></td>
        <td class="mono" style="color:var(--t3);"><span class="cell-flex"><span>${fmtNum(pev.trips)}</span><span class="cell-pct">(${pctExtPrev.toFixed(0)}%)</span></span></td>
        <td class="mono" style="color:var(--t3);">${fmtNum(pv.cbm)}</td></tr>`;
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
  const worstDelta = sites.map(s=>({s, d: (bySite[s]?.trips||0) - (prevBySite[s]?prevBySite[s].trips:0)})).sort((a,b)=>a.d-b.d)[0];
  document.getElementById('fleetInsight').innerHTML = `<b>Insight:</b><p>
    ${topSite ? topSite : '-'} mencatat volume trip internal tertinggi pada periode ini (${topSite?fmtNum(bySite[topSite]?.trips||0):'-'} trip).
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
      // responsive:false + a fixed canvas width/height (set in HTML) instead of the usual
      // responsive+maintainAspectRatio:false combo: this chart is the one most consistently
      // hit by a Chromium print-to-PDF bug where a canvas that resizes/redraws right before
      // printing gets rasterized mid-redraw (partial line, missing right-hand months). Fixing
      // the canvas's drawing buffer at creation time and scaling it visually via CSS instead
      // sidesteps the resize-during-print race entirely. See index.html for the matching CSS.
      responsive:false,
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

// Aggregates a DAILY_INS_DATA-shaped array (rows with a 'date' field) by date, summing
// the given numeric fields. Used for both the current-period and MoM-comparison series
// in the daily trend charts.
function dailyAggByDate(dataArr, fromISO, toISOs, fields){
  const rows = dataArr.filter(r => r.date >= fromISO && r.date <= toISOs);
  const byDate = {};
  rows.forEach(r => {
    if(!byDate[r.date]){ byDate[r.date] = {}; fields.forEach(f=>byDate[r.date][f]=0); }
    fields.forEach(f => byDate[r.date][f] += r[f]);
  });
  return byDate;
}

let doTripTrendChartObj = null;
function renderDoTripTrend(){
  const fromISO = toISO(state.from), toISOs = toISO(state.to);

  const byDate = dailyAggByDate(DAILY_INS_DATA, fromISO, toISOs, ['do','trips']);
  const dates = Object.keys(byDate).sort();
  const labels = dates.map(d => { const [y,m,day] = d.split('-'); return parseInt(day)+' '+MONTH_SHORT[m]; });
  const do26 = dates.map(d => byDate[d].do);
  const trip26 = dates.map(d => byDate[d].trips);

  // MoM comparison: same day-of-month range in the previous calendar month
  // (e.g. 7-15 Aug -> 7-15 Jul), aligned by position (day 1 of range vs day 1 of prior range).
  const [pf, pt] = prevPeriod(state.from, state.to);
  const prevByDate = dailyAggByDate(DAILY_INS_DATA, toISO(pf), toISO(pt), ['do','trips']);
  const prevDates = Object.keys(prevByDate).sort();
  let doMoM=null, tripMoM=null, momLabel=null;
  if(prevDates.length){
    const n = Math.min(dates.length, prevDates.length);
    doMoM = dates.map((_,i) => i<n ? prevByDate[prevDates[i]].do : null);
    tripMoM = dates.map((_,i) => i<n ? prevByDate[prevDates[i]].trips : null);
    momLabel = MONTH_SHORT[pad2(pf.getUTCMonth()+1)];
  }
  document.getElementById('doTripTrendTag').textContent = momLabel ? `volume harian (2026) — vs ${momLabel}` : 'volume harian (2026)';

  const manyPoints = do26.length > 20;
  const datasets = [
    { label:'DO 2026', data:do26, borderColor:'#1a2e6b', backgroundColor:'rgba(26,46,107,.08)', borderWidth:2, pointRadius:manyPoints?0:3, tension:.3, yAxisID:'yDo' },
  ];
  if(doMoM) datasets.push({ label:'DO '+momLabel, data:doMoM, borderColor:'#94a1c2', borderDash:[5,4], borderWidth:2, pointRadius:manyPoints?0:3, tension:.3, fill:false, yAxisID:'yDo' });
  datasets.push({ label:'Trip 2026', data:trip26, borderColor:'#f5a623', backgroundColor:'rgba(245,166,35,.08)', borderWidth:2, pointRadius:manyPoints?0:3, tension:.3, yAxisID:'yTrip' });
  if(tripMoM) datasets.push({ label:'Trip '+momLabel, data:tripMoM, borderColor:'#f7d38a', borderDash:[5,4], borderWidth:2, pointRadius:manyPoints?0:3, tension:.3, fill:false, yAxisID:'yTrip' });

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
        x:{ grid:{display:false}, ticks:{ maxRotation:0, autoSkip:true, maxTicksLimit: 10 } }
      }
    }
  });
}

let insUjpTrendChartObj = null;
function renderInsUjpTrend(){
  const fromISO = toISO(state.from), toISOs = toISO(state.to);

  const byDate = dailyAggByDate(DAILY_INS_DATA, fromISO, toISOs, ['ins','ujp']);
  const dates = Object.keys(byDate).sort();
  const labels = dates.map(d => { const [y,m,day] = d.split('-'); return parseInt(day)+' '+MONTH_SHORT[m]; });
  const ins26 = dates.map(d => byDate[d].ins/1e6);
  const ujp26 = dates.map(d => byDate[d].ujp/1e6);

  const [pf, pt] = prevPeriod(state.from, state.to);
  const prevByDate = dailyAggByDate(DAILY_INS_DATA, toISO(pf), toISO(pt), ['ins','ujp']);
  const prevDates = Object.keys(prevByDate).sort();
  let insMoM=null, ujpMoM=null, momLabel=null;
  if(prevDates.length){
    const n = Math.min(dates.length, prevDates.length);
    insMoM = dates.map((_,i) => i<n ? prevByDate[prevDates[i]].ins/1e6 : null);
    ujpMoM = dates.map((_,i) => i<n ? prevByDate[prevDates[i]].ujp/1e6 : null);
    momLabel = MONTH_SHORT[pad2(pf.getUTCMonth()+1)];
  }
  document.getElementById('insUjpTrendTag').textContent = momLabel ? `total harian (2026) — vs ${momLabel}` : 'total harian (2026)';

  const manyPoints = ins26.length > 20;
  const datasets = [
    { label:'Insentif 2026', data:ins26, borderColor:'#1a2e6b', backgroundColor:'rgba(26,46,107,.08)', borderWidth:2, pointRadius:manyPoints?0:3, tension:.3, yAxisID:'yIns' },
  ];
  if(insMoM) datasets.push({ label:'Insentif '+momLabel, data:insMoM, borderColor:'#94a1c2', borderDash:[5,4], borderWidth:2, pointRadius:manyPoints?0:3, tension:.3, fill:false, yAxisID:'yIns' });
  datasets.push({ label:'UJP 2026', data:ujp26, borderColor:'#00c49a', backgroundColor:'rgba(0,196,154,.08)', borderWidth:2, pointRadius:manyPoints?0:3, tension:.3, yAxisID:'yUjp' });
  if(ujpMoM) datasets.push({ label:'UJP '+momLabel, data:ujpMoM, borderColor:'#8fe3d1', borderDash:[5,4], borderWidth:2, pointRadius:manyPoints?0:3, tension:.3, fill:false, yAxisID:'yUjp' });

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
        x:{ grid:{display:false}, ticks:{ maxRotation:0, autoSkip:true, maxTicksLimit: 10 } }
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
