
// Serveur Email SMTP (Gmail)
import nodemailer from "npm:nodemailer@6.9.13";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        // 1. Récupération des secrets
        const SMTP_USER = Deno.env.get('SMTP_USER'); // Votre adresse Gmail
        const SMTP_PASS = Deno.env.get('SMTP_PASS'); // Le mot de passe d'application (16 lettres)

        if (!SMTP_USER || !SMTP_PASS) {
            throw new Error('CONFIG ERROR: SMTP_USER ou SMTP_PASS manquant.');
        }

        // 2. Parsing de la requête
        let body;
        try { body = await req.json(); } catch (e) { throw new Error('Corps JSON invalide.'); }

        const { recipient, subject, html, attachments } = body;
        if (!recipient) throw new Error('Destinataire manquant.');

        console.log(`Préparation envoi GMAIL de ${SMTP_USER} vers ${recipient}`);

        // 3. Configuration du Transporteur (GMAIL)
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: SMTP_USER,
                pass: SMTP_PASS,
            }
        });

        // 4. Envoi
        const info = await transporter.sendMail({
            from: `"Rapports Chantier" <${SMTP_USER}>`, // Expéditeur (Votre Gmail)
            to: recipient, // Email du chantier (Atoom ou autre)
            subject: subject,
            html: html,
            attachments: attachments,
        });

        console.log("Message envoyé: %s", info.messageId);

        return new Response(JSON.stringify({ success: true, messageId: info.messageId }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error('Erreur Critique SMTP:', error);
        return new Response(JSON.stringify({
            success: false,
            error: `Erreur GMAIL: ${error.message}`
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    }
});
