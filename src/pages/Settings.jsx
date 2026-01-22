import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { Save, UserPlus, Shield, Users, Database } from 'lucide-react';
import UserModal from '../components/UserModal';
import { legacyMaterials } from '../data/legacyMaterials';

const Settings = () => {
    const { users, currentUser, companyInfo, updateCompanyInfo, clearData, deleteUser, addMaterial, dbError } = useAppContext();
    const [localCompanyValues, setLocalCompanyValues] = useState({ name: '', address: '' });
    const [isEditing, setIsEditing] = useState(false);
    const [showUserModal, setShowUserModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null);

    useEffect(() => {
        if (companyInfo) {
            setLocalCompanyValues(companyInfo);
        }
    }, [companyInfo]);

    const handleSaveCompany = () => {
        updateCompanyInfo(localCompanyValues);
        setIsEditing(false);
    };

    const handleImportData = async () => {
        if (!window.confirm(`Voulez-vous importer ${legacyMaterials.length} outils ?`)) return;

        let successCount = 0;
        let skipCount = 0;

        for (const item of legacyMaterials) {
            const result = await addMaterial(item);
            if (result && !result.error) {
                successCount++;
            } else {
                skipCount++;
            }
        }

        alert(`Import terminé !\nSuccès: ${successCount}\nDoublons ignorés: ${skipCount}`);
    };

    if (currentUser?.role !== 'admin') {
        return (
            <div className="p-8 text-center text-slate-400">
                <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
                <h2 className="text-xl font-bold mb-2">Accès Restreint</h2>
                <p>Seuls les administrateurs peuvent modifier les paramètres.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="page-title text-slate-800">Paramètres</h1>
                    <p className="text-slate-500">Gérez les détails de l'entreprise et les utilisateurs</p>
                    <p className="text-slate-500">v0.6.0 (Factures)</p>
                </div>
            </div>

            {dbError && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mb-6 flex items-start gap-3">
                    <Shield className="shrink-0 mt-1" size={20} />
                    <div>
                        <h3 className="font-bold">Erreur de connexion base de données</h3>
                        <p className="text-sm">{dbError}</p>
                        <p className="text-xs mt-1 text-red-500">Vos anciens utilisateurs n'ont pas pu être chargés.</p>
                    </div>
                </div>
            )}

            {/* Company Settings */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-800">
                    <Shield className="text-blue-600" size={24} />
                    Informations Entreprise
                </h2>
                <div className="max-w-xl space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Nom de l'entreprise</label>
                        <input
                            type="text"
                            value={localCompanyValues.name}
                            onChange={(e) => setLocalCompanyValues({ ...localCompanyValues, name: e.target.value })}
                            disabled={!isEditing}
                            className={`w-full p-3 rounded-lg border ${isEditing ? 'border-slate-300 bg-white text-slate-900' : 'border-transparent bg-slate-50 text-slate-500'}`}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Adresse</label>
                        <input
                            type="text"
                            value={localCompanyValues.address}
                            onChange={(e) => setLocalCompanyValues({ ...localCompanyValues, address: e.target.value })}
                            disabled={!isEditing}
                            className={`w-full p-3 rounded-lg border ${isEditing ? 'border-slate-300 bg-white text-slate-900' : 'border-transparent bg-slate-50 text-slate-500'}`}
                        />
                    </div>

                    <div className="pt-4">
                        {!isEditing ? (
                            <button
                                onClick={() => setIsEditing(true)}
                                className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg font-medium transition-colors"
                            >
                                Modifier
                            </button>
                        ) : (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        setIsEditing(false);
                                        setLocalCompanyValues(companyInfo); // Reset
                                    }}
                                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                                >
                                    Annuler
                                </button>
                                <button
                                    onClick={handleSaveCompany}
                                    className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-medium shadow-md shadow-blue-500/20 transition-all flex items-center gap-2"
                                >
                                    <Save size={18} />
                                    Enregistrer
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* User Management */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
                <div className="flex items-center justify-between mb-8">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                        <Users className="text-green-600" size={24} />
                        Gestion Utilisateurs
                    </h2>
                    <button
                        onClick={() => {
                            setEditingUser(null);
                            setShowUserModal(true);
                        }}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium shadow-md shadow-green-500/20 transition-all flex items-center gap-2"
                    >
                        <UserPlus size={20} />
                        <span>Inviter Utilisateur</span>
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-100 text-slate-500 text-sm">
                                <th className="py-4 px-4 font-semibold">Nom</th>
                                <th className="py-4 px-4 font-semibold">Email</th>
                                <th className="py-4 px-4 font-semibold">Rôle</th>
                                <th className="py-4 px-4 font-semibold text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((user) => (
                                <tr key={user.id} className="border-b border-slate-50 hover:bg-slate-50/80 transition-colors">
                                    <td className="py-4 px-4 font-medium text-slate-900">{user.name}</td>
                                    <td className="py-4 px-4 text-slate-500">{user.email}</td>
                                    <td className="py-4 px-4">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${user.role === 'admin'
                                            ? 'bg-blue-50 text-blue-700 border-blue-100'
                                            : 'bg-slate-50 text-slate-600 border-slate-100'
                                            }`}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td className="py-4 px-4 text-right">
                                        {currentUser?.id !== user.id && (
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => {
                                                        setEditingUser(user);
                                                        setShowUserModal(true);
                                                    }}
                                                    className="text-blue-400 hover:text-blue-600 p-2 rounded-lg hover:bg-blue-50 transition-colors"
                                                    title="Modifier l'utilisateur"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (window.confirm(`Voulez-vous vraiment supprimer ${user.name} ?`)) {
                                                            deleteUser(user.id);
                                                        }
                                                    }}
                                                    className="text-red-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-colors"
                                                    title="Supprimer l'utilisateur"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Import Data */}
            <div className="bg-blue-50 rounded-2xl shadow-sm border border-blue-100 p-8">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-blue-700">
                    <Database className="text-blue-600" size={24} />
                    Import de Données
                </h2>
                <p className="text-blue-600 mb-6">
                    Importer massivement la liste d'inventaire initiale ({legacyMaterials.length} éléments).
                    Les numéros de série en double seront ignorés.
                </p>
                <button
                    onClick={handleImportData}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-md shadow-blue-500/20 transition-all flex items-center gap-2"
                >
                    <Database size={18} />
                    Lancer l'importation
                </button>
            </div>



            {showUserModal && (
                <UserModal
                    onClose={() => setShowUserModal(false)}
                    userToEdit={editingUser}
                />
            )}

            <div className="text-center text-slate-300 text-sm mt-10">
                v0.6.1 (Fix Factures)
                <button
                    onClick={async () => {
                        if (!window.confirm("Cela va effacer le cache et recharger l'application. Continuer ?")) return;

                        try {
                            // 1. Unregister Service Workers
                            if ('serviceWorker' in navigator) {
                                const registrations = await navigator.serviceWorker.getRegistrations();
                                for (const registration of registrations) {
                                    await registration.unregister();
                                }
                            }

                            // 2. Clear Caches
                            if ('caches' in window) {
                                const cacheNames = await caches.keys();
                                await Promise.all(
                                    cacheNames.map(name => caches.delete(name))
                                );
                            }

                            // 3. Force Reload with Cache Busting
                            alert("Mise à jour effectuée. L'application va redémarrer.");
                            window.location.href = window.location.origin + '?t=' + new Date().getTime();

                        } catch (error) {
                            console.error("Update failed:", error);
                            window.location.reload();
                        }
                    }}
                    className="block mx-auto mt-2 text-xs text-blue-400 hover:text-blue-300 underline"
                >
                    Forcer la mise à jour
                </button>
            </div>
        </div>
    );
};

export default Settings;
