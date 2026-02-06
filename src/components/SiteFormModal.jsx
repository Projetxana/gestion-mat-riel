import React, { useState, useEffect } from 'react';
import { X, Save, Trash2, Plus, Upload } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { supabase } from '../supabaseClient';

const SiteFormModal = ({ onClose, siteToEdit = null }) => {
    const { addSite, updateSite, projectTasks } = useAppContext(); // ✅ ADDED projectTasks
    const isEditing = !!siteToEdit;

    // Step 1: Project Info
    const [projectInfo, setProjectInfo] = useState({
        name: '',
        address: '',
        start_date: '',
        end_date: '',
        status: 'active'
    });

    // Step 2: Sections (ex-Tasks)
    // Structure: { id, name, planned_hours, completed_hours }
    const [sections, setSections] = useState([]);

    // Quick Add State
    const [newSelectionName, setNewSelectionName] = useState('');
    const [newPlanHours, setNewPlanHours] = useState('');
    const [newDoneHours, setNewDoneHours] = useState('');

    // Load initial data if editing
    useEffect(() => {
        if (isEditing && siteToEdit) {
            setProjectInfo({
                name: siteToEdit.name || '',
                address: siteToEdit.address || '',
                start_date: siteToEdit.start_date ? siteToEdit.start_date.split('T')[0] : '',
                end_date: siteToEdit.end_date ? siteToEdit.end_date.split('T')[0] : '',
                status: siteToEdit.status || 'active'
            });

            // Use project_tasks populated in AppContext mapping
            if (siteToEdit.project_tasks) {
                setSections(siteToEdit.project_tasks.map(t => ({
                    id: t.id,
                    name: t.name,
                    planned_hours: Number(t.planned_hours) || 0,
                    completed_hours: Number(t.completed_hours) || 0
                })));
            }
        } else {
            // Default sections for new site
            setSections([
                { id: 't1', name: 'Lot 1: Préparation', planned_hours: 0, completed_hours: 0 },
                { id: 't2', name: 'Lot 2: Exécution', planned_hours: 0, completed_hours: 0 },
                { id: 't3', name: 'Lot 3: Finitions', planned_hours: 0, completed_hours: 0 }
            ]);
        }
    }, [isEditing, siteToEdit]);

    // ✅ FIX #3: Real-time sync with global projectTasks
    // If another user imports sections while this modal is open, reflect changes
    useEffect(() => {
        if (isEditing && siteToEdit && projectTasks) {
            const liveSections = projectTasks.filter(pt =>
                String(pt.project_id) === String(siteToEdit.id)
            );
            if (liveSections.length > 0) {
                setSections(liveSections.map(t => ({
                    id: t.id,
                    name: t.name,
                    planned_hours: Number(t.planned_hours) || 0,
                    completed_hours: Number(t.completed_hours) || 0
                })));
            }
        }
    }, [projectTasks, isEditing, siteToEdit?.id]);

    // Computed Totals
    const totalPlanned = sections.reduce((acc, t) => acc + (Number(t.planned_hours) || 0), 0);
    const totalCompleted = sections.reduce((acc, t) => acc + (Number(t.completed_hours) || 0), 0);

    const handleSubmit = (e) => {
        e.preventDefault();

        // Rule: Start date required validation could be here but optional per schema

        const payload = {
            ...projectInfo,
            planned_hours: totalPlanned, // Auto-update total on site
            project_tasks: sections.map(t => ({
                ...t,
                planned_hours: Number(t.planned_hours) || 0,
                completed_hours: Number(t.completed_hours) || 0
            }))
        };

        if (isEditing) {
            updateSite(siteToEdit.id, payload);
        } else {
            addSite(payload);
        }
        onClose();
    };

    const handleAddSection = () => {
        if (!newSelectionName.trim()) return;
        const newSection = {
            id: `temp-${Date.now()}`,
            name: newSelectionName.trim(),
            planned_hours: Number(newPlanHours) || 0,
            completed_hours: Number(newDoneHours) || 0
        };
        setSections([...sections, newSection]);
        setNewSelectionName('');
        setNewPlanHours('');
        setNewDoneHours('');
    };

    const removeSection = (id) => {
        setSections(sections.filter(t => t.id !== id));
    };

    const updateSection = (id, field, value) => {
        setSections(sections.map(s => s.id === id ? { ...s, [field]: value } : s));
    };

    const handleExcelImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Ensure we are in edit mode
        if (!isEditing || !siteToEdit?.id) {
            alert("L'import Excel nécessite que le chantier soit déjà créé (Mode Modification).");
            e.target.value = '';
            return;
        }

        const projectId = siteToEdit.id;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const data = new Uint8Array(evt.target.result);
                // Dynamic import to keep bundle small
                const XLSX = await import('xlsx');
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                if (!jsonData || jsonData.length === 0) {
                    alert("Le fichier semble vide.");
                    return;
                }

                // 1. Find Header Row (first row with typically 'Tache' or 'Nom')
                let headerRowIdx = -1;
                let colNameIdx = -1;
                let colPlannedIdx = -1;
                let colRealizedIdx = -1;

                // Scan first 5 rows to find headers
                for (let i = 0; i < Math.min(jsonData.length, 5); i++) {
                    const row = jsonData[i].map(c => String(c || '').toLowerCase().trim());
                    const nameIdx = row.findIndex(c => c.includes('tache') || c.includes('tâche') || c.includes('section') || c.includes('nom') || c.includes('designation'));

                    if (nameIdx !== -1) {
                        headerRowIdx = i;
                        colNameIdx = nameIdx;
                        colPlannedIdx = row.findIndex(c => c.includes('prevu') || c.includes('prévu') || c.includes('planned') || c.includes('devis'));
                        colRealizedIdx = row.findIndex(c => c.includes('realise') || c.includes('réalisé') || c.includes('completed') || c.includes('fait'));
                        break;
                    }
                }

                if (colNameIdx === -1) {
                    // Fallback to strict 0, 1, 2 if no headers found? Or error?
                    // Let's try to be smart: if row 0 has strings that look like data, maybe no header?
                    // Safe bet: Alert user
                    alert("Impossible de trouver les colonnes. Le fichier doit avoir des en-têtes : 'Nom' (ou Tâche), 'Prévu', 'Réalisé'.");
                    return;
                }

                let addedCount = 0;
                let updatedCount = 0;
                let newSectionsList = [...sections];

                // Process rows starting AFTER header
                for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if (!Array.isArray(row) || row.length === 0) continue;

                    const nameRaw = row[colNameIdx];
                    if (!nameRaw) continue;

                    const name = String(nameRaw).trim();
                    if (!name) continue;

                    // Parse Numbers
                    let plannedStr = '0';
                    let completedStr = '0';

                    if (colPlannedIdx !== -1 && row[colPlannedIdx] !== undefined) {
                        plannedStr = String(row[colPlannedIdx]).replace(',', '.').replace(/[^0-9.]/g, '');
                    }
                    if (colRealizedIdx !== -1 && row[colRealizedIdx] !== undefined) {
                        completedStr = String(row[colRealizedIdx]).replace(',', '.').replace(/[^0-9.]/g, '');
                    }

                    let planned = parseFloat(plannedStr) || 0;
                    let completed = parseFloat(completedStr) || 0;

                    // CHECK IF EXISTS
                    const existingSection = newSectionsList.find(s => s.name.toLowerCase() === name.toLowerCase());

                    if (existingSection) {
                        // UPDATE LOGIC
                        const { error } = await supabase
                            .from('project_tasks')
                            .update({
                                planned_hours: planned,
                                completed_hours: completed
                            })
                            .eq('id', existingSection.id);

                        if (!error) {
                            newSectionsList = newSectionsList.map(s => s.id === existingSection.id ? { ...s, planned_hours: planned, completed_hours: completed } : s);
                            updatedCount++;
                        }
                    } else {
                        // INSERT LOGIC
                        const { data, error } = await supabase
                            .from('project_tasks')
                            .insert({
                                project_id: projectId,
                                name: name,
                                planned_hours: planned,
                                completed_hours: completed,
                                is_active: true
                            })
                            .select()
                            .single();

                        if (!error && data) {
                            const realTask = {
                                id: data.id,
                                name: data.name,
                                planned_hours: Number(data.planned_hours),
                                completed_hours: Number(data.completed_hours)
                            };
                            newSectionsList.push(realTask);
                            addedCount++;
                        }
                    }
                }

                if (updatedCount > 0 || addedCount > 0) {
                    setSections(newSectionsList);
                    alert(`Import réussi : ${addedCount} ajoutés, ${updatedCount} mis à jour.`);
                } else {
                    alert("Aucune donnée valide trouvée ou aucune modification nécessitée.");
                }

            } catch (err) {
                console.error("Excel parse error:", err);
                alert("Erreur lors de la lecture du fichier Excel: " + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
        e.target.value = '';
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-4xl shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-6 border-b border-slate-800 shrink-0">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            {isEditing ? 'Modifier Chantier' : 'Nouveau Chantier'}
                        </h2>
                        <p className="text-xs text-slate-400">
                            {isEditing ? `Édition de ${siteToEdit.name}` : 'Configuration du projet'}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="overflow-y-auto p-6 custom-scrollbar grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* LEFT COLUMN: PROJECT INFO */}
                    <div className="space-y-4 lg:col-span-1">
                        <h3 className="text-sm font-bold text-blue-400 uppercase border-b border-blue-500/20 pb-2">1. Informations</h3>

                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Nom du Chantier *</label>
                            <input
                                type="text"
                                required
                                value={projectInfo.name}
                                onChange={(e) => setProjectInfo({ ...projectInfo, name: e.target.value })}
                                className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white focus:border-blue-500 outline-none text-sm"
                                placeholder="Nom du projet"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Adresse</label>
                            <textarea
                                rows="3"
                                value={projectInfo.address}
                                onChange={(e) => setProjectInfo({ ...projectInfo, address: e.target.value })}
                                className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white focus:border-blue-500 outline-none text-sm resize-none"
                                placeholder="Adresse complète"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Début</label>
                                <input
                                    type="date"
                                    value={projectInfo.start_date}
                                    onChange={(e) => setProjectInfo({ ...projectInfo, start_date: e.target.value })}
                                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white focus:border-blue-500 outline-none text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Fin</label>
                                <input
                                    type="date"
                                    value={projectInfo.end_date}
                                    onChange={(e) => setProjectInfo({ ...projectInfo, end_date: e.target.value })}
                                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white focus:border-blue-500 outline-none text-sm"
                                />
                            </div>
                        </div>

                        <div className="bg-slate-800 p-4 rounded border border-slate-700 mt-4 space-y-2">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase">Total Heures Prévues</label>
                                <div className="text-xl font-mono font-bold text-white">{totalPlanned} h</div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase">Total Heures Réalisées</label>
                                <div className="text-xl font-mono font-bold text-blue-400">{totalCompleted} h</div>
                            </div>
                            <div className="w-full bg-slate-900 rounded-full h-1.5 mt-2">
                                <div
                                    className="bg-blue-500 h-1.5 rounded-full transition-all"
                                    style={{ width: `${totalPlanned > 0 ? Math.min((totalCompleted / totalPlanned) * 100, 100) : 0}%` }}
                                ></div>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: SECTIONS */}
                    <div className="space-y-4 flex flex-col h-full lg:col-span-2">
                        <div className="flex justify-between items-center border-b border-blue-500/20 pb-2">
                            <h3 className="text-sm font-bold text-blue-400 uppercase">2. Sections du Chantier ({sections.length})</h3>
                            <label className="cursor-pointer text-[10px] bg-green-600 hover:bg-green-500 text-white px-2 py-1 rounded flex items-center gap-1 transition-colors">
                                <Upload size={12} />
                                <span>Import Excel</span>
                                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleExcelImport} />
                            </label>
                        </div>

                        {/* HEADERS */}
                        <div className="grid grid-cols-12 gap-2 text-[10px] uppercase font-bold text-slate-500 px-2">
                            <div className="col-span-6">Nom Section</div>
                            <div className="col-span-2 text-right">Prévu</div>
                            <div className="col-span-2 text-right">Réalisé</div>
                            <div className="col-span-2"></div>
                        </div>

                        <div className="flex-1 bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden flex flex-col min-h-[300px]">
                            <div className="overflow-y-auto flex-1 p-2 space-y-1 custom-scrollbar">
                                {sections.map((section, idx) => (
                                    <div key={section.id} className="grid grid-cols-12 gap-2 items-center bg-slate-800 p-2 rounded border border-slate-700/50 group hover:border-blue-500/30 transition-colors">
                                        <div className="col-span-6">
                                            <input
                                                type="text"
                                                value={section.name}
                                                onChange={(e) => updateSection(section.id, 'name', e.target.value)}
                                                className="w-full bg-transparent text-sm text-slate-200 outline-none border-b border-transparent focus:border-blue-500/50 transition-colors"
                                            />
                                        </div>
                                        <div className="col-span-2">
                                            <input
                                                type="text" inputMode="decimal"
                                                className="w-full bg-slate-900 border border-slate-700 rounded px-1 text-right text-xs text-slate-300 font-mono focus:border-blue-500 outline-none"
                                                value={Number(section.planned_hours || 0)}
                                                onChange={(e) => {
                                                    const v = e.target.value.replace(',', '.');
                                                    if (!isNaN(v)) updateSection(section.id, 'planned_hours', Number(v));
                                                }}
                                            />
                                        </div>
                                        <div className="col-span-2">
                                            <input
                                                type="text" inputMode="decimal"
                                                className="w-full bg-slate-900 border border-slate-700 rounded px-1 text-right text-xs text-blue-400 font-mono focus:border-blue-500 outline-none"
                                                value={Number(section.completed_hours || 0)}
                                                onChange={(e) => {
                                                    const v = e.target.value.replace(',', '.');
                                                    if (!isNaN(v)) updateSection(section.id, 'completed_hours', Number(v));
                                                }}
                                            />
                                        </div>
                                        <div className="col-span-2 flex justify-end">
                                            <button onClick={() => removeSection(section.id)} className="text-slate-600 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {sections.length === 0 && (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-500 p-8 text-center opacity-50">
                                        <p className="text-sm mb-2">Aucune section</p>
                                    </div>
                                )}
                            </div>

                            {/* Add Section Footer */}
                            <div className="p-2 bg-slate-800 border-t border-slate-700 grid grid-cols-12 gap-2 items-center">
                                <div className="col-span-6">
                                    <input
                                        type="text"
                                        placeholder="Nouvelle section..."
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-blue-500"
                                        value={newSelectionName}
                                        onChange={(e) => setNewSelectionName(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddSection()}
                                    />
                                </div>
                                <div className="col-span-2">
                                    <input
                                        type="text" inputMode="decimal"
                                        placeholder="Prévu"
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-blue-500"
                                        value={newPlanHours}
                                        onChange={(e) => setNewPlanHours(e.target.value.replace(',', '.'))}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddSection()}
                                    />
                                </div>
                                <div className="col-span-2">
                                    <input
                                        type="text" inputMode="decimal"
                                        placeholder="Fait"
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-blue-500"
                                        value={newDoneHours}
                                        onChange={(e) => setNewDoneHours(e.target.value.replace(',', '.'))}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddSection()}
                                    />
                                </div>
                                <div className="col-span-2 flex justify-end">
                                    <button
                                        type="button"
                                        onClick={handleAddSection}
                                        className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-bold w-full flex justify-center"
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-slate-800 shrink-0 flex justify-between items-center bg-slate-900/50">
                    <div className="text-xs text-slate-500">
                        * Champs obligatoires
                    </div>
                    <div className="flex gap-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-white transition-colors text-sm">Annuler</button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={!projectInfo.name || sections.length === 0}
                            className={`px-6 py-2 font-bold rounded-lg shadow-lg transition-all text-sm flex items-center gap-2 ${!projectInfo.name || sections.length === 0
                                ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20'
                                }`}
                        >
                            <Save size={18} />
                            {isEditing ? 'Enregistrer Modifications' : 'Créer Chantier'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SiteFormModal;
