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
  return { sdlt, finance, acquisition, rental, bmv, flip, brr, projections };
});
