(function () {
  'use strict';
  const C = window.KestrelCalculators;
  const tool = document.body.dataset.calculator;
  if (!tool || !C) return;
  const form = document.getElementById('calculator-form');
  const output = document.getElementById('calculator-results');
  const error = document.getElementById('calculator-error');
  const money = n => n == null ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  const pct = n => n == null ? '—' : n.toFixed(2) + '%';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const options = (...pairs) => pairs;
  const num = (id, label, value, help = '', min = 0, max = undefined) => ({ id, label, value, help, type: 'number', min, max });
  const select = (id, label, value, choices, help = '') => ({ id, label, value, choices, help, type: 'select' });
  const group = (title, fields, when = () => true, help = '') => ({ title, fields, when, help });
  const taxFields = [
    select('taxMode', 'Purchase tax', 'auto', options(['auto', 'Calculate SDLT (England / Northern Ireland)'], ['manual', 'Enter purchase tax manually']), 'For Scotland or Wales, enter an amount from the official local tax calculator.'),
    { ...select('kind', 'Property at purchase', 'residential', options(['residential', 'Residential'], ['commercial', 'Commercial / non-residential land'], ['mixed', 'Mixed residential and commercial'])), when: d => d.taxMode === 'auto' },
    { ...select('buyer', 'Buyer type', 'additional', options(['additional', 'Additional property / buy-to-let'], ['standard', 'Standard rates / replacing main home'], ['first', 'Eligible first-time buyer (own main home)'], ['company', 'Company'])), when: d => d.taxMode === 'auto' && d.kind === 'residential' },
    { ...select('nonresident', 'Non-resident for SDLT purposes?', 'no', options(['no', 'No'], ['yes', 'Yes — include 2% surcharge']), 'SDLT residence rules differ from ordinary tax residence. Check all buyers and company control.'), when: d => d.taxMode === 'auto' && d.kind === 'residential' },
    { ...select('companyRelief', 'Relief from the special corporate rate?', 'no', options(['no', 'No — model the 17% rate'], ['yes', 'Yes — assume qualifying relief']), 'Select Yes only where your adviser confirms the rental / development or other qualifying relief conditions.'), when: d => d.taxMode === 'auto' && d.kind === 'residential' && d.buyer === 'company' && d.price > 500000 },
    { ...num('manualTax', 'Purchase tax (£)', 8000), when: d => d.taxMode === 'manual' }
  ];
  const acquisitionFields = [num('sourcing', 'Sourcing fee (£)', 0, 'Enter your agreed fee, including any applicable VAT. The ROI-based fee on our homepage uses the definition in your agreement.'), num('refurb', 'Refurbishment / fit-out (£)', 15000), num('legal', 'Purchase legal fees (£)', 1500), num('survey', 'Survey / valuation (£)', 500), num('broker', 'Broker fees (£)', 0), num('financeFee', 'Initial finance fees (£)', 0), num('otherAcquisition', 'Other acquisition costs (£)', 0, 'Include contingency, licences and any other costs relevant to your project.')];
  const financeFields = [select('finance', 'Finance type', 'interest', options(['interest', 'Interest-only mortgage'], ['repayment', 'Repayment mortgage'], ['cash', 'Cash purchase'])),
    { ...num('ltv', 'Loan to value (%)', 75, '', 0, 99), when: d => d.finance !== 'cash' },
    { ...num('rate', 'Annual mortgage interest (%)', 5, '', 0, 100), when: d => d.finance !== 'cash' },
    { ...num('term', 'Mortgage term (years)', 25, '', 1, 50), when: d => d.finance !== 'cash' }];
  const runningFields = [num('voidPct', 'Void allowance (%)', 5, 'Deducted from potential rent before management and maintenance.', 0, 100), num('managementPct', 'Management fee (%)', 10, 'Applied to rent actually collected.', 0, 100), num('maintenancePct', 'Maintenance reserve (%)', 5, 'Applied to rent actually collected.', 0, 100), num('insurance', 'Insurance per year (£)', 500), num('serviceCharge', 'Service charge per year (£)', 0), num('groundRent', 'Ground rent per year (£)', 0), num('utilities', 'Utilities / council tax per year (£)', 0), num('otherRunning', 'Other running costs per year (£)', 0)];
  const bridgeFields = [select('purchaseFinance', 'Purchase funding', 'cash', options(['cash', 'Cash'], ['bridge', 'Bridging finance'])),
    { ...num('bridgeLtv', 'Bridging LTV (%)', 70, 'Loan against purchase price only; works are funded from cash.', 0, 99), when: d => d.purchaseFinance === 'bridge' },
    { ...num('bridgeRate', 'Bridging interest per year (%)', 12, 'Simple interest accrued for the project period. Include arrangement / exit fees in finance or other acquisition costs.', 0, 100), when: d => d.purchaseFinance === 'bridge' },
    num('months', 'Project / refurbishment period (months)', 6, '', 1, 120), num('holdingMonthly', 'Holding costs per month (£)', 250, 'Insurance, utilities and other holding costs, excluding bridging interest.')];
  const projectionFields = [select('years', 'Projection period', '10', options(['5', '5 years'], ['10', '10 years'], ['15', '15 years'], ['20', '20 years'])), num('valueGrowth', 'Property growth per year (%)', 2, 'An assumption, not a forecast.', -50, 50), num('rentGrowth', 'Rent growth per year (%)', 2, '', -50, 50), num('costInflation', 'Fixed-cost inflation per year (%)', 3, '', -50, 50)];
  let groups;
  if (tool === 'stamp') {
    groups = [group('Property & buyer', [num('price', 'Purchase price (£)', 250000, '', 1), ...taxFields.filter(f => !['taxMode', 'manualTax'].includes(f.id))])];
  } else if (tool === 'yield') {
    groups = [group('Property & income', [num('price', 'Purchase price (£)', 150000, '', 1), num('rent', 'Monthly rent (£)', 750)]), group('Finance', financeFields), group('Running costs', runningFields)];
  } else if (tool === 'bmv') {
    groups = [group('Value & purchase', [num('marketValue', 'Current open-market value (£)', 200000, 'Use evidenced comparable sales or a professional valuation.', 1), num('price', 'Purchase / offer price (£)', 150000, '', 1), select('compare', 'Compare total cost against', 'market', options(['market', 'Current market value'], ['gdv', 'Value after works (GDV)'])), { ...num('gdv', 'Value after works (£)', 220000, '', 1), when: d => d.compare === 'gdv' }]), group('Purchase tax', taxFields), group('Acquisition & works', acquisitionFields.filter(f => f.id !== 'financeFee')), group('Potential sale', [num('sellingPct', 'Selling costs (%)', 1.5, 'Percentage of the comparison value; include any applicable VAT.', 0, 100), num('holding', 'Holding / finance costs (£)', 0)])];
  } else {
    groups = [group('Choose your strategy', [select('strategy', 'Investment strategy', 'btl', options(['btl', 'Buy-to-let'], ['flip', 'Flip — buy, improve and sell'], ['brr', 'BRR — buy, refurbish, refinance and rent'], ['hmo', 'HMO — room-by-room rental'], ['sa', 'Serviced accommodation']))]),
      group('Property & income', [num('price', 'Purchase price (£)', 150000, '', 1),
        { ...num('rent', 'Monthly rent (£)', 750), when: d => ['btl', 'brr'].includes(d.strategy) },
        { ...num('rooms', 'Lettable rooms', 5, '', 1, 100), step: 1, when: d => d.strategy === 'hmo' },
        { ...num('roomRent', 'Monthly rent per room (£)', 500), when: d => d.strategy === 'hmo' },
        { ...num('nightlyRate', 'Average nightly rate (£)', 100), when: d => d.strategy === 'sa' },
        { ...num('occupancy', 'Occupied nights (%)', 70, '', 0, 100), when: d => d.strategy === 'sa' },
        { ...num('operatingPct', 'Operating costs (% of revenue)', 30, 'Cleaning, platform fees, laundry, management and consumables. Add separate fixed bills under Running costs.', 0, 100), when: d => d.strategy === 'sa' },
        { ...num('saleValue', 'Expected sale value (£)', 220000, '', 1), when: d => d.strategy === 'flip' },
        { ...num('arv', 'Value on refinance (£)', 220000, 'Refinancing depends on lender terms and an acceptable valuation.', 1), when: d => d.strategy === 'brr' }]),
      group('Purchase tax', taxFields), group('Acquisition & works', acquisitionFields),
      group('Mortgage', financeFields, d => ['btl', 'hmo', 'sa'].includes(d.strategy)),
      group('Project funding & holding', bridgeFields, d => ['flip', 'brr'].includes(d.strategy)),
      group('Refinance', [num('refiLtv', 'Refinance LTV (%)', 75, '', 0, 99), select('finance', 'Refinance mortgage type', 'interest', options(['interest', 'Interest-only'], ['repayment', 'Repayment'])), num('rate', 'Annual mortgage interest (%)', 5, '', 0, 100), num('term', 'Mortgage term (years)', 25, '', 1, 50), num('refiFee', 'Refinance fees (£)', 1500)], d => d.strategy === 'brr'),
      group('Sale costs', [num('sellingPct', 'Selling costs (%)', 1.5, '', 0, 100), num('saleLegal', 'Sale legal fees (£)', 1500)], d => d.strategy === 'flip'),
      group('Running costs', runningFields.map(f => ['voidPct', 'managementPct', 'maintenancePct'].includes(f.id) ? { ...f, when: d => d.strategy !== 'sa' } : f), d => d.strategy !== 'flip'),
      group('Long-term assumptions', projectionFields, d => d.strategy !== 'flip', 'Mortgage rates and occupancy stay constant. Interest-only loan maturity, refinancing, tax and sale costs are excluded from these holding projections.')];
  }
  // Refinance and mortgage use the same input names, so inactive groups contribute no values.
  form.innerHTML = groups.map((g, index) => '<fieldset data-group="' + index + '"><legend>' + esc(g.title) + '</legend>' + (g.help ? '<p class="field-help group-help">' + esc(g.help) + '</p>' : '') + '<div class="fields">' + g.fields.map(f => {
    const id = 'g' + index + '-' + f.id;
    const input = f.type === 'select' ? '<select id="' + id + '" name="' + f.id + '">' + f.choices.map(([value, label]) => '<option value="' + esc(value) + '"' + (String(f.value) === value ? ' selected' : '') + '>' + esc(label) + '</option>').join('') + '</select>' : '<input id="' + id + '" name="' + f.id + '" type="number" inputmode="decimal" required step="' + (f.step || 'any') + '" min="' + f.min + '"' + (f.max !== undefined ? ' max="' + f.max + '"' : '') + ' value="' + f.value + '">';
    return '<div class="field" data-field="' + f.id + '"><label for="' + id + '">' + esc(f.label) + '</label>' + input + (f.help ? '<small id="' + id + '-help" class="field-help">' + esc(f.help) + '</small>' : '') + '</div>';
  }).join('') + '</div></fieldset>').join('') + '<div class="form-actions"><button class="btn btn--primary" type="submit">Calculate</button><button class="btn btn--ghost" type="reset">Reset example</button></div>';
  form.querySelectorAll('.field').forEach(field => {
    const help = field.querySelector('small'), input = field.querySelector('input, select');
    if (help) input.setAttribute('aria-describedby', help.id);
  });
  const defaults = { taxMode: 'auto', kind: 'residential', buyer: 'additional', nonresident: 'no', companyRelief: 'no', price: 150000, rent: 750, ltv: 75, finance: 'interest', rate: 5, term: 25, bridgeRate: 12, refiFee: 1500 };
  function data() {
    const d = { ...defaults };
    form.querySelectorAll('input, select').forEach(el => { if (!el.disabled) d[el.name] = el.type === 'number' ? Number(el.value) : el.value; });
    d.nonresident = d.nonresident === 'yes'; d.companyRelief = d.companyRelief === 'yes';
    return d;
  }
  function visibility() {
    // Two passes allow the strategy control to re-enable a group before reading its inputs.
    for (let pass = 0; pass < 2; pass++) {
      const raw = data();
      groups.forEach((g, index) => {
        const fs = form.querySelector('[data-group="' + index + '"]'), active = g.when(raw);
        fs.hidden = !active;
        g.fields.forEach(f => {
          const wrap = fs.querySelector('[data-field="' + f.id + '"]'), enabled = active && (!f.when || f.when(raw));
          wrap.hidden = !enabled;
          wrap.querySelector('input, select').disabled = !enabled;
        });
      });
    }
  }
  const metric = (label, value, help = '') => '<div class="metric"><dt>' + esc(label) + '</dt><dd>' + esc(value) + '</dd>' + (help ? '<small>' + esc(help) + '</small>' : '') + '</div>';
  const rows = entries => '<dl class="breakdown">' + entries.map(([label, value]) => '<div><dt>' + esc(label) + '</dt><dd>' + esc(money(value)) + '</dd></div>').join('') + '</dl>';
  const metrics = entries => '<dl class="metrics">' + entries.map(e => metric(...e)).join('') + '</dl>';
  const costLabels = { sourcing: 'Sourcing fee', refurb: 'Works / fit-out', legal: 'Purchase legal fees', survey: 'Survey / valuation', broker: 'Broker fees', financeFee: 'Initial finance fees', otherAcquisition: 'Other acquisition costs' };
  function purchase(buy) {
    return '<h3>Acquisition breakdown</h3>' + rows([['Purchase price', buy.price], ['Purchase tax', buy.tax], ...Object.entries(buy.costs).filter(([, v]) => v).map(([k, v]) => [costLabels[k], v]), ['Total acquisition & works', buy.total]]);
  }
  function cashflow(result, d) {
    const op = result.op;
    return '<h3>Annual cash flow before tax</h3>' + rows([['Potential rental income', op.grossAnnual], [d.strategy === 'sa' ? 'Unoccupied nights' : 'Void allowance', -op.lostRent], [d.strategy === 'sa' ? 'Operating costs' : 'Management', -op.management], ['Maintenance reserve', -op.maintenance], ['Fixed running costs', -op.fixed], ['Mortgage payments', -result.debt.monthly * 12], ['Annual cash flow', result.annualCashflow]]) + '<p class="result-note">Net operating yield excludes mortgage payments. Cash flow includes ' + (d.finance === 'repayment' ? 'interest and principal repayments' : 'mortgage interest where selected') + '. All figures are before tax.</p>';
  }
  function longterm(result, d) {
    const projection = C.projections(result, d), last = projection.at(-1);
    return '<h3>' + esc(d.years) + '-year holding scenario</h3>' + metrics([['Property value at year ' + d.years, money(last.propertyValue)], ['Equity at year ' + d.years, money(last.equity)], ['Cumulative rental cash flow', money(last.accumulated)]]) + '<div class="table-scroll"><table><caption>Year-by-year estimates at the entered growth assumptions</caption><thead><tr><th>Year</th><th>Value</th><th>Loan</th><th>Equity</th><th>Income</th><th>Costs & finance</th><th>Cash flow</th></tr></thead><tbody>' + projection.map(p => '<tr><th scope="row">' + p.year + '</th>' + ['propertyValue', 'loan', 'equity', 'income', 'costs', 'cashflow'].map(k => '<td>' + money(p[k]) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div><p class="result-note">These are scenarios, not forecasts. Year-one rent starts at today’s entered level; property growth is applied to each year end. Fixed costs grow with inflation; percentage fees grow with collected rent. Interest-only debt is held at the same balance and rate, including beyond its stated term. Any loan repayment at maturity, future refinance, taxes and sale costs require a separate allowance.</p>';
  }
  function recalculate() {
    visibility();
    if (!form.checkValidity()) { error.hidden = false; error.textContent = 'Enter valid numbers in all visible fields. Purchase prices and values must be greater than zero.'; output.hidden = true; return; }
    try {
      const d = data();
      let html = '';
      if (tool === 'stamp') {
        const tax = C.sdlt(d.price, d);
        html = metrics([['Estimated SDLT', money(tax.total)], ['Effective tax rate', pct(tax.effectiveRate)], ['Price + SDLT', money(d.price + tax.total)]]) + '<p class="result-note">' + esc(tax.note) + '</p><div class="table-scroll"><table><caption>Tax charged progressively on each portion of the price</caption><thead><tr><th>Band</th><th>Taxable portion</th><th>Rate</th><th>Tax</th></tr></thead><tbody>' + tax.rows.map(r => '<tr><th scope="row">' + (r.upper === Infinity ? 'Above ' + money(r.lower) : r.lower === 0 ? 'Up to ' + money(r.upper) : money(r.lower) + ' to ' + money(r.upper)) + '</th><td>' + money(r.amount) + '</td><td>' + r.rate + '%</td><td>' + money(r.tax) + '</td></tr>').join('') + '</tbody></table></div>';
      } else if (tool === 'yield') {
        const result = C.rental({ ...d, taxMode: 'manual', manualTax: 0 });
        html = metrics([['Gross potential yield', pct(result.potentialYield), 'Annual rent ÷ purchase price'], ['Net operating yield', pct(result.netYield), 'After voids & running costs; before finance'], ['Monthly cash flow', money(result.monthlyCashflow), 'After mortgage payments; before tax'], ['Annual cash flow', money(result.annualCashflow), 'Calculated without monthly rounding']]) + cashflow(result, d);
      } else if (tool === 'bmv') {
        const result = C.bmv(d);
        html = metrics([['BMV discount', pct(result.discount), 'Current market value less price, ÷ current value'], ['Value gap before costs', money(result.equityBeforeCosts)], ['Surplus after acquisition & works', money(result.surplus), 'Comparison value less total acquisition & works'], ['Estimated sale profit', money(result.profit), 'After entered selling and holding costs']]) + purchase(result.buy) + '<h3>Potential sale breakdown</h3>' + rows([['Comparison value', result.targetValue], ['Selling costs', -result.sellingCosts], ['Holding / finance costs', -d.holding], ['Estimated profit before tax', result.profit]]) + '<p class="result-note">Return on total project cost: <strong>' + pct(result.returnOnCost) + '</strong>. This is an unlevered cost-based return; a refinance or mortgage is not modelled. A value gap is not independently verified equity or cash profit.</p>';
      } else if (d.strategy === 'flip') {
        const result = C.flip(d);
        html = metrics([['Estimated profit before tax', money(result.profit)], ['Cash required during project', money(result.capital), 'Includes accrued bridge interest & holding costs'], ['Return on cash committed', pct(result.cashReturn), 'Project return; not annualised'], ['Return on total project cost', pct(result.returnOnCost)]]) + purchase(result.buy) + '<h3>Project & sale breakdown</h3>' + rows([['Bridging loan', result.bridge], ['Bridging interest', result.bridgeInterest], ['Holding costs', result.holding], ['Selling & sale legal costs', result.sellingCosts], ['Total project cost', result.projectCost], ['Expected sale proceeds', result.saleValue], ['Profit before tax', result.profit]]) + '<p class="result-note">Cash required assumes all works are paid from cash and sale costs are deducted from sale proceeds. Bridging interest is simple and accrued; compounded interest or retained-interest facility limits are not modelled.</p>';
      } else {
        const result = d.strategy === 'brr' ? C.brr(d) : C.rental(d);
        html = metrics([['Monthly cash flow', money(result.monthlyCashflow), 'After finance; before tax'], ['Annual cash flow', money(result.annualCashflow)], [d.strategy === 'brr' ? 'Cash left after refinance' : 'Cash invested', money(result.capital)], ['Annual cash-on-cash return', pct(result.cashReturn), result.capital > 0 ? 'Annual cash flow ÷ cash invested' : 'Not meaningful where cash left is zero or negative']]) + purchase(result.buy);
        if (d.strategy === 'brr') html += '<h3>Refinance breakdown</h3>' + rows([['Initial cash required', result.initialCash], ['Bridging loan to repay', result.bridge], ['Bridging interest', result.bridgeInterest], ['Holding costs', result.holding], ['Refinance fees', result.refiFee], ['Total project investment', result.totalCost], ['New mortgage', result.debt.principal], ['Cash released after bridge repayment', result.released], ['Cash left in project', result.cashLeft], ['Equity at refinance value', result.equity]]) + '<p class="result-note">The holding projection begins after refurbishment and refinance. Released cash is new borrowing. A negative cash-left figure represents cash extracted beyond the modelled investment, not a guaranteed profit.</p>';
        html += cashflow(result, d) + '<p class="result-note">Net operating yield: <strong>' + pct(result.netYield) + '</strong> on ' + (d.strategy === 'brr' ? 'refinance value' : 'purchase price') + '.</p>' + longterm(result, d);
      }
      if (!['stamp', 'yield'].includes(tool) && d.taxMode === 'auto') html += '<p class="result-note"><strong>Purchase tax assumption:</strong> ' + esc(C.sdlt(d.price, d).note) + ' England / Northern Ireland only.</p>';
      output.innerHTML = html;
      error.hidden = true; output.hidden = false;
    } catch (e) { error.hidden = false; error.textContent = e.message; output.hidden = true; }
  }
  form.addEventListener('input', recalculate);
  form.addEventListener('change', recalculate);
  form.addEventListener('submit', e => { e.preventDefault(); recalculate(); if (!form.checkValidity()) form.reportValidity(); });
  form.addEventListener('reset', () => { setTimeout(recalculate, 0); });
  document.getElementById('print-results').addEventListener('click', () => window.print());
  recalculate();
})();
