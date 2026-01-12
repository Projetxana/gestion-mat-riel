import React, { useState } from 'react';
import { Search, Loader, QrCode } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { Html5QrcodeScanner } from 'html5-qrcode';
import HiltiToolModal from './HiltiToolModal';

const HiltiUserView = ({ targetUserId }) => {
    const { hiltiTools, currentUser } = useAppContext();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTool, setSelectedTool] = useState(null);
    const [showScanner, setShowScanner] = useState(false);

    // Filter tools: Use targetUser if provided (Admin view), else use currentUser (User view)
    const userIdToFilter = targetUserId || currentUser?.id;

    const myTools = hiltiTools.filter(t => t.assigned_to == userIdToFilter);

    const filteredTools = myTools.filter(t =>
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.serial_number.includes(searchTerm) ||
        t.qr_code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const onScanSuccess = (decodedText) => {
        setSearchTerm(decodedText);
        setShowScanner(false);
    };

    return (
        <div className="space-y-6">
            {/* Search Bar */}
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                        type="text"
                        placeholder="Rechercher nom, série, QR..."
                        className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:border-red-500 outline-none"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <button
                    onClick={() => setShowScanner(!showScanner)}
                    className={`p-3 rounded-xl border transition-colors ${showScanner ? 'bg-red-500/20 border-red-500 text-red-500' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
                >
                    <QrCode size={24} />
                </button>
            </div>

            {/* Scanner */}
            {showScanner && (
                <div className="bg-black p-4 rounded-xl overflow-hidden">
                    <div id="hilti-reader" className="w-full max-w-sm mx-auto"></div>
                    {/* Tiny hack to mount scanner only when div exists */}
                    <ScannerMounter onScan={onScanSuccess} />
                </div>
            )}

            {/* Tools Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTools.map(tool => (
                    <div
                        key={tool.id}
                        onClick={() => setSelectedTool(tool)}
                        className="bg-slate-800 p-4 rounded-xl border border-slate-700 hover:border-red-500/50 transition-all cursor-pointer group relative overflow-hidden"
                    >
                        <div className="absolute right-0 top-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                            <img src="/hilti-logo.png" className="w-16 grayscale" alt="" />
                        </div>
                        <h3 className="font-bold text-white text-lg mb-1">{tool.name}</h3>
                        <div className="text-sm text-slate-400 font-mono mb-2">{tool.serial_number}</div>
                        <div className={`text-xs inline-flex items-center px-2 py-1 rounded bg-slate-900 border ${tool.status === 'ok' ? 'border-green-800 text-green-400' : 'border-red-800 text-red-400'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full mr-2 ${tool.status === 'ok' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                            {tool.status === 'ok' ? 'Opérationnel' : 'À Réparer'}
                        </div>
                    </div>
                ))}

                {filteredTools.length === 0 && (
                    <div className="col-span-full py-12 text-center text-slate-500">
                        Aucun outil trouvé pour cet utilisateur.
                    </div>
                )}
            </div>

            {selectedTool && <HiltiToolModal tool={selectedTool} onClose={() => setSelectedTool(null)} />}
        </div>
    );
};

// Helper for Scanner Lifecycle
const ScannerMounter = ({ onScan }) => {
    React.useEffect(() => {
        const scanner = new Html5QrcodeScanner("hilti-reader", { fps: 10, qrbox: 250 }, false);
        scanner.render(onScan, (err) => console.warn(err));
        return () => scanner.clear();
    }, []);
    return null;
};

export default HiltiUserView;
