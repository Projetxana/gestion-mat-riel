
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.13";
import * as XLSX from "https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper: Get Previous Week Range (Monday to Sunday)
function getLastWeekRange() {
    const date = new Date();
    // Go to previous Monday
    // Day of week: 0 (Sun) - 6 (Sat)
    // If today is Mon (1), -7 days. If Sun (0), -6 days? 
    // Logic: Find last Monday.
    const day = date.getDay();
    const diffToMon = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    const currentMonday = new Date(date.setDate(diffToMon));

    // Last Monday = Current Monday - 7 days
    const lastMonday = new Date(currentMonday);
    lastMonday.setDate(lastMonday.getDate() - 7);
    lastMonday.setHours(0, 0, 0, 0);

    // Last Sunday = Last Monday + 6 days
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastSunday.getDate() + 6);
    lastSunday.setHours(23, 59, 59, 999);

    return { start: lastMonday, end: lastSunday };
}

function formatDate(date: Date) {
    return date.toISOString().split('T')[0];
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        console.log("🚀 Starting Weekly Report Job");

        // 1. Env Vars
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const SMTP_USER = Deno.env.get('SMTP_USER');
        const SMTP_PASS = Deno.env.get('SMTP_PASS');

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SMTP_USER || !SMTP_PASS) {
            throw new Error('Missing Env Variables');
        }

        // 2. Init Clients
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: SMTP_USER, pass: SMTP_PASS }
        });

        // 3. Date Range
        const { start, end } = getLastWeekRange();
        console.log(`📅 Generating report for: ${formatDate(start)} to ${formatDate(end)}`);

        // 4. Fetch Data
        const { data: sessions, error } = await supabase
            .from('time_sessions')
            .select(`
                *,
                users (name),
                sites (name, planned_hours),
                tasks (name)
            `)
            .gte('punch_start_at', start.toISOString())
            .lte('punch_start_at', end.toISOString())
            .eq('approved', true);

        if (error) throw error;
        console.log(`✅ Fetched ${sessions?.length || 0} sessions`);

        if (!sessions || sessions.length === 0) {
            console.log("⚠️ No sessions found. Skipping report.");
            return new Response(JSON.stringify({ message: "No sessions found" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // 5. Process Data for Excel

        // Sheet 1: Details
        const detailData = sessions.map(s => ({
            Date: new Date(s.punch_start_at).toLocaleDateString('fr-FR'),
            Employé: s.users?.name || 'Inconnu',
            Chantier: s.sites?.name || 'Inconnu',
            Tâche: s.tasks?.name || 'Inconnue',
            Début: new Date(s.corrected_start_at || s.punch_start_at).toLocaleTimeString('fr-FR'),
            Fin: s.corrected_end_at || s.punch_end_at ? new Date(s.corrected_end_at || s.punch_end_at).toLocaleTimeString('fr-FR') : 'En cours',
            Heures: Number((s.duration_minutes / 60).toFixed(2)),
            GPS: s.geo_confidence || 'N/A',
            Manuel: s.is_manual ? 'OUI' : 'NON'
        }));

        // Sheet 2: Résumé par Chantier
        const siteStats: Record<string, any> = {};
        sessions.forEach(s => {
            const siteName = s.sites?.name || 'Inconnu';
            if (!siteStats[siteName]) {
                siteStats[siteName] = {
                    Chantier: siteName,
                    'Heures Prévues': s.sites?.planned_hours || 0,
                    'Heures Semaine': 0,
                    'Total (est.)': 0 // We could fetch total from DB if needed, simplified here
                };
            }
            siteStats[siteName]['Heures Semaine'] += (s.duration_minutes / 60);
        });
        const summaryData = Object.values(siteStats).map((d: any) => ({
            ...d,
            'Heures Semaine': Number(d['Heures Semaine'].toFixed(2))
        }));

        // Sheet 3: Répartition Tâche
        const taskStats: Record<string, any> = {};
        sessions.forEach(s => {
            const key = `${s.sites?.name}-${s.tasks?.name}`;
            if (!taskStats[key]) {
                taskStats[key] = {
                    Chantier: s.sites?.name,
                    Tâche: s.tasks?.name,
                    'Heures': 0
                };
            }
            taskStats[key]['Heures'] += (s.duration_minutes / 60);
        });
        const taskData = Object.values(taskStats).map((d: any) => ({
            ...d,
            'Heures': Number(d['Heures'].toFixed(2))
        })).sort((a: any, b: any) => a.Chantier.localeCompare(b.Chantier));


        // 6. Generate Excel File
        const wb = XLSX.utils.book_new();

        const wsDetails = XLSX.utils.json_to_sheet(detailData);
        XLSX.utils.book_append_sheet(wb, wsDetails, "Détails");

        const wsSummary = XLSX.utils.json_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, wsSummary, "Résumé Chantier");

        const wsTasks = XLSX.utils.json_to_sheet(taskData);
        XLSX.utils.book_append_sheet(wb, wsTasks, "Par Tâche");

        // Write to buffer
        const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        // 7. Send Email
        const filename = `Heures_Chantiers_Semaine_${formatDate(start)}.xlsx`;

        await transporter.sendMail({
            from: `"Antigravity Report" <${SMTP_USER}>`,
            to: SMTP_USER, // Send to self/admin
            subject: `📊 Rapport Hebdo Heures : ${formatDate(start)} - ${formatDate(end)}`,
            html: `
                <h2>Rapport Hebdomadaire des Heures</h2>
                <p>Bonjour,</p>
                <p>Veuillez trouver ci-joint le rapport des heures pour la semaine du <strong>${new Date(start).toLocaleDateString('fr-FR')}</strong> au <strong>${new Date(end).toLocaleDateString('fr-FR')}</strong>.</p>
                <ul>
                    <li><strong>${sessions.length}</strong> sessions validées</li>
                    <li><strong>${summaryData.length}</strong> chantiers actifs</li>
                </ul>
                <p>Cordialement,<br>Votre Assistant Antigravity</p>
            `,
            attachments: [
                {
                    filename: filename,
                    content: excelBuffer
                }
            ]
        });

        console.log("✅ Email sent successfully");

        return new Response(JSON.stringify({ success: true, message: "Report generated and sent" }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
        });

    } catch (error) {
        console.error("❌ Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500
        });
    }
});
