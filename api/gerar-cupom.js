export default async function handler(req, res) {

    const origensPermitidas = [
        'https://testewidicare.lojavirtualnuvem.com.br',
        'https://lojawidicare.com.br',
        'https://www.lojawidicare.com.br'
    ];
    const origem = req.headers.origin;
    if (origensPermitidas.includes(origem)) {
        res.setHeader('Access-Control-Allow-Origin', origem);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

    const { resultado, cpf, email } = req.body;

    if (!resultado || !cpf || !email) {
        return res.status(400).json({ erro: 'Dados incompletos' });
    }
    if (!['gol', 'trave', 'verificar'].includes(resultado)) {
        return res.status(400).json({ erro: 'Resultado inválido' });
    }
    if (!/^\d{11}$/.test(cpf)) {
        return res.status(400).json({ erro: 'CPF inválido' });
    }

    if (resultado === 'verificar') {
        try {
            const redisUrl = process.env.KV_REST_API_URL;
            const redisToken = process.env.KV_REST_API_TOKEN;
            const checkResp = await fetch(`${redisUrl}/get/jogou_${cpf}`, {
                headers: { Authorization: `Bearer ${redisToken}` }
            });
            const checkData = await checkResp.json();
            if (checkData.result) {
                return res.status(200).json({ jaJogou: true });
            }
            return res.status(200).json({ jaJogou: false });
        } catch (e) {
            return res.status(200).json({ jaJogou: false });
        }
    }

    try {
        const redisUrl = process.env.KV_REST_API_URL;
        const redisToken = process.env.KV_REST_API_TOKEN;

        const checkResp = await fetch(`${redisUrl}/get/jogou_${cpf}`, {
            headers: { Authorization: `Bearer ${redisToken}` }
        });
        const checkData = await checkResp.json();

        if (checkData.result) {
            return res.status(400).json({
                erro: 'Este CPF já participou do jogo.',
                jaJogou: true
            });
        }

        await fetch(`${redisUrl}/set/jogou_${cpf}/true/ex/31536000`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${redisToken}` }
        });

    } catch (erroRedis) {
        console.error('Erro Redis:', erroRedis);
    }

    try {
        const sufixo = Math.random().toString(36).substring(2, 8).toUpperCase();
        const prefixo = resultado === 'gol' ? 'WIDI-GOL' : 'WIDI-TRAVE';
        const codigoCupom = `${prefixo}-${sufixo}`;
        const ehGol = resultado === 'gol';

        const validade = new Date();
        validade.setHours(validade.getHours() + 48);
        const validadeISO = validade.toISOString().split('T')[0];

        const dadosCupom = {
            code: codigoCupom,
            type: 'percentage',
            value: ehGol ? 12 : 5,
            valid_until: validadeISO,
            max_uses: 1,
            min_price: ehGol ? 150 : 0,
            active: true
        };

        const urlApi = `https://api.tiendanube.com/v1/${process.env.NUVEMSHOP_USER_ID}/coupons`;

        const resposta = await fetch(urlApi, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authentication': `bearer ${process.env.NUVEMSHOP_ACCESS_TOKEN}`,
                'User-Agent': 'WidiCare-JogoCopa/1.0 (widicasmarketing@gmail.com)'
            },
            body: JSON.stringify(dadosCupom)
        });

        if (!resposta.ok) {
            const erro = await resposta.text();
            console.error('Erro Nuvemshop:', erro);
            return res.status(500).json({ erro: 'Falha ao criar cupom' });
        }

        console.log(`Cupom gerado: ${codigoCupom} | CPF: ${cpf} | Email: ${email} | Resultado: ${resultado}`);

        try {
            const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
            const resultadoTexto = resultado === 'gol' ? 'GOL ⚽' : 'TRAVE 🇧🇷';

            const token = await getGoogleToken();
            console.log('Token Google obtido:', token ? 'sim' : 'não');

            const sheetId = process.env.GOOGLE_SHEET_ID;
            const range = 'Página1!A:F';
            const urlSheets = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=USER_ENTERED`;

            const sheetsResp = await fetch(urlSheets, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    values: [[agora, cpf, email, resultadoTexto, codigoCupom, 'Não']]
                })
            });

            const sheetsData = await sheetsResp.json();
            console.log('Resposta Sheets:', JSON.stringify(sheetsData));

        } catch (erroSheets) {
            console.error('Erro Google Sheets detalhado:', erroSheets.message, erroSheets.stack);
        }

        return res.status(200).json({
            sucesso: true,
            cupom: codigoCupom,
            desconto: ehGol ? '20%' : '10%',
            validade: validadeISO,
            minimoCompra: ehGol ? 'R$150' : 'sem mínimo'
        });

    } catch (erro) {
        console.error('Erro interno:', erro);
        return res.status(500).json({ erro: 'Erro interno ao gerar cupom' });
    }
}

// FIX: Base64 URL-safe encoding para JWT válido
function base64url(data) {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    return btoa(unescape(encodeURIComponent(str)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

function base64urlFromBuffer(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
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
    console.log('Token response Google:', JSON.stringify(tokenData));
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
