/**
 * thIAguinho ERP — Tabela Tempária SINDIREPA-SP
 *
 * Carrega o JSON com 7.652 itens reais e fornece busca rápida.
 * Indexação em memória para pesquisa instantânea.
 *
 * APIs públicas:
 *   - window.tempaCarregar()       → baixa JSON do GitHub Pages
 *   - window.tempaPesquisar()      → executa busca da UI (Jarvis tela)
 *   - window.tempaBuscarPorTexto() → API programática usada pela IA e pela O.S.
 *   - window.tempaSugerirTempo()   → adiciona tempo da Tabela à OS aberta
 *
 * Powered by thIAguinho Soluções Digitais
 */
(function() {
  'use strict';

  // Estado global do módulo
  const TT = {
    carregada: false,
    carregando: false,
    dados: null,         // { _metadata, sistemas, itens }
    indice: null,        // mapa palavra-chave → array de itens (busca rápida)
    erro: null
  };
  window._tabelaTempa = TT;

  // ───────────────────────────────────────────────────────────────
  // CARREGAMENTO LAZY (só baixa quando o gestor abre a aba)
  // ───────────────────────────────────────────────────────────────
  window.tempaCarregar = async function() {
    if (TT.carregada || TT.carregando) return TT.dados;
    TT.carregando = true;
    try {
      // Tenta primeiro a versão minificada (mais rápida)
      const resp = await fetch('data/tabela-tempa.min.json', { cache: 'force-cache' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      TT.dados = await resp.json();
      TT.carregada = true;
      _construirIndice(TT.dados.itens);
      console.log('[TabelaTempa] Carregada:', TT.dados._metadata.totalItens, 'itens');
      return TT.dados;
    } catch (e) {
      TT.erro = e.message;
      console.error('[TabelaTempa] Falha ao carregar:', e);
      throw e;
    } finally {
      TT.carregando = false;
    }
  };

  function _construirIndice(itens) {
    // Tokeniza tudo em minúsculas removendo acentos para busca rápida
    TT.indice = itens.map(it => ({
      ref: it,
      busca: _norm(it.sistema) + ' ' + _norm(it.operacao) + ' ' + _norm(it.item) + ' ' + it.codigo
    }));
  }

  function _norm(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')   // remove acentos
      .replace(/[^a-z0-9 ]/g, ' ')        // remove pontuação
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ───────────────────────────────────────────────────────────────
  // API DE BUSCA (programática — usada pela IA e pela OS)
  // ───────────────────────────────────────────────────────────────
  window.tempaBuscarPorTexto = function(texto, opts) {
    if (!TT.carregada || !TT.indice) return [];
    opts = opts || {};
    const limite = opts.limite || 50;
    const sistemaFiltro = opts.sistema || '';
    const termos = _norm(texto).split(' ').filter(t => t.length >= 2);
    if (termos.length === 0 && !sistemaFiltro) return [];

    const resultados = [];
    for (const entry of TT.indice) {
      // Filtro por sistema se especificado
      if (sistemaFiltro && entry.ref.sistema !== sistemaFiltro) continue;
      // Todos os termos devem aparecer
      let bateu = true;
      for (const t of termos) {
        if (!entry.busca.includes(t)) { bateu = false; break; }
      }
      if (bateu) {
        resultados.push(entry.ref);
        if (resultados.length >= limite) break;
      }
    }
    return resultados;
  };

  // ───────────────────────────────────────────────────────────────
  // UI DA TELA TABELA TEMPÁRIA NO JARVIS
  // ───────────────────────────────────────────────────────────────
  window.tempaInicializarTela = async function() {
    const tbody = document.getElementById('tempaTbody');
    const cont = document.getElementById('tempaContador');
    const sel = document.getElementById('tempaSistema');
    if (!tbody) return;

    if (!TT.carregada) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--cyan);">⏳ Carregando 7.652 itens da Tabela Tempária SINDIREPA-SP...</td></tr>';
      try {
        await window.tempaCarregar();
      } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--danger);">⚠ Erro ao carregar: ${e.message}<br><small>Verifique se o arquivo data/tabela-tempa.min.json está no GitHub Pages.</small></td></tr>`;
        if (cont) cont.textContent = 'Erro';
        return;
      }
    }

    if (cont) cont.textContent = `${TT.dados._metadata.totalItens.toLocaleString('pt-BR')} itens · ${TT.dados._metadata.totalSistemas} sistemas`;

    // Popula select de sistemas (uma vez só)
    if (sel && sel.options.length <= 1) {
      const optsHTML = ['<option value="">Todos os sistemas</option>']
        .concat(TT.dados.sistemas.map(s => `<option value="${_esc(s)}">${_esc(s)}</option>`))
        .join('');
      sel.innerHTML = optsHTML;
    }

    window.tempaPesquisar();
  };

  window.tempaPesquisar = function() {
    if (!TT.carregada) {
      window.tempaInicializarTela();
      return;
    }

    const tbody = document.getElementById('tempaTbody');
    const status = document.getElementById('tempaStatus');
    const inp = document.getElementById('tempaSearch');
    const sel = document.getElementById('tempaSistema');

    const termo = inp ? inp.value.trim() : '';
    const sistema = sel ? sel.value : '';

    let resultados;
    if (!termo && !sistema) {
      resultados = TT.dados.itens.slice(0, 100);  // primeiros 100
    } else {
      resultados = window.tempaBuscarPorTexto(termo, { sistema, limite: 200 });
    }

    if (status) {
      if (!termo && !sistema) {
        status.textContent = `Mostrando 100 itens iniciais. Use a busca para filtrar nos ${TT.dados._metadata.totalItens.toLocaleString('pt-BR')} itens.`;
      } else {
        status.textContent = `${resultados.length} resultado(s) encontrado(s)`;
      }
    }

    if (resultados.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--muted);">Nenhum item encontrado. Tente outros termos.</td></tr>`;
      return;
    }

    tbody.innerHTML = resultados.map(it => {
      const tempoFmt = it.tempo.toFixed(2).replace('.', ',');
      const tempoHHmm = _hToHHmm(it.tempo);
      return `<tr>
        <td><span class="pill pill-cyan" style="font-family:var(--fm);font-size:0.65rem;">${_esc(it.codigo)}</span></td>
        <td style="font-size:0.78rem;color:var(--text);">${_esc(it.sistema)}</td>
        <td><span style="font-family:var(--fm);font-size:0.7rem;color:var(--warn);">${_esc(it.operacao)}</span></td>
        <td style="font-size:0.8rem;">${_esc(it.item)}</td>
        <td style="text-align:right;font-family:var(--fm);font-weight:700;color:var(--success);">${tempoFmt}h<br><small style="color:var(--muted);font-weight:400;">${tempoHHmm}</small></td>
        <td style="text-align:center;">
          <button class="btn-ghost" style="font-size:0.65rem;padding:5px 10px;" onclick='window.tempaCopiarItem(${JSON.stringify(it).replace(/'/g, "&apos;")})' title="Copiar para a área de transferência">📋</button>
        </td>
      </tr>`;
    }).join('');
  };

  // ───────────────────────────────────────────────────────────────
  // FERRAMENTAS AUXILIARES
  // ───────────────────────────────────────────────────────────────
  window.tempaCopiarItem = function(it) {
    const txt = `${it.sistema} | ${it.operacao} | ${it.item} | ${it.tempo.toFixed(2).replace('.', ',')}h`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(txt).then(() => {
        if (window.toast) window.toast('✓ Item copiado: ' + txt.substring(0, 60), 'ok');
      });
    } else {
      if (window.toast) window.toast('Item: ' + txt, 'ok');
    }
  };

  // ───────────────────────────────────────────────────────────────
  // INTEGRAÇÃO COM A IA — chamada quando o gestor pergunta tempo
  // Detecta intenções tipo "quanto tempo para trocar pastilha"
  // e devolve resposta enriquecida com dados reais da tabela.
  // ───────────────────────────────────────────────────────────────
  window.tempaConsultarParaIA = async function(textoPergunta) {
    if (!TT.carregada) {
      try { await window.tempaCarregar(); }
      catch(e) { return null; }
    }
    const resultados = window.tempaBuscarPorTexto(textoPergunta, { limite: 8 });
    if (resultados.length === 0) return null;
    return {
      total: resultados.length,
      itens: resultados,
      resumo: resultados.map(it =>
        `• [${it.codigo}] ${it.operacao} ${it.item} (${it.sistema}): ${it.tempo.toFixed(2).replace('.', ',')}h`
      ).join('\n')
    };
  };

  // ───────────────────────────────────────────────────────────────
  // INTEGRAÇÃO COM A O.S. — botão "Sugerir Tempo (Tabela Tempária)"
  // ───────────────────────────────────────────────────────────────
  window.tempaSugerirParaOS = async function() {
    if (!TT.carregada) {
      try { await window.tempaCarregar(); }
      catch(e) { if (window.toast) window.toast('⚠ Tabela Tempária não carregada', 'err'); return; }
    }
    // Pega o que está no campo "Defeito" ou "Diagnóstico" da OS
    const defeito = (document.getElementById('osDescricao')?.value || '').trim();
    const diag = (document.getElementById('osDiagnostico')?.value || '').trim();
    const referencia = diag || defeito;
    if (!referencia) {
      if (window.toast) window.toast('Preencha o defeito ou diagnóstico antes de sugerir tempos', 'warn');
      return;
    }
    const resultados = window.tempaBuscarPorTexto(referencia, { limite: 10 });
    if (resultados.length === 0) {
      if (window.toast) window.toast('⚠ Nenhum tempo encontrado na tabela. Tente termos diferentes.', 'warn');
      return;
    }
    // Mostra modal simples com os resultados
    const html = `
      <div style="padding:14px;">
        <div style="font-family:var(--fm);font-size:0.7rem;color:var(--muted);margin-bottom:10px;">
          ${resultados.length} sugestões da Tabela Tempária baseadas em: "<em>${_esc(referencia.substring(0,80))}</em>"
        </div>
        <table class="j-table" style="font-size:0.78rem;">
          <thead><tr><th>Sistema</th><th>Operação</th><th>Item</th><th style="width:80px;text-align:right;">Tempo</th></tr></thead>
          <tbody>
            ${resultados.map(it => `<tr>
              <td>${_esc(it.sistema.substring(0,30))}</td>
              <td><small style="color:var(--warn);">${_esc(it.operacao)}</small></td>
              <td>${_esc(it.item)}</td>
              <td style="text-align:right;color:var(--success);font-weight:700;">${it.tempo.toFixed(2).replace('.', ',')}h<br><small>${_hToHHmm(it.tempo)}</small></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    // Cria um modal volátil
    let modal = document.getElementById('modalTempaSugest');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modalTempaSugest';
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal" style="max-width:760px;">
          <div class="modal-head">
            <div class="modal-title">📖 Sugestões da Tabela Tempária</div>
            <button class="modal-close" onclick="document.getElementById('modalTempaSugest').classList.remove('open')">✕</button>
          </div>
          <div class="modal-body" id="modalTempaSugestBody"></div>
          <div class="modal-foot">
            <button class="btn-ghost" onclick="document.getElementById('modalTempaSugest').classList.remove('open')">FECHAR</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }
    document.getElementById('modalTempaSugestBody').innerHTML = html;
    modal.classList.add('open');
  };

  // ───────────────────────────────────────────────────────────────
  // UTILS
  // ───────────────────────────────────────────────────────────────
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[<>&"']/g, ch => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  function _hToHHmm(h) {
    const total = Math.round(h * 60);
    const hh = Math.floor(total / 60);
    const mm = total % 60;
    if (hh === 0) return `${mm}min`;
    if (mm === 0) return `${hh}h`;
    return `${hh}h${String(mm).padStart(2, '0')}`;
  }

  // Auto-init quando alguém clica no menu Tabela Tempária
  if (typeof window.ir === 'function' && !window._irOriginalTempa) {
    window._irOriginalTempa = window.ir;
    window.ir = function(rota, el) {
      window._irOriginalTempa(rota, el);
      if (rota === 'tabelatempa') setTimeout(window.tempaInicializarTela, 50);
    };
  }
})();

/* Powered by thIAguinho Soluções Digitais */
