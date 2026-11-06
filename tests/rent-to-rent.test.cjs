'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculate, defaults } = require('../rent-to-rent.js');
const near = (actual, expected) => assert.ok(Math.abs(actual-expected) < 1e-7*Math.max(1,Math.abs(expected)), `${actual} != ${expected}`);
const run = changes => calculate({...defaults,...changes});

test('nightly example accounts for fees, occupied nights, cleaning and fixed rent',()=>{
  const r=run();
  near(r.occupiedUnits,273.75);near(r.revenue,41062.5);
  near(r.fees,4927.5);near(r.maintenance,2053.125);near(r.cleaning,2737.5);near(r.otherVariable,2190);
  near(r.fixedAnnual,24000);near(r.annualCashflow,5154.375);near(r.monthlyCashflow,429.53125);
  near(r.initialCash,16000);near(r.roi,32.21484375);near(r.breakEven,24000/(365*106.5)*100);
});
test('zero occupancy removes revenue and variable costs but keeps all landlord rent and bills',()=>{
  const r=run({occupancy:0});near(r.revenue,0);near(r.variableCosts,0);near(r.monthlyCashflow,-2000);near(r.roi,-150);
});
test('full occupancy uses all available unit-nights',()=>{
  const r=run({occupancy:100});near(r.revenue,54750);near(r.annualCashflow,14872.5);
});
test('room letting uses collected room-months and ignores nightly-only inputs',()=>{
  const r=run({model:'rooms',rooms:4,roomRent:600,occupancy:50,landlordRent:1000,utilities:100,propertyTax:0,insurance:0,otherFixed:0,collectionPct:2,managementPct:10,maintenancePct:5,occupiedRoomCost:20,nightlyRate:-10,averageStay:0});
  near(r.occupiedUnits,24);near(r.revenue,14400);near(r.fees,288);near(r.management,1440);near(r.maintenance,720);near(r.otherVariable,480);near(r.cleaning,0);near(r.annualCashflow,-1728);
});
test('deposit and working capital affect ROI denominator, not operating cash flow',()=>{
  const a=run(),b=run({deposit:6000,workingCapital:5000});near(a.annualCashflow,b.annualCashflow);near(b.initialCash,21000);near(b.roi,5154.375/21000*100);near(b.annualCashAfterSetup,-4845.625);
});
test('unrecoverable operating structure reports break-even above 100%',()=>{
  const r=run({landlordRent:4000});assert.ok(r.breakEven>100);assert.ok(r.curve.at(-1).annualCashflow<0);
});
test('break-even point produces zero operating cash flow',()=>{
  const a=run(),b=run({occupancy:a.breakEven});near(b.annualCashflow,0);
});
test('no upfront cash gives no infinite ROI or payback',()=>{
  const r=run({setupCost:0,deposit:0,workingCapital:0});assert.equal(r.roi,null);assert.equal(r.paybackMonths,null);assert.ok(r.scenarios.every(s=>s.roi===null));
});
test('losses and zero cash flow have no positive-cash-flow payback',()=>{
  assert.equal(run({occupancy:0}).paybackMonths,null);
  const b=run({occupancy:0,landlordRent:0,utilities:0,propertyTax:0,insurance:0,otherFixed:0});assert.equal(b.paybackMonths,null);
});
test('nonpositive contribution does not invent an achievable break-even occupancy',()=>{
  assert.equal(run({bookingPct:100}).breakEven,null);
  assert.equal(run({nightlyRate:0}).breakEven,null);
});
test('all-zero income and costs has zero cash flow at every occupancy',()=>{
  const r=run({nightlyRate:0,cleaningPerStay:0,occupiedNightCost:0,landlordRent:0,utilities:0,propertyTax:0,insurance:0,otherFixed:0});assert.equal(r.breakEven,0);assert.equal(r.zeroCostBreakEven,true);assert.ok(r.curve.every(s=>s.annualCashflow===0));
});
test('planned closure reduces capacity but fixed costs still run for twelve months',()=>{
  const r=run({availableDays:180,occupancy:100});near(r.revenue,27000);near(r.fixedAnnual,24000);near(r.annualCashflow,-4830);
});
test('multiple units multiply revenue and occupied costs without silently multiplying whole-operation fixed costs',()=>{
  const r=run({units:2});near(r.revenue,82125);near(r.fixedAnnual,24000);near(r.annualCashflow,34308.75);
});
test('longer stays reduce the number of cleanings',()=>{
  const r=run({averageStay:8});near(r.cleaning,1368.75);near(r.annualCashflow,6523.125);
});
test('scenario table and chart share the exact base model and include the selected occupancy once',()=>{
  const r=run({occupancy:73.5});assert.equal(r.scenarios.filter(s=>s.occupancy===73.5).length,1);
  for(const s of [...r.scenarios,...r.curve]){const expected=run({occupancy:s.occupancy});near(s.annualCashflow,expected.annualCashflow);near(s.roi,expected.roi);}
});
test('validates ranges, finite inputs and whole units',()=>{
  for(const d of [{occupancy:-1},{occupancy:101},{occupancy:''},{units:0},{units:1.5},{rooms:0,model:'rooms'},{availableDays:367},{averageStay:0},{nightlyRate:Infinity},{landlordRent:-1},{workingCapital:NaN},{bookingPct:101},{model:'purchase'}])assert.throws(()=>run(d));
});
