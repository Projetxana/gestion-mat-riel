import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { allowedPushEndpoint } from '../supabase/functions/hour-reminders/security.js';
import { decodeVapidKey, enableDevicePush } from '../src/utils/pushSubscription.js';

test('provider allowlist blocks SSRF, credentials, redirects to arbitrary destinations',()=>{
    for(const url of ['https://web.push.apple.com/Qtest','https://fcm.googleapis.com/fcm/send/test','https://updates.push.services.mozilla.com/wpush/v2/test'])assert.equal(allowedPushEndpoint(url),true);
    for(const url of ['http://web.push.apple.com/x','https://127.0.0.1/x','https://web.push.apple.com.evil.test/x','https://web.push.apple.com@evil.test/x','https://evil.test@web.push.apple.com/x','https://web.push.apple.com:444/x','https://web.push.apple.com/x#frag','https://web.push.apple.com/x\n'])assert.equal(allowedPushEndpoint(url),false,url);
});
test('public VAPID key is decoded to uncompressed P-256 form',()=>{
    const key=Buffer.concat([Buffer.from([4]),Buffer.alloc(64,1)]).toString('base64url');
    assert.equal(decodeVapidKey(key).length,65);
    assert.deepEqual(decodeVapidKey('  '+key+'\n'),decodeVapidKey(key));
    assert.throws(()=>decodeVapidKey('private-key'),/11 caractères reçus, 87 attendus/);
    assert.throws(()=>decodeVapidKey(key.slice(0,40)+' '+key.slice(40)),/88 caractères reçus/);
});
test('subscription requires explicit browser permission and persists only device endpoint',async()=>{
    const old=globalThis.Notification;
    try{
        globalThis.Notification={requestPermission:async()=> 'granted'};
        const endpoint='https://web.push.apple.com/test';
        const sub={endpoint,unsubscribe:async()=>true};
        const reg={active:true,pushManager:{getSubscription:async()=>null,subscribe:async opts=>{
            assert.equal(opts.userVisibleOnly,true);return sub;
        }}};
        const key=Buffer.concat([Buffer.from([4]),Buffer.alloc(64,1)]).toString('base64url');
        let wrote;
        const client={from:table=>({upsert:async row=>{assert.equal(table,'bt_push_subscriptions');wrote=row;return {error:null};}})};
        await enableDevicePush(client,'tenant','employee',reg,key);
        assert.deepEqual(wrote,{endpoint,company_id:'tenant',user_id:'employee'});
        globalThis.Notification={requestPermission:async()=> 'denied'};
        wrote=null;
        await assert.rejects(enableDevicePush(client,'tenant','employee',reg,key));
        assert.equal(wrote,null);
    }finally{globalThis.Notification=old;}
});
test('worker displays only generic notification and opens fixed same-origin hours route',async()=>{
    const listeners={};let notification,opened;
    const self={location:{origin:'https://app.buildtrackapp.ca'},
        addEventListener:(type,fn)=>{listeners[type]=fn;},
        registration:{showNotification:async(title,opts)=>{notification={title,...opts};}},
        clients:{matchAll:async()=>[],openWindow:async url=>{opened=url;}}};
    vm.runInNewContext(readFileSync(new URL('../public/buildtrack-push-handler.js',import.meta.url),'utf8'),{self,URL});
    assert.equal(listeners.fetch,undefined);
    let pending;
    listeners.push({data:{json:()=>({name:'private',url:'https://evil.test'})},waitUntil:p=>{pending=p;}});
    await pending;
    assert.equal(notification.data.route,'/timetracking/manual');
    assert.ok(!JSON.stringify(notification).includes('private'));
    listeners.notificationclick({notification:{close(){},data:{route:'https://evil.test'}},waitUntil:p=>{pending=p;}});
    await pending;
    assert.equal(opened,'https://app.buildtrackapp.ca/timetracking/manual');
});
test('dispatcher is fail-closed and never follows external redirects',()=>{
    const source=readFileSync(new URL('../supabase/functions/hour-reminders/index.ts',import.meta.url),'utf8');
    assert.ok(source.includes('BT_PUSH_SEND_ENABLED')&&source.includes('equalSecret'));
    assert.ok(source.includes('bt_push_claim')&&source.includes('allowedPushEndpoint'));
    assert.ok(source.includes('redirect:"error"'));
});
