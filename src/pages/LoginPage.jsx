import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

const LoginPage = () => {
    const { login } = useAppContext();
    const navigate = useNavigate();
    const [role, setRole] = useState('admin');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(false);
    const [error, setError] = useState('');

    const handleLogin = (e) => {
        e.preventDefault();
        if (login(role, password, rememberMe)) {
            navigate('/');
        } else {
            setError('Mot de passe incorrect');
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <div className="glass-panel w-full max-w-md p-8">
                <div className="text-center mb-8">
                    <img src="/company-logo.png" alt="Logo" className="h-24 mx-auto mb-4 object-contain" />
                    <p className="text-slate-400">Système de Gestion de Matériel</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Sélectionnez un rôle</label>
                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    type="button"
                                    onClick={() => setRole('admin')}
                                    className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${role === 'admin'
                                        ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                                        : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-800'
                                        }`}
                                >
                                    <Lock size={24} />
                                    <span className="font-medium">Administrateur</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setRole('user')}
                                    className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${role === 'user'
                                        ? 'bg-green-600/20 border-green-500 text-green-400'
                                        : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-800'
                                        }`}
                                >
                                    <User size={24} />
                                    <span className="font-medium">Utilisateur</span>
                                </button>
                            </div>
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

                    <div className="flex items-center justify-between">
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={rememberMe}
                                onChange={(e) => setRememberMe(e.target.checked)}
                                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-slate-400">Se souvenir de moi</span>
                        </label>
                    </div>

                    <button
                        type="submit"
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        <span>Se connecter</span>
                    </button>
                </form>

                <div className="mt-8 text-center text-xs text-slate-500">
                    <p>Antigravity - v1.0</p>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
