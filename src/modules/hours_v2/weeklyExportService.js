import * as XLSX from 'xlsx';
import { supabase } from '../../supabaseClient';

/**
 * generateWeeklyExcel(timesheet_id)
 * Basée uniquement sur weekly_timesheet_entries.
 * Retourne un Blob (fichier Excel).
 */
export const generateWeeklyExcel = async (timesheetId) => {
    // 1. Fetch Entries
    const { data: entries, error } = await supabase
        .from('weekly_timesheet_entries')
        .select(`
            id,
            site_id,
            section_id,
            hours,
            source,
            created_at
        `)
        .eq('timesheet_id', timesheetId);

    if (error) throw error;
    if (!entries || entries.length === 0) return null;

    // 2. Fetch Reference Data (Sites & Sections Name) - "Enrichment"
    // To make the Excel useful, we need names, even if "based on entries".
    // We do a lookup.
    const siteIds = [...new Set(entries.map(e => e.site_id).filter(Boolean))];
    const sectionIds = [...new Set(entries.map(e => e.section_id).filter(Boolean))];

    const { data: sites } = await supabase.from('sites').select('id, name').in('id', siteIds);
    const { data: sections } = await supabase.from('project_tasks').select('id, name').in('id', sectionIds);

    const siteMap = (sites || []).reduce((acc, s) => ({ ...acc, [s.id]: s.name }), {});
    const sectionMap = (sections || []).reduce((acc, s) => ({ ...acc, [s.id]: s.name }), {});

    // 3. Prepare Data for Sheet
    const sheetData = entries.map(e => ({
        'Chantier': siteMap[e.site_id] || 'Inconnu',
        'Tâche': sectionMap[e.section_id] || 'Inconnue',
        'Heures': e.hours,
        'Source': e.source === 'manual' ? 'Saisie Manuelle' : 'Pointeuse',
        'Date Saisie': new Date(e.created_at).toLocaleDateString()
    }));

    // Calculate Total
    const total = sheetData.reduce((acc, row) => acc + (Number(row['Heures']) || 0), 0);
    sheetData.push({ 'Chantier': 'TOTAL', 'Heures': total });

    // 4. Create Workbook
    const worksheet = XLSX.utils.json_to_sheet(sheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Relevé Heures");

    // 5. Generate Buffer/Blob
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    return blob;
};

/**
 * Hook sendWeeklyReportByEmail
 * @param {string} email
 * @param {Blob} file
 */
export const sendWeeklyReportByEmail = async (email, file) => {
    console.log(`[MOCK EMAIL] Envoi du rapport à ${email}`);
    console.log(`[MOCK EMAIL] Fichier joint (taille): ${file.size} octets`);

    // Simulation d'un délai réseau
    await new Promise(resolve => setTimeout(resolve, 1000));

    return { success: true, message: "Email simulé envoyé" };
};
