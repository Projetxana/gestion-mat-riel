import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import BuildTrackLogo from '../components/BuildTrackLogo';
import { supabase } from '../supabaseClient';
import pkg from '../../package.json';

const LoginPage = () => {
    const { login } = useAppContext();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [recoveryOpen, setRecoveryOpen] = useState(false);
    const [recoveryBusy, setRecoveryBusy] = useState(false);
    const [recoveryNotice, setRecoveryNotice] = useState('');
    const [recoveryError, setRecoveryError] = useState('');

    const handleLogin = async (e) => {
        e.preventDefault();
        if (isSubmitting) return;
        setIsSubmitting(true);
        setError('');
        try {
            const loginError = await login(email, password);
            if (loginError) {
                setError('Email ou mot de passe incorrect');
                return;
            }
            navigate('/', { replace: true });
        } catch (error) {
            console.error('Login failed:', error);
            setError('Connexion indisponible. Veuillez réessayer.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRecovery = async (event) => {
        event.preventDefault();
        if (recoveryBusy) return;
        setRecoveryBusy(true);
        setRecoveryNotice('');
        setRecoveryError('');
        try {
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(
                email.trim().toLowerCase(),
                { redirectTo: `${window.location.origin}/activate` }
            );
            if (resetError) throw resetError;
            // Keep the same response whether or not the email has an account.
            setRecoveryNotice('Si un compte existe pour cette adresse, un lien de récupération a été envoyé. Vérifiez votre boîte courriel et ouvrez le lien le plus récent.');
        } catch {
            setRecoveryError('Impossible d’envoyer le lien pour le moment. Réessayez plus tard.');
        } finally {
            setRecoveryBusy(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <div className="glass-panel w-full max-w-md p-8">
                <div className="text-center mb-8">
                    <BuildTrackLogo size={180} />
                    <p className="text-slate-400 text-base mt-3">Gestion de chantier intelligente</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
                            <input
                                type="email"
                                required
                                placeholder="Entrez votre email"
                                value={email}
                                onChange={(e) => {
                                    setEmail(e.target.value);
                                    setError('');
                                }}
                                className="w-full p-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder:text-slate-600"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Mot de passe</label>
                            <input
                                type="password"
                                required
                                placeholder="Entrez votre mot de passe"
                                value={password}
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    setError('');
                                }}
                                className="w-full p-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder:text-slate-600"
                            />
                            {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        <span>{isSubmitting ? 'Connexion…' : 'Se connecter'}</span>
                    </button>
                </form>

                <div className="mt-4 text-center">
                    <button
                        type="button"
                        className="text-sm text-blue-400 underline hover:text-blue-300"
                        onClick={() => {
                            setRecoveryOpen(prev => !prev);
                            setRecoveryNotice('');
                            setRecoveryError('');
                        }}
                    >
                        {recoveryOpen ? 'Masquer la récupération' : 'Mot de passe oublié ?'}
                    </button>
                </div>
                {recoveryOpen && (
                    <form onSubmit={handleRecovery} className="mt-4 space-y-3 rounded-xl border border-slate-700 p-4">
                        <p className="text-sm text-slate-300">
                            Un lien de réinitialisation à usage unique sera envoyé à votre adresse courriel.
                        </p>
                        <label htmlFor="recovery-email" className="block text-sm font-medium text-slate-300">Courriel du compte</label>
                        <input
                            id="recovery-email"
                            type="email"
                            autoComplete="email"
                            required
                            value={email}
                            onChange={(event) => {
                                setEmail(event.target.value);
                                setRecoveryNotice('');
                                setRecoveryError('');
                            }}
                            className="w-full rounded-lg border border-slate-700 bg-slate-900 p-3 text-white"
                        />
                        <button
                            type="submit"
                            disabled={recoveryBusy}
                            className="w-full rounded-lg bg-slate-700 px-4 py-3 font-semibold text-white disabled:opacity-50"
                        >
                            {recoveryBusy ? 'Envoi…' : 'Recevoir le lien de récupération'}
                        </button>
                        {recoveryNotice && <p role="status" className="text-sm text-green-300">{recoveryNotice}</p>}
                        {recoveryError && <p role="alert" className="text-sm text-red-300">{recoveryError}</p>}
                    </form>
                )}

                <div className="mt-8 text-center text-xs text-slate-500">
                    <button 
                        type="button" 
                        onClick={() => navigate('/onboarding')}
                        className="text-blue-400 hover:text-blue-300 underline mb-4 inline-block"
                    >
                        Nouvelle entreprise ? Rejoignez le mode SaaS
                    </button>
                    <p>Build Track - v{pkg.version}</p>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
