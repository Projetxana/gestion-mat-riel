import React, { useState } from 'react';
import { MapPin, Clock, ArrowRight, CheckCircle, AlertTriangle } from 'lucide-react';

const SmartCorrectionPopup = ({
    punchTime,
    gpsTime,
    type = 'start', // 'start' or 'end'
    onConfirm,
    onCancel
}) => {
    // If diff is small (< 5 mins), maybe skip? User requirement implies showing it if exists.
    // We'll trust the parent to decide when to show this.

    if (type === 'entry') {
        const siteName = gpsTime; // Hack: In entry mode, gpsTime argument is siteName
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                    <div className="bg-blue-600 p-6 text-white text-center">
                        <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                            <MapPin className="text-white" size={24} />
                        </div>
                        <h2 className="text-xl font-bold">Arrivée Détectée</h2>
                        <p className="text-blue-100 text-sm mt-1">
                            Vous êtes arrivé à <span className="font-bold text-white">{siteName}</span>
                        </p>
                    </div>
                    <div className="p-6">
                        <p className="text-slate-600 text-center font-medium mb-6">
                            Voulez-vous démarrer votre journée de travail maintenant ?
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={onCancel}
                                className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition-colors"
                            >
                                Non, plus tard
                            </button>
                            <button
                                onClick={onConfirm}
                                className="flex-1 py-3 bg-blue-600 text-white font-bold hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-500/30 transition-all"
                            >
                                Oui, Démarrer
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (type === 'reminder') {
        const timeString = gpsTime; // Hack: passing formatted time string
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                    <div className="bg-amber-500 p-6 text-white text-center">
                        <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                            <Clock className="text-white" size={24} />
                        </div>
                        <h2 className="text-xl font-bold">Rappel Horaire</h2>
                        <p className="text-amber-100 text-sm mt-1">
                            Il est <span className="font-bold text-white">{timeString}</span>.
                        </p>
                    </div>
                    <div className="p-6">
                        <p className="text-slate-600 text-center font-medium mb-6">
                            La journée commence à 6h00. Vous n'avez pas encore démarré votre session.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={onCancel}
                                className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition-colors"
                            >
                                Ignorer
                            </button>
                            <button
                                onClick={onConfirm}
                                className="flex-1 py-3 bg-amber-500 text-white font-bold hover:bg-amber-600 rounded-xl shadow-lg shadow-amber-500/30 transition-all"
                            >
                                Démarrer
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Default Correction Mode (Start/End)
    const [selectedSource, setSelectedSource] = useState(null); // 'punch' or 'gps'

    const formatTime = (date) => {
        if (!date) return '--:--';
        return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const getDiffMinutes = () => {
        if (!punchTime || !gpsTime) return 0;
        const diffMs = Math.abs(new Date(punchTime).getTime() - new Date(gpsTime).getTime());
        return Math.round(diffMs / 60000);
    };

    const handleConfirm = () => {
        if (!selectedSource) return;
        const correctedTime = selectedSource === 'gps' ? gpsTime : punchTime;
        onConfirm(correctedTime, selectedSource === 'gps'); // (time, isModified)
    };

    const diff = getDiffMinutes();

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="bg-blue-600 p-6 text-white text-center">
                    <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                        <MapPin className="text-white" size={24} />
                    </div>
                    <h2 className="text-xl font-bold">Correction Intelligente</h2>
                    <p className="text-blue-100 text-sm mt-1">
                        Nous avons détecté une différence de <span className="font-bold text-white">{diff} min</span> avec votre GPS.
                    </p>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    <p className="text-slate-600 text-center font-medium mb-4">
                        Quelle heure voulez-vous utiliser pour votre {type === 'start' ? 'arrivée' : 'départ'} ?
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                        {/* Option: PUNCH */}
                        <button
                            onClick={() => setSelectedSource('punch')}
                            className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-2 ${selectedSource === 'punch'
                                ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200'
                                : 'border-slate-100 bg-white hover:bg-slate-50'
                                }`}
                        >
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Punché</span>
                            <span className="text-2xl font-bold text-slate-800">{formatTime(punchTime)}</span>
                            {selectedSource === 'punch' && <CheckCircle size={16} className="text-blue-600" />}
                        </button>

                        {/* Option: GPS */}
                        <button
                            onClick={() => setSelectedSource('gps')}
                            className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-2 ${selectedSource === 'gps'
                                ? 'border-green-600 bg-green-50 ring-2 ring-green-200'
                                : 'border-slate-100 bg-white hover:bg-slate-50'
                                }`}
                        >
                            <span className="text-xs font-bold text-green-600 uppercase tracking-wider flex items-center gap-1">
                                <MapPin size={10} /> GPS
                            </span>
                            <span className="text-2xl font-bold text-green-700">{formatTime(gpsTime)}</span>
                            {selectedSource === 'gps' && <CheckCircle size={16} className="text-green-600" />}
                        </button>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-lg flex items-start gap-2 text-xs text-slate-500">
                        <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-500" />
                        <p>
                            Le contremaître verra les deux heures lors de la validation. Choisir l'heure GPS accélère souvent l'approbation.
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3">
                    <button
                        onClick={onCancel} // Fallback to original punch
                        className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition-colors"
                    >
                        Ignorer
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!selectedSource}
                        className={`flex-1 py-3 rounded-xl font-bold shadow-lg transition-all ${selectedSource
                            ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-blue-500/30'
                            : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                            }`}
                    >
                        Confirmer
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SmartCorrectionPopup;
