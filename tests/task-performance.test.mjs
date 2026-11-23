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


test('manually recorded work is immediately visible if no employee punches exist',()=>{
 const rows=computeTaskHours({
  tasks:[{id:107,name:'Sous-sol 1',planned_hours:280,completed_hours:229},
         {id:106,name:'Sous-sol 2',planned_hours:272,completed_hours:222}],
  sessions:[],siteId:8,historyMode:'unverified'
 });
 assert.equal(rows[0].actual,229);
 assert.equal(rows[1].actual,222);
 assert.equal(rows[0].overlapUnverified,false);
 assert.equal(barConsumption(rows[0].budget,rows[0].actual).known,true);
});

test('DJ3 hours can be summed for operational reporting without validating IPMO',()=>{
 const sample=[{id:107,name:'Sous-sol 1',planned_hours:280,completed_hours:229},
  {id:106,name:'Sous-sol 2',planned_hours:272,completed_hours:222}];
 const punches=[{
  id:10,site_id:8,section_id:107,
  punch_start_at:'2026-11-19T13:00:00Z',
  punch_end_at:'2026-11-19T21:00:00Z'
 }];
 const unverified=computeTaskHours({tasks:sample,sessions:punches,siteId:8,historyMode:'unverified'});
 assert.equal(unverified[0].historical,229);
 assert.equal(unverified[0].sessionsHours,8);
 assert.equal(unverified[0].actual,null);
 assert.equal(unverified[0].overlapUnverified,true);
 assert.equal(unverified[1].actual,222);
 const distinct=computeTaskHours({
  tasks:sample,sessions:punches,siteId:8,
  manualHoursDistinct:true,historyMode:'unverified'
 });
 assert.equal(distinct[0].actual,237);
 assert.equal(distinct[0].overlapUnverified,false);
 assert.equal(distinct[1].actual,222);
 // Physical percent and immutable published IPMO are not inputs.
 assert.equal('physical_percent' in distinct[0],false);
 assert.equal('performance_index' in distinct[0],false);
});

test('DJ3 manually entered time-sheet sessions are never silently added twice',()=>{
 const tasks=[{id:107,planned_hours:280,completed_hours:229},
  {id:106,planned_hours:272,completed_hours:222}];
 const sessions=[{id:101,site_id:8,section_id:107,manual_entry:true,
  punch_start_at:'2026-11-16T13:00:00Z',punch_end_at:'2026-11-16T21:00:00Z'},
 {id:102,site_id:8,section_id:107,manual_entry:true,
  punch_start_at:'2026-11-17T13:00:00Z',punch_end_at:'2026-11-17T21:00:00Z'}];
 const result=computeTaskHours({tasks,sessions,siteId:8,
  historyMode:'unverified',manualHoursDistinct:true});
 assert.equal(result[0].historical,229);
 assert.equal(result[0].manualSessionHours,16);
 assert.equal(result[0].employeePunchHours,0);
 assert.equal(result[0].actual,229);
 assert.equal(result[0].manualSessionOverlap,true);
 assert.equal(result[1].actual,222);
 // If real employee punches begin, count only those automatically.
 const appended=[...sessions,{id:103,site_id:8,section_id:107,manual_entry:false,
  punch_start_at:'2026-11-18T13:00:00Z',punch_end_at:'2026-11-18T21:00:00Z'}];
 const after=computeTaskHours({tasks,sessions:appended,siteId:8,
  historyMode:'unverified',manualHoursDistinct:true});
 assert.equal(after[0].actual,237);
 assert.equal(after[0].manualSessionOverlap,true);
 assert.equal(after[0].employeePunchHours,8);
});
test('manual time-sheet entries alone are real hours without project baseline',()=>{
 const rows=computeTaskHours({tasks:[{id:107,planned_hours:280,completed_hours:0}],
 sessions:[{site_id:8,section_id:107,manual_entry:true,
 punch_start_at:'2026-11-16T13:00:00Z',punch_end_at:'2026-11-16T21:00:00Z'}],
 siteId:8,historyMode:'unverified',manualHoursDistinct:true});
 assert.equal(rows[0].actual,8);
 assert.equal(rows[0].manualSessionOverlap,false);
});
