import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

/** Password recovery is intentionally outside ProtectedRoute and company onboarding. */
export default function ResetPasswordPage() {
  const [state, setState] = useState('checking');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    // Supabase uses a fragment for implicit recovery links and ?code for PKCE.
    // A direct visit without recovery proof must not allow a password change.
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const recoveryLink = hash.get('type') === 'recovery' || params.get('type') === 'recovery' || params.has('code') || params.has('token_hash');

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY' && session) setState('ready');
      else if (recoveryLink && session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) setState('ready');
    });

    async function checkLink() {
      try {
        if (params.has('token_hash') && params.get('type') === 'recovery') {
          const { error } = await supabase.auth.verifyOtp({ token_hash: params.get('token_hash'), type: 'recovery' });
          if (error) throw error;
        } else if (params.has('code')) {
          const { error } = await supabase.auth.exchangeCodeForSession(params.get('code'));
          // detectSessionInUrl may have already consumed this code.
          if (error) {
            const { data } = await supabase.auth.getSession();
            if (!data.session) throw error;
          }
        }
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (active) setState(recoveryLink && data.session ? 'ready' : 'invalid');
      } catch (err) {
        if (active) {
          setMessage(err.message || 'Le lien est invalide ou a expiré.');
          setState('invalid');
        }
      }
    }
    checkLink();
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (busy || state !== 'ready') return;
    if (password.length < 12) return setMessage('Utilise au moins 12 caractères.');
    if (password !== confirmation) return setMessage('Les deux mots de passe ne correspondent pas.');
    setBusy(true);
    setMessage('');
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error('Session expirée. Demande un nouveau lien.');
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setState('success');
      setPassword('');
      setConfirmation('');
      await supabase.auth.signOut();
    } catch (err) {
      setMessage(err.message || 'Impossible de mettre à jour le mot de passe.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
      <section className="w-full max-w-md rounded-xl bg-slate-900 border border-slate-700 p-8 space-y-5">
        <h1 className="text-2xl font-bold">Réinitialiser le mot de passe</h1>
        {state === 'checking' && <p>Vérification du lien sécurisé…</p>}
        {state === 'invalid' && <p role="alert">Lien invalide ou expiré. Demande un nouveau courriel de récupération.</p>}
        {state === 'success' && <p role="status">Mot de passe modifié. Tu peux maintenant te connecter.</p>}
        {state === 'ready' && (
          <form onSubmit={submit} className="space-y-4">
            <label className="block">Nouveau mot de passe
              <input className="block w-full mt-1 rounded bg-slate-800 border border-slate-600 p-3" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={e => setPassword(e.target.value)} />
            </label>
            <label className="block">Confirmer le mot de passe
              <input className="block w-full mt-1 rounded bg-slate-800 border border-slate-600 p-3" type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={e => setConfirmation(e.target.value)} />
            </label>
            <button disabled={busy} className="w-full rounded bg-blue-600 px-4 py-3 disabled:opacity-50" type="submit">{busy ? 'Enregistrement…' : 'Enregistrer le mot de passe'}</button>
          </form>
        )}
        {message && <p role="alert" className="text-red-300">{message}</p>}
        <a className="block text-blue-300 underline" href="/login">Retour à la connexion</a>
      </section>
    </main>
  );
}
