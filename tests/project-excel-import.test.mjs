import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProjectRows, planProjectImport, importProjectProgress } from '../src/utils/excelParser.js';

test('French planning headers, empty realized hours and blank rows', () => {
  assert.deepEqual(parseProjectRows([['Nom','Prévu','Réalisé'],['Sous-sol',528,null],['Niveau 2','336,5',''],[null,null,null],['Total',864.5,null]]), [
    {name:'Sous-sol',planned_hours:528,completed_hours:null},
    {name:'Niveau 2',planned_hours:336.5,completed_hours:null}
  ]);
});
test('requires budget and rejects invalid or duplicate tasks', () => {
  for (const rows of [[['Nom'],['A']], [['Nom','Prévu'],['A','-1']], [['Nom','Prévu'],['A',2],['a',3]], [['Nom','Prévu'],['A',null]]]) {
    assert.throws(() => parseProjectRows(rows));
  }
});
test('existing realized hours never overwritten and inserts match schema', () => {
  const result = planProjectImport([{id:7,name:'Sous-sol',completed_hours:80}], [
    {name:'Sous-sol',planned_hours:528,completed_hours:0},
    {name:'Niveau 2',planned_hours:336,completed_hours:null}
  ], 42);
  assert.deepEqual(result, {updates:[{id:7,planned_hours:528}],inserts:[{project_id:42,name:'Niveau 2',planned_hours:336,completed_hours:0}]});
});
test('database insert errors cannot report success', async () => {
  const db = {from: () => ({
    select: () => ({eq: async () => ({data:[],error:null})}),
    insert: () => ({select: async () => ({error:{message:'insert denied'}})})
  })};
  assert.deepEqual(await importProjectProgress(42,null,db,[{name:'A',planned_hours:2,completed_hours:null}]),{error:'insert denied',count:0,updated:0});
});
