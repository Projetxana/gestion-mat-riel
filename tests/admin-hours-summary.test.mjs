import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeAdminHours } from '../src/utils/adminHoursSummary.js';
const weekStart=new Date('2026-11-23T00:00:00-05:00'), weekEnd=new Date('2026-11-30T00:00:00-05:00');
const users=[{id:1,auth_user_id:'a',name:'Alain'},{id:2,auth_user_id:'b',name:'Alex'}];
const sites=[{id:15,name:'DJ4',company_id:'cd'},{id:16,name:'A1',company_id:'cd'},{id:17,name:'DJ4',company_id:'cd'}];
const session=(id,user,site,hours,extra={})=>({id,user_id:user,site_id:site,company_id:'cd',punch_start_at:'2026-11-26T13:00:00Z',punch_end_at:new Date(Date.parse('2026-11-26T13:00:00Z')+hours*3600000).toISOString(),...extra});
const summary=sessions=>summarizeAdminHours({sessions,users,sites,companyId:'cd',weekStart,weekEnd});
test('both groupings reconcile to one total; names do not merge distinct sites',()=>{
    const r=summary([session(1,'a',15,9),session(2,'b',15,4),session(3,'b',16,5),session(4,'a',17,1)]);
    assert.equal(r.total,19);
    assert.deepEqual(r.jobsites.map(x=>[x.id,x.hours]),[['16',5],['15',13],['17',1]]);
    assert.deepEqual(r.jobsites[1].details.map(x=>[x.name,x.hours]),[['Alain',9],['Alex',4]]);
    assert.deepEqual(r.employees.map(x=>[x.name,x.hours]),[['Alain',10],['Alex',9]]);
});
test('corrected durations, deletion and tenant isolation are consistent',()=>{
    const a=session(1,'a',15,9,{corrected_end_at:'2026-11-26T21:00:00Z'});
    const b=session(2,'a',15,9);
    const foreign=session(3,'a',15,10,{company_id:'other'});
    const open=session(4,'b',16,5,{punch_end_at:null});
    const old=session(5,'a',15,4,{punch_start_at:'2026-11-19T13:00:00Z',punch_end_at:'2026-11-19T17:00:00Z'});
    assert.equal(summary([a,b,foreign,open,old]).total,17);
    const r=summary([a,foreign,open,old]);
    assert.equal(r.total,8);assert.equal(r.jobsites[0].hours,8);assert.equal(r.employees[0].hours,8);
});
test('legacy and auth user keys map to one employee; missing company fails closed',()=>{
    assert.equal(summary([session(1,'a',15,4),session(2,'1',15,3)]).employees.length,1);
    assert.equal(summarizeAdminHours({sessions:[session(1,'a',15,4)],users,sites,weekStart,weekEnd}).total,0);
});
