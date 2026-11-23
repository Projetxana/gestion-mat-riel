// Pure helpers for immutable budget versions. An updated estimate replaces
// the previous BASE only; it never removes separately added scope extensions.
export const activeBudgetLines = (allLines = [], revisions = []) => {
    const replacements = revisions.filter(r=>r.kind==='replacement')
        .sort((a,b)=>Number(b.revision_no)-Number(a.revision_no));
    const latest = replacements[0]?.id || null;
    const extensions = new Set(revisions.filter(r=>r.kind==='extension').map(r=>String(r.id)));
    return allLines.filter(line=>{
        if(line.revision_id == null)return !latest;
        return String(line.revision_id)===String(latest) || extensions.has(String(line.revision_id));
    });
};

const cents = lines => lines.reduce((sum,row)=>sum+Math.round(Number(row.amount||0)*100),0);
export const projectedBudgetRevision = (activeLines, revisionRows, revisions, kind) => {
    const currentCents=cents(activeLines);
    const addedCents=cents(revisionRows);
    const latest=revisions.filter(r=>r.kind==='replacement')
        .sort((a,b)=>Number(b.revision_no)-Number(a.revision_no))[0];
    const baseCents = cents(activeLines.filter(row =>
        latest ? String(row.revision_id)===String(latest.id) : row.revision_id==null));
    const extendedCents=currentCents-baseCents;
    const nextCents=kind==='replacement'?extendedCents+addedCents:currentCents+addedCents;
    return {
        current:currentCents/100, base:baseCents/100,
        extensions:extendedCents/100, newList:addedCents/100,
        projected:nextCents/100, difference:(nextCents-currentCents)/100,
    };
};
