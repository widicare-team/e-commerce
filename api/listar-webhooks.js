export default async function handler(req, res) {
    const userId = process.env.NUVEMSHOP_USER_ID;
    const token = process.env.NUVEMSHOP_ACCESS_TOKEN;

    // GET — lista todos os webhooks
    if (req.method === 'GET') {
        const r = await fetch(`https://api.tiendanube.com/v1/${userId}/webhooks`, {
            headers: {
                'Authentication': `bearer ${token}`,
                'User-Agent': 'WidiCare-CopaCashback/1.0 (widicasmarketing@gmail.com)'
            }
        });
        const webhooks = await r.json();

        const linhas = webhooks.map(w => `
            <tr>
                <td>${w.id}</td>
                <td>${w.event}</td>
                <td>${w.url}</td>
                <td>
                    <form method="POST">
                        <input type="hidden" name="id" value="${w.id}" />
                        <button type="submit" style="background:#e53e3e;color:white;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;">Deletar</button>
                    </form>
                </td>
            </tr>
        `).join('');

        return res.status(200).send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Webhooks Nuvemshop</title>
<style>
  body { font-family: Arial, sans-serif; padding: 24px; background: #f5f5f5; }
  h2 { color: #002776; }
  table { border-collapse: collapse; width: 100%; background: white; border-radius: 8px; overflow: hidden; }
  th { background: #002776; color: white; padding: 12px; text-align: left; }
  td { padding: 12px; border-bottom: 1px solid #eee; }
</style>
</head>
<body>
  <h2>Webhooks registrados na Nuvemshop</h2>
  <table>
    <thead><tr><th>ID</th><th>Evento</th><th>URL</th><th>Ação</th></tr></thead>
    <tbody>${linhas}</tbody>
  </table>
</body>
</html>
        `);
    }

    // POST — deleta um webhook pelo ID
    if (req.method === 'POST') {
        const id = req.body?.id;
        if (!id) return res.status(400).send('ID não informado');

        const r = await fetch(`https://api.tiendanube.com/v1/${userId}/webhooks/${id}`, {
            method: 'DELETE',
            headers: {
                'Authentication': `bearer ${token}`,
                'User-Agent': 'WidiCare-CopaCashback/1.0 (widicasmarketing@gmail.com)'
            }
        });

        if (r.ok) {
            return res.status(200).send(`
                <p style="font-family:Arial;color:#009C3B;">✅ Webhook ${id} deletado! <a href="/api/listar-webhooks">Voltar</a></p>
            `);
        } else {
            const erro = await r.text();
            return res.status(500).send(`
                <p style="font-family:Arial;color:#e53e3e;">❌ Erro ao deletar: ${erro}</p>
            `);
        }
    }

    return res.status(405).end();
}
