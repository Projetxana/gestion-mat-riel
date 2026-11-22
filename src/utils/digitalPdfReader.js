import { rebuildPdfPageLayout } from './pdfTextLayout.js';

const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');

// PDF.js + matching worker are bundled by Vite and stay on the user's device.
// No data leaves the browser during PDF extraction.
export const readDigitalPdf = async (file,{maxBytes=12*1024*1024,maxPages=40,onProgress}={}) => {
    if(!file || !/\.pdf$/i.test(file.name) ||
       (file.type && file.type !== 'application/pdf'))
        throw new Error('Sélectionnez un document PDF.');
    if(file.size>maxBytes || file.size<50)
        throw new Error('PDF invalide ou trop volumineux (12 Mo maximum).');
    const bytes=new Uint8Array(await file.arrayBuffer());
    if(String.fromCharCode(...bytes.slice(0,5))!=='%PDF-')
        throw new Error('Ce fichier ne contient pas une structure PDF valide.');
    const sha256=hex(await crypto.subtle.digest('SHA-256',bytes));
    // Dynamic import keeps the large PDF decoder out of the default project dashboard.
    const [{getDocument,GlobalWorkerOptions},{default:workerSrc}]=await Promise.all([
        import('pdfjs-dist/build/pdf.mjs'),
        import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    ]);
    GlobalWorkerOptions.workerSrc=workerSrc;
    const task=getDocument({data:bytes,isEvalSupported:false,useSystemFonts:true});
    let pdf=null;
    try{
        pdf=await task.promise;
        if(pdf.numPages<1 || pdf.numPages>maxPages)
            throw new Error('PDF de plus de 40 pages : contrôle manuel requis.');
        let textItems=0;
        const pages=[];
        for(let number=1;number<=pdf.numPages;number++){
            const page=await pdf.getPage(number);
            const content=await page.getTextContent();
            textItems+=content.items.filter(item=>item.str?.trim()).length;
            pages.push(rebuildPdfPageLayout(content.items));
            page.cleanup();
            onProgress?.(Math.round(number/pdf.numPages*100));
        }
        if(textItems<10 || pages.every(page=>page.trim().length<80))
            throw new Error('PDF scanné ou texte insuffisant : import automatique impossible.');
        return {
            text:pages.join('\n\f\n'),
            pages,
            numPages:pdf.numPages,
            allPagesProcessed:true,
            digitalText:true,
            sha256,
        };
    } catch (error) {
        throw error;
    } finally {
        if(pdf) await pdf.destroy();
        else await task.destroy();
    }
};
