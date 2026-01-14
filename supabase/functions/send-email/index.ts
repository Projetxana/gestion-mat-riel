
// Modern Supabase Edge Function (No external imports for server)

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

        // Validate Configuration
        if (!RESEND_API_KEY) {
            throw new Error('CONFIG ERROR: RESEND_API_KEY is missing in Supabase Secrets.');
        }

        // Parse Request
        let body;
        try {
            body = await req.json();
        } catch (e) {
            throw new Error('INVALID REQUEST: Could not parse JSON body.');
        }

        const { recipient, subject, html, attachments } = body;

        // Validate Payload
        if (!recipient) throw new Error('VALIDATION ERROR: Recipient is missing.');

        console.log(`Sending email to ${recipient}`);

        // Call Resend API
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
                from: 'Rapports Chantier <onboarding@resend.dev>',
                to: recipient,
                subject: subject,
                html: html,
                attachments: attachments,
            }),
        });

        const data = await res.json();

        if (!res.ok) {
            console.error('Resend API Error:', data);
            // RETURN 200 with error info to bypass client exceptions
            return new Response(JSON.stringify({
                success: false,
                error: `Resend Rejected: ${data.message || data.name}`
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        return new Response(JSON.stringify({ success: true, data }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error('Function Critical Error:', error);
        // RETURN 200 with error info to bypass client exceptions
        return new Response(JSON.stringify({
            success: false,
            error: `Server Error: ${error.message}`
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    }
});
