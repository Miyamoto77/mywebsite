(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const fields = ['name', 'yield', 'price', 'rent', 'rentGrowth', 'priceGrowth', 'priceGrowth5'];
  const labels = ['Council area', 'Est. gross yield', 'Average price', 'Monthly rent', 'Rent growth, 1 yr', 'Price growth, 1 yr', 'Price growth, 5 yrs'];
  const money = n => n == null ? 'Unavailable' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n);
  const percent = (n, signed = false) => n == null ? 'Unavailable' : `${signed && n > 0 ? '+' : ''}${n.toFixed(1)}%`;
  const month = m => new Date(m + '-01T12:00:00Z').toLocaleDateString('en-GB', {month: 'long', year: 'numeric', timeZone: 'UTC'});
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  const link = (text, href, cls) => { const a = el('a', text, cls); a.href = href; return a; };
  let data, matched = [], sort = 'yield', ascending = false, page = 0, size = 25, boundaries;
  const selected = new Set();
  const normal = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const format = (key, value) => ['price', 'rent'].includes(key) ? money(value) : key === 'name' ? value : percent(value, key.includes('Growth'));

  function csvDownload(rows, filename) {
    const csv = rows.map(row => row.map(value => '"' + String(value ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], {type: 'text/csv;charset=utf-8'}));
    const a = link('', url); a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function filter() {
    const search = normal($('area-search').value.trim()), region = $('region-filter').value;
    matched = data.areas.filter(a => (!region || a.region === region) && normal(a.name + ' ' + a.code).includes(search));
    matched.sort((a, b) => {
      if (a[sort] == null) return b[sort] == null ? a.name.localeCompare(b.name) : 1;
      if (b[sort] == null) return -1;
      const comparison = sort === 'name' ? a.name.localeCompare(b.name, 'en-GB') : a[sort] - b[sort];
      return (ascending ? comparison : -comparison) || a.name.localeCompare(b.name);
    });
    page = 0; renderTable(); updateMap();
    $('region-chips').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.region === region)));
  }

  function renderTable() {
    const body = $('area-rows'); body.replaceChildren();
    const visible = matched.slice(page * size, (page + 1) * size);
    for (const a of visible) {
      const tr = el('tr');
      fields.forEach(key => {
        const td = el('td');
        if (key === 'name') { td.append(link(a.name, 'areas.html?area=' + a.code), el('small', a.region)); }
        else { td.textContent = format(key, a[key]); if (key === 'yield') td.className = 'yield-cell'; if (a[key] < 0) td.classList.add('negative'); }
        tr.append(td);
      });
      const td = el('td'), checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = selected.has(a.code);
      checkbox.setAttribute('aria-label', 'Compare ' + a.name);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked && selected.size >= 3) { checkbox.checked = false; $('compare-status').textContent = 'Choose up to 3 areas. Remove one to add another.'; return; }
        if (checkbox.checked) selected.add(a.code); else selected.delete(a.code);
        $('compare-status').textContent = selected.size + ' of 3 areas selected for comparison.'; renderComparison();
      });
      td.append(checkbox); tr.append(td); body.append(tr);
    }
    if (!visible.length) { const td = el('td', 'No areas found. Try a council name such as Manchester or change the region.'); td.colSpan = 8; const tr = el('tr'); tr.append(td); body.append(tr); }
    $('result-count').textContent = matched.length + ' council area' + (matched.length === 1 ? '' : 's');
    $('page-label').textContent = matched.length ? `${page * size + 1}–${Math.min((page + 1) * size, matched.length)} of ${matched.length}` : '0 results';
    $('previous-page').disabled = page === 0; $('next-page').disabled = (page + 1) * size >= matched.length;
    $('download-areas').disabled = !matched.length;
    document.querySelectorAll('#area-head th[data-key]').forEach(th => {
      const key = th.dataset.key; th.setAttribute('aria-sort', key === sort ? (ascending ? 'ascending' : 'descending') : 'none');
      th.querySelector('button').textContent = labels[fields.indexOf(key)] + (key === sort ? (ascending ? ' ↑' : ' ↓') : ' ↕');
    });
  }

  function renderComparison() {
    const panel = $('compare-panel'); panel.hidden = !selected.size;
    const table = $('compare-table'); table.replaceChildren();
    const areas = data.areas.filter(a => selected.has(a.code));
    const head = el('thead'), row = el('tr'); row.append(el('th', 'Area comparison'));
    areas.forEach(a => { const th = el('th'); th.scope = 'col'; th.append(link(a.name, 'areas.html?area=' + a.code)); row.append(th); }); head.append(row); table.append(head);
    const body = el('tbody');
    fields.slice(1).forEach((key, i) => { const tr = el('tr'); tr.append(el('td', labels[i + 1])); areas.forEach(a => tr.append(el('td', format(key, a[key])))); body.append(tr); });
    const remove = el('tr'); remove.append(el('td', 'Selection'));
    areas.forEach(a => {const td = el('td'), button = el('button', 'Remove', 'btn btn--ghost'); button.type = 'button'; button.setAttribute('aria-label', 'Remove ' + a.name + ' from comparison'); button.onclick = () => {selected.delete(a.code); $('compare-status').textContent = selected.size + ' of 3 areas selected for comparison.'; renderComparison(); renderTable();}; td.append(button); remove.append(td);});
    body.append(remove); table.append(body);
  }

  function updateMap() {
    if (!boundaries) return;
    const metric = $('map-metric').value;
    const valid = matched.map(a => a[metric]).filter(n => n != null).sort((a, b) => a - b);
    const colors = ['#d4e3d7', '#aecab6', '#84ae94', '#53856a', '#245644'];
    const values = new Map(matched.map(a => [a.code, a]));
    $('map-min').textContent = valid.length ? format(metric, valid[0]) : 'Unavailable';
    $('map-max').textContent = valid.length ? format(metric, valid[valid.length - 1]) : 'Unavailable';
    $('area-map').querySelectorAll('a[data-code]').forEach(a => {
      const area = values.get(a.dataset.code), value = area?.[metric];
      const bucket = value == null ? -1 : Math.min(4, Math.floor(5 * valid.filter(n => n < value).length / Math.max(valid.length, 1)));
      a.querySelector('path').setAttribute('fill', bucket < 0 ? '#d0d4cf' : colors[bucket]);
      const text = area ? area.name + ' · ' + format(metric, value) : 'Outside the current filter';
      a.querySelector('title').textContent = text;
      a.onmouseenter = () => {$('map-info').textContent = text;};
      a.onmouseleave = () => {$('map-info').textContent = 'Select an area to explore its figures';};
    });
  }

  async function loadMap() {
    try {
      const response = await fetch('data/area-boundaries.json'); if (!response.ok) throw new Error(); boundaries = await response.json();
      const svg = $('area-map'), ns = 'http://www.w3.org/2000/svg'; svg.setAttribute('viewBox', boundaries.viewBox);
      const names = new Map(data.areas.map(a => [a.code, a.name]));
      boundaries.paths.forEach(([code, d]) => {
        if (!names.has(code)) return;
        const a = document.createElementNS(ns, 'a'); a.setAttribute('href', 'areas.html?area=' + code); a.dataset.code = code;
        // The area table is the keyboard and screen-reader equivalent of this overview map.
        a.setAttribute('tabindex', '-1'); const path = document.createElementNS(ns, 'path'); path.setAttribute('d', d); path.setAttribute('fill-rule', 'evenodd');
        const title = document.createElementNS(ns, 'title'); a.append(title, path); svg.append(a);
      }); updateMap();
    } catch (_) { $('map-info').textContent = 'Map unavailable. Use the searchable area table below.'; }
  }

  function chart(title, series) {
    const card = el('section', null, 'area-chart'); card.append(el('h3', title));
    const valid = series.filter(([, value]) => value != null);
    if (valid.length < 2) {card.append(el('p', 'A comparable series is unavailable for this area.')); return card;}
    card.append(el('p', month(valid[0][0]) + ' to ' + month(valid[valid.length - 1][0])));
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 460 235'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `${title}: ${money(valid[0][1])} in ${month(valid[0][0])} to ${money(valid[valid.length-1][1])} in ${month(valid[valid.length-1][0])}. Download the monthly figures using the button above.`);
    const min = Math.min(...valid.map(p => p[1])), max = Math.max(...valid.map(p => p[1]));
    const low = min * .95, high = max * 1.05;
    const ordinal = m => Number(m.slice(0, 4)) * 12 + Number(m.slice(5));
    const start = ordinal(series[0][0]), end = ordinal(series[series.length - 1][0]);
    const x = m => 66 + (ordinal(m) - start) / (end - start || 1) * 374;
    const y = v => 190 - (v - low) / (high - low || 1) * 170;
    function shape(tag, attributes, text) {const node = document.createElementNS(ns, tag); Object.entries(attributes).forEach(([k,v]) => node.setAttribute(k, v)); if (text != null) node.textContent = text; svg.append(node);}
    for (let i=0;i<4;i++) {const v = low + (high - low) * i / 3; shape('line', {x1:66,x2:440,y1:y(v),y2:y(v),class:'chart-gridline'}); shape('text', {x:58,y:y(v)+4,'text-anchor':'end'},money(v));}
    let d = '', connected = false;
    series.forEach(([m, v]) => {if (v == null) {connected = false; return;} d += `${connected ? 'L' : 'M'}${x(m).toFixed(1)},${y(v).toFixed(1)} `; connected = true;});
    shape('path', {d,class:'chart-line'});
    [0, Math.floor((series.length - 1) / 2), series.length - 1].forEach(i => shape('text', {x:x(series[i][0]),y:216,'text-anchor':i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle'},series[i][0].slice(0,4)));
    card.append(svg); return card;
  }

  function showDetail(code) {
    const a = data.areas.find(area => area.code === code);
    if (!a) {$('area-status').hidden = false; $('area-status').textContent = 'That council area was not found. Search the full directory below.'; return;}
    $('browse-view').hidden = true; $('detail-view').hidden = false;
    document.title = a.name + ' property prices, rents & yields | Kestrel Sourcing';
    $('hero-title').textContent = a.name + ' property research';
    $('hero-description').textContent = 'Local house prices, private rents and long-term trends to help you assess the area before appraising a deal.';
    $('detail-name').textContent = a.name; $('detail-region').textContent = a.region + ' · Council code ' + a.code;
    $('ons-area-link').href = 'https://www.ons.gov.uk/visualisations/housingpriceslocal/' + a.code + '/';
    const metrics = $('detail-metrics');
    [['Average house price', money(a.price), month(data.priceMonth) + ' · ' + percent(a.priceGrowth, true) + ' over 1 year'],
     ['Average monthly rent', money(a.rent), month(data.rentMonth) + (a.rentGrowth != null ? ' · ' + percent(a.rentGrowth, true) + ' over 1 year' : '')],
     ['Estimated gross yield', percent(a.yield), 'Annualised area rent ÷ area price, before costs']].forEach(([label,value,note]) => {const dl=el('dl',null,'area-metric');dl.append(el('dt',label),el('dd',value),el('p',note));metrics.append(dl);});
    $('detail-charts').append(chart('Average house price', a.history.price), chart('Average monthly private rent', a.history.rent));
    const typeBody=$('type-rows'); a.types.forEach(t => {const tr=el('tr'); [t.name,money(t.price),money(t.rent),percent(t.yield)].forEach(v=>tr.append(el('td',v)));typeBody.append(tr);});
    a.bedrooms.forEach(t => {const tr=el('tr');tr.append(el('td',t.name),el('td',money(t.rent)));$('bedroom-rows').append(tr);});
    $('download-history').onclick=()=>{
      const prices=new Map(a.history.price),rents=new Map(a.history.rent),dates=[...new Set([...prices.keys(),...rents.keys()])].sort();
      csvDownload([['Area code','Area','Month','HMLR average house price GBP','ONS average monthly rent GBP'],...dates.map(m=>[a.code,a.name,m,prices.get(m),rents.get(m)])],a.code+'-monthly-prices-and-rents.csv');
    };
  }

  async function init() {
    try {
      const response=await fetch('data/areas.json'); if(!response.ok)throw new Error('Data unavailable');data=await response.json();
      if(data.schemaVersion!==1||!Array.isArray(data.areas)||!data.areas.length)throw new Error('Data unavailable');
      data.areas.forEach(a => { for (const kind of ['price','rent']) a.history[kind] = data.months[kind].map((m,i) => [m,a.history[kind][i]]); });
      $('area-status').hidden=true; $('browse-view').hidden=false;
      $('price-date').textContent=month(data.priceMonth);$('rent-date').textContent=month(data.rentMonth);
      $('snapshot-date').textContent=new Date(data.generatedAt).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/London'});
      $('coverage-count').textContent=data.areas.length;$('rent-count').textContent=data.areas.filter(a=>a.rent!=null).length;
      $('hpi-download').href=data.sources.hpi.download;$('hpi-source').href=data.sources.hpi.page;$('ons-download').href=data.sources.rents.download;
      $('price-source-period').textContent=month(data.priceMonth);$('rent-source-period').textContent=month(data.rentMonth);
      const regions=[...new Set(data.areas.map(a=>a.region))].sort();
      regions.forEach(r=>{const o=el('option',r);o.value=r;$('region-filter').append(o);});
      ['',...regions].forEach(r=>{const b=el('button',r||'All regions');b.type='button';b.dataset.region=r;b.setAttribute('aria-pressed',String(!r));b.onclick=()=>{$('region-filter').value=r;filter();};$('region-chips').append(b);});
      fields.forEach((key,i)=>{const th=el('th');th.dataset.key=key;th.scope='col';const b=el('button',labels[i]);b.type='button';b.onclick=()=>{if(sort===key)ascending=!ascending;else{sort=key;ascending=key==='name';}page=0;filter();};th.append(b);$('area-head').append(th);});
      const compareHead=el('th','Compare');compareHead.scope='col';$('area-head').append(compareHead);
      $('area-search').addEventListener('input',filter);$('region-filter').addEventListener('change',filter);
      $('reset-filters').onclick=()=>{$('area-search').value='';$('region-filter').value='';filter();};
      $('page-size').onchange=()=>{size=Number($('page-size').value);page=0;renderTable();};
      $('previous-page').onclick=()=>{page--;renderTable();};$('next-page').onclick=()=>{page++;renderTable();};
      $('map-metric').onchange=updateMap;
      $('clear-compare').onclick=()=>{selected.clear();$('compare-status').textContent='';renderComparison();renderTable();};
      $('download-areas').onclick=()=>csvDownload([['Area code','Council area','Region','Estimated gross yield percent','Average price GBP','Monthly rent GBP','Rent growth 1 year percent','Price growth 1 year percent','Price growth 5 years percent','Price month','Rent month'],...matched.map(a=>[a.code,a.name,a.region,a.yield,a.price,a.rent,a.rentGrowth,a.priceGrowth,a.priceGrowth5,data.priceMonth,data.rentMonth])],'kestrel-area-research.csv');
      const age=(Date.now()-new Date(data.generatedAt))/86400000;if(age>45){$('stale-note').hidden=false;}
      filter();const code=new URLSearchParams(location.search).get('area');if(code)showDetail(code);else loadMap();
    } catch (_) {
      $('browse-view').hidden=true;$('area-status').hidden=false;$('area-status').classList.add('error');$('area-status').replaceChildren(el('p','The area data could not be loaded. Please try again or use the official sources below.'),link('View ONS local housing data','https://www.ons.gov.uk/visualisations/housingpriceslocal/','area-link'));
    }
  }
  init();
})();
