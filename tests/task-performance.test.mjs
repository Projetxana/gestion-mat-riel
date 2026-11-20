import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTaskHours, taskCompletionBadge, barConsumption } from '../src/utils/taskPerformance.js';

const tasks=[{id:1,planned_hours:176,completed_hours:96},{id:2,planned_hours:464,completed_hours:28}];
const sessions=[
  {id:1,site_id:12,section_id:1,punch_start_at:'2026-11-16T13:00:00Z',punch_end_at:'2026-11-16T21:00:00Z'},
  {id:2,site_id:12,section_id:2,punch_start_at:'2026-11-16T13:00:00Z',punch_end_at:'2026-11-16T21:00:00Z'},
];
test('graph compares hours planned with actual, not earned hours',()=>{
 const rows=computeTaskHours({tasks,sessions,siteId:12,historyMode:'additive'});
 assert.equal(rows[0].budget,176);
 assert.equal(rows[0].actual,104);
 assert.equal(rows[1].actual,36);
 assert.equal(rows[0].sessionsHours,8);
});
test('do not double count unverified historical hours',()=>{
 const a=computeTaskHours({tasks,sessions,siteId:12,historyMode:'unverified'});
 assert.equal(a[0].actual,null);
 const b=computeTaskHours({tasks,sessions,siteId:12,historyMode:'sessions_only'});
 assert.equal(b[0].actual,8);
});
test('no badge for 99%, unvalidated drafts or null audit snapshot',()=>{
 assert.equal(taskCompletionBadge({physical_percent:99,task_performance_index:2}),null);
 assert.equal(taskCompletionBadge(null),null);
 assert.deepEqual(taskCompletionBadge({physical_percent:100,planned_hours:176,consumed_hours:null,task_performance_index:null}),{completed:true,verified:false});
});
test('100% task snapshot rewards saved hours and computes its own IPMO',()=>{
 const item=taskCompletionBadge({physical_percent:100,planned_hours:176,consumed_hours:120,task_performance_index:1.467});
 assert.equal(item.verified,true); assert.equal(item.favorable,true); assert.equal(item.hoursSaved,56); assert.equal(item.ipmo,1.467);
 const overspent=taskCompletionBadge({physical_percent:100,planned_hours:176,consumed_hours:190,task_performance_index:.926});
 assert.equal(overspent.favorable,false);assert.equal(overspent.hoursSaved,-14);
});
test('bars cap at budget and flag overruns',()=>{
 assert.equal(barConsumption(100,80).width,80);
 assert.equal(barConsumption(100,140).width,100);
 assert.equal(barConsumption(100,140).overBudget,true);
 assert.equal(barConsumption(100,null).known,false);
});
