/**
 * frete-funcionarios.js
 * Endpoint Vercel — Transportadora externa da Nuvemshop
 *
 * Recebe o CEP do cliente e retorna frete grátis
 * apenas para os CEPs autorizados (galpão e escritório).
 * Para qualquer outro CEP, não retorna opções (passa para a Frenet).
 */

const CEPS_PERMITIDOS = ['20031918', '25520670'];

function normalizarCep(cep) {
    return (cep || '').replace(/\D/g, '');
}

export default async function handler(req, res) {
    // Nuvemshop envia POST com o CEP no body
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { destination } = req.body || {};
    const cep = normalizarCep(destination?.zipcode || '');

    // Se o CEP não for permitido, retorna array vazio
    // (Nuvemshop vai usar as outras transportadoras normalmente)
    if (!CEPS_PERMITIDOS.includes(cep)) {
        return res.status(200).json({ rates: [] });
    }

    // CEP permitido — retorna frete grátis
    return res.status(200).json({
        rates: [
            {
                name: 'Frete Funcionários',
                code: 'FUNC_FREE',
                price: '0.00',
                currency: 'BRL',
                type: 'ship',
                min_delivery_date: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000)
                    .toISOString()
                    .split('T')[0],
                max_delivery_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
                    .toISOString()
                    .split('T')[0],
                phone_required: false,
                reference: 'func-free',
                description: 'Entrega exclusiva para funcionários',
            },
        ],
    });
}
