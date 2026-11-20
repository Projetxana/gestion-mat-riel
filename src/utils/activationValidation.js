export const MIN_PASSWORD_LENGTH = 6;

export const normalizeAccountEmail = (email = '') => email.trim().toLowerCase();

export function validateAccountActivation({ enteredEmail, sessionEmail, password, confirmPassword }) {
    if (!enteredEmail.trim()) {
        return 'Saisissez l’adresse du compte invité.';
    }
    if (!sessionEmail) {
        return 'Session absente : ouvrez votre lien d’invitation le plus récent dans une fenêtre privée, ou demandez une nouvelle invitation.';
    }
    if (normalizeAccountEmail(enteredEmail) !== normalizeAccountEmail(sessionEmail)) {
        return 'Adresse différente du compte connecté. Ouvrez le lien dans une fenêtre privée, sans compte administrateur connecté.';
    }
    if (!password) {
        return 'Saisissez un nouveau mot de passe.';
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
        return `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`;
    }
    if (!confirmPassword) {
        return 'Confirmez votre nouveau mot de passe.';
    }
    if (password !== confirmPassword) {
        return 'Les mots de passe ne correspondent pas.';
    }
    return null;
}
