const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calculators.js');
const close = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const baseline = { price: 150000, rent: 750, finance: 'interest', ltv: 75, rate: 5, term: 25, managementPct: 10, maintenancePct: 5, voidPct: 5, insurance: 500, taxMode: 'auto', buyer: 'additional' };
const cases = [
  ['standard at 125k', 125000, { buyer: 'standard' }, 0],
  ['standard at 250k', 250000, { buyer: 'standard' }, 2500],
  ['HMRC 295k example', 295000, { buyer: 'standard' }, 4750],
  ['additional at 150k', 150000, { buyer: 'additional' }, 8000],
  ['additional at 250k', 250000, { buyer: 'additional' }, 15000],
  ['HMRC additional 300k', 300000, { buyer: 'additional' }, 20000],
  ['below additional threshold', 39999, { buyer: 'additional' }, 0],
  ['at additional threshold', 40000, { buyer: 'additional' }, 2000],
  ['first-time at 300k', 300000, { buyer: 'first' }, 0],
  ['first-time at 500k', 500000, { buyer: 'first' }, 10000],
  ['above first-time ceiling', 500001, { buyer: 'first' }, 15000.05],
  ['nonresident first-time', 300000, { buyer: 'first', nonresident: true }, 6000],
  ['nonresident additional', 250000, { buyer: 'additional', nonresident: true }, 20000],
  ['no nonresident surcharge below 40k', 39999, { buyer: 'standard', nonresident: true }, 0],
  ['company below special threshold', 500000, { buyer: 'company' }, 40000],
  ['company special 17%', 600000, { buyer: 'company' }, 102000],
  ['company relief', 600000, { buyer: 'company', companyRelief: true }, 50000],
  ['nonresident company special 19%', 600000, { buyer: 'company', nonresident: true }, 114000],
  ['HMRC commercial example', 275000, { kind: 'commercial' }, 3250],
  ['mixed ignores residential surcharges', 275000, { kind: 'mixed', buyer: 'company', nonresident: true }, 3250],
  ['mixed zero first band', 150000, { kind: 'mixed' }, 0],
  ['high-price residential bands', 2000000, { buyer: 'standard' }, 153750]
];
for (const [label, price, options, expected] of cases) test('SDLT: ' + label, () => {
  const r = C.sdlt(price, options); close(r.total, expected); close(r.rows.reduce((a, row) => a + row.tax, 0), expected);
});
test('Rental cash flow keeps full precision and fees use collected rent', () => {
  const r = C.rental(baseline); close(r.op.income, 8550); close(r.op.management, 855); close(r.op.maintenance, 427.5); close(r.annualCashflow, 1142.5); close(r.monthlyCashflow, 1142.5 / 12); close(r.potentialYield, 6);
});
test('Rental reference inputs without voids produce £962.50 at 5.5%', () => {
  const r = C.rental({ ...baseline, rate: 5.5, voidPct: 0 }); close(r.annualCashflow, 962.5);
});
test('Cash purchase has no mortgage debt', () => { const r = C.rental({ ...baseline, finance: 'cash' }); close(r.debt.principal, 0); close(r.annualCashflow, 6767.5); close(r.capital, 158000); });
test('Zero-interest repayment mortgage amortises to zero', () => { const r = C.finance(120000, 0, 10, 'repayment'); close(r.monthly, 1000); close(r.balance(60), 60000); close(r.balance(120), 0); });
test('Repayment mortgage uses amortisation, not interest-only payment', () => { const r = C.finance(112500, 5, 25, 'repayment'); close(r.monthly, 657.6637966979781, 0.0001); close(r.balance(300), 0, 0.001); assert.ok(r.balance(12) < 112500); });
test('100% voids retain fixed costs and debt payments', () => { const r = C.rental({ ...baseline, voidPct: 100 }); close(r.op.income, 0); close(r.annualCashflow, -6125); });
test('HMO room income', () => { const r = C.rental({ ...baseline, strategy: 'hmo', rooms: 5, roomRent: 500 }); close(r.op.grossAnnual, 30000); });
test('SA occupancy applied once; operating costs use collected revenue', () => { const r = C.rental({ ...baseline, strategy: 'sa', nightlyRate: 100, occupancy: 70, operatingPct: 30 }); close(r.op.income, 25550); close(r.op.management, 7665); close(r.op.maintenance, 0); close(r.annualCashflow, 11760); });
test('BMV separates current discount from GDV profit', () => {
  const r = C.bmv({ ...baseline, marketValue: 200000, sourcing: 3500, refurb: 15000, legal: 1500, survey: 500, sellingPct: 1.5, holding: 0, compare: 'gdv', gdv: 220000 }); close(r.discount, 25); close(r.buy.total, 178500); close(r.profit, 38200);
});
test('BMV over market price shows a negative discount', () => { const r = C.bmv({ ...baseline, price: 210000, marketValue: 200000 }); close(r.discount, -5); });
test('Manual purchase tax replaces automatic tax', () => { close(C.acquisition({ ...baseline, taxMode: 'manual', manualTax: 7000 }).tax, 7000); });
test('Flip bridge interest is on loan, not full purchase price', () => {
  const r = C.flip({ ...baseline, refurb: 15000, legal: 1500, saleValue: 220000, months: 6, purchaseFinance: 'bridge', bridgeLtv: 70, bridgeRate: 12, holdingMonthly: 250, sellingPct: 1.5, saleLegal: 1500 }); close(r.bridge, 105000); close(r.bridgeInterest, 6300); close(r.projectCost, 187100); close(r.profit, 32900); close(r.capital, 77300);
});
test('BRR cash released repays bridge and reconciles cash left', () => {
  const r = C.brr({ ...baseline, refurb: 15000, legal: 1500, arv: 220000, months: 6, purchaseFinance: 'bridge', bridgeLtv: 70, bridgeRate: 12, holdingMonthly: 250, refiLtv: 75, refiFee: 1500 }); close(r.totalCost, 183800); close(r.initialCash, 78800); close(r.released, 60000); close(r.cashLeft, 18800); close(r.initialCash - r.released, r.cashLeft); close(r.equity, 55000);
});
test('BRR does not divide by zero or negative capital', () => {
  const r = C.brr({ ...baseline, arv: 300000, months: 6, purchaseFinance: 'cash', holdingMonthly: 0, refiLtv: 75, refiFee: 0 }); assert.ok(r.cashLeft < 0); assert.equal(r.cashReturn, null);
});
test('Projection year one reconciles to annual cash flow', () => {
  const result = C.rental(baseline), p = C.projections(result, { ...baseline, years: 10, valueGrowth: 2, rentGrowth: 2, costInflation: 3 }); close(p[0].cashflow, result.annualCashflow); close(p[0].propertyValue, 153000); close(p[9].loan, 112500);
});
test('Projection stops repayment payments once loan is paid', () => {
  const d = { ...baseline, finance: 'repayment', term: 2, rate: 0 }; const result = C.rental(d); const p = C.projections(result, { ...d, years: 5, valueGrowth: 0, rentGrowth: 0, costInflation: 0 }); close(p[2].loan, 0); close(p[2].cashflow, result.op.netOperating);
});
test('Invalid input cannot produce NaN or an invented result', () => {
  assert.throws(() => C.sdlt(-1)); assert.throws(() => C.rental({ ...baseline, price: 0 })); assert.throws(() => C.rental({ ...baseline, ltv: 101 })); assert.throws(() => C.rental({ ...baseline, rent: NaN })); assert.throws(() => C.sdlt(250000, { kind: 'unsupported' }));
});
