// Allow only known browser push providers, HTTPS, no credentials, no explicit port.
export function allowedPushEndpoint(value) {
    if(typeof value!=="string"||value.length>2048||/[\s\x00-\x1f\x7f]/.test(value))return false;
    try{
        const u=new URL(value);
        if(u.protocol!=="https:"||u.username||u.password||u.port||u.hash||!u.pathname||u.pathname==="/")return false;
        const h=u.hostname;
        return h==="fcm.googleapis.com"||h==="updates.push.services.mozilla.com"||
            h==="push.apple.com"||h.endsWith(".push.apple.com")||h.endsWith(".notify.windows.com");
    }catch{return false;}
}
