import React, { useState } from 'react';
import { X, Wrench, AlertCircle, Camera, Send, User } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { supabase } from '../supabaseClient';

const HiltiToolModal = ({ tool, onClose }) => {
    const { updateHiltiTool, currentUser, users } = useAppContext();
    const [reportMode, setReportMode] = useState(false);
    const [issueDescription, setIssueDescription] = useState('');
    const [issueImage, setIssueImage] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [newOwner, setNewOwner] = useState(tool.assigned_to);

    const isAdmin = currentUser?.role === 'admin' || currentUser?.email === 'admin@antigravity.com';
    const assignedUser = users.find(u => u.id == tool.assigned_to);

    const handleReportIssue = async (e) => {
        e.preventDefault();
        if (!issueDescription.trim()) return;

        setIsUploading(true);
        let imageUrl = '';

        try {
            if (issueImage) {
                const fileName = `hilti_issue_${Date.now()}_${tool.id}.jpg`;
                const { data, error } = await supabase.storage.from('delivery-notes').upload(fileName, issueImage);
                if (!error) {
                    const { data: publicData } = supabase.storage.from('delivery-notes').getPublicUrl(fileName);
                    imageUrl = publicData.publicUrl;
                }
            }

            updateHiltiTool(tool.id, { status: 'repair' });

            const subject = `Problème Hilti: ${tool.name} [${tool.serial_number}]`;
            let body = `Bonjour,\n\nJe signale un problème sur l'outil Hilti :\n\nNom: ${tool.name}\nSérie: ${tool.serial_number}\n\nDescription :\n${issueDescription}\n\n`;
            if (imageUrl) body += `Photo : ${imageUrl}\n\n`;
            body += `Signalé par : ${currentUser?.name || 'Utilisateur'}\n\n`;

            window.location.href = `mailto:materiaux@cd.atoomerp.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            onClose();
        } catch (error) {
            console.error(error);
            alert("Erreur");
        } finally {
            setIsUploading(false);
        }
    };

    const handleReassign = () => {
        if (newOwner !== tool.assigned_to) {
            updateHiltiTool(tool.id, { assigned_to: newOwner });
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 rounded-2xl w-full max-w-lg border border-slate-700 shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-slate-800 flex justify-between items-center sticky top-0 bg-slate-900 z-10 rounded-t-2xl">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <span className="w-2 h-8 bg-red-600 rounded-full block"></span>
                        {tool.name}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar">
                    {/* Tool Details */}
                    <div className="bg-slate-800/50 rounded-xl p-4 space-y-3">
                        <div className="flex justify-between border-b border-slate-700/50 pb-2">
                            <span className="text-slate-400">Série</span>
                            <span className="text-white font-mono">{tool.serial_number}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-700/50 pb-2">
                            <span className="text-slate-400">QR Code</span>
                            <span className="text-white font-mono">{tool.qr_code}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-slate-400">Statut</span>
                            <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${tool.status === 'ok' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                }`}>
                                {tool.status === 'ok' ? 'Opérationnel' : 'En Panne'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center pt-2">
                            <span className="text-slate-400">Affecté à</span>
                            <div className="flex items-center gap-2">
                                <User size={16} className="text-blue-400" />
                                <span className="text-white">{assignedUser?.name || 'Inconnu'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Admin Reassign */}
                    {isAdmin && !reportMode && (
                        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                            <h3 className="text-sm font-bold text-slate-300 mb-3 uppercase tracking-wider">Réaffectation</h3>
                            <div className="flex gap-2">
                                <select
                                    className="flex-1 bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:border-red-500 outline-none"
                                    value={newOwner}
                                    onChange={(e) => setNewOwner(e.target.value)}
                                >
                                    {users.map(u => (
                                        <option key={u.id} value={u.id}>{u.name}</option>
                                    ))}
                                </select>
                                <button
                                    onClick={handleReassign}
                                    className="btn bg-blue-600 hover:bg-blue-500 text-white"
                                    disabled={newOwner == tool.assigned_to}
                                >
                                    Valider
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Report Issue UI */}
                    {reportMode ? (
                        <div className="bg-slate-800 p-4 rounded-lg border border-red-900/40 animate-in slide-in-from-top-2">
                            <h3 className="font-bold mb-4 flex items-center gap-2 text-red-400">
                                <AlertCircle size={20} />
                                Signaler une Panne
                            </h3>
                            <form onSubmit={handleReportIssue} className="space-y-4">
                                <textarea
                                    required
                                    rows={3}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:border-red-500 outline-none"
                                    placeholder="Description..."
                                    value={issueDescription}
                                    onChange={(e) => setIssueDescription(e.target.value)}
                                />
                                <label className="flex items-center gap-2 cursor-pointer bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded text-sm text-white w-fit">
                                    <Camera size={16} />
                                    {issueImage ? 'Changer' : 'Photo'}
                                    <input type="file" accept="image/*" className="hidden" onChange={(e) => setIssueImage(e.target.files[0])} />
                                </label>
                                <div className="flex justify-end gap-3">
                                    <button type="button" onClick={() => setReportMode(false)} className="btn btn-ghost text-sm">Annuler</button>
                                    <button type="submit" disabled={isUploading} className="btn bg-red-600 hover:bg-red-500 text-white border-none">
                                        {isUploading ? '...' : <><Send size={16} className="mr-2" /> Envoyer</>}
                                    </button>
                                </div>
                            </form>
                        </div>
                    ) : (
                        <button onClick={() => setReportMode(true)} className="w-full btn border border-red-500/50 text-red-400 hover:bg-red-500/10">
                            <Wrench size={20} className="mr-2" />
                            Signaler Problème
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default HiltiToolModal;
