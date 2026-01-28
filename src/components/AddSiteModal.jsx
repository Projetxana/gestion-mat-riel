import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

const AddSiteModal = ({ onClose }) => {
    const { addSite } = useAppContext();
    const [formData, setFormData] = useState({
        name: '',
        address: '',
        status: 'active',
        email: ''
    });

    const [tasks, setTasks] = useState([
        { id: 't1', name: 'Installation' },
        { id: 't2', name: 'Inspection' },
        { id: 't3', name: 'Maintenance' },
        { id: 't4', name: 'Transport' },
        { id: 't5', name: 'Autre' }
    ]);
    const [newTaskName, setNewTaskName] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        addSite({ ...formData, tasks });
        onClose();
    };

    const handleAddTask = () => {
        if (!newTaskName.trim()) return;
        const newTask = {
            id: `t-${Date.now()}`,
            name: newTaskName.trim()
        };
        setTasks([...tasks, newTask]);
        setNewTaskName('');
    };

    const removeTask = (id) => {
        setTasks(tasks.filter(t => t.id !== id));
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-6 border-b border-slate-800 shrink-0">
                    <h2 className="text-xl font-bold text-white">Nouveau Chantier</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="overflow-y-auto p-6 space-y-6 custom-scrollbar">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-1">Nom du Chantier</label>
                            <input
                                type="text"
                                required
                                placeholder="ex: Projet Alpha"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-1">Heures Prévues (Total Chantier)</label>
                            <input
                                type="number"
                                min="0"
                                placeholder="ex: 450"
                                value={formData.planned_hours || ''}
                                onChange={(e) => setFormData({ ...formData, planned_hours: Number(e.target.value) })}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-1">Adresse / Lieu</label>
                            <textarea
                                required
                                rows="3"
                                placeholder="123 Rue de la Construction..."
                                value={formData.address}
                                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Date de Début</label>
                                <input
                                    type="date"
                                    value={formData.start_date || ''}
                                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Date de Fin (Estimée)</label>
                                <input
                                    type="date"
                                    value={formData.end_date || ''}
                                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-2">Tâches Disponibles</label>
                            <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-3 mb-3 space-y-2">
                                {tasks.map(task => (
                                    <div key={task.id} className="flex justify-between items-center bg-slate-800 p-2 rounded border border-slate-700/50">
                                        <span className="text-sm text-slate-200">{task.name}</span>
                                        <button
                                            type="button"
                                            onClick={() => removeTask(task.id)}
                                            className="text-slate-500 hover:text-red-400"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                ))}
                                {tasks.length === 0 && <p className="text-xs text-slate-500 text-center py-2">Aucune tâche définie</p>}
                            </div>

                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Nouvelle tâche..."
                                    value={newTaskName}
                                    onChange={(e) => setNewTaskName(e.target.value)}
                                    // Prevent form submission on Enter
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTask(); } }}
                                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm text-white focus:border-blue-500 outline-none"
                                />
                                <button
                                    type="button"
                                    onClick={handleAddTask}
                                    className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
                                >
                                    Ajouter
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-slate-800 shrink-0 flex justify-end gap-3">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-white transition-colors">Annuler</button>
                    <button type="button" onClick={handleSubmit} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-lg shadow-blue-500/20 transition-all">
                        Créer Chantier
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AddSiteModal;
