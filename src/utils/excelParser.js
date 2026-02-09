
export const importProjectProgress = async (siteId, file, supabase) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                // Dynamic import keeps bundle size small and avoids circular dependency risks at module level
                const XLSX = await import('xlsx');
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                if (!jsonData || jsonData.length === 0) {
                    resolve({ error: "Fichier vide" });
                    return;
                }

                // 1. Parse Headers (Row 0) to find columns
                // Using permissive matching
                const headers = jsonData[0].map(h => String(h || '').toLowerCase().trim());

                const colNameIdx = headers.findIndex(h => h.includes('tache') || h.includes('tâche') || h.includes('section') || h.includes('nom') || h.includes('designation'));
                const colPlannedIdx = headers.findIndex(h => h.includes('prevu') || h.includes('prévu') || h.includes('planned') || h.includes('devis'));
                const colRealizedIdx = headers.findIndex(h => h.includes('realise') || h.includes('réalisé') || h.includes('completed') || h.includes('fait'));

                if (colNameIdx === -1) {
                    // Fallback try: maybe no headers?
                    // But for safety, request headers
                    resolve({ error: "Colonnes introuvables. Le fichier doit avoir : 'Tâche' (ou Section), 'Prévu', 'Réalisé'" });
                    return;
                }

                let processedCount = 0;
                let updatedCount = 0;

                // Fetch existing Sections for this site to detect duplicates/updates
                const { data: existingSections, error: fetchError } = await supabase
                    .from('project_tasks')
                    .select('*')
                    .eq('project_id', siteId);

                if (fetchError) throw fetchError;

                const updates = [];
                const inserts = [];

                // Process rows (start at 1)
                for (let i = 1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if (!Array.isArray(row) || row.length === 0) continue;

                    const nameRaw = row[colNameIdx];
                    if (!nameRaw) continue; // Skip empty names

                    const name = String(nameRaw).trim();
                    if (!name) continue;

                    // Parse Numbers strictly
                    let plannedStr = '0';
                    let completedStr = '0';

                    if (colPlannedIdx !== -1 && row[colPlannedIdx] !== undefined) {
                        plannedStr = String(row[colPlannedIdx]).replace(',', '.').replace(/[^0-9.]/g, '');
                    }
                    if (colRealizedIdx !== -1 && row[colRealizedIdx] !== undefined) {
                        completedStr = String(row[colRealizedIdx]).replace(',', '.').replace(/[^0-9.]/g, '');
                    }

                    let planned = parseFloat(plannedStr);
                    let completed = parseFloat(completedStr);

                    if (isNaN(planned)) planned = 0;
                    if (isNaN(completed)) completed = 0;

                    // UPSERT LOGIC
                    const existing = existingSections.find(s => s.name.toLowerCase() === name.toLowerCase());

                    if (existing) {
                        updates.push({
                            id: existing.id,
                            planned_hours: planned,
                            completed_hours: completed
                        });
                    } else {
                        inserts.push({
                            project_id: siteId,
                            name,
                            planned_hours: planned,
                            completed_hours: completed,
                            is_active: true
                        });
                    }
                }

                // EXECUTE BATCHES
                // 1. Inserts
                if (inserts.length > 0) {
                    const { error } = await supabase.from('project_tasks').insert(inserts);
                    if (error) console.error("Error inserting project_tasks:", error);
                    else processedCount += inserts.length;
                }

                // 2. Updates
                // Supabase doesn't support bulk update with different values easily without upsert, 
                // but usually looped updates are fine for small Excel files.
                // Or use upsert if ID is present? Upsert requires all fields.
                // We'll loop for safety and simplicity as files are small.
                for (const up of updates) {
                    const { error } = await supabase.from('project_tasks').update({
                        planned_hours: up.planned_hours,
                        completed_hours: up.completed_hours
                    }).eq('id', up.id);

                    if (!error) updatedCount++;
                }

                // 3. Update Site Total Planned Hours
                // We need to re-fetch or calculate total manually.
                // Best is to sum what we have in DB now.
                // But simplified: allow AppContext real-time to eventually handle it? 
                // Or force update site total here.

                // Let's force update site total for consistency
                const { data: allTasks } = await supabase.from('project_tasks').select('planned_hours').eq('project_id', siteId);
                if (allTasks) {
                    const totalPlanned = allTasks.reduce((acc, t) => acc + (Number(t.planned_hours) || 0), 0);
                    await supabase.from('sites').update({ planned_hours: totalPlanned }).eq('id', siteId);
                }

                resolve({ success: true, count: processedCount, updated: updatedCount });

            } catch (err) {
                console.error("Import Parser Error:", err);
                resolve({ error: err.message });
            }
        };
        reader.readAsArrayBuffer(file);
    });
};
