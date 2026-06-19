export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    try {
        const pedido = req.body;

        // Dados do pedido
        const nomeCliente = pedido.contact_name || '';
        const emailCliente = pedido.contact_email || '';
        const cpfCliente = pedido.contact_identification || '';
        const numeroPedido = pedido.number || '';
        const valorPedido = parseFloat(pedido.total || 0).toFixed(2);

        // Busca o placar atual no Redis
        const redisUrl = process.env.KV_REST_API_URL;
        const redisToken = process.env.KV_REST_API_TOKEN;

        const r = await fetch(`${redisUrl}/get/copa_gols`, {
            headers: { Authorization: `Bearer ${redisToken}` }
        });
        const d = await r.json();
        const gols = parseInt(d.result || 0);
        const pctCashback = gols * 5;

        // Se não tiver gols, não gera cupom
        if (gols === 0) {
            console.log(`Pedido #${numeroPedido} — sem gols, sem cashback`);
            return res.status(200).json({ sucesso: true, msg: 'Sem gols, sem cupom gerado' });
        }

        // Valor mínimo para ganhar o cupom: R$26,00
        if (parseFloat(valorPedido) < 26) {
            console.log(`Pedido #${numeroPedido} — valor R$${valorPedido} abaixo do mínimo de R$26,00`);
            return res.status(200).json({ sucesso: true, msg: 'Pedido abaixo do valor mínimo de R$26,00' });
        }

        // Gera cupom único
        const sufixo = Math.random().toString(36).substring(2, 8).toUpperCase();
        const codigoCupom = `COPA-${pctCashback}PCT-${sufixo}`;

        // Validade: 37 dias (7 dias para envio + 30 dias para uso)
        const validade = new Date();
        validade.setDate(validade.getDate() + 37);
        const validadeISO = validade.toISOString().split('T')[0];

        // Cria cupom na Nuvemshop
        const urlApi = `https://api.tiendanube.com/v1/${process.env.NUVEMSHOP_USER_ID}/coupons`;

        const respCupom = await fetch(urlApi, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authentication': `bearer ${process.env.NUVEMSHOP_ACCESS_TOKEN}`,
                'User-Agent': 'WidiCare-CopaCashback/1.0 (widicasmarketing@gmail.com)'
            },
            body: JSON.stringify({
                code: codigoCupom,
                type: 'percentage',
                value: pctCashback,
                valid_until: validadeISO,
                max_uses: 1,
                min_price: 99,
                active: true
            })
        });

        if (!respCupom.ok) {
            const erro = await respCupom.text();
            console.error('Erro ao criar cupom Nuvemshop:', erro);
            return res.status(500).json({ erro: 'Falha ao criar cupom' });
        }

        console.log(`Cupom gerado: ${codigoCupom} | Pedido: #${numeroPedido} | Gols: ${gols} | Cashback: ${pctCashback}%`);

        // Salva no Google Sheets
        try {
            const token = await getGoogleToken();
            const sheetId = '1_sgDtQsHFpfv_PKbTBWATTk-nMzkRlI1IanLHQDRneU';
            const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

            await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Página1!A:H:append?valueInputOption=USER_ENTERED`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        values: [[agora, nomeCliente, emailCliente, cpfCliente, numeroPedido, `R$${valorPedido}`, `${gols} gol(s)`, codigoCupom]]
                    })
                }
            );
            console.log('Salvo no Sheets com sucesso');
        } catch (erroSheets) {
            console.error('Erro Google Sheets:', erroSheets.message);
        }

        return res.status(200).json({
            sucesso: true,
            cupom: codigoCupom,
            gols,
            cashback: `${pctCashback}%`
        });

    } catch (erro) {
        console.error('Erro interno webhook:', erro);
        return res.status(500).json({ erro: 'Erro interno' });
    }
}

// =============================================
// Google Token (mesmo do gerar-cupom.js)
// =============================================
function base64url(data) {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    return btoa(unescape(encodeURIComponent(str)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlFromBuffer(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function getGoogleToken() {
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
    const now = Math.floor(Date.now() / 1000);

    const header = base64url({ alg: 'RS256', typ: 'JWT' });
    const payload = base64url({
        iss: clientEmail,
        sub: clientEmail,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
    });

    const signingInput = `${header}.${payload}`;

    const cryptoKey = await crypto.subtle.importKey(
        'pkcs8',
        pemToArrayBuffer(privateKey),
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        cryptoKey,
        new TextEncoder().encode(signingInput)
    );

    const jwt = `${signingInput}.${base64urlFromBuffer(signature)}`;

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
    });

    const tokenData = await tokenResp.json();
    return tokenData.access_token;
}

function pemToArrayBuffer(pem) {
    const base64 = pem
        .replace('-----BEGIN PRIVATE KEY-----', '')
        .replace('-----END PRIVATE KEY-----', '')
        .replace('-----BEGIN RSA PRIVATE KEY-----', '')
        .replace('-----END RSA PRIVATE KEY-----', '')
        .replace(/\s/g, '');
    const binary = atob(base64);
    const buffer = new ArrayBuffer(binary.length);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i++) {
        view[i] = binary.charCodeAt(i);
    }
    return buffer;
}
