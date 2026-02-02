import React, { useMemo } from 'react';
import { Clock, Briefcase, Calendar } from 'lucide-react';

const WeeklySummary = ({ sessions, sites }) => {
    // 1. Calculate Date Range (Mon-Sun)
    const { startOfWeek, endOfWeek, weekLabel } = useMemo(() => {
        const now = new Date();
        const day = now.getDay(); // 0 (Sun) - 6 (Sat)
        // Adjust so Monday is day 0, Sunday is day 6
        const diffToMon = (day === 0 ? -6 : 1) - day;

        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        start.setDate(now.getDate() + diffToMon);

        const end = new Date(start);
        end.setHours(23, 59, 59, 999);
        end.setDate(start.getDate() + 6);

        const label = `${start.getDate().toString().padStart(2, '0')}/${(start.getMonth() + 1).toString().padStart(2, '0')} au ${end.getDate().toString().padStart(2, '0')}/${(end.getMonth() + 1).toString().padStart(2, '0')}`;

        return { startOfWeek: start, endOfWeek: end, weekLabel: label };
    }, []);

    // 2. Filter & Aggregate Data
    const { totalHours, dailyBreakdown, projectBreakdown } = useMemo(() => {
        const weeklySessions = sessions.filter(s => {
            if (!s.punch_start_at) return false;
            const d = new Date(s.punch_start_at);
            return d >= startOfWeek && d <= endOfWeek;
        });

        // Total
        const total = weeklySessions.reduce((acc, s) => acc + (Number(s.duration_hours) || 0), 0);

        // Daily Breakdown
        const daysMap = { 0: 'Lun', 1: 'Mar', 2: 'Mer', 3: 'Jeu', 4: 'Ven', 5: 'Sam', 6: 'Dim' };
        const daily = new Array(7).fill(0).map((_, i) => ({ day: daysMap[i], hours: 0, index: i }));

        weeklySessions.forEach(s => {
            const d = new Date(s.punch_start_at);
            // JS getDay: Sun=0, Mon=1...Sat=6. We want Mon=0...Sun=6
            let jsDay = d.getDay();
            const dayIndex = jsDay === 0 ? 6 : jsDay - 1;
            if (daily[dayIndex]) {
                daily[dayIndex].hours += (Number(s.duration_hours) || 0);
            }
        });

        // Project Breakdown
        const projects = {};
        weeklySessions.forEach(s => {
            const siteName = sites.find(site => String(site.id) === String(s.site_id))?.name || 'Inconnu';
            if (!projects[siteName]) projects[siteName] = 0;
            projects[siteName] += (Number(s.duration_hours) || 0);
        });

        return {
            totalHours: Math.round(total * 10) / 10,
            dailyBreakdown: daily,
            projectBreakdown: projects
        };
    }, [sessions, sites, startOfWeek, endOfWeek]);

    // 3. Overtime Logic
    const overtimeData = useMemo(() => {
        let normal = 0;
        let overtime = 0;
        let remaining = 0;

        if (totalHours <= 40) {
            normal = totalHours;
            remaining = Math.round((40 - totalHours) * 10) / 10;
        } else {
            normal = 40;
            overtime = Math.round((totalHours - 40) * 10) / 10;
        }

        return { normal, overtime, remaining };
    }, [totalHours]);

    return (
        <div className="space-y-4 mb-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex items-center gap-2 text-slate-400 text-xs uppercase font-bold tracking-wider px-1">
                <Calendar size={14} />
                <span>Semaine du {weekLabel}</span>
            </div>

            {/* CARD 1: TOTAL & OVERTIME */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <div className="text-sm text-slate-400 mb-1">Total Semaine</div>
                        <div className="text-3xl font-bold text-white tracking-tight">
                            {totalHours} <span className="text-lg text-slate-500 font-normal">h</span>
                        </div>
                    </div>
                    <div className={`p-2 rounded-lg ${overtimeData.overtime > 0 ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-400'}`}>
                        <Clock size={20} />
                    </div>
                </div>

                {/* Overtime Visualization */}
                <div className="space-y-2">
                    {/* Progress Bar */}
                    <div className="h-2 w-full bg-slate-700 rounded-full overflow-hidden flex">
                        <div
                            className="h-full bg-blue-500 transition-all duration-500"
                            style={{ width: `${Math.min(100, (overtimeData.normal / 40) * 100)}%` }}
                        />
                        {overtimeData.overtime > 0 && (
                            <div
                                className="h-full bg-amber-500 transition-all duration-500"
                                style={{ width: `${Math.min(100, (overtimeData.overtime / 40) * 100)}%` }} // Width relative to 40h for visual
                            />
                        )}
                    </div>

                    {/* Text Details */}
                    <div className="text-xs">
                        {totalHours <= 40 ? (
                            <div className="flex justify-between text-slate-400">
                                <span>Heures normales : {overtimeData.normal} h</span>
                                <span className="text-emerald-400">Reste : {overtimeData.remaining} h</span>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                <div className="flex justify-between text-slate-400">
                                    <span>Heures normales : 40 h</span>
                                </div>
                                <div className="flex justify-between text-amber-400 font-medium">
                                    <span>Heures supplémentaires estimées :</span>
                                    <span>+{overtimeData.overtime} h</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* CARD 2: DAILY BREAKDOWN */}
                <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
                    <div className="flex items-center gap-2 mb-3 text-slate-300 font-medium text-sm">
                        <Calendar size={16} className="text-blue-400" />
                        Détail Journalier
                    </div>
                    <div className="space-y-2">
                        {dailyBreakdown.map((d, i) => (
                            <div key={d.day} className={`flex justify-between text-sm ${d.hours > 0 ? 'text-white' : 'text-slate-600'}`}>
                                <span>{d.day}</span>
                                <span className={d.hours > 0 ? 'font-medium' : ''}>{d.hours > 0 ? `${Math.round(d.hours * 10) / 10} h` : '-'}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* CARD 3: PROJECT BREAKDOWN */}
                <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
                    <div className="flex items-center gap-2 mb-3 text-slate-300 font-medium text-sm">
                        <Briefcase size={16} className="text-purple-400" />
                        Par Chantier
                    </div>
                    <div className="space-y-3">
                        {Object.keys(projectBreakdown).length > 0 ? (
                            Object.entries(projectBreakdown).map(([name, hours]) => (
                                <div key={name} className="flex justify-between items-center text-sm">
                                    <span className="text-slate-300 truncate max-w-[70%]">{name}</span>
                                    <div className="bg-slate-700 px-2 py-1 rounded text-white text-xs font-mono">
                                        {Math.round(hours * 10) / 10} h
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="text-xs text-slate-600 italic text-center py-2">Aucune activité cette semaine</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WeeklySummary;
