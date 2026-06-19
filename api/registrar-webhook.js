export default async function handler(req, res) {
    const userId = process.env.NUVEMSHOP_USER_ID;
    const token = process.env.NUVEMSHOP_ACCESS_TOKEN;
    const urlWebhook = 'https://e-commerce-nu-roan.vercel.app/api/webhook-copa';

    try {
        // Lista webhooks existentes para evitar duplicatas
        const listar = await fetch(`https://api.tiendanube.com/v1/${userId}/webhooks`, {
            headers: {
                'Authentication': `bearer ${token}`,
                'User-Agent': 'WidiCare-CopaCashback/1.0 (widicasmarketing@gmail.com)'
            }
        });
        const existentes = await listar.json();

        // Verifica se já existe
        const jaExiste = Array.isArray(existentes) && existentes.find(w =>
            w.url === urlWebhook && w.event === 'order/created'
        );

        if (jaExiste) {
            return res.status(200).send(`
                <h2 style="font-family:Arial;color:#009C3B;">✅ Webhook já estava registrado!</h2>
                <p style="font-family:Arial;">ID: ${jaExiste.id}</p>
                <p style="font-family:Arial;">URL: ${jaExiste.url}</p>
                <p style="font-family:Arial;">Evento: ${jaExiste.event}</p>
            `);
        }

        // Cria o webhook
        const criar = await fetch(`https://api.tiendanube.com/v1/${userId}/webhooks`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authentication': `bearer ${token}`,
                'User-Agent': 'WidiCare-CopaCashback/1.0 (widicasmarketing@gmail.com)'
            },
            body: JSON.stringify({
                event: 'order/created',
                url: urlWebhook
            })
        });

        const resultado = await criar.json();

        if (resultado.id) {
            return res.status(200).send(`
                <h2 style="font-family:Arial;color:#009C3B;">✅ Webhook registrado com sucesso!</h2>
                <p style="font-family:Arial;">ID: ${resultado.id}</p>
                <p style="font-family:Arial;">URL: ${resultado.url}</p>
                <p style="font-family:Arial;">Evento: ${resultado.event}</p>
                <p style="font-family:Arial;color:#666;">Pode fechar essa página.</p>
            `);
        } else {
            return res.status(500).send(`
                <h2 style="font-family:Arial;color:#e53e3e;">❌ Erro ao registrar webhook</h2>
                <pre style="font-family:Arial;">${JSON.stringify(resultado, null, 2)}</pre>
            `);
        }

    } catch (erro) {
        return res.status(500).send(`
            <h2 style="font-family:Arial;color:#e53e3e;">❌ Erro interno</h2>
            <p style="font-family:Arial;">${erro.message}</p>
        `);
    }
}
