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
  // INTEGRAÇÃO COM A O.S. — automática: lê serviços lançados,
  // cruza com a Tabela Tempária, e preenche os valores baseados em
  // (tempo padrão × valor da hora-mecânica da oficina).
  // ───────────────────────────────────────────────────────────────
  window.tempaSugerirParaOS = async function() {
    if (!TT.carregada) {
      try { await window.tempaCarregar(); }
      catch(e) {
        if (window.toast) window.toast('⚠ Tabela Tempária não carregou. Verifique se data/tabela-tempa.min.json está no GitHub Pages.', 'err');
        return;
      }
    }

    // 1. Lê todos os serviços já lançados na O.S.
    const linhas = document.querySelectorAll('#containerServicosOS > div');
    if (linhas.length === 0) {
      if (window.toast) window.toast('⚠ Nenhum serviço lançado ainda. Adicione pelo menos um serviço antes de sugerir tempos.', 'warn');
      return;
    }

    // 2. Pergunta o valor da hora mecânica (uma vez por sessão)
    let valorHora = parseFloat(sessionStorage.getItem('thiaguinho_valorHoraMec') || '0');
    if (!valorHora || valorHora <= 0) {
      const resp = prompt(
        '💡 Para sugerir valores, informe o valor da hora-mecânica da sua oficina:\n\n' +
        '(Sugestão regional: R$ 100 a R$ 180 por hora)\n\n' +
        'Digite só o número, ex: 120',
        '120'
      );
      if (!resp) return;
      valorHora = parseFloat(resp.replace(',', '.'));
      if (!valorHora || valorHora <= 0) {
        if (window.toast) window.toast('Valor inválido. Digite um número maior que zero.', 'err');
        return;
      }
      sessionStorage.setItem('thiaguinho_valorHoraMec', String(valorHora));
    }

    // 3. Para cada linha, busca na Tabela e preenche o valor
    let preenchidas = 0;
    let naoEncontradas = [];
    const detalhes = [];

    linhas.forEach((row, idx) => {
      const inputDesc = row.querySelector('.serv-desc');
      const inputValor = row.querySelector('.serv-valor');
      if (!inputDesc || !inputValor) return;

      const desc = (inputDesc.value || '').trim();
      if (!desc) return;

      // Busca o item mais relevante na Tabela
      const resultados = window.tempaBuscarPorTexto(desc, { limite: 1 });

      if (resultados.length > 0) {
        const item = resultados[0];
        const tempo = item.tempo;             // horas
        const valorSugerido = tempo * valorHora;

        // Preenche valor APENAS se estiver vazio ou zero (não sobrescreve valor manual)
        const valorAtual = parseFloat(inputValor.value || 0);
        if (valorAtual <= 0) {
          inputValor.value = valorSugerido.toFixed(2);
          // Adiciona dica visual sobre o tempo no descritivo
          if (!desc.toLowerCase().includes('h)') && !desc.toLowerCase().includes('horas')) {
            const tempoTxt = tempo >= 1 ? `${tempo.toFixed(1).replace('.', ',')}h` : `${Math.round(tempo*60)}min`;
            inputDesc.value = `${desc} (${tempoTxt})`;
          }
          preenchidas++;
          detalhes.push(`✓ "${desc.substring(0,40)}" → ${tempo}h × R$${valorHora} = R$${valorSugerido.toFixed(2)}`);
        } else {
          detalhes.push(`= "${desc.substring(0,40)}" já tinha valor R$${valorAtual.toFixed(2)} (mantido)`);
        }
      } else {
        naoEncontradas.push(desc.substring(0, 40));
        detalhes.push(`✗ "${desc.substring(0,40)}" não encontrado na Tabela`);
      }
    });

    // 4. Recalcula total
    if (typeof window.calcOSTotal === 'function') window.calcOSTotal();

    // 5. Feedback completo
    if (preenchidas === 0 && naoEncontradas.length === 0) {
      if (window.toast) window.toast('Todos os serviços já tinham valor preenchido. Nada alterado.', 'warn');
    } else if (preenchidas > 0 && naoEncontradas.length === 0) {
      if (window.toast) window.toast(`✓ ${preenchidas} serviço(s) preenchido(s) com tempos da Tabela Tempária. Valor hora: R$${valorHora.toFixed(2)}`, 'ok');
    } else if (preenchidas > 0 && naoEncontradas.length > 0) {
      const aviso = `✓ ${preenchidas} preenchido(s).\n⚠ ${naoEncontradas.length} não encontrado(s):\n${naoEncontradas.slice(0,3).join('\n')}${naoEncontradas.length > 3 ? '\n...' : ''}`;
      alert(aviso);
    } else {
      alert(`⚠ Nenhum serviço encontrado na Tabela Tempária.\n\nServiços testados:\n${naoEncontradas.slice(0,5).join('\n')}\n\nDica: use termos como "pastilha", "embreagem", "amortecedor", "bomba".`);
    }

    // Log detalhado no console pra auditoria
    console.log('[Tabela Tempária] Aplicação:\n' + detalhes.join('\n'));
  };

  // Helper para o gestor RESETAR o valor da hora (caso queira mudar)
  window.tempaResetarValorHora = function() {
    sessionStorage.removeItem('thiaguinho_valorHoraMec');
    if (window.toast) window.toast('Valor da hora resetado. Próxima sugestão vai perguntar de novo.', 'ok');
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
