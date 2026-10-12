/* Kestrel calculators. Money is kept at full precision until presentation. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KestrelCalculators = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function nonnegative(value, name = 'Value') {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw new Error(name + ' must be zero or greater.');
    return n;
  }
  function positive(value, name = 'Value') {
    const n = nonnegative(value, name);
    if (!n) throw new Error(name + ' must be greater than zero.');
    return n;
  }
  const ratio = (a, b) => b > 0 ? a / b * 100 : null;
  function percentage(value, name, max = 100) {
    const n = nonnegative(value, name);
    if (n > max) throw new Error(name + ' must be between 0 and ' + max + '.');
    return n;
  }
  function bands(price, limits, rates) {
    let lower = 0;
    const rows = [];
    limits.forEach((upper, i) => {
      const amount = Math.max(0, Math.min(price, upper) - lower);
      if (amount > 0) rows.push({ lower, upper, amount, rate: rates[i], tax: amount * rates[i] / 100 });
      lower = upper;
    });
    return rows;
  }
  function sdlt(price, options = {}) {
    price = nonnegative(price, 'Purchase price');
    const kind = options.kind || 'residential', buyer = options.buyer || 'additional';
    if (!['residential', 'commercial', 'mixed'].includes(kind)) throw new Error('Select a supported property type.');
    if (!['standard', 'additional', 'first', 'company'].includes(buyer)) throw new Error('Select a buyer type.');
    let rows, note = '';
    if (kind !== 'residential') {
      rows = bands(price, [150000, 250000, Infinity], [0, 2, 5]);
      note = 'Non-residential / mixed-use purchase-price rates. Lease rent tax and linked purchases are excluded.';
    } else {
      const surcharge = price >= 40000 && options.nonresident ? 2 : 0;
      if (buyer === 'company' && price > 500000 && !options.companyRelief) {
        rows = bands(price, [Infinity], [17 + surcharge]);
        note = 'Assumes the special corporate rate applies and no qualifying relief is available. Confirm this treatment with your solicitor.';
      } else if (buyer === 'first' && price <= 500000) {
        rows = bands(price, [300000, 500000], [surcharge, 5 + surcharge]);
        note = 'Assumes every purchaser qualifies for first-time buyer relief and will occupy the property as their main residence.';
      } else {
        const additional = price >= 40000 && ['additional', 'company'].includes(buyer) ? 5 : 0;
        rows = bands(price, [125000, 250000, 925000, 1500000, Infinity], [0, 2, 5, 10, 12].map(r => r + additional + surcharge));
        if (buyer === 'first') note = 'First-time buyer relief is unavailable above £500,000; standard rates are used.';
        else if (buyer === 'company') note = price > 500000 ? 'Assumes eligibility for relief from the special 17% corporate rate; the additional-property rates still apply.' : 'Company purchase using additional-property rates.';
        else note = additional ? 'Includes the additional-property surcharge.' : 'Assumes standard rates apply, including a qualifying main-residence replacement where applicable.';
      }
      if (surcharge) note += ' Includes the 2% non-resident surcharge.';
    }
    const total = rows.reduce((sum, row) => sum + row.tax, 0);
    return { total, effectiveRate: ratio(total, price), rows, note };
  }
  function finance(principal, rate, term, type = 'interest') {
    principal = nonnegative(principal, 'Loan');
    rate = percentage(rate, 'Interest rate');
    term = positive(term, 'Mortgage term');
    if (!['cash', 'interest', 'repayment'].includes(type)) throw new Error('Select a finance type.');
    if (type === 'cash' || !principal) return { principal: 0, monthly: 0, interest: 0, balance: () => 0 };
    const r = rate / 1200, count = term * 12;
    const monthly = type === 'interest' ? principal * r : r === 0 ? principal / count : principal * r / (1 - Math.pow(1 + r, -count));
    const balance = months => {
      if (type === 'interest') return principal;
      const m = Math.min(Math.max(0, months), count);
      return Math.max(0, r === 0 ? principal - monthly * m : principal * Math.pow(1 + r, m) - monthly * (Math.pow(1 + r, m) - 1) / r);
    };
    return { principal, monthly, interest: principal * r, balance };
  }
  function acquisition(d) {
    const price = positive(d.price, 'Purchase price');
    const tax = d.taxMode === 'manual' ? nonnegative(d.manualTax, 'Purchase tax') : sdlt(price, d).total;
    const keys = ['sourcing', 'refurb', 'legal', 'survey', 'broker', 'financeFee', 'otherAcquisition'];
    const costs = Object.fromEntries(keys.map(k => [k, nonnegative(d[k] || 0, k)]));
    const additionalCosts = tax + Object.values(costs).reduce((a, b) => a + b, 0);
    return { price, tax, costs, additionalCosts, total: price + additionalCosts };
  }
  function operating(d, grossAnnual) {
    const voids = percentage(d.voidPct || 0, 'Void allowance');
    const management = percentage(d.managementPct || 0, 'Management fee');
    const maintenance = percentage(d.maintenancePct || 0, 'Maintenance allowance');
    const income = grossAnnual * (1 - voids / 100);
    const variable = income * (management + maintenance) / 100;
    const fixedKeys = ['insurance', 'serviceCharge', 'groundRent', 'utilities', 'otherRunning'];
    const fixed = fixedKeys.reduce((sum, k) => sum + nonnegative(d[k] || 0, k), 0);
    return { grossAnnual, income, lostRent: grossAnnual - income, management: income * management / 100,
      maintenance: income * maintenance / 100, variable, fixed, totalCosts: variable + fixed, netOperating: income - variable - fixed };
  }
  function rental(d) {
    const buy = acquisition(d);
    let gross = nonnegative(d.rent, 'Monthly rent') * 12;
    if (d.strategy === 'hmo') gross = positive(d.rooms, 'Lettable rooms') * nonnegative(d.roomRent, 'Monthly room rent') * 12;
    if (d.strategy === 'sa') gross = nonnegative(d.nightlyRate, 'Nightly rate') * 365;
    const opInputs = d.strategy === 'sa' ? { ...d, voidPct: 100 - percentage(d.occupancy, 'Occupancy'), managementPct: percentage(d.operatingPct || 0, 'Operating costs'), maintenancePct: 0 } : d;
    const op = operating(opInputs, gross);
    const ltv = d.finance === 'cash' ? 0 : percentage(d.ltv, 'Loan to value', 99);
    const debt = finance(buy.price * ltv / 100, d.rate, d.term, d.finance);
    const capital = buy.total - debt.principal;
    const annualCashflow = op.netOperating - debt.monthly * 12;
    return { buy, op, debt, capital, annualCashflow, monthlyCashflow: annualCashflow / 12,
      grossYield: ratio(op.income, buy.price), potentialYield: ratio(gross, buy.price), netYield: ratio(op.netOperating, buy.price), cashReturn: ratio(annualCashflow, capital) };
  }
  function bmv(d) {
    const buy = acquisition(d), marketValue = positive(d.marketValue, 'Current market value');
    const targetValue = d.compare === 'gdv' ? positive(d.gdv, 'Value after works') : marketValue;
    const sellingCosts = targetValue * percentage(d.sellingPct || 0, 'Selling costs') / 100;
    const equityBeforeCosts = marketValue - buy.price, surplus = targetValue - buy.total;
    const profit = surplus - sellingCosts - nonnegative(d.holding || 0, 'Holding / finance costs');
    return { buy, marketValue, targetValue, discount: ratio(equityBeforeCosts, marketValue), equityBeforeCosts,
      surplus, sellingCosts, profit, returnOnCost: ratio(profit, buy.total + sellingCosts + Number(d.holding || 0)) };
  }
  function flip(d) {
    const buy = acquisition(d), saleValue = positive(d.saleValue, 'Sale value'), months = positive(d.months, 'Project length');
    const bridge = d.purchaseFinance === 'bridge' ? buy.price * percentage(d.bridgeLtv, 'Bridging LTV', 99) / 100 : 0;
    const bridgeInterest = bridge ? bridge * percentage(d.bridgeRate, 'Annual bridging rate') / 100 * months / 12 : 0;
    const holding = nonnegative(d.holdingMonthly || 0, 'Monthly holding costs') * months;
    const sellingCosts = saleValue * percentage(d.sellingPct, 'Selling costs') / 100 + nonnegative(d.saleLegal || 0, 'Sale legal costs');
    const projectCost = buy.total + bridgeInterest + holding + sellingCosts;
    const capital = buy.total - bridge + bridgeInterest + holding;
    const profit = saleValue - projectCost;
    return { buy, saleValue, bridge, bridgeInterest, holding, sellingCosts, projectCost, capital, profit,
      returnOnCost: ratio(profit, projectCost), cashReturn: ratio(profit, capital) };
  }
  function brr(d) {
    const buy = acquisition(d), arv = positive(d.arv, 'Refinance value'), months = positive(d.months, 'Refurbishment period');
    const bridge = d.purchaseFinance === 'bridge' ? buy.price * percentage(d.bridgeLtv, 'Bridging LTV', 99) / 100 : 0;
    const bridgeInterest = bridge ? bridge * percentage(d.bridgeRate, 'Annual bridging rate') / 100 * months / 12 : 0;
    const holding = nonnegative(d.holdingMonthly || 0, 'Monthly holding costs') * months;
    const refiFee = nonnegative(d.refiFee, 'Refinance fees');
    const debt = finance(arv * percentage(d.refiLtv, 'Refinance LTV', 99) / 100, d.rate, d.term, d.finance === 'repayment' ? 'repayment' : 'interest');
    const totalCost = buy.total + bridgeInterest + holding + refiFee;
    const initialCash = buy.total - bridge + bridgeInterest + holding + refiFee;
    const released = debt.principal - bridge;
    const cashLeft = totalCost - debt.principal;
    const op = operating(d, nonnegative(d.rent, 'Monthly rent') * 12);
    const annualCashflow = op.netOperating - debt.monthly * 12;
    return { buy, debt, op, bridge, bridgeInterest, holding, refiFee, totalCost, initialCash, released, cashLeft,
      capital: cashLeft, equity: arv - debt.principal, value: arv, annualCashflow, monthlyCashflow: annualCashflow / 12,
      grossYield: ratio(op.grossAnnual, arv), netYield: ratio(op.netOperating, arv), cashReturn: ratio(annualCashflow, cashLeft) };
  }
  function projections(result, assumptions) {
    const years = positive(assumptions.years, 'Projection years');
    if (!Number.isInteger(years) || years > 30) throw new Error('Projection years must be a whole number from 1 to 30.');
    const valueGrowth = Number(assumptions.valueGrowth), rentGrowth = Number(assumptions.rentGrowth), inflation = Number(assumptions.costInflation);
    [valueGrowth, rentGrowth, inflation].forEach(n => { if (!Number.isFinite(n) || n < -50 || n > 50) throw new Error('Growth assumptions must be between -50% and 50%.'); });
    const value = result.value || result.buy.price;
    let accumulated = 0;
    return Array.from({ length: years }, (_, index) => {
      const year = index + 1, income = result.op.income * Math.pow(1 + rentGrowth / 100, index);
      const variable = result.op.variable * Math.pow(1 + rentGrowth / 100, index);
      const fixed = result.op.fixed * Math.pow(1 + inflation / 100, index);
      const paidMonths = assumptions.finance === 'repayment' ? Math.min(12, Math.max(0, assumptions.term * 12 - index * 12)) : 12;
      const debtPayments = result.debt.monthly * paidMonths;
      const propertyValue = value * Math.pow(1 + valueGrowth / 100, year);
      const cashflow = income - variable - fixed - debtPayments;
      accumulated += cashflow;
      return { year, propertyValue, loan: result.debt.balance(year * 12), equity: propertyValue - result.debt.balance(year * 12), income, costs: variable + fixed + debtPayments, cashflow, accumulated };
    });
  }
  function developmentBudget(d) {
    const build = d.buildMode === 'total' ? nonnegative(d.buildCost, 'Base build cost')
      : positive(d.buildArea, 'Gross internal floor area') * nonnegative(d.buildRate, 'Build rate');
    const external = nonnegative(d.external ?? 0, 'External works'), abnormal = nonnegative(d.abnormal ?? 0, 'Abnormal costs');
    const hardCosts = build + external + abnormal;
    const professionalFees = hardCosts * percentage(d.professionalPct ?? 0, 'Professional fees') / 100;
    const contingency = hardCosts * percentage(d.contingencyPct ?? 0, 'Contingency') / 100;
    const planning = nonnegative(d.planning ?? 0, 'Planning costs'), obligations = nonnegative(d.obligations ?? 0, 'Planning obligations');
    const otherDevelopment = nonnegative(d.otherDevelopment ?? 0, 'Other development costs'), vat = nonnegative(d.unrecoverableVat ?? 0, 'Unrecoverable VAT');
    const developmentCost = hardCosts + professionalFees + contingency + planning + obligations + otherDevelopment + vat;
    return { build, external, abnormal, hardCosts, professionalFees, contingency, planning, obligations, otherDevelopment, vat, developmentCost };
  }
  function residualDevelopment(d) {
    const gdv = d.gdvMode === 'units'
      ? positive(d.units, 'Residential units') * positive(d.unitValue, 'Average unit sale value') + nonnegative(d.otherGdv, 'Other GDV')
      : positive(d.gdv, 'Gross development value');
    if (d.gdvMode === 'units' && !Number.isInteger(Number(d.units))) throw new Error('Residential units must be a whole number.');
    const { build, external, abnormal, hardCosts, professionalFees, contingency, planning, obligations, otherDevelopment, vat, developmentCost } = developmentBudget(d);
    const selling = gdv * percentage(d.salesPct ?? 0, 'Sales / marketing') / 100;
    const salesLegal = nonnegative(d.salesLegal ?? 0, 'Sales legal fees');
    const acquisitionPct = percentage(d.acquisitionPct ?? 0, 'Land acquisition fee allowance');
    const purchaseLegal = nonnegative(d.purchaseLegal ?? 0, 'Purchase legal / due diligence fees');
    const sourcing = nonnegative(d.sourcing ?? 0, 'Sourcing fee');
    const profitPct = percentage(d.profitPct, 'Target profit', 95);
    if (!['gdv', 'cost'].includes(d.profitBasis)) throw new Error('Select a target profit basis.');
    if (!['estimate', 'manual', 'cash'].includes(d.developmentFinance)) throw new Error('Select a finance allowance method.');
    const financeSettings = d.developmentFinance === 'estimate' ? {
      share: percentage(d.fundedPct, 'Debt-funded share') / 100,
      rate: percentage(d.developmentRate, 'Finance interest') / 100,
      months: positive(d.developmentMonths, 'Project duration'),
      draw: percentage(d.averageDrawnPct, 'Average development draw') / 100,
      fee: percentage(d.loanFeePct ?? 0, 'Lender fees') / 100,
      fixed: nonnegative(d.otherFinance ?? 0, 'Other finance fees')
    } : null;
    const fixedFinance = d.developmentFinance === 'manual' ? nonnegative(d.manualFinance, 'Finance budget') : 0;
    const atLand = land => {
      land = nonnegative(land, 'Land / site price');
      const tax = d.taxMode === 'manual' ? nonnegative(d.manualTax, 'Purchase tax allowance') : sdlt(land, d).total;
      const acquisitionFees = land * acquisitionPct / 100 + purchaseLegal + sourcing;
      const siteCost = land + tax + acquisitionFees;
      let landDebt = 0, worksDebt = 0, interest = 0, lenderFees = 0, financeCost = fixedFinance;
      if (financeSettings) {
        landDebt = siteCost * financeSettings.share;
        worksDebt = developmentCost * financeSettings.share;
        interest = (landDebt + worksDebt * financeSettings.draw) * financeSettings.rate * financeSettings.months / 12;
        lenderFees = (landDebt + worksDebt) * financeSettings.fee + financeSettings.fixed;
        financeCost = interest + lenderFees;
      }
      const totalCost = siteCost + developmentCost + selling + salesLegal + financeCost;
      const profit = gdv - totalCost;
      const targetProfit = (d.profitBasis === 'cost' ? totalCost : gdv) * profitPct / 100;
      return { land, tax, acquisitionFees, siteCost, landDebt, worksDebt, interest, lenderFees, financeCost,
        totalCost, profit, targetProfit, targetHeadroom: profit - targetProfit,
        profitOnGdv: ratio(profit, gdv), profitOnCost: ratio(profit, totalCost) };
    };
    // Tax bands and finance both depend on the site price. Keep the feasible
    // lower bound: corporate SDLT can jump abruptly above its price threshold.
    const atZero = atLand(0), actual = atLand(nonnegative(d.landPrice, 'Entered site price'));
    let residualLand = null, residual = null;
    if (atZero.targetHeadroom >= 0) {
      let lower = 0, upper = gdv;
      for (let i = 0; i < 90; i++) {
        const mid = (lower + upper) / 2;
        if (atLand(mid).targetHeadroom >= 0) lower = mid;
        else upper = mid;
      }
      residualLand = lower;
      residual = atLand(lower);
    }
    return { gdv, build, external, abnormal, hardCosts, professionalFees, contingency, planning, obligations,
      otherDevelopment, vat, developmentCost, selling, salesLegal, profitPct, actual, residual, residualLand,
      shortfallAtZero: Math.max(0, -atZero.targetHeadroom), landHeadroom: residualLand == null ? null : residualLand - actual.land };
  }
  function developmentSensitivity(d) {
    const base = residualDevelopment(d), changes = [-10, -5, 0, 5, 10];
    return { changes, rows: changes.map(buildChange => ({ buildChange, values: changes.map(gdvChange => {
      const scenario = residualDevelopment({ ...d, gdvMode: 'total', gdv: base.gdv * (1 + gdvChange / 100),
        buildMode: 'total', buildCost: base.build * (1 + buildChange / 100) });
      return { gdvChange, residualLand: scenario.residualLand, shortfallAtZero: scenario.shortfallAtZero };
    }) })) };
  }
  function commercialConversion(d) {
    const price = positive(d.price, 'Purchase price'), units = positive(d.units, 'Residential units');
    if (!Number.isInteger(units)) throw new Error('Residential units must be a whole number.');
    const residentialValue = units * positive(d.unitValue, 'Average unit sale value');
    const commercialValue = d.keepCommercial === 'yes' ? nonnegative(d.commercialValue, 'Commercial value') : 0;
    const commercialRent = d.keepCommercial === 'yes' ? nonnegative(d.commercialRent, 'Commercial annual rent') : 0;
    const gdv = residentialValue + commercialValue;
    const budget = developmentBudget({ ...d, obligations: nonnegative(d.cil ?? 0, 'CIL') + nonnegative(d.s106 ?? 0, 'S106') });
    const tax = d.taxMode === 'manual' ? nonnegative(d.manualTax, 'Purchase tax') : sdlt(price, d).total;
    const purchaseLegal = nonnegative(d.purchaseLegal ?? 0, 'Purchase legal fees');
    const auctionFees = nonnegative(d.auctionFees ?? 0, 'Auction fees');
    const sourcing = nonnegative(d.sourcing ?? 0, 'Sourcing fee');
    const survey = nonnegative(d.survey ?? 0, 'Survey / acquisition costs');
    const purchaseCost = price + tax + purchaseLegal + auctionFees + sourcing + survey;
    const months = positive(d.projectMonths, 'Project duration');
    const holding = nonnegative(d.holdingMonthly ?? 0, 'Monthly utilities / holding costs') * months;
    const accountancy = nonnegative(d.accountancy ?? 0, 'Accountancy');
    if (!['cash', 'bridge', 'manual'].includes(d.conversionFinance)) throw new Error('Select a project finance method.');
    const bridge = d.conversionFinance === 'bridge' ? price * percentage(d.bridgeLtv, 'Bridging LTV', 99) / 100 : 0;
    const interest = bridge ? bridge * percentage(d.bridgeRate, 'Annual bridging interest') / 100 * months / 12 : 0;
    const lenderFees = bridge ? bridge * percentage(d.bridgeFeePct ?? 0, 'Bridging fees') / 100 + nonnegative(d.bridgeOtherFees ?? 0, 'Other bridging fees') : 0;
    const financeCost = d.conversionFinance === 'manual' ? nonnegative(d.projectFinanceBudget, 'Project finance budget') : interest + lenderFees;
    const projectCost = purchaseCost + budget.developmentCost + holding + accountancy + financeCost;
    const salesPct = percentage(d.salesPct ?? 0, 'Sales / marketing', 95);
    const sales = gdv * salesPct / 100, salesLegal = nonnegative(d.salesLegal ?? 0, 'Sales solicitors');
    const totalSaleCost = projectCost + sales + salesLegal, profit = gdv - totalSaleCost;
    const targetProfit = gdv * percentage(d.targetRogdv, 'Target ROGDV', 95) / 100;
    const grossRent = units * nonnegative(d.unitRent, 'Monthly rent per flat') * 12 + commercialRent;
    const op = operating({ ...d, rent: grossRent / 12 }, grossRent);
    if (!['interest', 'repayment'].includes(d.holdFinance)) throw new Error('Select the refinance mortgage type.');
    const term = positive(d.term, 'Refinance term'), stressRate = positive(d.stressRate, 'Stress interest rate');
    const dscr = positive(d.minimumDscr, 'Target debt-service coverage') / 100;
    const debtFactor = finance(1, stressRate, term, d.holdFinance).monthly * 12;
    const ltvLoan = gdv * percentage(d.refiLtv, 'Refinance LTV', 99) / 100;
    const incomeLoan = Math.max(0, op.netOperating) / (dscr * debtFactor);
    const refinanceLoan = Math.min(ltvLoan, incomeLoan);
    const mortgage = finance(refinanceLoan, percentage(d.rate, 'Mortgage interest'), term, d.holdFinance);
    const refinanceFees = refinanceLoan * percentage(d.refiFeePct ?? 0, 'Refinance fees') / 100 + nonnegative(d.refiLegal ?? 0, 'Refinance legal costs');
    const initialCash = projectCost - bridge;
    const cashReleased = refinanceLoan - bridge - refinanceFees;
    const cashLeft = initialCash - cashReleased;
    const annualCashflow = op.netOperating - mortgage.monthly * 12;
    return { price, units, residentialValue, commercialValue, commercialRent, gdv, budget, tax, purchaseLegal, auctionFees, sourcing, survey,
      purchaseCost, holding, accountancy, bridge, interest, lenderFees, financeCost, projectCost, sales, salesLegal,
      totalSaleCost, profit, targetProfit, targetHeadroom: profit - targetProfit, rogdv: ratio(profit, gdv), roc: ratio(profit, totalSaleCost),
      breakEvenGdv: (projectCost + salesLegal) / (1 - salesPct / 100), grossRent, op, ltvLoan, incomeLoan, refinanceLoan, mortgage,
      refinanceFees, initialCash, cashReleased, cashLeft, equity: gdv - refinanceLoan, annualCashflow, monthlyCashflow: annualCashflow / 12,
      cashReturn: ratio(annualCashflow, cashLeft), stressDscr: refinanceLoan > 0 ? op.netOperating / (refinanceLoan * debtFactor) : null };
  }
  return { sdlt, finance, acquisition, rental, bmv, flip, brr, projections, residualDevelopment, developmentSensitivity, commercialConversion };
});
