export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    const senha = req.query.senha;
    if (senha !== 'widi') {
        return res.status(401).json({ erro: 'Senha incorreta' });
    }

    try {
        // Busca dados da planilha
        const token = await getGoogleToken();
        const sheetId = '1_sgDtQsHFpfv_PKbTBWATTk-nMzkRlI1IanLHQDRneU';

        const respSheet = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Página1!A:I?majorDimension=ROWS`,
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );

        const sheetData = await respSheet.json();
        const rows = sheetData.values || [];

        // Remove cabeçalho
        const clientes = rows.slice(1).filter(row => row[2] && row[7]); // tem email e cupom

        let enviados = 0;
        let erros = 0;
        const resultados = [];

        for (const row of clientes) {
            const dataCompra = row[0] || '';
            const nomeCliente = row[1] || '';
            const emailCliente = row[2] || '';
            const numeroPedido = row[4] || '';
            const golsStr = row[6] || '0 gol(s)';
            const codigoCupom = row[7] || '';
            const jaEnviado = row[8] || '';

            // Pula se já foi enviado
            if (jaEnviado === 'Sim') {
                resultados.push({ email: emailCliente, status: 'já enviado' });
                continue;
            }

            // Calcula % de cashback a partir do cupom (ex: COPA-15PCT-XXXXXX)
            const matchPct = codigoCupom.match(/COPA-(\d+)PCT-/);
            const pctCashback = matchPct ? matchPct[1] : '?';

            // Calcula data de validade: data da compra + 30 dias
            let dataValidade = '';
            try {
                const partesData = dataCompra.split(',')[0].trim(); // "19/06/2026"
                const [dia, mes, ano] = partesData.split('/');
                const dataObj = new Date(`${ano}-${mes}-${dia}`);
                dataObj.setDate(dataObj.getDate() + 30);
                dataValidade = dataObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            } catch (e) {
                dataValidade = '19/07/2026';
            }

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
            <p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 16px;">Seu cupom de cashback Copa Brasil chegou! 🎉</p>
            <p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 16px;">Use o código abaixo para garantir <strong>${pctCashback}% de desconto</strong> na sua próxima compra acima de R$99:</p>

            <!-- Cupom destaque -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
              <tr>
                <td align="center" style="background:#f3f4f6;border:2px dashed #d6408b;border-radius:10px;padding:20px;">
                  <p style="color:#999;font-size:12px;font-weight:700;letter-spacing:2px;margin:0 0 8px;text-transform:uppercase;">Seu cupom exclusivo</p>
                  <p style="color:#d6408b;font-size:26px;font-weight:900;letter-spacing:3px;margin:0;">${codigoCupom}</p>
                </td>
              </tr>
            </table>

            <p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 32px;">Válido até <strong>${dataValidade}</strong>. Aproveite para garantir seus próximos favoritos com essa condição especial!</p>
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

            try {
                const respEmail = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        from: 'Widi Care <noreply@lojawidicare.com.br>',
                        to: emailCliente,
                        subject: '🎉 Seu cupom de cashback Copa Brasil chegou!',
                        html: htmlEmail
                    })
                });

                if (respEmail.ok) {
                    enviados++;
                    resultados.push({ email: emailCliente, status: 'enviado' });

                    // Marca como enviado na planilha (coluna I)
                    const linhaIndex = rows.indexOf(row) + 1;
                    await fetch(
                        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Página1!I${linhaIndex}?valueInputOption=USER_ENTERED`,
                        {
                            method: 'PUT',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ values: [['Sim']] })
                        }
                    );
                } else {
                    erros++;
                    resultados.push({ email: emailCliente, status: 'erro envio' });
                }
            } catch (e) {
                erros++;
                resultados.push({ email: emailCliente, status: `erro: ${e.message}` });
            }

            // Pequena pausa para não sobrecarregar a API
            await new Promise(r => setTimeout(r, 200));
        }

        return res.status(200).send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>Disparo Cashback</title></head>
<body style="font-family:Arial;padding:32px;background:#f5f5f5;">
  <div style="max-width:600px;margin:0 auto;background:white;padding:32px;border-radius:12px;">
    <h2 style="color:#009C3B;">✅ Disparo concluído!</h2>
    <p><strong>Enviados:</strong> ${enviados}</p>
    <p><strong>Erros:</strong> ${erros}</p>
    <p><strong>Já enviados anteriormente:</strong> ${clientes.length - enviados - erros}</p>
    <hr>
    <h3>Detalhes:</h3>
    <table width="100%" style="border-collapse:collapse;">
      <tr style="background:#f5f5f5;">
        <th style="padding:8px;text-align:left;border:1px solid #ddd;">E-mail</th>
        <th style="padding:8px;text-align:left;border:1px solid #ddd;">Status</th>
      </tr>
      ${resultados.map(r => `
        <tr>
          <td style="padding:8px;border:1px solid #ddd;font-size:13px;">${r.email}</td>
          <td style="padding:8px;border:1px solid #ddd;font-size:13px;color:${r.status === 'enviado' ? '#009C3B' : r.status === 'já enviado' ? '#999' : '#e53e3e'};">${r.status}</td>
        </tr>
      `).join('')}
    </table>
  </div>
</body>
</html>
        `);

    } catch (erro) {
        console.error('Erro geral:', erro);
        return res.status(500).json({ erro: erro.message });
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
