export default async function handler(req, res) {
    const origensPermitidas = [
        'https://testewidicare.lojavirtualnuvem.com.br',
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
    if (!['gol', 'trave'].includes(resultado)) {
        return res.status(400).json({ erro: 'Resultado inválido' });
    }
    if (!/^\d{11}$/.test(cpf)) {
        return res.status(400).json({ erro: 'CPF inválido' });
    }

    try {
        const sufixo = Math.random().toString(36).substring(2, 8).toUpperCase();
        const prefixo = resultado === 'gol' ? 'WIDI-GOL' : 'WIDI-TRAVE';
        const codigoCupom = `${prefixo}-${sufixo}`;
        const ehGol = resultado === 'gol';

        const validade = new Date();
        validade.setHours(validade.getHours() + 48);
        const validadeISO = validade.toISOString().split('T')[0];

        // CORRIGIDO: tipos corretos e campos válidos da API Nuvemshop
        const dadosCupom = {
            code: codigoCupom,
            type: 'percentage',
            value: ehGol ? 20 : 10,           // número, não string
            valid_until: validadeISO,           // nome correto do campo
            max_uses: 1,
            min_price: ehGol ? 150 : 0,        // número, não string
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

        const cupomCriado = await resposta.json();
        console.log(`Cupom gerado: ${codigoCupom} | CPF: ${cpf} | Email: ${email} | Resultado: ${resultado}`);

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
