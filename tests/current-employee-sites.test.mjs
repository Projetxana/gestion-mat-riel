import test from 'node:test';
import assert from 'node:assert/strict';
import { filterCurrentEmployeeSites } from '../src/utils/currentEmployeeSites.js';

const NOW=Date.parse('2026-11-20T12:00:00Z');
const company='company-1';
const sites=[
 {id:12,company_id:company,status:'active'},
 {id:5,company_id:company,status:'archived'},
 {id:2,company_id:company,status:'deleted'},
 {id:8,company_id:company,status:'active'},
 {id:10,company_id:'company-2',status:'active'},
];
const row=(site_id,last_worked_at,kind='site')=>({site_id:String(site_id),kind,last_worked_at});
test('employee only sees currently active projects with own recent RPC work metadata',()=>{
 const rows=[
   row(12,'2026-11-19T12:00:00Z'),
   row(12,'2026-11-19T12:00:00Z','task'),
   row(5,'2026-11-19T12:00:00Z'),
   row(2,'2026-11-19T12:00:00Z'),
   row(8,'2026-08-10T12:00:00Z'),
   row(10,'2026-11-19T12:00:00Z'),
   row(99,'2026-11-19T12:00:00Z'),
 ];
 assert.deepEqual(filterCurrentEmployeeSites(rows,sites,company,NOW).map(x=>x.site_id),['12','12']);
});
test('employee with no own work never sees every active project',()=>{
 assert.deepEqual(filterCurrentEmployeeSites([row(8,null)],sites,company,NOW),[]);
});
test('the lookback boundary includes exactly 60 days, excludes older',()=>{
 const boundary=new Date(NOW-60*86400000).toISOString();
 const before=new Date(NOW-60*86400000-1000).toISOString();
 assert.equal(filterCurrentEmployeeSites([row(8,boundary)],sites,company,NOW).length,1);
 assert.equal(filterCurrentEmployeeSites([row(8,before)],sites,company,NOW).length,0);
});
test('missing company/site listing fails closed',()=>{
 assert.deepEqual(filterCurrentEmployeeSites([row(12,'2026-11-19T12:00:00Z')],[],company,NOW),[]);
 assert.deepEqual(filterCurrentEmployeeSites([row(12,'2026-11-19T12:00:00Z')],sites,null,NOW),[]);
});
