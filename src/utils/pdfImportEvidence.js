import { parseDecimal } from './purchaseBudget.js';
import { extractDocumentHints } from './purchaseDocumentText.js';
import { extractFlocorHeader } from './flocorLayoutParser.js';
import { extractCdEstimateHeader } from './cdEstimateLayoutParser.js';
import { assessPdfAutoImport } from './pdfAutoImportPolicy.js';

const amountFrom = raw => {
    const n=parseDecimal(raw);
    return Number.isFinite(n)&&n>=0?n:null;
};
const rowAnchors = (text,kind) => {
    const rows=String(text||'').split(/\r?\n/);
    if(kind==='budget')return rows.filter(row=>/^\s*CD\s+\d{4,5}\s+\S/i.test(row)).length;
    // All Flocor product rows start with a three-digit line number and
    // contain order/shipped/BO quantities in that same printed row.
    return rows.filter(row=>/^\s*\d{3}\s+\S+\s{2,}.*\s{2,}(?:UN|PI|FT|EA|PC)\s+\d+(?:[.,]\d+)?\s+\d+(?:[.,]\d+)?/i.test(row)).length;
};

export const derivePdfImportEvidence = (readResult,{kind,site,supplier=''}) => {
    const text=String(readResult?.text||'');
    const hints=extractDocumentHints(text,kind);
    const isFlocor=kind==='order' && Boolean(extractFlocorHeader(text));
    const isCd=kind==='budget' && Boolean(extractCdEstimateHeader(text));
    const parser_id=isFlocor?'flocor-layout-v1':isCd?'cd-estimate-v1':'unknown';
    let printed_material_total=null;
    if(isFlocor){
        const match=text.match(/Sous-total\s*\/\s*Sub-Total\s+([\d ,.\u00a0]+)(?=\s*$)/im);
        printed_material_total=match?amountFrom(match[1]):null;
    }
    if(isCd){
        // In the CD grouped estimate, a final "total du matériel" note is
        // followed by the estimated material total. This may differ from
        // other reports; never silently substitute a subtotal or add taxes.
        const match=text.match(/total du mat[eé]riel[^\n]*?\s{3,}([\d \u00a0]+,\d{2})\s*$/im);
        printed_material_total=match?amountFrom(match[1]):null;
    }
    const rows=hints.suggested_lines||[];
    const source_line_count=rowAnchors(text,kind);
    const material_line_count=rows.filter(row=>row.included!==false).length;
    const boPresent=isFlocor && rows.some(row=>Number(row.supplier_bo_qty||0)>0);
    const unknownPriceUnits=isCd && rows.some(row=>row.source_price_unit &&
        !['CT','LG',row.unit].includes(row.source_price_unit));
    const warnings=[
        ...(hints.line_warnings||[]).filter(warn=>!/^Budget estimatif :/.test(warn)),
        ...(boPresent?['Le montant Flocor exclut les articles en BO : rapprochement manuel requis']:[]),
        ...(unknownPriceUnits?['Base de prix non reconnue dans une ligne CD']:[]),
    ];
    return {
        hints, supplier:isFlocor?'Flocor':supplier,
        document:{
            mime_type:'application/pdf',
            digital_text:readResult?.digitalText===true,
            sha256:readResult?.sha256||'',
            page_count:readResult?.numPages||0,
            all_pages_processed:readResult?.allPagesProcessed===true,
            parser_id,
            source_line_count,
            detected_line_count:rows.length,
            material_line_count,
            printed_material_total,
            total_verified_from_pdf:printed_material_total!==null,
        },evidence:{warnings},
    };
};

export const assessDigitalPdf = (readResult,{kind,site,supplier='',previousOrders=[],hasExistingBudget=false})=>{
    const parsed=derivePdfImportEvidence(readResult,{kind,site,supplier});
    const decision=assessPdfAutoImport({
        kind,site,hints:parsed.hints,supplier:parsed.supplier,
        previousOrders,hasExistingBudget,document:parsed.document,evidence:parsed.evidence,
    });
    return {...parsed,...decision};
};
