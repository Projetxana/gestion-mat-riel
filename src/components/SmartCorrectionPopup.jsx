import React, { useState } from 'react';
import { Clock, ArrowRight, AlertTriangle, Zap } from 'lucide-react';

/**
 * SmartCorrectionPopup — Time-based intelligent correction
 * 
 * START: If punching in after 6:00 AM → propose to set start to 6:00 AM
 * END: If punching out after 13:45 → propose to set end to 13:45
 * 
 * Goal: Normalize to 8h days / 40h weeks
 */
const SmartCorrectionPopup = ({ type, onConfirm, onCancel }) => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();

    // Standard times
    const STANDARD_START_HOUR = 6;
    const STANDARD_START_MIN = 0;
    const STANDARD_END_HOUR = 13;
    const STANDARD_END_MIN = 45;

    // Build the standard time for comparison
    const standardTime = new Date(now);
    if (type === 'start') {
        standardTime.setHours(STANDARD_START_HOUR, STANDARD_START_MIN, 0, 0);
    } else {
        standardTime.setHours(STANDARD_END_HOUR, STANDARD_END_MIN, 0, 0);
    }

    // Calculate difference in minutes
    const diffMs = Math.abs(now.getTime() - standardTime.getTime());
    const diffMinutes = Math.round(diffMs / 60000);

    // Should we show this popup?
    // START: only if after 6:00 AM and before ~8:00 AM (reasonable window)
    // END: only if after 13:45
    const shouldShow = type === 'start'
        ? (hours >= STANDARD_START_HOUR && hours < 8 && diffMinutes > 0)
        : (hours >= STANDARD_END_HOUR || (hours === STANDARD_END_HOUR && minutes >= STANDARD_END_MIN));

    if (!shouldShow) {
        // Auto-confirm with current time
        setTimeout(() => onConfirm(now, false), 0);
        return null;
    }

    const [useStandard, setUseStandard] = useState(true);

    const formatTime = (date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const handleConfirm = () => {
        if (useStandard) {
            onConfirm(standardTime, true);
        } else {
            onConfirm(now, false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl">
                <div className="bg-blue-50 p-4 border-b border-blue-100 flex items-center gap-3">
                    <div className="bg-blue-100 p-2 rounded-full text-blue-600">
                        <Zap size={24} />
                    </div>
                    <div>
                        <h3 className="font-bold text-blue-900">Correction Intelligente</h3>
                        <p className="text-xs text-blue-700">
                            {type === 'start' ? 'Ajustement de début de journée' : 'Ajustement de fin de journée'}
                            {diffMinutes > 0 && ` (${diffMinutes} min)`}
                        </p>
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    <p className="text-sm text-slate-600">
                        {type === 'start'
                            ? `Il est ${formatTime(now)}. Souhaitez-vous démarrer votre journée à 6h00 ?`
                            : `Il est ${formatTime(now)}. Souhaitez-vous terminer votre journée à 13h45 ?`}
                        <br />
                        <span className="font-bold mt-2 block">Quelle heure voulez-vous utiliser ?</span>
                    </p>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Option A: Current time */}
                        <button
                            onClick={() => setUseStandard(false)}
                            className={`p-4 rounded-xl border-2 text-left transition-all relative ${!useStandard
                                ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-500/20'
                                : 'border-slate-200 hover:border-slate-300'
                                }`}
                        >
                            <span className="block text-xs font-bold text-slate-400 uppercase mb-1">Mon Heure</span>
                            <span className="block text-xl font-bold text-slate-900">{formatTime(now)}</span>
                            <Clock className={`absolute top-3 right-3 ${!useStandard ? 'text-blue-500' : 'text-slate-300'}`} size={18} />
                        </button>

                        {/* Option B: Standard time */}
                        <button
                            onClick={() => setUseStandard(true)}
                            className={`p-4 rounded-xl border-2 text-left transition-all relative ${useStandard
                                ? 'border-green-600 bg-green-50 ring-2 ring-green-500/20'
                                : 'border-slate-200 hover:border-slate-300'
                                }`}
                        >
                            <span className="block text-xs font-bold text-green-600 uppercase mb-1">
                                {type === 'start' ? 'Heure Standard' : 'Heure Standard'}
                            </span>
                            <span className="block text-xl font-bold text-slate-900">{formatTime(standardTime)}</span>
                            <Zap className={`absolute top-3 right-3 ${useStandard ? 'text-green-500' : 'text-slate-300'}`} size={18} />
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
                            onClick={handleConfirm}
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
