import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';

const source=path=>readFileSync(new URL('../src/'+path,import.meta.url),'utf8');
test('DJ3 project modal offers manual startup hours independently from the IPMO',()=>{
 const modal=source('components/SiteDetailsModal.jsx');
 const component=source('components/StartupHoursPolicyPanel.jsx');
 const details=source('pages/SiteDetails.jsx');
 assert.match(modal,/<StartupHoursPolicyPanel site=\{site\}\/>/);
 assert.match(details,/Saisie manuelle/);
 assert.match(details,/completed_hours: Number\(v\)/);
 assert.match(component,/Ces heures de démarrage sont distinctes des pointages automatiques/);
 assert.match(component,/ne touche pas à l’IPMO/);
 assert.ok(transformSync(modal,{loader:'jsx'}).code.length>100);
 assert.ok(transformSync(component,{loader:'jsx'}).code.length>100);
});
test('task bars show historical and employee hours independently',()=>{
 const bars=source('components/TaskPerformanceBars.jsx');
 assert.match(bars,/Heures manuelles/);
 assert.match(bars,/Pointages employés/);
 assert.match(bars,/task\.overlapUnverified/);
 assert.match(bars,/Total réalisé/);
 assert.ok(transformSync(bars,{loader:'jsx'}).code.length>100);
});
test('the operational policy never writes or validates an IPMO report',()=>{
 const policy=source('hooks/useSiteManualHourPolicy.js');
 const hours=source('utils/taskPerformance.js');
 assert.match(policy,/bt_site_manual_hour_policies/);
 assert.match(policy,/buildtrack:manual-hours-policy-changed/);
 assert.match(hours,/manualHoursDistinct/);
 assert.doesNotMatch(policy,/bt_publish_performance_report/);
 assert.doesNotMatch(policy,/bt_performance_reports/);
});
