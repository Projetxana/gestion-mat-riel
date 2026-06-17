import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building, Upload, Users, ChevronRight, Check, Mail, Plus, Trash2, Sparkles, Image } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

const STEPS = ['Bienvenue', 'Compagnie', 'Logo', 'Équipe', 'Terminé'];

const SetupWizard = () => {
    const navigate = useNavigate();
    const { createCompanySaaS, inviteEmployee, uploadCompanyLogo, companySetupComplete } = useAppContext();

    const [step, setStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Step 2: Company
    const [companyName, setCompanyName] = useState('');

    // Step 3: Logo
    const [logoFile, setLogoFile] = useState(null);
    const [logoPreview, setLogoPreview] = useState(null);
    const fileInputRef = useRef(null);

    // Step 4: Invites
    const [invites, setInvites] = useState([{ email: '', role: 'user' }]);
    const [sentInvites, setSentInvites] = useState([]);

    // If company already setup, redirect
    if (companySetupComplete === true) {
        navigate('/', { replace: true });
        return null;
    }

    const handleCreateCompany = async () => {
        if (!companyName.trim()) {
            setError('Le nom de la compagnie est requis');
            return;
        }
        setLoading(true);
        setError('');
        const err = await createCompanySaaS(companyName.trim());
        setLoading(false);
        if (err) {
            setError(err);
        } else {
            setStep(2);
        }
    };

    const handleLogoSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setLogoFile(file);
            const reader = new FileReader();
            reader.onloadend = () => setLogoPreview(reader.result);
            reader.readAsDataURL(file);
        }
    };

    const handleLogoUpload = async () => {
        if (!logoFile) {
            setStep(3); // Skip logo
            return;
        }
        setLoading(true);
        setError('');
        const result = await uploadCompanyLogo(logoFile);
        setLoading(false);
        if (result.error) {
            setError(result.error);
        } else {
            setStep(3);
        }
    };

    const handleSendInvites = async () => {
        const validInvites = invites.filter(i => i.email.trim());
        if (validInvites.length === 0) {
            setStep(4); // Skip invites
            return;
        }

        setLoading(true);
        setError('');
        const results = [];

        for (const inv of validInvites) {
            const result = await inviteEmployee(inv.email.trim(), inv.role);
            results.push({ email: inv.email, ...result });
        }

        setSentInvites(results);
        setLoading(false);
        setStep(4);
    };

    const addInviteRow = () => {
        setInvites([...invites, { email: '', role: 'user' }]);
    };

    const removeInviteRow = (index) => {
        setInvites(invites.filter((_, i) => i !== index));
    };

    const updateInvite = (index, field, value) => {
        const updated = [...invites];
        updated[index][field] = value;
        setInvites(updated);
    };

    // --- RENDERS ---

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
            {/* Progress Bar */}
            <div className="w-full max-w-md mb-8">
                <div className="flex items-center justify-between mb-2">
                    {STEPS.map((s, i) => (
                        <div key={i} className="flex items-center">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                                i < step ? 'bg-green-500 text-white' :
                                i === step ? 'bg-blue-600 text-white ring-4 ring-blue-500/30' :
                                'bg-slate-800 text-slate-500'
                            }`}>
                                {i < step ? <Check size={14} /> : i + 1}
                            </div>
                            {i < STEPS.length - 1 && (
                                <div className={`w-8 sm:w-12 h-0.5 mx-1 transition-all ${i < step ? 'bg-green-500' : 'bg-slate-800'}`} />
                            )}
                        </div>
                    ))}
                </div>
                <p className="text-center text-xs text-slate-500 mt-1">{STEPS[step]}</p>
            </div>

            <div className="w-full max-w-md">
                {/* STEP 0: Welcome */}
                {step === 0 && (
                    <div className="glass-panel p-8 text-center space-y-6 animate-in fade-in duration-500">
                        <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-3xl flex items-center justify-center mx-auto shadow-lg shadow-blue-500/30">
                            <Sparkles size={36} className="text-white" />
                        </div>
                        <h1 className="text-3xl font-black text-white">Bienvenue !</h1>
                        <p className="text-slate-400 leading-relaxed">
                            Configurons votre espace de travail en quelques étapes simples.
                            Vous pourrez ensuite inviter votre équipe à rejoindre l'application.
                        </p>
                        <button
                            onClick={() => setStep(1)}
                            className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-lg shadow-blue-600/30 transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                            Commencer la configuration
                            <ChevronRight size={20} />
                        </button>
                    </div>
                )}

                {/* STEP 1: Company Name */}
                {step === 1 && (
                    <div className="glass-panel p-8 space-y-6 animate-in fade-in duration-500">
                        <div className="text-center">
                            <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <Building size={32} className="text-blue-400" />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">Votre Entreprise</h2>
                            <p className="text-slate-400 text-sm">Quel est le nom de votre compagnie ?</p>
                        </div>

                        <div>
                            <input
                                type="text"
                                placeholder="Ex: Construction ABC Inc."
                                value={companyName}
                                onChange={(e) => setCompanyName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleCreateCompany()}
                                className="w-full p-4 bg-slate-900 border border-slate-700 rounded-xl text-white text-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-600"
                                autoFocus
                            />
                        </div>

                        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

                        <button
                            onClick={handleCreateCompany}
                            disabled={loading || !companyName.trim()}
                            className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl font-bold shadow-lg shadow-blue-600/30 transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                            {loading ? 'Création...' : 'Créer la compagnie'}
                            {!loading && <ChevronRight size={20} />}
                        </button>
                    </div>
                )}

                {/* STEP 2: Logo Upload */}
                {step === 2 && (
                    <div className="glass-panel p-8 space-y-6 animate-in fade-in duration-500">
                        <div className="text-center">
                            <div className="w-16 h-16 bg-purple-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <Image size={32} className="text-purple-400" />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">Logo de l'entreprise</h2>
                            <p className="text-slate-400 text-sm">Ajoutez votre logo pour personnaliser l'application</p>
                        </div>

                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-slate-700 rounded-2xl p-8 text-center cursor-pointer hover:border-blue-500 transition-all group"
                        >
                            {logoPreview ? (
                                <img src={logoPreview} alt="Preview" className="max-h-32 mx-auto object-contain rounded-lg" />
                            ) : (
                                <>
                                    <Upload size={40} className="mx-auto text-slate-600 group-hover:text-blue-400 transition-colors mb-3" />
                                    <p className="text-slate-500 group-hover:text-slate-300">Cliquez pour sélectionner un logo</p>
                                    <p className="text-xs text-slate-600 mt-1">PNG, JPG, SVG (max 2MB)</p>
                                </>
                            )}
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleLogoSelect}
                            className="hidden"
                        />

                        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setStep(3)}
                                className="py-3 text-slate-400 hover:text-white rounded-xl font-bold transition-all"
                            >
                                Passer
                            </button>
                            <button
                                onClick={handleLogoUpload}
                                disabled={loading}
                                className="py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-lg shadow-blue-600/30 transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                {loading ? 'Envoi...' : (logoFile ? 'Enregistrer' : 'Passer')}
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    </div>
                )}

                {/* STEP 3: Invite Team */}
                {step === 3 && (
                    <div className="glass-panel p-8 space-y-6 animate-in fade-in duration-500">
                        <div className="text-center">
                            <div className="w-16 h-16 bg-green-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <Users size={32} className="text-green-400" />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">Inviter votre équipe</h2>
                            <p className="text-slate-400 text-sm">Ajoutez les emails de vos employés</p>
                        </div>

                        <div className="space-y-3 max-h-[40vh] overflow-y-auto">
                            {invites.map((inv, i) => (
                                <div key={i} className="flex gap-2">
                                    <div className="flex-1">
                                        <input
                                            type="email"
                                            placeholder="email@exemple.com"
                                            value={inv.email}
                                            onChange={(e) => updateInvite(i, 'email', e.target.value)}
                                            className="w-full p-3 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none placeholder:text-slate-600"
                                        />
                                    </div>
                                    <select
                                        value={inv.role}
                                        onChange={(e) => updateInvite(i, 'role', e.target.value)}
                                        className="p-3 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value="user">Employé</option>
                                        <option value="leader">Chef d'équipe</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                    {invites.length > 1 && (
                                        <button
                                            onClick={() => removeInviteRow(i)}
                                            className="p-3 text-red-400 hover:text-red-300"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={addInviteRow}
                            className="w-full py-2 border border-dashed border-slate-700 rounded-lg text-slate-500 hover:text-blue-400 hover:border-blue-500 transition-all flex items-center justify-center gap-2 text-sm"
                        >
                            <Plus size={16} /> Ajouter un employé
                        </button>

                        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setStep(4)}
                                className="py-3 text-slate-400 hover:text-white rounded-xl font-bold transition-all"
                            >
                                Plus tard
                            </button>
                            <button
                                onClick={handleSendInvites}
                                disabled={loading}
                                className="py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold shadow-lg shadow-green-600/30 transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                {loading ? 'Envoi...' : 'Envoyer les invitations'}
                                <Mail size={18} />
                            </button>
                        </div>
                    </div>
                )}

                {/* STEP 4: Done */}
                {step === 4 && (
                    <div className="glass-panel p-8 text-center space-y-6 animate-in fade-in duration-500">
                        <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-400 rounded-3xl flex items-center justify-center mx-auto shadow-lg shadow-green-500/30">
                            <Check size={40} className="text-white" />
                        </div>
                        <h2 className="text-3xl font-black text-white">Tout est prêt !</h2>
                        <p className="text-slate-400 leading-relaxed">
                            Votre espace <span className="text-white font-bold">{companyName}</span> est configuré.
                            {sentInvites.length > 0 && (
                                <span> {sentInvites.filter(i => i.success).length} invitation(s) envoyée(s).</span>
                            )}
                        </p>

                        {sentInvites.length > 0 && (
                            <div className="bg-slate-900/50 rounded-xl p-4 space-y-2 text-left">
                                <p className="text-xs text-slate-500 uppercase font-bold mb-2">Tokens d'invitation</p>
                                {sentInvites.filter(i => i.success).map((inv, i) => (
                                    <div key={i} className="flex items-center justify-between bg-slate-800 p-3 rounded-lg">
                                        <span className="text-sm text-slate-300 truncate">{inv.email}</span>
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(inv.token);
                                                alert('Token copié !');
                                            }}
                                            className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg font-bold hover:bg-blue-500"
                                        >
                                            Copier Token
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <button
                            onClick={() => navigate('/', { replace: true })}
                            className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-lg shadow-blue-600/30 transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                            Commencer à utiliser l'application
                            <ChevronRight size={20} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SetupWizard;
