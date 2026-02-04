import React, { useState, useEffect } from 'react';
import { X, Save, Trash2, Plus, Upload } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

const SiteFormModal = ({ onClose, siteToEdit = null }) => {
    const { addSite, updateSite } = useAppContext();
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

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const data = new Uint8Array(evt.target.result);
                const XLSX = await import('xlsx');
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                const newItems = [];
                for (let i = 0; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if (!Array.isArray(row) || row.length === 0) continue;

                    const nameRaw = row[0];
                    if (!nameRaw) continue;

                    const name = String(nameRaw).trim();
                    const lowerName = name.toLowerCase();
                    // Skip headers
                    if (lowerName === 'nom' || lowerName.includes('tache') || lowerName.includes('task') || lowerName.includes('section')) {
                        const col2 = String(row[1] || '').toLowerCase();
                        if (col2.includes('heure') || col2.includes('hour') || col2.includes('prévu') || col2.includes('planned')) {
                            continue;
                        }
                    }

                    // Strict parsing: A=Name, B=Planned, C=Completed
                    // FIX: Handle commas and ensure number
                    let plannedStr = String(row[1] || '0').replace(',', '.');
                    let completedStr = String(row[2] || '0').replace(',', '.');

                    let planned = Number(plannedStr);
                    let completed = Number(completedStr);

                    if (isNaN(planned)) planned = 0;
                    if (isNaN(completed)) completed = 0;

                    newItems.push({
                        id: `import-${Date.now()}-${i}`,
                        name: name,
                        planned_hours: planned,
                        completed_hours: completed
                    });
                }

                if (newItems.length > 0) {
                    // Smart Merge Logic
                    let updatedCount = 0;
                    let addedCount = 0;
                    const updatedSections = [...sections];

                    newItems.forEach(newItem => {
                        const existingIndex = updatedSections.findIndex(s => s.name.toLowerCase() === newItem.name.toLowerCase());
                        if (existingIndex >= 0) {
                            // Update existing (keep ID and Name, update hours)
                            updatedSections[existingIndex] = {
                                ...updatedSections[existingIndex],
                                planned_hours: newItem.planned_hours,
                                completed_hours: newItem.completed_hours
                            };
                            updatedCount++;
                        } else {
                            // Add new
                            updatedSections.push(newItem);
                            addedCount++;
                        }
                    });

                    if (updatedCount > 0 || addedCount > 0) {
                        const msg = [];
                        if (updatedCount > 0) msg.push(`${updatedCount} sections mises à jour`);
                        if (addedCount > 0) msg.push(`${addedCount} nouvelles sections ajoutées`);

                        if (window.confirm(`Import terminé :\n${msg.join('\n')}\n\nAppliquer ces modifications ?`)) {
                            setSections(updatedSections);
                        }
                    } else {
                        alert("Aucune donnée valide trouvée.");
                    }
                } else {
                    alert("Aucune donnée valide trouvée.");
                }
            } catch (err) {
                console.error("Excel parse error:", err);
                alert("Erreur lors de la lecture du fichier Excel.");
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
