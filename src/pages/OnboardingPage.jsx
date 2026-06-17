import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building, Plus, Mail } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAppContext } from '../context/AppContext';

const OnboardingPage = () => {
    const navigate = useNavigate();
    const { saasSession, signupSaaS, loginSaaS, createCompanySaaS, joinCompanySaaS } = useAppContext();

    const [isLoginMode, setIsLoginMode] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    
    // SaaS state
    const [companyName, setCompanyName] = useState('');
    const [inviteToken, setInviteToken] = useState('');
    const [action, setAction] = useState('create'); // 'create' or 'join'
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleAuth = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            if (isLoginMode) {
                const err = await loginSaaS(email, password);
                if (err) setError(err);
            } else {
                const err = await signupSaaS(email, password);
                if (err) setError(err);
            }
        } catch (err) {
            setError(err.message || 'Erreur authentification');
        } finally {
            setLoading(false);
        }
    };

    const handleCompanyAction = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            if (action === 'create') {
                const err = await createCompanySaaS(companyName);
                if (!err) navigate('/');
                else setError(err);
            } else {
                const err = await joinCompanySaaS(inviteToken);
                if (!err) navigate('/');
                else setError(err);
            }
        } catch (err) {
            setError(err.message || 'Erreur action entreprise');
        } finally {
            setLoading(false);
        }
    };

    if (saasSession) {
        // User is logged in via Supabase Auth. They can now create or join a company.
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
                <div className="glass-panel w-full max-w-md p-8">
                    <div className="text-center mb-8">
                        <Building className="h-16 w-16 mx-auto mb-4 text-blue-400" />
                        <h2 className="text-2xl font-bold text-white mb-2">Configurez votre Espace</h2>
                        <p className="text-slate-400">Créez une nouvelle entreprise ou rejoignez une existante avec un token.</p>
                    </div>

                    <div className="flex gap-2 mb-6">
                        <button
                            onClick={() => setAction('create')}
                            className={`flex-1 py-2 rounded-lg font-medium transition-colors ${action === 'create' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                        >
                            Créer
                        </button>
                        <button
                            onClick={() => setAction('join')}
                            className={`flex-1 py-2 rounded-lg font-medium transition-colors ${action === 'join' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                        >
                            Rejoindre
                        </button>
                    </div>

                    <form onSubmit={handleCompanyAction} className="space-y-6">
                        {action === 'create' ? (
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Nom de l'entreprise</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ex: Ma Construction SaaS"
                                    value={companyName}
                                    onChange={(e) => setCompanyName(e.target.value)}
                                    className="w-full p-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-600"
                                />
                            </div>
                        ) : (
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Token d'invitation</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Collez le token ici"
                                    value={inviteToken}
                                    onChange={(e) => setInviteToken(e.target.value)}
                                    className="w-full p-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-600"
                                />
                            </div>
                        )}
                        
                        {error && <p className="text-red-500 text-sm">{error}</p>}
                        
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                        >
                            {loading ? 'Chargement...' : (action === 'create' ? 'Créer l\'entreprise' : 'Rejoindre')}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    // Sign up / Log in mode for SaaS
    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
            <div className="glass-panel w-full max-w-md p-8">
                <div className="text-center mb-8">
                    <img src="/buildtrack-logo.png" alt="Build Track" className="h-28 mx-auto mb-4 object-contain" />
                    <h2 className="text-2xl font-bold text-white mb-2">Build Track</h2>
                    <p className="text-slate-400">{isLoginMode ? 'Connectez-vous à votre compte' : 'Inscrivez-vous pour créer votre espace'}</p>
                </div>

                <form onSubmit={handleAuth} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
                        <input
                            type="email"
                            required
                            placeholder="votre@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full p-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-600"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Mot de passe</label>
                        <input
                            type="password"
                            required
                            placeholder="Minimum 6 caractères"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full p-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-600"
                        />
                    </div>

                    {error && <p className="text-red-500 text-sm mt-1">{error}</p>}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full mt-4 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        {isLoginMode ? 'Se Connecter' : 'S\'inscrire'}
                    </button>
                </form>

                <div className="mt-6 text-center text-sm text-slate-400">
                    <button onClick={() => setIsLoginMode(!isLoginMode)} className="text-blue-400 hover:text-blue-300 underline">
                        {isLoginMode ? "Pas encore de compte ? S'inscrire" : "Déjà un compte ? Se connecter"}
                    </button>
                    <div className="mt-4">
                        <button onClick={() => navigate('/login')} className="text-slate-500 hover:text-slate-300">
                            Retourner à la connexion classique
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OnboardingPage;
