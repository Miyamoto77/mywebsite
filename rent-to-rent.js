/* Rent-to-rent operating cash flow. No property purchase or tax assumptions. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KestrelRentToRent = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const defaults = {
    model: 'sa', occupancy: 75, units: 1, nightlyRate: 150, availableDays: 365,
    averageStay: 4, cleaningPerStay: 40, occupiedNightCost: 8, bookingPct: 12,
    rooms: 6, roomRent: 750, occupiedRoomCost: 0, collectionPct: 0,
    landlordRent: 1500, utilities: 250, propertyTax: 150, insurance: 50, otherFixed: 50,
    managementPct: 0, maintenancePct: 5, setupCost: 10000, deposit: 3000, workingCapital: 3000
  };
  function number(value, label, max = 1e9, min = 0, integer = false) {
    if (value == null || (typeof value === 'string' && !value.trim())) throw Error('Enter ' + label.toLowerCase() + '.');
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) throw Error(label + ' must be ' + (integer ? 'a whole number ' : '') + 'between ' + min + ' and ' + max + '.');
    return n;
  }
  function calculate(input) {
    const d = { ...input };
    if (!['sa', 'rooms'].includes(d.model)) throw Error('Choose serviced accommodation or room letting.');
    const occupancy = number(d.occupancy, 'Paid occupancy', 100);
    const fixedKeys = ['landlordRent','utilities','propertyTax','insurance','otherFixed'];
    const labels = {landlordRent:'Landlord rent',utilities:'Utilities',propertyTax:'Council tax / business rates allowance',insurance:'Insurance',otherFixed:'Other fixed costs',setupCost:'Setup costs',deposit:'Refundable deposit',workingCapital:'Working capital'};
    const fixed = Object.fromEntries(fixedKeys.map(key => [key,number(d[key],labels[key])]));
    const fixedAnnual = Object.values(fixed).reduce((a,b) => a+b,0) * 12;
    const managementPct = number(d.managementPct,'Management fee',100), maintenancePct = number(d.maintenancePct,'Maintenance allowance',100);
    let capacity, rate, feePct, occupiedUnitCost, cleaningUnitCost = 0;
    if (d.model === 'sa') {
      capacity = number(d.units,'Lettable units',10000,1,true) * number(d.availableDays,'Available nights per unit per year',366,1,true);
      rate = number(d.nightlyRate,'Nightly rate');
      feePct = number(d.bookingPct,'Booking / platform fees',100);
      occupiedUnitCost = number(d.occupiedNightCost,'Other cost per occupied unit-night');
      cleaningUnitCost = number(d.cleaningPerStay,'Net cleaning / laundry cost per stay') / number(d.averageStay,'Average stay',366,1);
    } else {
      capacity = number(d.rooms,'Lettable rooms',10000,1,true) * 12;
      rate = number(d.roomRent,'Monthly rent per room');
      feePct = number(d.collectionPct,'Rent collection fees',100);
      occupiedUnitCost = number(d.occupiedRoomCost,'Other cost per occupied room-month');
    }
    const totalFeePct = managementPct + maintenancePct + feePct;
    const contributionAtFull = capacity * (rate * (1-totalFeePct/100) - occupiedUnitCost - cleaningUnitCost);
    const setupCost = number(d.setupCost,labels.setupCost), deposit = number(d.deposit,labels.deposit), workingCapital = number(d.workingCapital,labels.workingCapital);
    const initialCash = setupCost + deposit + workingCapital;
    const at = occupancy => {
      const occupiedUnits = capacity * occupancy / 100;
      const revenue = occupiedUnits * rate;
      const fees = revenue * feePct / 100, management = revenue * managementPct / 100, maintenance = revenue * maintenancePct / 100;
      const otherVariable = occupiedUnits * occupiedUnitCost, cleaning = occupiedUnits * cleaningUnitCost;
      const variableCosts = fees + management + maintenance + otherVariable + cleaning;
      const annualCashflow = revenue - variableCosts - fixedAnnual;
      return {occupancy,occupiedUnits,revenue,fees,management,maintenance,otherVariable,cleaning,variableCosts,annualCashflow,monthlyCashflow:annualCashflow/12,roi:initialCash>0?annualCashflow/initialCash*100:null};
    };
    const current = at(occupancy);
    const zeroCostBreakEven = fixedAnnual === 0 && contributionAtFull === 0;
    let breakEven = zeroCostBreakEven ? 0 : contributionAtFull > 0 ? fixedAnnual / contributionAtFull * 100 : null;
    if (breakEven != null && Math.abs(breakEven-100)<1e-9) breakEven=100;
    const scenarioOccupancies = [...new Set([0,25,50,60,70,80,90,100,occupancy])].sort((a,b)=>a-b);
    return {...current,model:d.model,capacity,rate,fixed,fixedAnnual,totalFeePct,contributionAtFull,setupCost,deposit,workingCapital,initialCash,breakEven,zeroCostBreakEven,
      fullRevenue:capacity*rate,operatingMargin:current.revenue>0?current.annualCashflow/current.revenue*100:null,
      paybackMonths:initialCash>0&&current.monthlyCashflow>0?initialCash/current.monthlyCashflow:null,
      annualCashAfterSetup:current.annualCashflow-setupCost,
      scenarios:scenarioOccupancies.map(at),curve:Array.from({length:21},(_,i)=>at(i*5))};
  }
  return {calculate,defaults};
});

(function () {
  'use strict';
  if (typeof document === 'undefined' || document.body.dataset.calculator !== 'rent-to-rent') return;
  const C=window.KestrelRentToRent,form=document.getElementById('calculator-form'),output=document.getElementById('calculator-results'),error=document.getElementById('calculator-error');
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(Math.abs(n)<1e-9?0:n);
  const pct=n=>n==null?'N/A':n.toFixed(1)+'%';
  const num=(id,label,help='',max=1e9,min=0,step='any')=>`<div class="field"><label for="r2r-${id}">${label}</label><input id="r2r-${id}" name="${id}" type="number" min="${min}" max="${max}" step="${step}" value="${C.defaults[id]}" required ${help?`aria-describedby="help-${id}"`:''}>${help?`<small class="field-help" id="help-${id}">${help}</small>`:''}</div>`;
  form.innerHTML=`<fieldset><legend>Your operating model</legend><div class="fields"><div class="field"><label for="r2r-model">Rent-to-rent strategy</label><select id="r2r-model" name="model"><option value="sa">Serviced accommodation / nightly stays</option><option value="rooms">Room letting / HMO</option></select></div><div class="field r2r-occupancy"><label for="r2r-occupancy">Paid occupancy (%)</label><div class="r2r-occupancy-control"><input id="occupancy-slider" type="range" min="0" max="100" step="1" value="75" aria-label="Adjust paid occupancy"><input id="r2r-occupancy" name="occupancy" type="number" min="0" max="100" step="any" value="75" required aria-describedby="help-occupancy"></div><small class="field-help" id="help-occupancy">Slide to test lower demand. Occupancy means paid use of available unit-nights or room-months, not people per bedroom.</small></div></div></fieldset>
    <fieldset data-model="sa"><legend>Nightly income &amp; occupancy costs</legend><div class="fields">${num('units','Lettable units','A whole property let per booking counts as one unit.',10000,1,1)}${num('nightlyRate','Nightly accommodation rate (£)','Average accommodation revenue per unit-night; exclude cleaning fees here.')}${num('availableDays','Available nights per unit / year','Reduce for planned closure. Fixed monthly costs still apply all year.',366,1,1)}${num('averageStay','Average stay (nights)','Used to estimate cleaning costs per stay.',366,1)}${num('bookingPct','Booking / platform fees (%)','Applied to accommodation revenue.',100)}${num('cleaningPerStay','Net cleaning / laundry per stay (£)','Cleaning cost minus any guest cleaning fee retained after its own fees. Enter zero if fully recovered.')}${num('occupiedNightCost','Other cost per occupied unit-night (£)','Consumables and other occupancy-linked costs, excluding cleaning and fixed bills.')}</div></fieldset>
    <fieldset data-model="rooms" hidden disabled><legend>Room income &amp; occupancy costs</legend><div class="fields">${num('rooms','Lettable rooms','Number of rooms available for the full year.',10000,1,1)}${num('roomRent','Monthly rent per room (£)','Full-occupancy monthly room rent.')}${num('collectionPct','Rent collection fees (%)','Applied to rent collected.',100)}${num('occupiedRoomCost','Other cost per occupied room-month (£)','Variable costs only; do not repeat fixed utilities or maintenance below.')}</div></fieldset>
    <fieldset><legend>Fixed monthly costs</legend><p class="field-help group-help">These costs remain payable at 0% occupancy. Enter the amounts for the whole operation, not per unit.</p><div class="fields">${num('landlordRent','Rent paid to landlord / month (£)')}${num('utilities','Utilities / month (£)')}${num('propertyTax','Council tax / business rates / month (£)','Your own allowance; tax treatment is not calculated.')}${num('insurance','Insurance / month (£)')}${num('otherFixed','Other fixed costs / month (£)','Include subscriptions, ongoing licence costs or other monthly commitments.')}</div></fieldset>
    <fieldset><legend>Revenue-based costs</legend><div class="fields">${num('managementPct','Management fee (%)','Applied to collected accommodation revenue or rent. Enter zero for self-management.',100)}${num('maintenancePct','Maintenance reserve (%)','An allowance from collected revenue, additional to the fixed costs above.',100)}</div></fieldset>
    <fieldset><legend>Upfront cash committed</legend><div class="fields">${num('setupCost','Non-refundable setup costs (£)','Include furniture, fit-out, legal, sourcing, licence and other initial costs once.')}${num('deposit','Refundable landlord deposit (£)','Cash tied up, not an operating expense.')}${num('workingCapital','Working capital reserve (£)','Cash held to cover costs and voids; not deducted again as an expense.')}</div></fieldset>
    <div class="form-actions"><button class="btn btn--primary" type="submit">Update results</button><button class="print-btn" type="reset">Reset example</button></div><p class="field-help">Example inputs are illustrative, not market benchmarks. Results update as you type. Calculations stay in your browser.</p>`;

  function fields(){return Object.fromEntries(new FormData(form));}
  function setModel(){const model=form.elements.model.value;form.querySelectorAll('[data-model]').forEach(el=>{el.hidden=el.dataset.model!==model;el.disabled=el.hidden;});}
  function metric(label,value,note,negative=false){return `<div class="metric ${negative?'r2r-negative':''}"><dt>${label}</dt><dd>${value}</dd><small>${note}</small></div>`;}
  function rows(items){return `<dl class="breakdown">${items.map(([label,value])=>`<div><dt>${label}</dt><dd>${money(value)}</dd></div>`).join('')}</dl>`;}
  function chart(r){
    const w=580,h=240,left=74,right=20,top=22,bottom=40,pw=w-left-right,ph=h-top-bottom;
    const values=r.curve.map(p=>p.monthlyCashflow),rawMin=Math.min(0,...values),rawMax=Math.max(0,...values),span=Math.max(100,rawMax-rawMin),min=rawMin-span*.1,max=rawMax+span*.1;
    const x=o=>left+pw*o/100,y=v=>top+ph*(max-v)/(max-min);
    const grids=Array.from({length:5},(_,i)=>{const v=min+(max-min)*i/4;return `<line x1="${left}" y1="${y(v)}" x2="${w-right}" y2="${y(v)}" stroke="currentColor" opacity=".12"/><text x="${left-9}" y="${y(v)+4}" text-anchor="end">${esc(money(v))}</text>`;}).join('');
    const ticks=[0,25,50,75,100].map(o=>`<text x="${x(o)}" y="${h-16}" text-anchor="middle">${o}%</text>`).join('');
    const path=r.curve.map((p,i)=>(i?'L':'M')+x(p.occupancy)+','+y(p.monthlyCashflow)).join(' ');
    const breakLine=r.breakEven!=null&&r.breakEven<=100?`<line x1="${x(r.breakEven)}" y1="${top}" x2="${x(r.breakEven)}" y2="${top+ph}" stroke="#A6803E" stroke-dasharray="4 4"/><text x="${Math.max(left+4,Math.min(w-right-4,x(r.breakEven)))}" y="${top-7}" text-anchor="${r.breakEven>80?'end':r.breakEven<20?'start':'middle'}">Break-even ${pct(r.breakEven)}</text>`:'';
    return `<svg class="r2r-chart" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="r2r-chart-title r2r-chart-desc"><title id="r2r-chart-title">Monthly cash flow at different paid occupancy levels</title><desc id="r2r-chart-desc">At ${pct(r.occupancy)} occupancy, monthly cash flow is ${money(r.monthlyCashflow)}. The table below gives the scenario values.</desc>${grids}<line x1="${left}" y1="${y(0)}" x2="${w-right}" y2="${y(0)}" stroke="currentColor" opacity=".6"/>${breakLine}<path d="${path}" fill="none" stroke="#1F3B32" stroke-width="3"/><line x1="${x(r.occupancy)}" y1="${top}" x2="${x(r.occupancy)}" y2="${top+ph}" stroke="#5C655E" opacity=".35"/><circle cx="${x(r.occupancy)}" cy="${y(r.monthlyCashflow)}" r="5" fill="#A6803E" stroke="#fff" stroke-width="2"/>${ticks}</svg>`;
  }
  function recalculate(){
    setModel();
    try{
      if(!form.checkValidity())throw Error('Complete all visible fields using the ranges shown. Occupancy must be between 0% and 100%.');
      const r=C.calculate(fields());
      const breakLabel=r.breakEven==null?'No positive margin':r.breakEven>100?'Above 100%':pct(r.breakEven);
      const breakNote=r.zeroCostBreakEven?'Cash flow is zero at every occupancy; there is no operating margin.':r.breakEven==null?'No positive operating contribution under these inputs.':r.breakEven>100?`${pct(r.breakEven)} would be required; even full occupancy loses money.`:'Covers operating costs, before setup cost recovery.';
      const occupiedLabel=r.model==='sa'?'unit-nights':'room-months';
      let html=`<p class="result-note r2r-current">At <strong>${pct(r.occupancy)} paid occupancy</strong>: ${r.occupiedUnits.toLocaleString('en-GB',{maximumFractionDigits:1})} expected ${occupiedLabel} per year.</p><dl class="metrics">${metric('Monthly operating cash flow',money(r.monthlyCashflow),'Annual average, before tax and financing.',r.monthlyCashflow<0)}${metric('Annual cash-on-cash ROI',pct(r.roi),r.initialCash>0?'Annual operating cash flow ÷ upfront cash committed.':'Enter upfront cash to calculate ROI.',r.roi<0)}${metric('Break-even occupancy',breakLabel,breakNote)}${metric('Upfront cash committed',money(r.initialCash),'Setup costs + refundable deposit + working capital.')}</dl>`;
      if(r.monthlyCashflow<0)html+='<p class="r2r-alert">These inputs produce an operating loss at the selected occupancy. Test the fixed costs, rate and occupancy before relying on the result.</p>';
      if(r.totalFeePct>=100)html+=`<p class="r2r-alert">Revenue-based fees and allowances total ${pct(r.totalFeePct)}. They are all applied to the same collected revenue.</p>`;
      html+='<h3>How occupancy changes the result</h3><p class="result-note">Monthly operating cash flow (£). All other inputs stay fixed. The gold dot marks your selected occupancy.</p>'+chart(r);
      html+=`<div class="table-scroll"><table><caption>Occupancy scenarios. Setup costs and reserves are unchanged.</caption><thead><tr><th scope="col">Occupancy</th><th scope="col">Monthly revenue</th><th scope="col">Monthly cash flow</th><th scope="col">Annual ROI</th></tr></thead><tbody>${r.scenarios.map(s=>`<tr class="${s.occupancy===r.occupancy?'r2r-selected':''}"><th scope="row">${pct(s.occupancy)}${s.occupancy===r.occupancy?' · selected':''}</th><td>${money(s.revenue/12)}</td><td class="${s.monthlyCashflow<0?'r2r-loss':''}">${money(s.monthlyCashflow)}</td><td>${pct(s.roi)}</td></tr>`).join('')}</tbody></table></div>`;
      html+='<h3>Monthly cash flow breakdown</h3>'+rows([['Collected accommodation revenue / rent',r.revenue/12],['Rent paid to landlord',-r.fixed.landlordRent],['Utilities',-r.fixed.utilities],['Council tax / business rates allowance',-r.fixed.propertyTax],['Insurance',-r.fixed.insurance],['Other fixed costs',-r.fixed.otherFixed],[r.model==='sa'?'Booking / platform fees':'Rent collection fees',-r.fees/12],['Management fees',-r.management/12],['Maintenance reserve',-r.maintenance/12],...(r.model==='sa'?[['Net cleaning / laundry',-r.cleaning/12]]:[]),[r.model==='sa'?'Other occupied-night costs':'Other occupied-room costs',-r.otherVariable/12],['Monthly operating cash flow',r.monthlyCashflow]]);
      html+='<h3>Annual return &amp; setup cash</h3>'+rows([['Annual operating cash flow',r.annualCashflow],['Non-refundable setup cost',r.setupCost],['Refundable deposit tied up',r.deposit],['Working capital held',r.workingCapital],['Annual operating cash flow less setup spend',r.annualCashAfterSetup]])+`<p class="result-note">Simple cash recovery period: <strong>${r.paybackMonths==null?'N/A':r.paybackMonths.toFixed(1)+' months'}</strong>. This assumes unchanged positive cash flow and recovery of all upfront cash through operations. Deposit return, reserve release, tax and financing are not modelled.</p>`;
      html+='<p class="result-note">Annual operating cash flow less setup spend is a first-year cash comparison, not a second ROI measure. Deposit and working capital are included in cash committed, but are not charged as operating expenses. No purchase-price yield or property growth is included.</p>';
      output.innerHTML=html;output.hidden=false;error.hidden=true;
    }catch(e){error.textContent=e.message;error.hidden=false;output.hidden=true;}
  }
  form.addEventListener('input',e=>{
    if(e.target.id==='occupancy-slider')form.elements.occupancy.value=e.target.value;
    else if(e.target.name==='occupancy'&&e.target.validity.valid)document.getElementById('occupancy-slider').value=e.target.value;
    recalculate();
  });
  form.addEventListener('change',recalculate);
  form.addEventListener('submit',e=>{e.preventDefault();recalculate();if(!form.checkValidity())form.reportValidity();});
  form.addEventListener('reset',()=>setTimeout(recalculate,0));
  document.getElementById('print-results').addEventListener('click',()=>window.print());
  recalculate();
})();
