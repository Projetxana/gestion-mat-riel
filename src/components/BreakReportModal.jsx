import React, { useState } from 'react';
import { Coffee, Utensils, ArrowRight, Check } from 'lucide-react';

const BreakReportModal = ({ onConfirm, defaultLunchTaken = false, defaultBreaksTaken = 1 }) => {
    // State — initialized from user preferences
    const [lunchTaken, setLunchTaken] = useState(defaultLunchTaken);
    const [breaksTaken, setBreaksTaken] = useState(defaultBreaksTaken);

    const handleSubmit = () => {
        // Calculate Adjustment
        // 1. Lunch: If taken, we remove 30 mins (Unpaid). If NOT taken, we keep them (Paid).
        // WAIT: Usually "Hours" = "On Site" - "Unpaid Breaks".
        // So if I worked 8h-16h (8h total).
        // If I took lunch, I worked 7.5h. -> Deduct 30m.
        // If I didn't take lunch, I worked 8h. -> Deduct 0.
        // So: Lunch Taken -> -30m. Lunch Not Taken -> -0m.
        const lunchAdjustment = lunchTaken ? -30 : 0;

        // 2. Breaks: Paid.
        // If I take them, I am paid for them. (0 adjustment to standard time).
        // If I SKIP them, I should be paid EXTRA? "Il faut ajouter 15 min à son temps".
        // Base assumption: User is paid for the time on site.
        // If standard day includes breaks, they are paid.
        // If I skip a break, I worked 15m MORE than standard for the same "clock time"?
        // Or does it mean "I stayed 15m later"? No, "ajouter à son temps".
        // Interpret: If I skip a break, I get a bonus of 15m paid time.
        // 2 breaks taken -> +0.
        // 1 break taken -> +15.
        // 0 breaks taken -> +30.
        const breaksAdjustment = (2 - breaksTaken) * 15;

        const totalAdjustment = lunchAdjustment + breaksAdjustment;

        onConfirm({
            lunchTaken,
            breaksTaken,
            adjustmentMinutes: totalAdjustment
        });
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl">
                <div className="bg-slate-50 p-6 border-b border-slate-100 text-center">
                    <h2 className="text-xl font-bold text-slate-800">Rapport de Fin de Journée</h2>
                    <p className="text-slate-500 text-sm mt-1">Déclarez vos pauses pour le calcul des heures.</p>
                </div>

                <div className="p-6 space-y-8">
                    {/* LUNCH */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-3 text-slate-800 font-bold">
                            <div className="bg-blue-100 p-2 rounded-full text-blue-600">
                                <Utensils size={20} />
                            </div>
                            <h3>Pause Dîner (30 min)</h3>
                        </div>
                        <label className="flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition-all hover:bg-slate-50 border-slate-200 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                            <input
                                type="checkbox"
                                className="w-6 h-6 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                checked={lunchTaken}
                                onChange={(e) => setLunchTaken(e.target.checked)}
                            />
                            <span className="font-medium text-slate-700">J'ai pris mon dîner</span>
                            {lunchTaken && <span className="ml-auto text-xs font-bold text-slate-400">-30 min</span>}
                        </label>
                    </div>

                    {/* COFFEE BREAKS */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-3 text-slate-800 font-bold">
                            <div className="bg-amber-100 p-2 rounded-full text-amber-600">
                                <Coffee size={20} />
                            </div>
                            <h3>Pauses Café (15 min)</h3>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            {[1, 2].map(count => (
                                <button
                                    key={count}
                                    onClick={() => setBreaksTaken(count)}
                                    className={`py-3 rounded-xl border-2 font-bold transition-all relative overflow-hidden ${breaksTaken === count
                                            ? 'border-amber-500 bg-amber-50 text-amber-700'
                                            : 'border-slate-200 text-slate-400 hover:border-slate-300'
                                        }`}
                                >
                                    {count}
                                    <span className="block text-[10px] items-center uppercase font-bold mt-1">
                                        {count === 1 ? 'Pause' : 'Pauses'}
                                    </span>
                                    {breaksTaken === count && (
                                        <div className="absolute top-1 right-1">
                                            <Check size={12} />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                        <p className="text-center text-xs text-slate-400">
                            {breaksTaken === 2
                                ? "Standard (2 pauses payées)."
                                : `Bonus : +${(2 - breaksTaken) * 15} min (Pauses non prises).`
                            }
                        </p>
                    </div>

                    <button
                        onClick={handleSubmit}
                        className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-lg shadow-slate-900/20 text-lg flex items-center justify-center gap-2 transition-all active:scale-95"
                    >
                        Valider et Terminer
                        <ArrowRight size={20} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BreakReportModal;
