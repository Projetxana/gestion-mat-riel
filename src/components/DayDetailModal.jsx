import React, { useState } from 'react';
import { X, Clock, MapPin, Trash2, Save, Calendar } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

const DayDetailModal = ({ dateStr, sessions, sites, projectTasks, onClose }) => {
    const { updateTimeSession, deleteTimeSession } = useAppContext();
    const [editingSessionId, setEditingSessionId] = useState(null);
    const [editForm, setEditForm] = useState({});

    // Sort sessions by start time
    const sortedSessions = [...sessions].sort((a, b) => new Date(a.punch_start_at) - new Date(b.punch_start_at));

    const handleEditClick = (session) => {
        setEditingSessionId(session.id);
        setEditForm({
            start: new Date(session.punch_start_at).toTimeString().slice(0, 5),
            end: session.punch_end_at ? new Date(session.punch_end_at).toTimeString().slice(0, 5) : '',
        });
    };

    const handleSave = async (sessionId) => {
        const session = sessions.find(s => s.id === sessionId);
        if (!session) return;

        const originalStart = new Date(session.punch_start_at);
        const originalEnd = session.punch_end_at ? new Date(session.punch_end_at) : new Date();

        // Construct new Dates keeping the original Day
        const newStart = new Date(originalStart);
        const [startH, startM] = editForm.start.split(':');
        newStart.setHours(startH, startM);

        let newEnd = null;
        if (editForm.end) {
            newEnd = new Date(originalEnd);
            // Handle day crossing if needed? For now assume same day or original day logic
            // If original session crossed midnight, we need to be careful.
            // Simplified: Assume end is same day as start unless original was different.
            // Let's use the original END date day, but update time.
            // If no original end, use start date day.
            const baseEndDate = session.punch_end_at ? new Date(session.punch_end_at) : new Date(originalStart);
            const [endH, endM] = editForm.end.split(':');
            baseEndDate.setHours(endH, endM);
            newEnd = baseEndDate;
        }

        const updates = {
            punch_start_at: newStart.toISOString(),
            punch_end_at: newEnd ? newEnd.toISOString() : null,
            manual_entry: true // Mark as manually edited?
        };

        if (session.duration_hours) {
            // If we update times, we should probably clear fixed duration if we want it recalculated?
            // OR we calculate new duration here.
            // AppContext updateTimeSession just updates fields.
            // BE usually recalculates or we do it.
            // Let's rely on DB triggers OR calculate simple diff here if we want immediate UI update
            if (newEnd) {
                const diff = (newEnd - newStart) / (1000 * 60 * 60);
                updates.duration_hours = diff;
            }
        }

        await updateTimeSession(sessionId, updates);
        setEditingSessionId(null);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-lg rounded-2xl p-6 shadow-2xl flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <Calendar className="text-blue-600" />
                            {dateStr}
                        </h3>
                        <p className="text-slate-500 text-sm">Détail des activités</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <X size={24} className="text-slate-400" />
                    </button>
                </div>

                <div className="space-y-4 overflow-y-auto flex-1 pr-2">
                    {sortedSessions.length === 0 ? (
                        <p className="text-center text-slate-400 py-8 italic">Aucune activité enregistrée ce jour-là.</p>
                    ) : (
                        sortedSessions.map(session => {
                            const isEditing = editingSessionId === session.id;
                            const site = sites.find(s => String(s.id) === String(session.site_id));
                            const taskName = projectTasks?.find(t => String(t.id) === String(session.section_id))?.name || 'Tâche inconnue';

                            return (
                                <div key={session.id} className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <h4 className="font-bold text-slate-800">{site?.name || 'Chantier Inconnu'}</h4>
                                            <p className="text-xs text-slate-500">{taskName}</p>
                                        </div>
                                        {!isEditing && (
                                            <button
                                                onClick={() => handleEditClick(session)}
                                                className="text-blue-600 text-xs font-bold hover:underline"
                                            >
                                                Modifier
                                            </button>
                                        )}
                                    </div>

                                    {isEditing ? (
                                        <div className="space-y-3 mt-2 bg-white p-3 rounded-lg border border-blue-100">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="text-xs text-slate-400 font-bold uppercase block mb-1">Début</label>
                                                    <input
                                                        type="time"
                                                        value={editForm.start}
                                                        onChange={e => setEditForm(prev => ({ ...prev, start: e.target.value }))}
                                                        className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm font-bold text-slate-700"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-xs text-slate-400 font-bold uppercase block mb-1">Fin</label>
                                                    <input
                                                        type="time"
                                                        value={editForm.end}
                                                        onChange={e => setEditForm(prev => ({ ...prev, end: e.target.value }))}
                                                        className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm font-bold text-slate-700"
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex justify-end gap-2 pt-2">
                                                <button
                                                    onClick={async () => {
                                                        if (window.confirm("Êtes-vous sûr de vouloir supprimer cette entrée ?")) {
                                                            await deleteTimeSession(session.id);
                                                            // List updates automatically via context
                                                        }
                                                    }}
                                                    className="px-3 py-1.5 text-xs font-bold text-red-500 hover:bg-red-50 hover:text-red-700 rounded-lg flex items-center gap-1 mr-auto"
                                                >
                                                    <Trash2 size={14} /> Supprimer
                                                </button>

                                                <button
                                                    onClick={() => setEditingSessionId(null)}
                                                    className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg"
                                                >
                                                    Annuler
                                                </button>
                                                <button
                                                    onClick={() => handleSave(session.id)}
                                                    className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-1"
                                                >
                                                    <Save size={14} /> Enregistrer
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-4 text-sm text-slate-600 mt-2">
                                            <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded border border-slate-200">
                                                <Clock size={14} className="text-slate-400" />
                                                <span>{new Date(session.punch_start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                <span className="text-slate-300">-</span>
                                                <span>
                                                    {session.punch_end_at
                                                        ? new Date(session.punch_end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                        : <span className="text-green-500 font-bold">En cours</span>
                                                    }
                                                </span>
                                            </div>
                                            {session.punch_end_at && (
                                                <span className="text-xs font-bold text-slate-400">
                                                    {Math.round(((new Date(session.punch_end_at) - new Date(session.punch_start_at)) / 3600000) * 10) / 10} h
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 text-center">
                    <button
                        onClick={onClose}
                        className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                    >
                        Fermer
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DayDetailModal;
