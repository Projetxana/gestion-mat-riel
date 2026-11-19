import React, { useState } from 'react';
import { BarChart3, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useCompanyPerformance } from '../hooks/useCompanyPerformance';

const CompanyPerformanceSettings = () => {
    const { enabled, isAdmin, loading, error, saveEnabled } = useCompanyPerformance();
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    if (loading || !isAdmin) return null;

    const toggle = async (value) => {
        setSaving(true);
        setMessage('');
        try {
            const response = await saveEnabled(value);
            setMessage(response.success
                ? (value ? 'Module de performance activé pour votre entreprise.' : 'Module masqué. Les rapports existants sont conservés.')
                : response.error);
        } finally {
            setSaving(false);
        }
    };

    return (
        <section aria-label="Performance des chantiers" className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                <BarChart3 size={19} className="text-blue-600" />
                <h3 className="font-bold text-slate-800">Performance de main-d'œuvre (IPMO)</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={enabled}
                        disabled={saving || !!error}
                        onChange={event => void toggle(event.target.checked)}
                        className="w-5 h-5 accent-blue-600 shrink-0"
                    />
                    <span className="font-semibold text-slate-800">Activer le suivi de performance des chantiers</span>
                </label>
                <p className="text-sm text-slate-600">
                    Optionnel et désactivé par défaut. Un administrateur valide l'avancement physique
                    des tâches à son rythme. Les compagnons continuent uniquement de saisir leurs heures.
                    L'indice est calculé à la validation et chaque bilan reste dans l'historique.
                </p>
                <p className="text-xs text-slate-500">La désactivation masque l'outil sans supprimer les bilans déjà validés.</p>
                {(error || message) && (
                    <p role={error ? 'alert' : 'status'} className={`flex items-center gap-2 text-sm ${error || message.startsWith('Seul') ? 'text-red-600' : 'text-emerald-700'}`}>
                        {error ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                        {error || message}
                    </p>
                )}
            </div>
        </section>
    );
};

export default CompanyPerformanceSettings;
