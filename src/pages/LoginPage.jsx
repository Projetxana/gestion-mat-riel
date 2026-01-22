import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

const LoginPage = () => {
    const { login } = useAppContext();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = (e) => {
        e.preventDefault();
        if (login(email, password)) {
            navigate('/');
        } else {
            setError('Email ou mot de passe incorrect');
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
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        <span>Se connecter</span>
                    </button>
                </form>

                <div className="mt-8 text-center text-xs text-slate-500">
                    <p>Antigravity - v0.6.0 (Factures)</p>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
