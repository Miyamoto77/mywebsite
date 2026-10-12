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
  } else if (tool === 'residual') {
    groups = [
      group('Gross development value', [
        select('gdvMode', 'GDV input method', 'total', options(['total', 'Enter total scheme GDV'], ['units', 'Residential units + other GDV'])),
        { ...num('gdv', 'Total gross development value (£)', 5000000, 'Include the completed value of all residential, affordable and commercial elements.', 1), when: d => d.gdvMode === 'total' },
        { ...num('units', 'Residential units', 8, '', 1, 10000), step: 1, when: d => d.gdvMode === 'units' },
        { ...num('unitValue', 'Average residential sale value (£)', 500000, '', 1), when: d => d.gdvMode === 'units' },
        { ...num('otherGdv', 'Other / commercial GDV (£)', 1000000, 'Enter a net investment sale value where applicable; this field does not capitalise rent.', 0), when: d => d.gdvMode === 'units' }
      ]),
      group('Construction & development costs', [
        select('buildMode', 'Base build cost input', 'area', options(['area', 'Floor area × build rate'], ['total', 'Enter total base build cost'])),
        { ...num('buildArea', 'Gross internal floor area (m²)', 1000, 'Use gross internal area, not net saleable area.', 1), when: d => d.buildMode === 'area' },
        { ...num('buildRate', 'Base build rate (£ / m²)', 2500, 'Example input only; obtain a project-specific cost plan.'), when: d => d.buildMode === 'area' },
        { ...num('buildCost', 'Total base build cost (£)', 2500000), when: d => d.buildMode === 'total' },
        num('external', 'External works / infrastructure (£)', 100000), num('abnormal', 'Abnormal / remediation costs (£)', 50000),
        num('professionalPct', 'Professional fees (% of hard costs)', 10, 'Applied to base build + external works + abnormal costs.', 0, 100),
        num('contingencyPct', 'Contingency (% of hard costs)', 5, 'Applied to base build + external works + abnormal costs.', 0, 100),
        num('planning', 'Planning / surveys / application costs (£)', 50000),
        num('obligations', 'CIL / S106 / other obligations (£)', 100000, 'Include cash obligations here. Reflect affordable housing values and costs in GDV and the cost plan without double counting.'),
        num('otherDevelopment', 'Other development costs (£)', 0),
        num('unrecoverableVat', 'Additional unrecoverable VAT (£)', 0, 'Only enter VAT not already included in other costs. This tool does not assess VAT eligibility or recovery.')
      ]),
      group('Sales & marketing', [num('salesPct', 'Sales / marketing (% of GDV)', 2, 'Use gross GDV before these deductions.', 0, 100), num('salesLegal', 'Total sales legal fees (£)', 25000)]),
      group('Land acquisition', [num('landPrice', 'Site price to test (£)', 500000, 'Used for the profit and headroom comparison; the residual solver calculates a separate supported price.'), num('acquisitionPct', 'Acquisition agent / other fees (% of price)', 1, 'Excludes SDLT and the fixed costs below.', 0, 100), num('purchaseLegal', 'Purchase legal / due diligence (£)', 10000), num('sourcing', 'Agreed sourcing fee (£)', 0, 'Enter your agreed amount, including any applicable VAT.')]),
      group('Purchase tax', taxFields.map(f => {
        if (f.id === 'kind') return { ...f, value: 'commercial' };
        if (f.id === 'taxMode') return { ...f, help: 'Automatic SDLT applies at each trial land price. A manual amount is a fixed allowance held constant in the residual and sensitivity calculations; verify it at the resulting price.' };
        if (f.id === 'manualTax') return { ...f, label: 'Fixed purchase-tax allowance (£)', value: 15000 };
        if (f.id === 'companyRelief') return { ...f, when: d => d.taxMode === 'auto' && d.kind === 'residential' && d.buyer === 'company' };
        return f;
      })),
      group('Development finance', [
        select('developmentFinance', 'Finance allowance method', 'estimate', options(['estimate', 'Estimate from debt share and average draw'], ['manual', 'Enter an all-in finance budget'], ['cash', 'Cash funding — no finance allowance'])),
        { ...num('fundedPct', 'Debt-funded share (%)', 70, 'Applied to the site package and development costs. Actual loan-to-cost, loan-to-GDV and facility caps are not assessed.', 0, 100), when: d => d.developmentFinance === 'estimate' },
        { ...num('developmentRate', 'Annual finance interest (%)', 9, 'Simple interest; retained or compounded interest is not modelled.', 0, 100), when: d => d.developmentFinance === 'estimate' },
        { ...num('developmentMonths', 'Total project duration (months)', 18, 'Include acquisition-to-sale time, planning delays and the sales period.', 1, 120), when: d => d.developmentFinance === 'estimate' },
        { ...num('averageDrawnPct', 'Average development debt drawn (%)', 50, 'Average across the entire project period. Land debt is assumed drawn for the full period; this factor applies to development debt only.', 0, 100), when: d => d.developmentFinance === 'estimate' },
        { ...num('loanFeePct', 'Lender arrangement / exit fees (%)', 2, 'Applied to modelled land + development principal.', 0, 100), when: d => d.developmentFinance === 'estimate' },
        { ...num('otherFinance', 'Other finance fees (£)', 5000), when: d => d.developmentFinance === 'estimate' },
        { ...num('manualFinance', 'All-in finance budget (£)', 200000, 'Include interest and all lender / broker fees. The amount is held fixed as the land price and sensitivity inputs change.'), when: d => d.developmentFinance === 'manual' }
      ]),
      group('Target developer return', [select('profitBasis', 'Target profit basis', 'gdv', options(['gdv', 'Percentage of GDV'], ['cost', 'Percentage of total project cost'])), num('profitPct', 'Target developer profit (%)', 20, 'An editable screening assumption, not a recommended return or guarantee.', 0, 95)])
    ];
  } else if (tool === 'commercial') {
    const reviewed = (id, label) => select(id, label, 'pending', options(['pending', 'Not yet checked'], ['yes', 'Evidence reviewed'], ['no', 'Issue / further review needed']));
    groups = [
      group('1. Quick screen — purchase, size & GDV', [num('price', 'Purchase price (£)', 450000, '', 1), num('buildArea', 'Gross internal conversion area (m²)', 600, 'Area of the conversion works; retained commercial works should be included in the cost plan.', 1), num('buildRate', 'Base conversion rate (£ / m²)', 1400, 'Illustrative only; verify scope and contractor / QS cost estimates.'), { ...num('units', 'Residential units after conversion', 6, '', 1, 10000), step: 1 }, num('unitValue', 'Average flat sale value (£)', 400000, 'Use supported completed-sale comparables.', 1), select('keepCommercial', 'Commercial space remains in completed scheme?', 'no', options(['no', 'No — fully residential'], ['yes', 'Yes — mixed-use completed scheme'])), { ...num('commercialValue', 'Completed commercial capital value (£)', 500000, 'Enter the net sale / lender valuation assumption; rent is not automatically capitalised.'), when: d => d.keepCommercial === 'yes' }, { ...num('commercialRent', 'Commercial gross rent per year (£)', 30000), when: d => d.keepCommercial === 'yes' }, num('targetRogdv', 'Target profit on GDV (%)', 20, 'Editable project-return assumption; not annualised.', 0, 95)]),
      group('2. Purchase costs', [num('purchaseLegal', 'Purchase legal fees (£)', 5000), num('auctionFees', 'Auction fees (£)', 0), num('survey', 'Survey / valuation / other acquisition (£)', 5000), num('sourcing', 'Agreed sourcing fee (£)', 0)]),
      group('Purchase tax at acquisition', taxFields.map(f => f.id === 'kind' ? { ...f, value: 'commercial' } : f)),
      group('3. Development costs', [num('external', 'External / services works (£)', 25000), num('abnormal', 'Abnormal / remediation costs (£)', 25000), num('professionalPct', 'Professional fees / consultants (%)', 10, 'Percentage of base conversion + external + abnormal works.', 0, 100), num('contingencyPct', 'Contingency (%)', 10, 'Percentage of base conversion + external + abnormal works.', 0, 100), num('planning', 'Planning / application / surveys (£)', 25000), num('otherDevelopment', 'Other development costs (£)', 0), num('unrecoverableVat', 'Additional unrecoverable VAT (£)', 0, 'Enter only VAT not included in other costs. VAT liability and recovery require adviser confirmation.')]),
      group('4. Other costs', [num('salesPct', 'Sales / marketing (% of GDV)', 2, 'Only deducted in the sell-completed-scheme exit.', 0, 95), num('salesLegal', 'Sales solicitors fees (£)', 9000, 'Only deducted in the sale exit.'), num('accountancy', 'Accountancy (£)', 2000), num('cil', 'CIL (£)', 50000), num('s106', 'S106 payment (£)', 0), num('holdingMonthly', 'Utilities / holding costs per month (£)', 1000, 'Include void commercial space, insurance, rates and other relevant holding costs; finance interest is separate.')]),
      group('5. Project financing', [num('projectMonths', 'Total project duration (months)', 12, 'Acquisition to completed sale / refinance, including delays.', 1, 120), select('conversionFinance', 'Project finance method', 'bridge', options(['bridge', 'Purchase bridge — works paid from cash'], ['cash', 'Cash-funded project'], ['manual', 'Enter all-in project finance budget'])), { ...num('bridgeLtv', 'Purchase bridging LTV (%)', 70, 'Loan against purchase price only. This example does not fund staged conversion works.', 0, 99), when: d => d.conversionFinance === 'bridge' }, { ...num('bridgeRate', 'Annual bridging interest (%)', 12, 'Simple accrued interest, not compounded.', 0, 100), when: d => d.conversionFinance === 'bridge' }, { ...num('bridgeFeePct', 'Bridging arrangement / exit fees (%)', 2, 'Percentage of the purchase bridge principal.', 0, 100), when: d => d.conversionFinance === 'bridge' }, { ...num('bridgeOtherFees', 'Other project finance fees (£)', 2500), when: d => d.conversionFinance === 'bridge' }, { ...num('projectFinanceBudget', 'All-in project finance budget (£)', 75000, 'Finance interest and fees only. A loan principal is not deducted from cash required in this mode.'), when: d => d.conversionFinance === 'manual' }]),
      group('6. Refinance & hold comparison', [num('unitRent', 'Monthly rent per flat (£)', 1200), num('refiLtv', 'Refinance LTV cap (%)', 75, 'One whole-scheme valuation is assumed; lenders may treat residential and commercial parts differently.', 0, 99), select('holdFinance', 'Refinance mortgage type', 'interest', options(['interest', 'Interest-only'], ['repayment', 'Repayment'])), num('rate', 'Actual mortgage interest (%)', 5.5, '', 0, 100), num('term', 'Mortgage term (years)', 25, '', 1, 50), num('stressRate', 'Finance stress interest (%)', 6.5, 'Illustrative lender-screening assumption, not a lender offer.', 0.1, 100), num('minimumDscr', 'Target stressed debt-service coverage (%)', 125, 'Net operating income ÷ stressed annual debt payments. A lender may use a different income or coverage basis.', 1, 1000), num('refiFeePct', 'Refinance fees (% of new loan)', 1, '', 0, 100), num('refiLegal', 'Refinance legal / valuation (£)', 1500)]),
      group('Annual rental running costs', runningFields.map(f => f.id === 'insurance' ? { ...f, value: 2000 } : f)),
      group('Kestrel evidence checks', [reviewed('planningCheck', 'Planning / prior approval route'), reviewed('titleCheck', 'Title, possession & building constraints'), reviewed('costCheck', 'Conversion scope & cost plan'), reviewed('valueCheck', 'Sales / rental comparables & demand'), reviewed('fundingCheck', 'Purchase finance & exit terms')], () => true, 'Record your own evidence review. These selections do not verify planning eligibility or approve an investment.')
    ];
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
      } else if (tool === 'residual') {
        const result = C.residualDevelopment(d), a = result.actual, r = result.residual;
        const landValue = result.residualLand == null ? 'Target unmet' : money(Math.floor(result.residualLand));
        html = metrics([
          ['Residual land value', landValue, result.residualLand == null ? 'Target is unmet even at a zero site price' : 'Supported site price, rounded down; excludes acquisition costs'],
          ['Profit at entered site price', money(a.profit), 'Before corporation / personal tax'],
          ['Profit on ' + (d.profitBasis === 'cost' ? 'total cost' : 'GDV'), pct(d.profitBasis === 'cost' ? a.profitOnCost : a.profitOnGdv), 'Target: ' + d.profitPct + '%'],
          ['Site-price headroom', result.landHeadroom == null ? '—' : money(result.landHeadroom), 'Residual price less entered site price']
        ]) + '<p class="result-note"><strong>' + (a.targetHeadroom >= 0 ? 'Profit at your entered site price meets the modelled target.' : 'Profit at your entered site price is below the modelled target.') + '</strong> Profit headroom against the target: ' + money(a.targetHeadroom) + '. This comparison does not assess planning permission, loan approval or market demand.</p>';
        if (!r) html += '<p class="error">No non-negative land price meets the target on these assumptions. The target shortfall at a zero site price is ' + money(result.shortfallAtZero) + '.</p>';
        const comparison = (title, scenario) => '<h3>' + title + '</h3>' + rows([
          ['Gross development value', result.gdv], ['Base build cost', -result.build], ['External works', -result.external], ['Abnormal / remediation costs', -result.abnormal], ['Professional fees', -result.professionalFees], ['Contingency', -result.contingency], ['Planning costs', -result.planning], ['CIL / S106 / obligations', -result.obligations], ['Other development costs', -result.otherDevelopment], ['Additional unrecoverable VAT', -result.vat], ['Sales / marketing', -result.selling], ['Sales legal fees', -result.salesLegal], ['Development finance', -scenario.financeCost], ['Land / site price', -scenario.land], ['Purchase tax', -scenario.tax], ['Acquisition / legal / sourcing fees', -scenario.acquisitionFees], ['Profit before tax', scenario.profit]
        ]) + '<p class="result-note">Total project cost: <strong>' + money(scenario.totalCost) + '</strong>. Target developer profit: <strong>' + money(scenario.targetProfit) + '</strong>. Profit on GDV: ' + pct(scenario.profitOnGdv) + '; profit on cost: ' + pct(scenario.profitOnCost) + '.</p>';
        if (r) html += comparison('Appraisal at the residual site price', r);
        html += comparison('Appraisal at your entered site price', a);
        if (d.developmentFinance === 'estimate') html += '<h3>Finance at your entered site price</h3>' + rows([['Modelled site-package debt', a.landDebt], ['Modelled development debt', a.worksDebt], ['Simple interest allowance', a.interest], ['Lender & other finance fees', a.lenderFees]]) + '<p class="result-note">Interest = (site-package debt + development debt × average draw) × annual rate × project years. Site-package debt includes price, purchase tax and acquisition costs. Lender fees apply to total principal. Finance interest and fees are funded from outside this modelled principal. Sales costs are deducted from sale proceeds. There is no monthly cash flow, compounded interest, staged sales or loan facility cap in this estimate.</p>';
        const matrix = C.developmentSensitivity(d), change = n => (n > 0 ? '+' : '') + n + '%';
        html += '<h3>Residual land value sensitivity</h3><div class="table-scroll"><table><caption>Columns change GDV; rows change base build cost. Fees, contingency, tax and estimated finance recalculate in each scenario.</caption><thead><tr><th>Build / GDV</th>' + matrix.changes.map(n => '<th>' + change(n) + '</th>').join('') + '</tr></thead><tbody>' + matrix.rows.map(row => '<tr><th scope="row">' + change(row.buildChange) + '</th>' + row.values.map(cell => '<td>' + (cell.residualLand == null ? 'Target unmet' : money(Math.floor(cell.residualLand))) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div><p class="result-note">Only the base build cost changes across rows; external and abnormal costs stay fixed. Manual finance budgets and manual purchase-tax allowances stay fixed. Cross-check any supported site price against comparable land sales and a detailed project appraisal.</p>';
      } else if (tool === 'commercial') {
        const r = C.commercialConversion(d), checkpoints = [d.planningCheck, d.titleCheck, d.costCheck, d.valueCheck, d.fundingCheck];
        const reviewedCount = checkpoints.filter(v => v === 'yes').length;
        html = '<h3>Quick screen</h3>' + metrics([['Completed GDV', money(r.gdv)], ['Base conversion cost', money(r.budget.build), 'Entered area × conversion rate'], ['Sale profit before tax', money(r.profit)], ['ROGDV / ROC', pct(r.rogdv) + ' / ' + pct(r.roc), 'Project returns; not annualised']]) + '<p class="result-note">' + (r.targetHeadroom >= 0 ? 'Sale profit meets your entered ROGDV target.' : 'Sale profit is below your entered ROGDV target.') + ' Target profit: ' + money(r.targetProfit) + '; profit headroom: ' + money(r.targetHeadroom) + '. Evidence checks marked reviewed: <strong>' + reviewedCount + ' / 5</strong>.' + (reviewedCount < 5 ? ' Further evidence review is outstanding.' : ' Completion is user-reported and is not independently verified.') + '</p>';
        html += '<h3>Detailed appraisal — sell completed scheme</h3>' + rows([['Residential GDV', r.residentialValue], ['Commercial completed value', r.commercialValue], ['Total GDV', r.gdv], ['Purchase price', -r.price], ['Purchase tax', -r.tax], ['Purchase legal fees', -r.purchaseLegal], ['Auction fees', -r.auctionFees], ['Survey / acquisition costs', -r.survey], ['Sourcing fee', -r.sourcing], ['Base conversion works', -r.budget.build], ['External works', -r.budget.external], ['Abnormal costs', -r.budget.abnormal], ['Professional fees / consultants', -r.budget.professionalFees], ['Contingency', -r.budget.contingency], ['Planning costs', -r.budget.planning], ['CIL / S106', -r.budget.obligations], ['Other development costs', -r.budget.otherDevelopment], ['Additional unrecoverable VAT', -r.budget.vat], ['Utilities / holding costs', -r.holding], ['Accountancy', -r.accountancy], ['Project finance', -r.financeCost], ['Sales / marketing', -r.sales], ['Sales solicitors', -r.salesLegal], ['Profit before tax', r.profit]]) + '<p class="result-note">Total costs: <strong>' + money(r.totalSaleCost) + '</strong>. ROGDV = profit ÷ GDV; ROC = profit ÷ total costs. Break-even GDV at these cost assumptions: <strong>' + money(r.breakEvenGdv) + '</strong>.</p>';
        if (r.bridge) html += '<h3>Purchase bridge allowance</h3>' + rows([['Purchase bridge principal', r.bridge], ['Accrued simple interest', r.interest], ['Arrangement / exit / other fees', r.lenderFees]]) + '<p class="result-note">Works and other costs are funded from cash. Retained interest, staged drawdowns, compounded interest and facility caps are excluded. Use an all-in budget where you have a lender / broker cash-flow model.</p>';
        html += '<h3>Kestrel comparison — refinance & hold</h3>' + metrics([['Indicative refinance loan', money(r.refinanceLoan), 'Lower of LTV and income-screen caps'], ['Cash left in the project', money(r.cashLeft), 'After repaying purchase bridge and refinance fees'], ['Monthly cash flow', money(r.monthlyCashflow), 'After running costs and mortgage; before tax'], ['Annual cash-on-cash return', pct(r.cashReturn), r.cashLeft > 0 ? 'Annual cash flow ÷ cash left' : 'Not meaningful where cash left is zero or negative']]) + rows([['LTV-based loan cap', r.ltvLoan], ['Income-screen loan cap', r.incomeLoan], ['Project cost before sales / refinance fees', r.projectCost], ['Initial cash requirement', r.initialCash], ['Purchase bridge to repay', r.bridge], ['New refinance loan', r.refinanceLoan], ['Refinance fees / legals', r.refinanceFees], ['Net cash released at refinance', r.cashReleased], ['Cash left in the project', r.cashLeft], ['Equity at completed valuation', r.equity], ['Gross annual rent', r.grossRent], ['Voids', -r.op.lostRent], ['Management', -r.op.management], ['Maintenance', -r.op.maintenance], ['Fixed rental running costs', -r.op.fixed], ['Annual mortgage payments', -r.mortgage.monthly * 12], ['Annual rental cash flow', r.annualCashflow]]) + '<p class="result-note">Stressed debt-service coverage: ' + (r.stressDscr == null ? '—' : r.stressDscr.toFixed(2) + '×') + '. Refinance uses the entered completed scheme GDV and the lower of its LTV cap or net operating income ÷ target coverage ÷ stressed mortgage payment factor. This is a screening estimate, not a lender-approved facility. Sale fees are excluded from the hold exit. Negative net cash released means additional cash is needed at refinance; negative cash left means borrowing exceeds modelled invested costs, not a guaranteed profit.</p>';
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
      if (!['stamp', 'yield'].includes(tool) && d.taxMode === 'auto') html += '<p class="result-note"><strong>Purchase tax assumption:</strong> ' + esc(C.sdlt(tool === 'residual' ? d.landPrice : d.price, d).note) + ' England / Northern Ireland only.</p>';
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
