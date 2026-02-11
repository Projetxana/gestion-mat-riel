import React, { useState } from 'react';
import { Clock, MapPin, AlertTriangle, ArrowRight, X } from 'lucide-react';

const SmartCorrectionPopup = ({ title, punchTime, gpsTime, type, onConfirm, onCancel }) => {
    // Type: 'start' | 'end'
    // Default to keep manual unless user opts for GPS
    const [useGps, setUseGps] = useState(true);

    if (!gpsTime) return null;

    const safeDate = (d) => {
        const date = new Date(d);
        return isNaN(date.getTime()) ? new Date() : date;
    };

    const validPunch = safeDate(punchTime);
    const validGps = safeDate(gpsTime);

    const timeDiffMinutes = Math.round(Math.abs(validPunch - validGps) / 60000);

    const formatTime = (date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl">
                <div className="bg-amber-50 p-4 border-b border-amber-100 flex items-center gap-3">
                    <div className="bg-amber-100 p-2 rounded-full text-amber-600">
                        <AlertTriangle size={24} />
                    </div>
                    <div>
                        <h3 className="font-bold text-amber-900">{title || 'Correction Intelligente'}</h3>
                        <p className="text-xs text-amber-700">Décalage détecté ({timeDiffMinutes} min)</p>
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    <p className="text-sm text-slate-600">
                        {type === 'start'
                            ? "Vous commencez la journée, mais le GPS vous a détecté sur site plus tôt."
                            : "Vous terminez la journée, mais le GPS vous a vu partir du chantier plus tôt."}
                        <br />
                        <span className="font-bold mt-2 block">Quelle heure voulez-vous utiliser ?</span>
                    </p>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Option A: Manual (Punch) */}
                        <button
                            onClick={() => setUseGps(false)}
                            className={`p-4 rounded-xl border-2 text-left transition-all relative ${!useGps
                                ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-500/20'
                                : 'border-slate-200 hover:border-slate-300'
                                }`}
                        >
                            <span className="block text-xs font-bold text-slate-400 uppercase mb-1">Mon Heure</span>
                            <span className="block text-xl font-bold text-slate-900">{formatTime(validPunch)}</span>
                            <Clock className={`absolute top-3 right-3 ${!useGps ? 'text-blue-500' : 'text-slate-300'}`} size={18} />
                        </button>

                        {/* Option B: GPS */}
                        <button
                            onClick={() => setUseGps(true)}
                            className={`p-4 rounded-xl border-2 text-left transition-all relative ${useGps
                                ? 'border-green-600 bg-green-50 ring-2 ring-green-500/20'
                                : 'border-slate-200 hover:border-slate-300'
                                }`}
                        >
                            <span className="block text-xs font-bold text-slate-400 uppercase mb-1">Heure GPS</span>
                            <span className="block text-xl font-bold text-slate-900">{formatTime(validGps)}</span>
                            <MapPin className={`absolute top-3 right-3 ${useGps ? 'text-green-500' : 'text-slate-300'}`} size={18} />
                        </button>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={onCancel}
                            className="flex-1 py-3 text-slate-400 font-bold hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-colors"
                        >
                            Ignorer
                        </button>
                        <button
                            onClick={() => onConfirm(useGps ? gpsTime : punchTime, useGps)}
                            className="flex-1 py-3 bg-slate-900 text-white font-bold rounded-xl shadow-lg shadow-slate-900/20 hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                        >
                            Confirmer
                            <ArrowRight size={18} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SmartCorrectionPopup;
