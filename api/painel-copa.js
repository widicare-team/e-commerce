export default async function handler(req, res) {
    const redisUrl = process.env.KV_REST_API_URL;
    const redisToken = process.env.KV_REST_API_TOKEN;
    const senha = process.env.SENHA_PAINEL || 'widi';

    // GET — retorna o HTML do painel
    if (req.method === 'GET') {
        const r = await fetch(`${redisUrl}/get/copa_gols`, {
            headers: { Authorization: `Bearer ${redisToken}` }
        });
        const d = await r.json();
        const gols = parseInt(d.result || 0);
        const pct = gols * 5;

        return res.status(200).send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Painel Copa Brasil — Widi Care</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: Arial, sans-serif; }
  body { background: #002776; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
  .card { background: white; border-radius: 16px; padding: 32px; max-width: 400px; width: 100%; text-align: center; border: 4px solid #FFDC00; }
  .logo { color: #009C3B; font-size: 20px; font-weight: 900; margin-bottom: 4px; }
  .sub { color: #666; font-size: 13px; margin-bottom: 24px; }
  .placar { font-size: 72px; font-weight: 900; color: #002776; line-height: 1; }
  .placar-label { font-size: 14px; color: #666; margin-bottom: 4px; }
  .cashback { font-size: 28px; font-weight: 700; color: #009C3B; margin: 8px 0 24px; }
  .btns { display: flex; gap: 12px; justify-content: center; margin-bottom: 20px; }
  .btn { padding: 14px 28px; border: none; border-radius: 8px; font-size: 22px; font-weight: 700; cursor: pointer; flex: 1; }
  .btn-plus { background: #009C3B; color: white; }
  .btn-minus { background: #e53e3e; color: white; }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-reset { width: 100%; padding: 10px; background: #f5f5f5; color: #666; border: none; border-radius: 8px; font-size: 13px; cursor: pointer; margin-bottom: 12px; }
  .senha-wrap { border-top: 1px solid #eee; padding-top: 16px; }
  .senha-wrap input { width: 100%; padding: 10px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px; text-align: center; margin-bottom: 8px; }
  .msg { font-size: 12px; color: #009C3B; min-height: 18px; margin-top: 8px; }
  .hora { font-size: 11px; color: #999; margin-top: 12px; }
</style>
</head>
<body>
<div class="card">
  <div class="logo">WIDI CARE</div>
  <div class="sub">Painel Copa Brasil 2026 — Cashback ao Vivo</div>

  <div class="placar-label">Gols do Brasil</div>
  <div class="placar" id="gols">${gols}</div>
  <div class="cashback" id="cashback">${pct > 0 ? pct + '% de cashback' : 'Sem cashback'}</div>

  <div class="btns">
    <button class="btn btn-minus" onclick="atualizar(-1)" ${gols === 0 ? 'disabled' : ''} id="btnMinus">−</button>
    <button class="btn btn-plus" onclick="atualizar(1)" id="btnPlus">+</button>
  </div>
  <button class="btn-reset" onclick="resetar()">🔄 Resetar para 0</button>

  <div class="senha-wrap">
    <input type="password" id="senha" placeholder="Senha" value="" />
    <div class="msg" id="msg"></div>
  </div>
  <div class="hora" id="hora"></div>
</div>

<script>
  document.getElementById('hora').innerText = 'Última atualização: ' + new Date().toLocaleTimeString('pt-BR');

  async function atualizar(delta) {
    const senha = document.getElementById('senha').value;
    if (!senha) { document.getElementById('msg').innerText = '⚠️ Digite a senha'; return; }

    const resp = await fetch('/api/painel-copa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'atualizar', delta, senha })
    });
    const d = await resp.json();
    if (d.erro) { document.getElementById('msg').innerText = '❌ ' + d.erro; return; }

    document.getElementById('gols').innerText = d.gols;
    document.getElementById('cashback').innerText = d.gols > 0 ? (d.gols * 5) + '% de cashback' : 'Sem cashback';
    document.getElementById('btnMinus').disabled = d.gols === 0;
    document.getElementById('msg').innerText = '✅ Atualizado! Placar: ' + d.gols + ' gol(s)';
    document.getElementById('hora').innerText = 'Última atualização: ' + new Date().toLocaleTimeString('pt-BR');
  }

  async function resetar() {
    const senha = document.getElementById('senha').value;
    if (!senha) { document.getElementById('msg').innerText = '⚠️ Digite a senha'; return; }
    if (!confirm('Resetar o placar para 0?')) return;

    const resp = await fetch('/api/painel-copa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'resetar', senha })
    });
    const d = await resp.json();
    if (d.erro) { document.getElementById('msg').innerText = '❌ ' + d.erro; return; }

    document.getElementById('gols').innerText = 0;
    document.getElementById('cashback').innerText = 'Sem cashback';
    document.getElementById('btnMinus').disabled = true;
    document.getElementById('msg').innerText = '✅ Placar resetado!';
  }
</script>
</body>
</html>
        `);
    }

    // POST — atualiza o placar
    if (req.method === 'POST') {
        const { acao, delta, senha: senhaDig } = req.body;

        if (senhaDig !== senha) {
            return res.status(401).json({ erro: 'Senha incorreta' });
        }

        const r = await fetch(`${redisUrl}/get/copa_gols`, {
            headers: { Authorization: `Bearer ${redisToken}` }
        });
        const d = await r.json();
        let gols = parseInt(d.result || 0);

        if (acao === 'resetar') {
            gols = 0;
        } else if (acao === 'atualizar') {
            gols = Math.max(0, gols + delta);
        }

        await fetch(`${redisUrl}/set/copa_gols/${gols}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${redisToken}` }
        });

        return res.status(200).json({ sucesso: true, gols, cashback: gols * 5 });
    }

    return res.status(405).json({ erro: 'Método não permitido' });
}
