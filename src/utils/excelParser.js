const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const blank = value => value == null || String(value).trim() === '';
const hours = (value, row, label, optional = false) => {
    if (blank(value)) {
        if (optional) return null;
        throw new Error(`Ligne ${row} : ${label} manquantes.`);
    }
    const raw = typeof value === 'number' ? value : String(value).trim().replace(/[\s\u00a0\u202f]/g, '').replace(/,/g, '.');
    if (typeof raw !== 'number' && !/^\d+(?:\.\d+)?$/.test(raw)) throw new Error(`Ligne ${row} : ${label} invalides.`);
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) throw new Error(`Ligne ${row} : ${label} invalides.`);
    return n;
};

export function parseProjectRows(rows) {
    const nameKeys = ['tache', 'section', 'nom', 'designation', 'libelle'];
    const plannedKeys = ['prevu', 'planned', 'devis', 'budget'];
    const doneKeys = ['realise', 'completed', 'fait', 'conso'];
    const find = (row, keys) => row.findIndex(c => keys.some(k => normalize(c).includes(k)));
    let header = -1, nameCol = -1, plannedCol = -1, doneCol = -1;
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
        const row = rows[i] || [];
        const n = find(row, nameKeys), p = find(row, plannedKeys);
        if (n >= 0 && p >= 0 && n !== p) {
            header = i; nameCol = n; plannedCol = p; doneCol = find(row, doneKeys); break;
        }
    }
    if (header < 0) throw new Error("Colonnes introuvables : Nom (ou Tâche), Heures prévues.");
    const result = [], seen = new Set();
    for (let i = header + 1; i < rows.length; i++) {
        const row = rows[i] || [];
        if (blank(row[nameCol])) {
            if (!blank(row[plannedCol]) || (doneCol >= 0 && !blank(row[doneCol]))) throw new Error(`Ligne ${i + 1} : nom de tâche manquant.`);
            continue;
        }
        const name = String(row[nameCol]).trim(), key = normalize(name);
        if (/^(?:sous[ -]?total|total|page)(?:\s|:|$)/.test(key)) continue;
        if (seen.has(key)) throw new Error(`Ligne ${i + 1} : tâche en double : ${name}.`);
        seen.add(key);
        result.push({ name, planned_hours: hours(row[plannedCol], i + 1, 'heures prévues'), completed_hours: doneCol < 0 ? null : hours(row[doneCol], i + 1, 'heures réalisées', true) });
    }
    if (!result.length) throw new Error('Aucune tâche à importer.');
    return result;
}

export async function readProjectExcel(file) {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error('Fichier vide.');
    return parseProjectRows(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }));
}

export function planProjectImport(existing, tasks, siteId) {
    const byName = new Map();
    for (const task of existing) {
        const key = normalize(task.name);
        if (byName.has(key)) byName.set(key, null);
        else byName.set(key, task);
    }
    const inserts = [], updates = [];
    for (const task of tasks) {
        const key = normalize(task.name);
        if (byName.has(key)) {
            const current = byName.get(key);
            if (!current) throw new Error(`Plusieurs tâches existantes correspondent à ${task.name}.`);
            // Existing realized hours are never overwritten by a planning import.
            updates.push({ id: current.id, planned_hours: task.planned_hours });
        } else {
            inserts.push({ project_id: siteId, name: task.name, planned_hours: task.planned_hours, completed_hours: task.completed_hours ?? 0 });
        }
    }
    return { inserts, updates };
}

export async function importProjectProgress(siteId, file, supabase, parsedTasks) {
    let count = 0, updated = 0;
    try {
        const tasks = parsedTasks ?? await readProjectExcel(file);
        const { data: existing, error: fetchError } = await supabase.from('project_tasks').select('id,name,planned_hours,completed_hours').eq('project_id', siteId);
        if (fetchError) throw fetchError;
        const { inserts, updates } = planProjectImport(existing || [], tasks, siteId);
        if (inserts.length) {
            const { data, error } = await supabase.from('project_tasks').insert(inserts).select('id');
            if (error) throw error;
            count = data?.length ?? 0;
            if (count !== inserts.length) throw new Error('Nombre de tâches ajoutées inattendu.');
        }
        for (const { id, planned_hours } of updates) {
            const { data, error } = await supabase.from('project_tasks').update({ planned_hours }).eq('project_id', siteId).eq('id', id).select('id');
            if (error) throw error;
            if (data?.length !== 1) throw new Error('Modification refusée ou tâche introuvable.');
            updated++;
        }
        const { data: sections, error: readError } = await supabase.from('project_tasks').select('id,name,planned_hours,completed_hours,project_id').eq('project_id', siteId);
        if (readError) throw readError;
        const totalPlanned = sections.reduce((sum, task) => sum + Number(task.planned_hours || 0), 0);
        const { data: site, error: siteError } = await supabase.from('sites').update({ planned_hours: totalPlanned }).eq('id', siteId).select('id');
        if (siteError) throw siteError;
        if (site?.length !== 1) throw new Error('Total du chantier non enregistré.');
        return { success: true, count, updated, sections, totalPlanned };
    } catch (error) {
        return { error: error.message || String(error), count, updated };
    }
}
