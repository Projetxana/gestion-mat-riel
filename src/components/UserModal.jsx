import React, { useState, useEffect } from 'react';
import { X, Mail, RefreshCw } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

const UserModal = ({ onClose, userToEdit = null }) => {
    const { addUser, updateUser } = useAppContext();
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        role: 'user',
        level: ''
    });
    const [inviteLink, setInviteLink] = useState('');
    const [shouldInvite, setShouldInvite] = useState(false);

    useEffect(() => {
        if (userToEdit) {
            setFormData({
                name: userToEdit.name,
                email: userToEdit.email,
                password: userToEdit.password,
                role: userToEdit.role,
                level: userToEdit.level || ''
            });
        } else {
            // Generate random password for new users
            const randomPass = Math.random().toString(36).slice(-8);
            setFormData(prev => ({ ...prev, password: randomPass }));
        }
    }, [userToEdit]);

    useEffect(() => {
        // Generate invite link if we have email and password
        if (formData.email && formData.password) {
            const subject = encodeURIComponent("Invitation à Gestion matériel - Protection Incendie CD");
            const appUrl = window.location.origin;
            const body = encodeURIComponent(`Bonjour ${formData.name},\n\nVous avez été invité à rejoindre l'application Gestion matériel pour Protection Incendie CD.\n\nAccéder à l'application : ${appUrl}\n\nVoici vos identifiants :\nEmail : ${formData.email}\nMot de passe : ${formData.password}\n\nVous devrez changer votre mot de passe lors de la première connexion.\n\nCordialement,`);
            setInviteLink(`mailto:${formData.email}?subject=${subject}&body=${body}`);
        }
    }, [formData]);

    const generatePassword = () => {
        const randomPass = Math.random().toString(36).slice(-8);
        setFormData(prev => ({ ...prev, password: randomPass }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        // Open mail client if adding new user
        if (shouldInvite && inviteLink) {
            window.location.href = inviteLink;
        }

        if (userToEdit) {
            updateUser(userToEdit.id, formData);
        } else {
            addUser(formData);
        }
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in zoom-in duration-200">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50">
                    <h2 className="text-xl font-bold text-slate-800">
                        {userToEdit ? 'Modifier Utilisateur' : 'Ajouter Utilisateur'}
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Nom complet</label>
                        <input
                            type="text"
                            required
                            placeholder="Jean Dupont"
                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-slate-900 bg-white"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Email</label>
                        <input
                            type="email"
                            required
                            placeholder="jean@example.com"
                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-slate-900 bg-white"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Mot de passe {userToEdit ? '' : '(Temporaire)'}</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                required
                                placeholder="******"
                                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-slate-900 bg-white"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            />
                            {!userToEdit && (
                                <button
                                    type="button"
                                    onClick={generatePassword}
                                    className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="Générer un mot de passe"
                                >
                                    <RefreshCw size={20} />
                                </button>
                            )}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Rôle</label>
                        <div className="flex gap-4 mt-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="role"
                                    value="user"
                                    checked={formData.role === 'user'}
                                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                    className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-slate-700">Utilisateur</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="role"
                                    value="admin"
                                    checked={formData.role === 'admin'}
                                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                    className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-slate-700">Administrateur</span>
                            </label>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Niveau</label>
                        <select
                            value={formData.level || ''}
                            onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-slate-900 bg-white"
                        >
                            <option value="">Sélectionner un niveau</option>
                            <option value="Chef d'équipe">Chef d'équipe</option>
                            <option value="Compagnon">Compagnon</option>
                            <option value="Apprenti 4">Apprenti 4</option>
                            <option value="Apprenti 3">Apprenti 3</option>
                            <option value="Apprenti 2">Apprenti 2</option>
                            <option value="Apprenti 1">Apprenti 1</option>
                        </select>
                    </div>

                    <div className="pt-6 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                        >
                            Annuler
                        </button>

                        <button
                            type="submit"
                            onClick={() => setShouldInvite(false)}
                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
                        >
                            Enregistrer seulement
                        </button>

                        <button
                            type="submit"
                            onClick={() => setShouldInvite(true)}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-lg shadow-blue-500/30 transition-all flex items-center gap-2"
                        >
                            <Mail size={18} />
                            {userToEdit ? 'Mettre à jour & Inviter' : 'Inviter & Ajouter'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default UserModal;
