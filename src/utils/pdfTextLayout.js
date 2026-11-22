// PDF text items arrive in an arbitrary stream order. Rebuild rows using
// their PDF coordinates before applying the conservative supplier templates.
// No OCR, no network calls, and no automatic trust in PDF text order.
const safeText = value => String(value || '').replace(/[\u0000-\u0008\u000b\u000e-\u001f]/g,' ').trim();
export const rebuildPdfPageLayout = (items = [], { cellWidth = 4.3, tolerance = 2.4 } = {}) => {
    const pieces = items.filter(item=>typeof item.str==='string' && item.str.trim() &&
      Array.isArray(item.transform) && Number.isFinite(item.transform[4]) &&
      Number.isFinite(item.transform[5]))
      .map(item=>({str:safeText(item.str),x:Number(item.transform[4]),y:Number(item.transform[5])}))
      .sort((a,b)=>b.y-a.y || a.x-b.x);
    const lines=[];
    for(const piece of pieces) {
        // For multiline PDFs, rows are grouped on a constant font baseline.
        let line=lines[lines.length-1];
        if(!line || Math.abs(line.y-piece.y)>tolerance) {
            line={y:piece.y,parts:[]};lines.push(line);
        }
        line.parts.push(piece);
    }
    return lines.map(line=>{
        const parts=line.parts.sort((a,b)=>a.x-b.x);
        const origin=Math.min(...parts.map(p=>p.x));
        let cursor=0,out='';
        for(const part of parts) {
            const column=Math.max(0,Math.round((part.x-origin)/cellWidth));
            const target=Math.min(240,Math.max(cursor+(cursor?1:0),column));
            out+=' '.repeat(Math.max(0,target-cursor))+part.str;
            cursor=out.length;
        }
        return out.trimEnd();
    }).join('\n');
};
