(() => {
  'use strict';

  const root = document.documentElement;
  const PARTY_COLORS = {
    PL:'#165dff', PT:'#e31d2b', PSD:'#ef8d22', NOVO:'#e86e1c', MDB:'#3e9278',
    PSOL:'#d5b913', PDT:'#d34646', PSB:'#d5a51d', PP:'#3471bf', 'UNIÃO':'#207da5',
    REPUBLICANOS:'#587cca', AVANTE:'#7b1bd1', PCB:'#8d2737', PSTU:'#b82d3d', UP:'#bd20c8',
    PCO:'#7a2530', DC:'#23847b', 'MISSÃO':'#6e58a0', DEMOCRATA:'#25838d'
  };

  const fmt = value => new Intl.NumberFormat('pt-BR').format(Number(value || 0));
  const pct = value => `${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));

  function partyColor(party) {
    const key = String(party || '').toUpperCase();
    if (PARTY_COLORS[key]) return PARTY_COLORS[key];
    let hash = 0;
    for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) % 360;
    return `hsl(${hash || 205} 62% 46%)`;
  }

  function initials(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  }

  function isElected(candidate) {
    if (candidate?.elected === true || candidate?.isElected === true) return true;
    const status = String(candidate?.status || candidate?.resultStatus || candidate?.situation || '').toUpperCase();
    return /\bELEIT[OA]S?\b/.test(status) && !/NÃO\s+ELEIT/.test(status);
  }

  function panel() {
    return document.querySelector('.mobile-map-bottom-results');
  }

  function activeOffice() {
    const button = document.querySelector('.office-btn[data-office].active');
    return {
      code: button?.dataset?.office || 'presidente',
      label: button?.textContent?.trim() || 'Presidente'
    };
  }

  function mapAtBrasil() {
    return (document.getElementById('mapTitle')?.textContent || '').trim().toLowerCase() === 'brasil';
  }

  function renderLoadingForOffice() {
    const target = panel();
    if (!target) return;
    const office = activeOffice();
    target.classList.add('mobile-map-carousel-ready');
    if (office.code !== 'presidente' && mapAtBrasil()) {
      target.innerHTML = `
        <div class="mobile-map-office-prompt">
          <strong>${escapeHtml(office.label)}</strong>
          <span>Selecione um estado no mapa para carregar esta apuração.</span>
        </div>`;
      return;
    }
    target.innerHTML = `
      <div class="mobile-map-office-prompt is-loading">
        <strong>${escapeHtml(office.label)}</strong>
        <span>Atualizando dados oficiais…</span>
      </div>`;
  }

  function candidateCard(candidate, index) {
    const name = candidate?.ballotName || candidate?.name || 'Candidato';
    const color = partyColor(candidate?.party);
    const elected = isElected(candidate);
    const photo = candidate?.photoUrl
      ? `<img src="${escapeHtml(candidate.photoUrl)}" alt="Foto de ${escapeHtml(name)}" loading="lazy" onerror="this.remove()">`
      : '';
    return `
      <article class="mobile-map-candidate mobile-map-carousel-card${elected ? ' is-elected' : ''}" data-candidate-index="${index}" style="--candidate-color:${color}" tabindex="0" role="listitem">
        ${elected ? '<span class="mobile-map-elected-badge">ELEITO</span>' : ''}
        <div class="mobile-map-candidate-photo">${photo}<span>${escapeHtml(initials(name))}</span></div>
        <div class="mobile-map-candidate-body">
          <div class="mobile-map-candidate-name">${escapeHtml(name)}</div>
          <div class="mobile-map-candidate-meta">
            <span class="mobile-map-candidate-party">${escapeHtml(candidate?.party || '—')}</span>
            <span>Nº ${escapeHtml(candidate?.number || '—')}</span>
          </div>
        </div>
        <div class="mobile-map-candidate-bottom">
          <div class="mobile-map-candidate-votes">${fmt(candidate?.votes)} votos</div>
          <div class="mobile-map-candidate-percent">${pct(candidate?.percentage)}</div>
        </div>
      </article>`;
  }

  function render(result) {
    if (!result || result.available === false) return;
    const target = panel();
    if (!target) return;

    const sections = result.sections || {};
    const total = Math.max(0, Number(sections.total || 0));
    const totalized = Math.max(0, Number(sections.totalized || 0));
    const progress = Math.max(0, Math.min(100, Number(sections.percentage || (total ? totalized / total * 100 : 0))));
    const office = activeOffice();
    const maxCandidates = office.code.startsWith('deputado') ? 80 : 30;
    const candidates = (result.candidates || []).slice(0, maxCandidates);

    const count = `
      <div class="mobile-map-count">
        <div>
          <span>URNAS APURADAS · ${escapeHtml(office.label.toUpperCase())}</span>
          <strong>${fmt(totalized)}${total ? ` de ${fmt(total)}` : ''}</strong>
        </div>
        <b>${pct(progress)}</b>
      </div>`;

    target.classList.add('mobile-map-carousel-ready');
    target.innerHTML = candidates.length
      ? `${count}
         <div class="mobile-map-candidate-strip" role="list" aria-label="Candidatos — deslize horizontalmente">
           ${candidates.map(candidateCard).join('')}
         </div>
         ${candidates.length > 2 ? '<div class="mobile-map-swipe-hint" aria-hidden="true"><span>Deslize para ver mais candidatos</span><b>›</b></div>' : ''}`
      : `${count}<div class="mobile-map-office-prompt"><strong>${escapeHtml(office.label)}</strong><span>Ainda não há votos computados para este recorte.</span></div>`;

    const strip = target.querySelector('.mobile-map-candidate-strip');
    if (strip) {
      strip.scrollLeft = 0;
      strip.addEventListener('click', event => event.stopPropagation());
    }
  }

  function handleResultEvent(event) {
    render(event.detail?.result);
  }

  window.addEventListener('apura:result-year-loaded', handleResultEvent);
  window.addEventListener('apura:election-year-changed', handleResultEvent);
  window.addEventListener('apura:historical-result-loaded', handleResultEvent);

  document.addEventListener('click', event => {
    const officeButton = event.target.closest('.office-btn[data-office]');
    if (!officeButton || !root.classList.contains('mobile-ui')) return;
    requestAnimationFrame(renderLoadingForOffice);
  });

  const mapTitle = document.getElementById('mapTitle');
  if (mapTitle) {
    new MutationObserver(() => {
      const office = activeOffice();
      if (office.code !== 'presidente' && mapAtBrasil()) renderLoadingForOffice();
    }).observe(mapTitle, { childList:true, subtree:true, characterData:true });
  }
})();
