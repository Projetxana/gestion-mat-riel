import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    setError('');
    setPending(true);
    try {
      const { error: requestError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (requestError) throw requestError;
      setSent(true);
    } catch (err) {
      // Avoid account enumeration; show technical failures without revealing account existence.
      if (/rate limit|too many requests/i.test(err?.message || '')) {
        setError('Trop de tentatives. Réessaie plus tard.');
      } else {
        setError('Impossible de traiter la demande pour le moment. Réessaie plus tard.');
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
      <section className="w-full max-w-md rounded-xl bg-slate-900 border border-slate-700 p-8 space-y-5">
        <h1 className="text-2xl font-bold">Mot de passe oublié</h1>
        {sent ? (
          <p role="status" className="text-slate-200">
            Si cette adresse est associée à un compte, tu recevras un courriel de réinitialisation.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-slate-300">Entre ton adresse courriel pour recevoir un lien de réinitialisation.</p>
            <label className="block" htmlFor="recovery-email">Adresse courriel</label>
            <input
              id="recovery-email"
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="block w-full rounded bg-slate-800 border border-slate-600 p-3 text-white focus:ring-2 focus:ring-blue-500"
            />
            <button type="submit" disabled={pending} className="w-full rounded bg-blue-600 hover:bg-blue-500 px-4 py-3 font-semibold disabled:opacity-50">
              {pending ? 'Envoi…' : 'Envoyer le lien de réinitialisation'}
            </button>
          </form>
        )}
        {error && <p role="alert" className="text-red-300">{error}</p>}
        <Link className="block text-blue-300 underline" to="/login">Retour à la connexion</Link>
      </section>
    </main>
  );
}
