import React, { useMemo, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Link } from 'react-router-dom';
import { summarizeAdminHours } from '../../utils/adminHoursSummary';

const localDate = (date) => {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};
const mondayOf = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
};
export default function AdminHoursView() {
    const { currentUser, currentCompanyId, users, sites, timeSessions } = useAppContext();
    const [week, setWeek] = useState(() => mondayOf(new Date()));
    const end = new Date(week);
    end.setDate(end.getDate() + 7);
    const [groupBy, setGroupBy] = useState('site');
    const summary = useMemo(() => summarizeAdminHours({
        sessions: timeSessions || [], users: users || [], sites: sites || [],
        companyId: currentUser?.role === 'admin' ? currentCompanyId : null,
        weekStart: week, weekEnd: end,
    }), [currentUser?.role, currentCompanyId, users, sites, timeSessions, week]);
    const rows = groupBy === 'site' ? summary.jobsites : summary.employees;
    if (currentUser?.role !== 'admin') return null;
    const changeWeek = (step) => setWeek(prev => { const next = new Date(prev); next.setDate(next.getDate() + step * 7); return next; });
    const number = value => value.toLocaleString('fr-CA', { maximumFractionDigits: 2, minimumFractionDigits: 1 });
    const reportTitle = `Heures - semaine du ${localDate(week)} au ${localDate(new Date(end.getTime() - 86400000))}`;
    const reportRows = rows.flatMap(row => row.details.map(detail => ({
        employee: groupBy === 'site' ? detail.name : row.name,
        site: groupBy === 'site' ? row.name : detail.name,
        hours: detail.hours,
    })));
    const headers = groupBy === 'site' ? ['Chantier', 'Employé', 'Heures'] : ['Employé', 'Chantier', 'Heures'];
    const reportCells = row => groupBy === 'site' ? [row.site,row.employee] : [row.employee,row.site];
    const exportExcel = async () => {
        if (!currentCompanyId || currentUser?.role !== 'admin' || !reportRows.length) return;
        try {
            const XLSX = await import('xlsx');
            const workbook = XLSX.utils.book_new();
            const sheetData = [
                ['Rapport provisoire - ' + reportTitle],
                headers,
                ...reportRows.map(r => [...reportCells(r), Number(r.hours.toFixed(4))]),
                ['TOTAL', '', Number(summary.total.toFixed(4))],
            ];
            const sheet = XLSX.utils.aoa_to_sheet(sheetData);
            sheet['!cols'] = [{ wch: 32 }, { wch: 42 }, { wch: 16 }];
            XLSX.utils.book_append_sheet(workbook, sheet, 'Heures semaine');
            XLSX.writeFile(workbook, `buildtrack-heures-${localDate(week)}.xlsx`);
        } catch (error) {
            console.error('Excel export failed', error);
            alert('Impossible de créer le fichier Excel sur cet appareil.');
        }
    };
    const exportPrintPdf = () => {
        if (!currentCompanyId || currentUser?.role !== 'admin' || !reportRows.length) return;
        const popup = window.open('', '_blank');
        if (!popup) {
            alert('Autorisez les fenêtres surgissantes pour imprimer ou enregistrer en PDF.');
            return;
        }
        const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
        const trs = reportRows.map(r => `<tr>${reportCells(r).map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}<td class="num">${escapeHtml(number(r.hours))}</td></tr>`).join('');
        const total = number(summary.total);
        popup.document.open();
        popup.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(reportTitle)}</title><style>
            body{font-family:Arial,sans-serif;color:#172033;padding:24px}h1{font-size:20px}
            table{border-collapse:collapse;width:100%;margin-top:24px}th,td{border:1px solid #d1d5db;padding:9px;text-align:left}
            th{background:#eef2f7}.num{text-align:right}tfoot{font-weight:bold}
            .note{font-size:11px;color:#5b6473;margin-top:20px}
            @media print{body{padding:0}tr{break-inside:avoid}}
            </style></head><body><h1>${escapeHtml(reportTitle)}</h1>
            <table><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
            <tbody>${trs}</tbody><tfoot><tr><td>TOTAL</td><td></td><td class="num">${escapeHtml(total)}</td></tr></tfoot></table>
            <p class="note">Rapport provisoire : heures terminées seulement, sans déduction des pauses ni validation de paie.</p>
            </body></html>`);
        popup.document.close();
        popup.focus();
        popup.print();
    };
    return (
        <div className="mx-auto max-w-4xl p-4 pb-24 text-slate-100 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h1 className="text-2xl font-bold">Heures hebdomadaires</h1><p className="text-slate-400">Heures corrigées prises en compte dans les totaux.</p></div>
                <Link to="/timetracking/validation" className="min-h-11 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white">
                    Vérifier, corriger et valider
                </Link>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-slate-800 p-3">
                <button className="rounded-lg bg-slate-700 px-4 py-2" onClick={() => changeWeek(-1)} aria-label="Semaine précédente">←</button>
                <span className="flex-1 text-center font-semibold">Semaine du {localDate(week)} au {localDate(new Date(end.getTime() - 86400000))}</span>
                <button className="rounded-lg bg-slate-700 px-4 py-2" onClick={() => changeWeek(1)} aria-label="Semaine suivante">→</button>
            </div>
            <div className="rounded-xl bg-slate-800 p-4"><span className="text-slate-300">Total de la semaine</span><p className="text-3xl font-bold">{number(summary.total)} h</p></div>
            <div className="flex flex-wrap gap-2">
                <button type="button" disabled={!rows.length || !currentCompanyId} onClick={exportExcel} className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white disabled:opacity-40">Exporter Excel (.xlsx)</button>
                <button type="button" disabled={!rows.length || !currentCompanyId} onClick={exportPrintPdf} className="rounded-lg bg-slate-700 px-4 py-2 font-semibold text-white disabled:opacity-40">Imprimer / PDF</button>
            </div>
            <div role="group" aria-label="Regroupement des heures" className="grid grid-cols-2 gap-1 rounded-xl bg-slate-800 p-1">
                {[['site','Par chantier'],['employee','Par employé']].map(([value,label]) =>
                    <button key={value} type="button" aria-pressed={groupBy === value} onClick={() => setGroupBy(value)}
                        className={`min-h-11 rounded-lg px-2 py-2 text-sm font-semibold ${groupBy === value ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
                        {label}
                    </button>
                )}
            </div>
            {!currentCompanyId && <p className="text-amber-300">Entreprise non chargée : aucun relevé affiché.</p>}
            {rows.length === 0 && <p className="rounded-xl bg-slate-800 p-4 text-slate-300">Aucune heure terminée et attribuée à cette entreprise pour cette semaine. Les anciennes entrées sans entreprise associée ne sont pas incluses.</p>}
            {rows.map(r => <section key={r.id} className="rounded-xl bg-slate-800 p-4 space-y-2">
                <div className="flex justify-between items-start gap-3"><h2 className="font-bold min-w-0 break-words">{r.name}</h2><strong className="shrink-0 tabular-nums">{number(r.hours)} h</strong></div>
                <p className="text-sm text-slate-400">{r.details.length} {groupBy === 'site' ? 'employé(s)' : 'chantier(s)'} · {r.sessions} entrée(s)</p>
                {r.details.map(detail => <div key={detail.id} className="flex justify-between gap-3 border-t border-slate-700 pt-2 text-sm">
                    <span className="min-w-0 break-words">{detail.name}</span><span className="shrink-0 tabular-nums">{number(detail.hours)} h</span>
                </div>)}
            </section>)}
            <p className="text-xs text-slate-400">Calcul provisoire sur les pointages terminés, sans déduction automatique des pauses ni validation de paie. Ne pas utiliser pour la paie avant rapprochement.</p>
            <p className="text-xs text-slate-400">
                Le suivi de progression des chantiers et leurs indices IPMO sont consultables depuis
                l'accueil, dans « Suivi Projets ». Cette page reste consacrée aux heures hebdomadaires.
            </p>
        </div>
    );
}
