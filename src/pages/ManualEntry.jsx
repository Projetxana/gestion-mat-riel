import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ManualEntry = () => {
    const { sites, projectTasks, logManualTime } = useAppContext();
    const navigate = useNavigate();

    const [siteId, setSiteId] = useState('');
    const [taskId, setTaskId] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!siteId || !taskId || !date || !startTime || !endTime) {
            alert("Veuillez remplir tous les champs");
            return;
        }

        setIsSubmitting(true);

        const startAt = new Date(`${date}T${startTime}`);
        const endAt = new Date(`${date}T${endTime}`);

        if (endAt <= startAt) {
            alert("L'heure de fin doit être après l'heure de début");
            setIsSubmitting(false);
            return;
        }

        const result = await logManualTime(siteId, taskId, startAt, endAt);

        setIsSubmitting(false);

        if (result.success) {
            alert("Entrée ajoutée avec succès !");
            navigate('/timetracking');
        } else {
            alert("Erreur: " + result.error);
        }
    };

    return (
        <div className="max-w-md mx-auto pb-24">
            <div className="flex items-center gap-2 mb-6">
                <button
                    onClick={() => navigate('/timetracking')}
                    className="p-2 -ml-2 text-slate-400 hover:text-slate-600"
                >
                    <ArrowLeft />
                </button>
                <h1 className="text-xl font-bold text-slate-800">Ajout Manuel</h1>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">

                {/* Site */}
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Chantier</label>
                    <div className="relative">
                        <select
                            value={siteId}
                            onChange={e => {
                                setSiteId(e.target.value);
                                setTaskId(''); // Reset task on site change
                            }}
                            className="w-full p-4 rounded-xl font-bold appearance-none border border-slate-300 shadow-sm focus:ring-2 focus:ring-blue-500"
                            style={{
                                backgroundColor: '#ffffff',
                                color: '#000000',
                                WebkitTextFillColor: '#000000',
                                opacity: 1
                            }}
                        >
                            <option value="" disabled>Sélectionner un chantier...</option>
                            {sites.filter(s => s.status === 'active').sort((a, b) => a.name.localeCompare(b.name)).map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                            <ArrowLeft className="-rotate-90" size={20} />
                        </div>
                    </div>
                </div>

                {/* Task */}
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Tâche</label>
                    <div className="relative">
                        {(() => {
                            const liveSiteTasks = projectTasks && projectTasks.length > 0
                                ? projectTasks.filter(pt => String(pt.project_id) === String(siteId))
                                : [];

                            const selectedSite = sites.find(s => String(s.id) === String(siteId));
                            const legacyTasks = selectedSite?.tasks || [];

                            const tasksToDisplay = liveSiteTasks.length > 0 ? liveSiteTasks : legacyTasks;

                            if (!siteId) {
                                return (
                                    <select disabled className="w-full p-4 rounded-xl font-bold appearance-none border border-slate-300 shadow-sm opacity-50" style={{ backgroundColor: '#ffffff', color: '#000000', WebkitTextFillColor: '#000000', opacity: 1 }}>
                                        <option>Sélectionner d'abord un chantier...</option>
                                    </select>
                                );
                            }

                            if (tasksToDisplay.length === 0) {
                                return (
                                    <select disabled className="w-full p-4 rounded-xl font-bold appearance-none border border-red-300 shadow-sm" style={{ backgroundColor: '#ffffff', color: '#ef4444', WebkitTextFillColor: '#ef4444', opacity: 1 }}>
                                        <option>Aucune section définie pour ce chantier</option>
                                    </select>
                                );
                            }

                            return (
                                <select
                                    value={taskId}
                                    onChange={e => setTaskId(e.target.value)}
                                    className="w-full p-4 rounded-xl font-bold appearance-none border border-slate-300 shadow-sm focus:ring-2 focus:ring-blue-500"
                                    style={{ backgroundColor: '#ffffff', color: '#000000', WebkitTextFillColor: '#000000', opacity: 1 }}
                                >
                                    <option value="" disabled>Sélectionner une tâche...</option>
                                    {tasksToDisplay.map(t => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                </select>
                            );
                        })()}
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                            <ArrowLeft className="-rotate-90" size={20} />
                        </div>
                    </div>
                </div>

                {/* Date & Time */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Date</label>
                        <input
                            type="date"
                            value={date}
                            onChange={e => setDate(e.target.value)}
                            className="w-full p-2 bg-slate-50 rounded-lg border-none font-bold text-slate-800"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Début</label>
                            <input
                                type="time"
                                value={startTime}
                                onChange={e => setStartTime(e.target.value)}
                                className="w-full p-2 bg-slate-50 rounded-lg border-none font-bold text-slate-800"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Fin</label>
                            <input
                                type="time"
                                value={endTime}
                                onChange={e => setEndTime(e.target.value)}
                                className="w-full p-2 bg-slate-50 rounded-lg border-none font-bold text-slate-800"
                            />
                        </div>
                    </div>
                </div>

                {/* Submit */}
                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                    {isSubmitting ? 'Enregistrement...' : 'Enregistrer'}
                    {!isSubmitting && <CheckCircle size={20} />}
                </button>
            </form>
        </div>
    );
};

export default ManualEntry;
