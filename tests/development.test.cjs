const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calculators.js');
const close = (actual, expected, tolerance = 0.000001) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const residual = { gdvMode: 'total', gdv: 1000000, buildMode: 'total', buildCost: 500000,
  landPrice: 100000, taxMode: 'manual', manualTax: 0, profitPct: 20, profitBasis: 'gdv', developmentFinance: 'cash' };
test('Residual on GDV matches a simple independent worked appraisal', () => {
  const r = C.residualDevelopment(residual); close(r.residualLand, 300000); close(r.residual.profit, 200000); close(r.actual.profit, 400000); close(r.landHeadroom, 200000);
});
test('Profit on total cost includes land in the residual solution', () => {
  const r = C.residualDevelopment({ ...residual, profitBasis: 'cost' }); close(r.residualLand, 1000000 / 1.2 - 500000); close(r.residual.profitOnCost, 20);
});
test('Percentage acquisition fees are solved on the land price', () => {
  const r = C.residualDevelopment({ ...residual, acquisitionPct: 10, purchaseLegal: 10000 }); close(r.residualLand, 290000 / 1.1);
});
test('Non-residential SDLT is recomputed at the residual price', () => {
  const r = C.residualDevelopment({ ...residual, taxMode: 'auto', kind: 'commercial' }); close(r.residualLand, 310500 / 1.05); close(r.residual.tax, C.sdlt(r.residualLand, { kind: 'commercial' }).total); close(r.residual.profit, 200000);
});
test('Estimated interest and lender fees create a circular land-cost solution', () => {
  const r = C.residualDevelopment({ ...residual, developmentFinance: 'estimate', fundedPct: 70, developmentRate: 12, developmentMonths: 12, averageDrawnPct: 50, loanFeePct: 2, otherFinance: 5000 });
  close(r.residualLand, 267000 / 1.098); close(r.actual.interest, 29400); close(r.actual.lenderFees, 13400); close(r.actual.financeCost, 42800);
});
test('Manual finance remains a fixed all-in amount', () => {
  const r = C.residualDevelopment({ ...residual, developmentFinance: 'manual', manualFinance: 50000 }); close(r.residualLand, 250000); close(r.actual.financeCost, 50000);
});
test('Finance grows with project time', () => {
  const d = { ...residual, developmentFinance: 'estimate', fundedPct: 70, developmentRate: 12, developmentMonths: 12, averageDrawnPct: 50, loanFeePct: 0, otherFinance: 0 };
  assert.ok(C.residualDevelopment({ ...d, developmentMonths: 24 }).residualLand < C.residualDevelopment(d).residualLand);
});
test('Unviable residual is not presented as a positive or zero land value', () => {
  const r = C.residualDevelopment({ ...residual, buildCost: 900000 }); assert.equal(r.residualLand, null); assert.equal(r.residual, null); close(r.shortfallAtZero, 100000);
});
test('Exactly zero supported land price remains distinguishable from target unmet', () => {
  const r = C.residualDevelopment({ ...residual, buildCost: 800000 }); close(r.residualLand, 0); close(r.shortfallAtZero, 0); assert.ok(r.residual);
});
test('Corporate SDLT threshold jump retains the highest feasible lower price', () => {
  const r = C.residualDevelopment({ ...residual, gdv: 760000, buildCost: 200000, profitPct: 0, taxMode: 'auto', kind: 'residential', buyer: 'company', companyRelief: false }); close(r.residualLand, 500000); assert.ok(r.residual.targetHeadroom >= 0); close(r.residual.tax, 40000);
});
test('Units and floor-area modes correctly aggregate GDV and construction', () => {
  const r = C.residualDevelopment({ ...residual, gdvMode: 'units', units: 4, unitValue: 200000, otherGdv: 200000, buildMode: 'area', buildArea: 200, buildRate: 2500 }); close(r.gdv, 1000000); close(r.build, 500000); close(r.residualLand, 300000);
});
test('Fees and contingency include external and abnormal works', () => {
  const r = C.residualDevelopment({ ...residual, buildCost: 100000, external: 10000, abnormal: 10000, professionalPct: 10, contingencyPct: 5, planning: 5000, obligations: 10000, otherDevelopment: 2000, unrecoverableVat: 3000 }); close(r.hardCosts, 120000); close(r.professionalFees, 12000); close(r.contingency, 6000); close(r.developmentCost, 158000);
});
test('Sensitivity centre matches base; lower GDV and higher build costs reduce land value', () => {
  const grid = C.developmentSensitivity(residual); close(grid.rows[2].values[2].residualLand, 300000); assert.ok(grid.rows[2].values[0].residualLand < 300000); assert.ok(grid.rows[4].values[2].residualLand < 300000);
});
test('Residual rejects invalid GDV, fractional units and unsupported finance', () => {
  assert.throws(() => C.residualDevelopment({ ...residual, gdv: 0 })); assert.throws(() => C.residualDevelopment({ ...residual, gdvMode: 'units', units: 1.5, unitValue: 100000, otherGdv: 0 })); assert.throws(() => C.residualDevelopment({ ...residual, developmentFinance: 'unknown' }));
});
const conversion = { price: 200000, units: 2, unitValue: 200000, keepCommercial: 'no', buildMode: 'total', buildCost: 100000,
  external: 5000, abnormal: 5000, professionalPct: 10, contingencyPct: 10, planning: 5000, cil: 10000, s106: 5000,
  otherDevelopment: 4000, unrecoverableVat: 2000, taxMode: 'manual', manualTax: 0, purchaseLegal: 10000,
  auctionFees: 2000, survey: 3000, sourcing: 5000, projectMonths: 6, holdingMonthly: 1000, accountancy: 2000,
  conversionFinance: 'cash', salesPct: 2, salesLegal: 4000, targetRogdv: 20, unitRent: 1000,
  refiLtv: 75, holdFinance: 'interest', rate: 5, term: 25, stressRate: 5, minimumDscr: 125, refiFeePct: 1, refiLegal: 1000 };
test('John Howard cost categories reconcile independently to total cost, profit, ROGDV and ROC', () => {
  const r = C.commercialConversion(conversion); close(r.purchaseCost, 220000); close(r.budget.developmentCost, 158000); close(r.projectCost, 386000); close(r.totalSaleCost, 398000); close(r.profit, 2000); close(r.rogdv, .5); close(r.roc, 2000 / 398000 * 100);
});
test('Refinance deducts bridge and fees without duplicating debt principal', () => {
  const r = C.commercialConversion({ ...conversion, conversionFinance: 'bridge', bridgeLtv: 70, bridgeRate: 12, bridgeFeePct: 2, bridgeOtherFees: 1000 }); close(r.bridge, 140000); close(r.interest, 8400); close(r.lenderFees, 3800); close(r.projectCost, 398200); close(r.initialCash, 258200); close(r.refinanceLoan, 300000); close(r.cashReleased, 156000); close(r.cashLeft, 102200); close(r.initialCash - r.cashReleased, r.cashLeft);
});
test('Hold cash flow excludes sale costs and includes mortgage payments', () => {
  const r = C.commercialConversion(conversion); close(r.refinanceLoan, 300000); close(r.refinanceFees, 4000); close(r.cashLeft, 90000); close(r.annualCashflow, 9000); close(r.cashReturn, 10);
});
test('Income-screen mortgage cap can constrain refinance below the LTV cap', () => {
  const r = C.commercialConversion({ ...conversion, unitRent: 500 }); close(r.incomeLoan, 192000); close(r.refinanceLoan, 192000); close(r.stressDscr, 1.25);
});
test('Retained commercial value and rent are included only when selected', () => {
  const no = C.commercialConversion({ ...conversion, commercialValue: 100000, commercialRent: 12000 }); close(no.gdv, 400000); close(no.grossRent, 24000);
  const yes = C.commercialConversion({ ...conversion, keepCommercial: 'yes', commercialValue: 100000, commercialRent: 12000 }); close(yes.gdv, 500000); close(yes.grossRent, 36000);
});
test('No operating income means no income-supported refinance', () => {
  const r = C.commercialConversion({ ...conversion, unitRent: 0 }); close(r.refinanceLoan, 0); assert.equal(r.stressDscr, null); assert.ok(Number.isFinite(r.cashLeft));
});
test('Repayment refinance uses amortising debt at actual and stress rates', () => {
  const r = C.commercialConversion({ ...conversion, holdFinance: 'repayment' }); assert.ok(r.refinanceLoan < 300000); close(r.stressDscr, 1.25); assert.ok(r.mortgage.balance(12) < r.refinanceLoan);
});
test('Manual project finance does not invent a borrowed principal or double count interest', () => {
  const r = C.commercialConversion({ ...conversion, conversionFinance: 'manual', projectFinanceBudget: 20000 }); close(r.bridge, 0); close(r.financeCost, 20000); close(r.initialCash, 406000);
});
test('Tax follows property at purchase, not its proposed residential exit', () => {
  const r = C.commercialConversion({ ...conversion, price: 300000, taxMode: 'auto', kind: 'commercial', buyer: 'additional' }); close(r.tax, 4500);
});
test('Break-even GDV accounts for sales percentage', () => {
  const r = C.commercialConversion(conversion); close(r.breakEvenGdv * .98 - r.projectCost - r.salesLegal, 0);
});
test('Invalid unit count, stress rate and cost cannot return a plausible appraisal', () => {
  assert.throws(() => C.commercialConversion({ ...conversion, units: 2.5 })); assert.throws(() => C.commercialConversion({ ...conversion, stressRate: 0 })); assert.throws(() => C.commercialConversion({ ...conversion, buildCost: -1 }));
});
