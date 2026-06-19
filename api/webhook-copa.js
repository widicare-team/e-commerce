export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    try {
        const payload = req.body;
        console.log('PAYLOAD RECEBIDO:', JSON.stringify(payload));

        // Verifica se está dentro do período do jogo
        const agora = new Date();
        const inicio = new Date('2026-06-19T15:05:00-03:00');
        const fim = new Date('2026-06-20T21:30:00-03:00');

        if (agora < inicio || agora > fim) {
            console.log('Fora do período do jogo Copa Brasil');
            return res.status(200).json({ sucesso: true, msg: 'Fora do período da campanha' });
        }

        // Nuvemshop envia só o ID — busca os detalhes completos via API
        const pedidoId = payload.id;
        const storeId = payload.store_id || process.env.NUVEMSHOP_USER_ID;

        if (!pedidoId) {
            return res.status(200).json({ sucesso: true, msg: 'Payload sem ID de pedido' });
        }

        const respPedido = await fetch(`https://api.tiendanube.com/v1/${storeId}/orders/${pedidoId}`, {
            headers: {
                'Authentication': `bearer ${process.env.NUVEMSHOP_ACCESS_TOKEN}`,
                'User-Agent': 'WidiCare-CopaCashback/1.0 (widicasmarketing@gmail.com)'
            }
        });

        if (!respPedido.ok) {
            console.error('Erro ao buscar pedido:', await respPedido.text());
            return res.status(200).json({ sucesso: true, msg: 'Erro ao buscar detalhes do pedido' });
        }

        const pedido = await respPedido.json();
        console.log('PEDIDO COMPLETO:', JSON.stringify(pedido).substring(0, 500));

        // Dados do pedido
        const nomeCliente = pedido.contact_name || '';
        const emailCliente = pedido.contact_email || '';
        const cpfCliente = pedido.contact_identification || '';
        const numeroPedido = pedido.number || '';
        const valorPedido = parseFloat(pedido.total || pedido.subtotal || 0).toFixed(2);

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

        // Validade: 30 dias
        const validade = new Date();
        validade.setDate(validade.getDate() + 30);
        const validadeISO = validade.toISOString().split('T')[0];
        const dataValidade = validade.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });

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
                max_discount_percentage: 25,
                active: true
            })
        });

        if (!respCupom.ok) {
            const erro = await respCupom.text();
            console.error('Erro ao criar cupom Nuvemshop:', erro);
            return res.status(500).json({ erro: 'Falha ao criar cupom' });
        }

        console.log(`Cupom gerado: ${codigoCupom} | Pedido: #${numeroPedido} | Gols: ${gols} | Cashback: ${pctCashback}%`);

        // Envia e-mail via Resend
        if (emailCliente) {
            try {
                const nomeExibir = nomeCliente.split(' ')[0] || 'cliente';

                const htmlEmail = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;max-width:600px;width:100%;">
        <tr>
          <td align="center" valign="top">
            <table border="0" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:20px 0;">
                  <img src="https://d2az8otjr0j19j.cloudfront.net/templates/003/941/769/twig/static/images/logo_widi.png" alt="Logo WidiCare" style="display:block;max-width:150px;height:auto;" />
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 8px;">
            <p style="color:#333;font-size:16px;line-height:1.7;margin:0 0 16px;">Olá, <strong>${nomeExibir}</strong>!</p>
            <p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 16px;">Temos uma ótima notícia: você recebeu <strong>${pctCashback}% de cashback</strong> para usar na sua próxima compra na Widi Care. ✨</p>
            <p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 24px;">Seu cupom já está disponível e poderá ser utilizado até <strong>${dataValidade}</strong>.</p>
            <p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 32px;">Aproveite para garantir seus próximos favoritos com essa condição especial!</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 24px;text-align:center;">
            <a href="https://lojawidicare.com.br" style="background:#d6408b;color:white;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:700;display:inline-block;">Aproveitar Agora</a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 32px;text-align:center;">
            <p style="color:#999;font-size:13px;margin:0;">Confira aqui o <a href="https://lojawidicare.com.br/regulamento-promocional/" style="color:#d6408b;text-decoration:underline;">regulamento: Regras para Cupons e Promoções na Loja Online</a></p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9f9f9;padding:20px 32px;text-align:center;border-top:1px solid #eee;">
            <p style="color:#999;font-size:12px;margin:0;line-height:1.6;">Widi Care — Toda Beleza Importa<br><a href="https://lojawidicare.com.br" style="color:#d6408b;">lojawidicare.com.br</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

                await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        from: 'Widi Care Loja Oficial | Produtos Veganos para Todos os Cabelos <noreply@lojawidicare.com.br>',
                        to: emailCliente,
                        subject: '🎉 Seu cashback Copa Brasil chegou!',
                        html: htmlEmail
                    })
                });
                console.log(`E-mail enviado para ${emailCliente}`);
            } catch (erroEmail) {
                console.error('Erro ao enviar e-mail:', erroEmail.message);
            }
        }

        // Salva no Google Sheets
        try {
            const token = await getGoogleToken();
            const sheetId = '1_sgDtQsHFpfv_PKbTBWATTk-nMzkRlI1IanLHQDRneU';
            const agoraStr = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

            await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Página1!A:H:append?valueInputOption=USER_ENTERED`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        values: [[agoraStr, nomeCliente, emailCliente, cpfCliente, numeroPedido, `R$${valorPedido}`, `${gols} gol(s)`, codigoCupom]]
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
// Google Token
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
