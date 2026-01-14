
// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
        if (!RESEND_API_KEY) {
            throw new Error('Missing RESEND_API_KEY environment variable');
        }

        const { recipient, subject, html, attachments } = await req.json();

        console.log(`Sending email to ${recipient} with ${attachments?.length || 0} attachments`);

        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
                from: 'Rapports Chantier <onboarding@resend.dev>', // Default testing domain
                to: recipient,
                subject: subject,
                html: html,
                attachments: attachments, // Array of { filename: string, path: string (url) }
            }),
        });

        const data = await res.json();

        if (!res.ok) {
            console.error('Resend API Error:', data);
            throw new Error(`Resend Error: ${data.name} - ${data.message}`);
        }

        return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error('Function Error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
