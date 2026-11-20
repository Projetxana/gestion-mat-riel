import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { ShieldCheck, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MIN_PASSWORD_LENGTH, normalizeAccountEmail, validateAccountActivation } from '../utils/activationValidation';

export default function ActivateAccountPage() {
    const navigate = useNavigate();
    const [sessionEmail, setSessionEmail] = useState('');
    const [loading, setLoading] = useState(true);
    const [enteredEmail, setEnteredEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let active = true;
        const updateSession = (session) => {
            if (!active) return;
            setSessionEmail(normalizeAccountEmail(session?.user?.email));
            setLoading(false);
        };

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            updateSession(session);
        });

        // A session can exist before the listener subscribes (or after an invite redirect).
        // Reading it explicitly prevents a permanently disabled activation screen.
        const loadSession = async () => {
            try {
                const { data, error: sessionError } = await supabase.auth.getSession();
                if (!active) return;
                if (sessionError) setError('Impossible de vérifier la session d’invitation. Rouvrez votre lien.');
                updateSession(data?.session);
            } catch {
                if (active) {
                    setError('Impossible de vérifier la session d’invitation. Réessayez.');
                    setLoading(false);
                }
            }
        };
        void loadSession();

        return () => { active = false; subscription.unsubscribe(); };
    }, []);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');
        const validationError = validateAccountActivation({ enteredEmail, sessionEmail, password, confirmPassword });
        if (validationError) return setError(validationError);
        if (saving) return;
        setSaving(true);
        const { data: check, error: checkError } = await supabase.auth.getUser();
        const verifiedEmail = normalizeAccountEmail(check?.user?.email);
        if (checkError || verifiedEmail !== sessionEmail || verifiedEmail !== normalizeAccountEmail(enteredEmail)) {
            setError('La session a changé. Recommencez depuis le lien d’invitation.');
            setSaving(false);
            return;
        }
        const { error: updateError } = await supabase.auth.updateUser({ password });
        setSaving(false);
        if (updateError) return setError(updateError.message);
        setSuccess('Mot de passe défini. Redirection vers la connexion…');
        setPassword('');
        setConfirmPassword('');
        const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
        if (signOutError) {
            setError('Mot de passe enregistré, mais déconnexion impossible : ' + signOutError.message);
            return;
        }
        navigate('/login', { replace: true });
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl bg-slate-800 p-8 text-white">
                <ShieldCheck size={32} className="mb-4 text-blue-400" />
                <h1 className="text-2xl font-bold mb-2">Définir mon mot de passe</h1>
                <p className="text-sm text-slate-300 mb-4">Cette opération modifie uniquement le compte Supabase Auth connecté.</p>
                {loading ? <p>Vérification du compte…</p> : (
                    <form onSubmit={handleSubmit} noValidate className="space-y-4">
                        <p className="text-sm text-amber-300">Compte connecté : {sessionEmail || 'Aucun — ouvrez votre lien d’invitation dans une fenêtre privée'}</p>
                        <label className="block text-sm">Confirmez l’adresse du compte invité
                            <input type="email" autoComplete="off" required value={enteredEmail} onChange={e => { setEnteredEmail(e.target.value); setError(''); }} className="mt-1 w-full rounded-lg bg-slate-900 p-3 text-white border border-slate-600" />
                        </label>
                        <label className="block text-sm">Nouveau mot de passe
                            <input type="password" autoComplete="new-password" required value={password} onChange={e => { setPassword(e.target.value); setError(''); }} className="mt-1 w-full rounded-lg bg-slate-900 p-3 text-white border border-slate-600" />
                        </label>
                        <label className="block text-sm">Confirmer le mot de passe
                            <input type="password" autoComplete="new-password" required value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); setError(''); }} className="mt-1 w-full rounded-lg bg-slate-900 p-3 text-white border border-slate-600" />
                        </label>
                        <p className="text-xs text-slate-300">Le mot de passe doit contenir au moins {MIN_PASSWORD_LENGTH} caractères.</p>
                        {error && <p role="alert" className="text-red-300">{error}</p>}
                        {success && <p role="status" className="text-green-300">{success}</p>}
                        <button type="submit" disabled={saving || !!success} className="w-full rounded-lg bg-blue-600 disabled:opacity-50 p-3 font-semibold"><Lock size={16} className="inline mr-2" />{saving ? 'Enregistrement…' : 'Définir le mot de passe'}</button>
                        {success && <button type="button" onClick={() => navigate('/login', { replace: true })} className="w-full rounded-lg bg-slate-700 p-3">Continuer vers BuildTrack</button>}
                    </form>
                )}
            </div>
        </div>
    );
}
