import React, { useMemo } from 'react';
import { Activity, TrendingUp } from 'lucide-react';
import { buildWeeklyPerformanceTrends, formatWeeklyLabel } from '../utils/performanceTrends';

const decimal = (value, digits = 1) => Number(value).toLocaleString('fr-CA', {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
});

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const TrendLine = ({ items, title, description, type }) => {
    const percent = type === 'physical';
    const values = items.map(item => item.value);
    const maxValue = percent ? 100
        : Math.max(1.5, Math.ceil(Math.max(...values, 1) * 1.15 * 4) / 4);
    const bounds = items.map(item => Date.parse(item.week + 'T12:00:00Z'));
    const timeSpan = Math.max(WEEK_MS, bounds.at(-1) - bounds[0]);
    const visualWidth = Math.max(460, Math.min(1600, 100 + Math.ceil(timeSpan / WEEK_MS) * 76));
    const w = visualWidth;
    const h = 235;
    const left = 44;
    const right = 28;
    const top = 30;
    const bottom = 53;
    const plotW = w - left - right;
    const plotH = h - top - bottom;
    const x = i => left + (bounds[i] - bounds[0]) / timeSpan * plotW;
    const y = value => top + (1 - value / maxValue) * plotH;
    const color = percent ? '#60a5fa' : '#34d399';
    const points = items.map((item, i) => ({ ...item, x: x(i), y: y(item.value) }));
    const path = points.map((point,i) => (i===0 ? 'M' : 'L') + point.x.toFixed(2) + ' ' + point.y.toFixed(2)).join(' ');
    const unit = percent ? '%' : '';
    const chartSummary = items.map(item =>
        formatWeeklyLabel(item.week) + ' : ' + decimal(item.value, percent ? 1 : 2) + unit
    ).join('; ');
    const yTicks = [0,1,2,3,4].map(i => (maxValue * i / 4));
    const referenceY = y(1);

    return (
        <section className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 sm:p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-1">
                    <h4 className="font-semibold text-slate-100">{title}</h4>
                    <p className="text-xs text-slate-400">{description}</p>
                </div>
                <span className="font-bold text-xl tabular-nums" style={{color}}>
                    {decimal(items.at(-1).value, percent ? 1 : 2)}{unit}
                </span>
            </div>
            <div className="overflow-x-auto overscroll-x-contain" tabIndex={0}
                aria-label={'Graphique défilant horizontalement : ' + title}>
                <svg
                    viewBox={'0 0 ' + w + ' ' + h}
                    style={{minWidth: Math.min(w, 460) + 'px', width: w + 'px', height: h + 'px'}}
                    role="img"
                    aria-label={title + '. ' + chartSummary}
                >
                    {yTicks.map((value,index) => (
                        <g key={index}>
                            <line x1={left} y1={y(value)} x2={w-right} y2={y(value)}
                                stroke="#475569" strokeOpacity="0.65" strokeDasharray="3 5" />
                            <text x={left-8} y={y(value)+4} textAnchor="end" fill="#cbd5e1" fontSize="11">
                                {decimal(value, percent ? 0 : 2)}{unit}
                            </text>
                        </g>
                    ))}
                    {!percent && (
                        <line x1={left} y1={referenceY} x2={w-right} y2={referenceY}
                            stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="7 5" />
                    )}
                    <path d={path} fill="none" stroke={color} strokeWidth="3"
                        strokeLinecap="round" strokeLinejoin="round" />
                    {points.map((point,index) => (
                        <g key={point.week}>
                            <circle cx={point.x} cy={point.y} r="5.5"
                                fill={color} stroke="#0f172a" strokeWidth="2">
                                <title>{formatWeeklyLabel(point.week) + ' : ' + decimal(point.value, percent ? 1 : 2) + unit}</title>
                            </circle>
                            <text x={point.x} y={Math.max(14,point.y-12)}
                                textAnchor="middle" fill="#e2e8f0" fontWeight="600" fontSize="11">
                                {decimal(point.value, percent ? 1 : 2)}{unit}
                            </text>
                            <text x={point.x} y={h-23} textAnchor="middle"
                                fill="#cbd5e1" fontSize="10">
                                {formatWeeklyLabel(point.week)}
                            </text>
                        </g>
                    ))}
                </svg>
            </div>
            {!percent && (
                <p className="text-xs text-amber-200">Ligne pointillée : IPMO 1,00, conforme au budget.</p>
            )}
            <details className="text-xs text-slate-300">
                <summary className="cursor-pointer py-2 min-h-10">Voir les valeurs exactes</summary>
                <div className="overflow-x-auto mt-2">
                    <table className="w-full text-left">
                        <thead><tr className="border-b border-slate-600">
                            <th scope="col" className="py-2 pr-3">Semaine du</th>
                            <th scope="col" className="py-2">Valeur validée</th>
                        </tr></thead>
                        <tbody>{items.map(item => (
                            <tr key={item.week} className="border-b border-slate-700/60">
                                <td className="py-2 pr-3">{formatWeeklyLabel(item.week)}</td>
                                <td className="py-2 tabular-nums">{decimal(item.value, percent ? 1 : 2)}{unit}</td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
            </details>
        </section>
    );
};

// Graphs materialize only after *distinct weeks* contain enough validated
// snapshots. Several validations on the same week count as ONE point.
const PerformanceTrends = ({ reports = [] }) => {
    const trends = useMemo(() => buildWeeklyPerformanceTrends(reports), [reports]);
    if (!trends.showPhysical && !trends.showIpmo) return null;

    return (
        <section aria-label="Évolution hebdomadaire de la performance"
            className="space-y-3">
            <div className="flex items-center gap-2">
                <TrendingUp className="text-blue-300" size={19}/>
                <h3 className="text-lg font-bold text-slate-100">Évolution de la performance</h3>
            </div>
            {trends.showPhysical && (
                <TrendLine
                    title="Avancement physique dans le temps"
                    description="Pourcentage cumulé validé, une mesure par semaine."
                    items={trends.physical} type="physical"
                />
            )}
            {trends.showIpmo && (
                <TrendLine
                    title="Évolution de l'IPMO"
                    description="IPMO cumulé mesuré à chaque validation hebdomadaire fiable."
                    items={trends.ipmo} type="ipmo"
                />
            )}
            <p className="text-xs text-slate-400 flex items-start gap-2">
                <Activity size={14} className="shrink-0 mt-0.5"/>
                Chaque point représente le dernier bilan validé de la semaine (lundi–dimanche, heure du Québec).
                Les semaines sans bilan fiable ne créent aucun indice. Les courbes ne représentent pas encore
                une comparaison à un échéancier planifié d'Atoom.
            </p>
        </section>
    );
};

export default PerformanceTrends;
