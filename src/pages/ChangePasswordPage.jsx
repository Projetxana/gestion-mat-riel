import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { ShieldCheck, Lock, Eye, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ChangePasswordPage = () => {
    const { changePassword, logout } = useAppContext();
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (password.length < 6) {
            setError('Le mot de passe doit contenir au moins 6 caractères');
            return;
        }

        if (password !== confirmPassword) {
            setError('Les mots de passe ne correspondent pas');
            return;
        }

        await changePassword(password);
        navigate('/');
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <div className="glass-panel w-full max-w-md p-8">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-500/30">
                        <ShieldCheck className="text-blue-400" size={32} />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Sécurité Requise</h1>
                    <p className="text-slate-400">
                        Pour votre sécurité, vous devez changer votre mot de passe temporaire pour continuer.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="change-password" className="block text-sm font-medium text-slate-300 mb-1">Nouveau mot de passe</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} aria-hidden="true" />
                                <input
                                    id="change-password"
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="new-password"
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full pl-10 pr-14 p-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder:text-slate-600"
                                    placeholder="Nouveau mot de passe"
                                />
                                <button
                                    type="button"
                                    aria-label={showPassword ? 'Masquer le nouveau mot de passe' : 'Afficher le nouveau mot de passe'}
                                    aria-pressed={showPassword}
                                    aria-controls="change-password"
                                    onClick={() => setShowPassword(value => !value)}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-lg text-slate-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
                                >
                                    {showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label htmlFor="change-confirm-password" className="block text-sm font-medium text-slate-300 mb-1">Confirmer le mot de passe</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} aria-hidden="true" />
                                <input
                                    id="change-confirm-password"
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    autoComplete="new-password"
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    required
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full pl-10 pr-14 p-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder:text-slate-600"
                                    placeholder="Confirmer le mot de passe"
                                />
                                <button
                                    type="button"
                                    aria-label={showConfirmPassword ? 'Masquer la confirmation du mot de passe' : 'Afficher la confirmation du mot de passe'}
                                    aria-pressed={showConfirmPassword}
                                    aria-controls="change-confirm-password"
                                    onClick={() => setShowConfirmPassword(value => !value)}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-lg text-slate-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
                                >
                                    {showConfirmPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
                                </button>
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-lg transition-colors shadow-lg shadow-blue-600/20"
                    >
                        Changer le mot de passe
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            logout();
                            navigate('/login');
                        }}
                        className="w-full text-slate-500 hover:text-slate-400 text-sm py-2"
                    >
                        Se déconnecter
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ChangePasswordPage;
