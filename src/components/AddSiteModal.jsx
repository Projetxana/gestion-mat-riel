import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

const AddSiteModal = ({ onClose }) => {
    const { addSite } = useAppContext();

    // Step 1: Project Info
    const [projectInfo, setProjectInfo] = useState({
        name: '',
        address: '',
        start_date: '',
        end_date: '',
        planned_hours: 0, // Will be calculated from tasks
        status: 'active'
    });

    // Step 2: Tasks
    const [tasks, setTasks] = useState([
        { id: 't1', name: 'Installation', planned_hours: 0 },
        { id: 't2', name: 'Inspection', planned_hours: 0 },
        { id: 't3', name: 'Maintenance', planned_hours: 0 },
        { id: 't4', name: 'Transport', planned_hours: 0 },
        { id: 't5', name: 'Autre', planned_hours: 0 }
    ]);

    const [newTaskName, setNewTaskName] = useState('');
    const [newTaskHours, setNewTaskHours] = useState('');

    // Computed Total
    const totalHours = tasks.reduce((acc, t) => acc + (Number(t.planned_hours) || 0), 0);

    const handleSubmit = (e) => {
        e.preventDefault();

        // Validation: At least 1 task
        if (tasks.length === 0) {
            alert("Règle Absolue: Un chantier doit avoir au moins une tâche.");
            return;
        }

        addSite({
            ...projectInfo,
            planned_hours: totalHours, // Force sum as source of truth
            tasks: tasks.map(t => ({
                name: t.name,
                planned_hours: Number(t.planned_hours) || 0
            }))
        });
        onClose();
    };

    const handleAddTask = () => {
        if (!newTaskName.trim()) return;
        const newTask = {
            id: `t-${Date.now()}`,
            name: newTaskName.trim(),
            planned_hours: Number(newTaskHours) || 0
        };
        setTasks([...tasks, newTask]);
        setNewTaskName('');
        setNewTaskHours('');
    };

    const removeTask = (id) => {
        setTasks(tasks.filter(t => t.id !== id));
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
                const jsonData = XLSX.utils.sheet_to_json(sheet);

                const normalizeKey = (k) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

                const newTasks = jsonData.map((row, idx) => {
                    let name = 'Tâche Importée';
                    let hours = 0;

                    Object.keys(row).forEach(k => {
                        const nk = normalizeKey(k);
                        if (nk.includes('tache') || nk.includes('task')) name = row[k];
                        else if (nk.includes('heure') || nk.includes('hour') || nk.includes('prevue')) hours = Number(row[k]) || 0;
                    });

                    return {
                        id: `import-${Date.now()}-${idx}`,
                        name: String(name),
                        planned_hours: hours
                    };
                });

                if (newTasks.length > 0) {
                    if (window.confirm(`Ajouter ${newTasks.length} tâches depuis Excel ?`)) {
                        setTasks(prev => [...prev, ...newTasks]);
                    }
                } else {
                    alert("Aucune tâche trouvée dans le fichier Excel.");
                }
            } catch (err) {
                console.error("Excel parse error:", err);
                alert("Erreur lors de la lecture du fichier Excel.");
            }
        };
        reader.readAsArrayBuffer(file);
        e.target.value = ''; // Reset input
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-6 border-b border-slate-800 shrink-0">
                    <div>
                        <h2 className="text-xl font-bold text-white">Nouveau Chantier</h2>
                        <p className="text-xs text-slate-400">Configuration du projet et des tâches</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="overflow-y-auto p-6 custom-scrollbar grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* LEFT COLUMN: PROJECT INFO */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-blue-400 uppercase border-b border-blue-500/20 pb-2">1. Informations Projet</h3>

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
                                rows="2"
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

                        <div className="bg-slate-800 p-3 rounded border border-slate-700 mt-4">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Total Heures Calculé</label>
                            <div className="text-2xl font-mono font-bold text-white">{totalHours} h</div>
                            <p className="text-[10px] text-slate-500 italic">Somme des tâches ci-contre</p>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: TASKS */}
                    <div className="space-y-4 flex flex-col h-full">
                        <div className="flex justify-between items-center border-b border-blue-500/20 pb-2">
                            <h3 className="text-sm font-bold text-blue-400 uppercase">2. Tâches ({tasks.length})</h3>
                            <label className="cursor-pointer text-[10px] bg-green-600 hover:bg-green-500 text-white px-2 py-1 rounded flex items-center gap-1 transition-colors">
                                <span>Import Excel</span>
                                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleExcelImport} />
                            </label>
                        </div>

                        <div className="flex-1 bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden flex flex-col min-h-[300px]">
                            <div className="overflow-y-auto flex-1 p-2 space-y-2 custom-scrollbar">
                                {tasks.map((task, idx) => (
                                    <div key={task.id} className="flex gap-2 items-center bg-slate-800 p-2 rounded border border-slate-700/50 group">
                                        <div className="w-6 text-[10px] text-slate-500 font-mono text-center">{idx + 1}</div>
                                        <div className="flex-1">
                                            <div className="text-sm text-slate-200 font-medium">{task.name}</div>
                                        </div>
                                        <div className="w-16">
                                            <input
                                                type="number"
                                                className="w-full bg-slate-900 border border-slate-700 rounded px-1 text-right text-xs text-blue-300 font-mono focus:border-blue-500 outline-none"
                                                value={task.planned_hours}
                                                onChange={(e) => {
                                                    const val = Number(e.target.value) || 0;
                                                    setTasks(tasks.map(t => t.id === task.id ? { ...t, planned_hours: val } : t));
                                                }}
                                            />
                                        </div>
                                        <button onClick={() => removeTask(task.id)} className="text-slate-600 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                                {tasks.length === 0 && (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-500 p-8 text-center opacity-50">
                                        <p className="text-sm mb-2">Aucune tâche</p>
                                        <p className="text-xs">Ajoutez manuellement ou importez un Excel</p>
                                    </div>
                                )}
                            </div>

                            {/* Add Task Footer */}
                            <div className="p-2 bg-slate-800 border-t border-slate-700 flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Nom tâche..."
                                    className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                                    value={newTaskName}
                                    onChange={(e) => setNewTaskName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                                />
                                <input
                                    type="number"
                                    placeholder="Heures"
                                    className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                                    value={newTaskHours}
                                    onChange={(e) => setNewTaskHours(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                                />
                                <button
                                    type="button"
                                    onClick={handleAddTask}
                                    className="bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded text-xs font-bold"
                                >
                                    +
                                </button>
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
                            disabled={!projectInfo.name || tasks.length === 0}
                            className={`px-6 py-2 font-bold rounded-lg shadow-lg transition-all text-sm flex items-center gap-2 ${!projectInfo.name || tasks.length === 0
                                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20'
                                }`}
                        >
                            {(!projectInfo.name) ? 'Nom requis' : (tasks.length === 0 ? 'Ajouter une tâche' : 'Créer Chantier')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AddSiteModal;
