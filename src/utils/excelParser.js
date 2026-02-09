
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

                console.log("📊 [ExcelParser] Raw Data (First 5 rows):", jsonData.slice(0, 5));

                if (!jsonData || jsonData.length === 0) {
                    resolve({ error: "Fichier vide" });
                    return;
                }

                // 1. Find Header Row
                let headerRowIdx = -1;
                let colNameIdx = -1;
                let colPlannedIdx = -1;
                let colRealizedIdx = -1;

                // Scan first 10 rows to find headers
                for (let i = 0; i < Math.min(jsonData.length, 10); i++) {
                    const row = jsonData[i] ? jsonData[i].map(c => String(c || '').toLowerCase().trim()) : [];
                    console.log(`🔎 [ExcelParser] Scanning Row ${i}:`, row);

                    const nameIdx = row.findIndex(c =>
                        c.includes('tache') || c.includes('tâche') || c.includes('section') ||
                        c.includes('nom') || c.includes('designation') || c.includes('libelle') || c.includes('libellé')
                    );

                    if (nameIdx !== -1) {
                        headerRowIdx = i;
                        colNameIdx = nameIdx;
                        colPlannedIdx = row.findIndex(c => c.includes('prevu') || c.includes('prévu') || c.includes('planned') || c.includes('devis') || c.includes('budget'));
                        colRealizedIdx = row.findIndex(c => c.includes('realise') || c.includes('réalisé') || c.includes('completed') || c.includes('fait') || c.includes('conso'));

                        console.log(`✅ [ExcelParser] Headers Found at Row ${i}: NameIdx=${colNameIdx}, PlannedIdx=${colPlannedIdx}, RealizedIdx=${colRealizedIdx}`);
                        break;
                    }
                }

                if (colNameIdx === -1) {
                    const msg = "Colonnes introuvables. En-têtes attendus : 'Tâche' (ou Nom/Désignation), 'Heures Prévues', 'Heures Réalisées'.";
                    console.warn("❌ [ExcelParser]", msg);
                    resolve({ error: msg });
                    return;
                }

                let processedCount = 0;
                let updatedCount = 0;

                // Fetch existing Sections for this site
                const { data: existingSections, error: fetchError } = await supabase
                    .from('project_tasks')
                    .select('*')
                    .eq('project_id', siteId);

                if (fetchError) throw fetchError;

                const updates = [];
                const inserts = [];

                // Process rows (start after header)
                for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if (!Array.isArray(row) || row.length === 0) continue;

                    const nameRaw = row[colNameIdx];
                    if (!nameRaw) continue; // Skip empty names

                    const name = String(nameRaw).trim();
                    // Filter out obviously bad rows
                    if (!name || name.toLowerCase().includes('total') || name.toLowerCase().includes('page')) continue;

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

                    // console.log(`👉 [ExcelParser] Row ${i}: "${name}" -> P:${planned} | C:${completed}`);

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

                console.log(`📝 [ExcelParser] Summary: ${inserts.length} Inserts, ${updates.length} Updates found.`);

                // EXECUTE BATCHES
                if (inserts.length > 0) {
                    const { error } = await supabase.from('project_tasks').insert(inserts);
                    if (error) console.error("Error inserting project_tasks:", error);
                    else processedCount += inserts.length;
                }

                for (const up of updates) {
                    const { error } = await supabase.from('project_tasks').update({
                        planned_hours: up.planned_hours,
                        completed_hours: up.completed_hours
                    }).eq('id', up.id);

                    if (!error) updatedCount++;
                }

                // Update Site Total
                const { data: allTasks } = await supabase.from('project_tasks').select('planned_hours').eq('project_id', siteId);
                if (allTasks) {
                    const totalPlanned = allTasks.reduce((acc, t) => acc + (Number(t.planned_hours) || 0), 0);
                    await supabase.from('sites').update({ planned_hours: totalPlanned }).eq('id', siteId);
                }

                resolve({
                    success: true,
                    count: processedCount,
                    updated: updatedCount,
                    totalRows: jsonData.length - (headerRowIdx + 1),
                    debug: `Lignes lues: ${jsonData.length}. En-tête (Ligne ${headerRowIdx}): Nom=${colNameIdx}, Prévu=${colPlannedIdx}, Réalisé=${colRealizedIdx}`
                });

            } catch (err) {
                console.error("Import Parser Error:", err);
                resolve({ error: err.message });
            }
        };
        reader.readAsArrayBuffer(file);
    });
};
