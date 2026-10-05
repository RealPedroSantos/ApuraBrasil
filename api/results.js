const TSE_BASE = 'https://resultados.tse.jus.br/oficial';
const UFS = ['ac','al','ap','am','ba','ce','df','es','go','ma','mt','ms','mg','pa','pb','pr','pe','pi','rj','rn','rs','ro','rr','sc','sp','se','to'];

const YEAR_CONFIG = {
  2026: {
    cycle: 'ele2026', pleito: '3220', current: true,
    offices: {
      presidente: { election: '6257', cargo: '0001', label: 'Presidente' },
      governador: { election: '6259', cargo: '0003', label: 'Governador' },
      senador: { election: '6259', cargo: '0005', label: 'Senador' },
      'deputado-federal': { election: '6259', cargo: '0006', label: 'Deputado Federal' },
      'deputado-estadual': { election: '6259', cargo: '0007', label: 'Deputado Estadual' }
    }
  },
  2022: {
    cycle: 'ele2022', pleito: '406', historical: true,
    offices: {
      presidente: { election: '544', cargo: '0001', label: 'Presidente' },
      governador: { election: '546', cargo: '0003', label: 'Governador' },
      senador: { election: '546', cargo: '0005', label: 'Senador' },
      'deputado-federal': { election: '546', cargo: '0006', label: 'Deputado Federal' },
      'deputado-estadual': { election: '546', cargo: '0007', label: 'Deputado Estadual' }
    }
  }
};

function send(res, status, payload, cache = 'public, s-maxage=5, stale-while-revalidate=20') {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(payload));
}

function pad(value, size) { return String(value).padStart(size, '0'); }
function integer(value) {
  const parsed = parseInt(String(value ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
function decimal(value) {
  if (typeof value === 'number') return value;
  const raw = String(value ?? '').trim();
  const parsed = raw.includes(',') ? Number(raw.replace(/\./g, '').replace(',', '.')) : Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}
function normalizeText(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function electionType(year) { return Number(year) % 4 === 0 ? 'municipal' : 'geral'; }
function electionContext(value) {
  const year = Number(value || 2026);
  return { year, config: YEAR_CONFIG[year] || null, type: electionType(year), future: year > 2026, archive: year < 2026 && !YEAR_CONFIG[year] };
}

async function fetchJson(url, timeout = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'ApuraBrasil/0.3 (+Vercel)' },
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`TSE respondeu ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}

function placeholderResult(query, context) {
  const office = String(query.office || 'presidente');
  const municipal = context.type === 'municipal';
  return {
    ok: true,
    year: context.year,
    electionType: context.type,
    future: context.future,
    archive: context.archive || municipal,
    available: false,
    office,
    officeLabel: office,
    scope: String(query.uf || 'BR').toUpperCase(),
    final: false,
    sections: { total:0,totalized:0,percentage:0 },
    electorate: { total:0,turnout:0,turnoutPercentage:0,abstentions:0,abstentionPercentage:0 },
    votes: { valid:0,validPercentage:0,blank:0,blankPercentage:0,null:0,nullPercentage:0 },
    candidates: [], groups: [],
    notice: context.future
      ? (municipal ? `Eleições municipais ${context.year}: aguardando dados oficiais.` : `Eleições gerais ${context.year}: aguardando dados oficiais.`)
      : (municipal ? `Eleições municipais ${context.year}: os cargos desta tela pertencem às eleições gerais.` : `Arquivo histórico ${context.year}: integração detalhada ainda não normalizada no ApuraBrasil.`),
    checkedAt: new Date().toISOString()
  };
}

function officeDefinition(office, uf, context) {
  const base = context.config?.offices?.[office];
  if (!base) throw new Error('Cargo não suportado para esta eleição.');
  if (office === 'deputado-estadual' && String(uf || '').toLowerCase() === 'df') {
    return { ...base, cargo:'0008', label:'Deputado Distrital' };
  }
  return base;
}

function resultUrl(def, context, uf, municipalityCode) {
  const election = pad(def.election, 6);
  if (def.cargo === '0001' && !uf) {
    return `${TSE_BASE}/${context.config.cycle}/${def.election}/dados/br/br-c${def.cargo}-e${election}-u.json`;
  }
  const state = String(uf || '').toLowerCase();
  if (!state) throw new Error('Selecione uma UF para este cargo.');
  const scope = municipalityCode ? `${state}${pad(municipalityCode,5)}` : state;
  return `${TSE_BASE}/${context.config.cycle}/${def.election}/dados/${state}/${scope}-c${def.cargo}-e${election}-u.json`;
}

function normalizeResult(raw, meta) {
  const cargo = raw?.carg?.[0] || {};
  const candidates = [], groups = [];
  for (const group of cargo.agr || []) {
    let groupVotes = 0;
    const parties = [];
    for (const party of group.par || []) {
      parties.push(party.sg || '');
      const legendVotes = integer(party.tval);
      groupVotes += legendVotes;
      for (const candidate of party.cand || []) {
        const votes = integer(candidate.vap);
        groupVotes += votes;
        candidates.push({
          number:String(candidate.n || ''), sequence:String(candidate.sqcand || ''),
          name:candidate.nm || '', ballotName:candidate.nmu || candidate.nm || '',
          party:party.sg || candidate.sgp || '', coalition:group.nm || '', votes,
          percentage:decimal(candidate.pvap), status:candidate.st || '', electedFlag:candidate.e || '',
          photoUrl:candidate.sqcand ? `${TSE_BASE}/${meta.cycle}/${meta.election}/fotos/${meta.photoScope}/${candidate.sqcand}.jpeg` : ''
        });
      }
    }
    groups.push({ name:group.nm || '', composition:group.com || '', parties, seats:integer(group.vag), votes:groupVotes });
  }
  candidates.sort((a,b)=>b.votes-a.votes || a.ballotName.localeCompare(b.ballotName,'pt-BR'));
  groups.sort((a,b)=>b.seats-a.seats || b.votes-a.votes);
  const s=raw.s || {}, e=raw.e || {}, v=raw.v || {};
  return {
    ok:true, available:true, future:false, archive:false,
    year:meta.year, electionType:'geral', round:integer(raw.t)||1,
    electionCode:String(raw.ele || meta.election), office:meta.office, officeLabel:meta.officeLabel,
    scope:String(raw.cdabr || meta.scope || '').toUpperCase(), municipalityCode:meta.municipalityCode || null,
    municipalityName:meta.municipalityName || null, generatedDate:raw.dg || '', generatedTime:raw.hg || '',
    idg:String(raw.idg || ''), final:String(raw.tf || '').toLowerCase()==='s',
    mathematicallyDefined:String(raw.md || '').toLowerCase()!=='n' && String(raw.md || '')!=='',
    sections:{ total:integer(s.ts), totalized:integer(s.st), percentage:decimal(s.pst) },
    electorate:{ total:integer(e.te), turnout:integer(e.c), turnoutPercentage:decimal(e.pc), abstentions:integer(e.a), abstentionPercentage:decimal(e.pa) },
    votes:{ valid:integer(v.vv!==undefined?v.vv:v.vvc), validPercentage:decimal(v.pvv!==undefined?v.pvv:v.pvvc), blank:integer(v.vb), blankPercentage:decimal(v.pvb), null:integer(v.tvn!==undefined?v.tvn:v.vn), nullPercentage:decimal(v.ptvn!==undefined?v.ptvn:v.pvn) },
    candidates, groups, sourceUrl:meta.sourceUrl, checkedAt:new Date().toISOString()
  };
}

async function municipalityList(election, uf, context) {
  const code=pad(election,6);
  const url=`${TSE_BASE}/${context.config.cycle}/${election}/config/mun-e${code}-cm.json`;
  const payload=await fetchJson(url);
  const scope=(payload.abr || []).find(x=>String(x.cd || '').toLowerCase()===String(uf || '').toLowerCase());
  const municipalities=(scope?.mu || []).map(m=>({code:String(m.cd),name:m.nm || '',capital:/^s$/i.test(String(m.c || ''))}));
  return {municipalities,sourceUrl:url};
}

async function resolveMunicipality(election, uf, municipalityCode, municipalityName, context) {
  const list=await municipalityList(election,uf,context);
  let match;
  if (municipalityCode) match=list.municipalities.find(m=>String(m.code)===String(municipalityCode).padStart(5,'0'));
  if (!match && municipalityName) {
    const target=normalizeText(municipalityName);
    match=list.municipalities.find(m=>normalizeText(m.name)===target);
  }
  if (!match && municipalityName) {
    const target=normalizeText(municipalityName);
    match=list.municipalities.find(m=>normalizeText(m.name).includes(target)||target.includes(normalizeText(m.name)));
  }
  if (!match) throw new Error(`Município ${municipalityName || municipalityCode || ''} não encontrado na configuração oficial do TSE.`);
  return match;
}

async function persistSnapshot(result) {
  const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !result?.sourceUrl) return;
  const body={ election_code:result.electionCode, office:result.office, scope:result.scope, source_url:result.sourceUrl, idg:result.idg || null, generated_date:result.generatedDate || null, generated_time:result.generatedTime || null, sections_percentage:result.sections?.percentage || 0, payload:result };
  try {
    await fetch(`${url}/rest/v1/result_snapshots?on_conflict=source_url,idg`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(body)});
  } catch(error) { console.warn('snapshot persistence failed',error.message); }
}

async function getResult(query) {
  const context=electionContext(query.year);
  if (!context.config) return placeholderResult(query,context);
  const office=String(query.office || 'presidente');
  const uf=query.uf ? String(query.uf).toLowerCase() : '';
  const def=officeDefinition(office,uf,context);
  let municipality=null;
  if (query.municipalityName || query.municipalityCode) {
    if (!uf) throw new Error('UF obrigatória para resultado municipal.');
    municipality=await resolveMunicipality(def.election,uf,query.municipalityCode,query.municipalityName,context);
  }
  const url=resultUrl(def,context,uf || null,municipality?.code);
  const raw=await fetchJson(url);
  const result=normalizeResult(raw,{
    year:context.year, cycle:context.config.cycle, office, officeLabel:def.label, election:def.election,
    scope:municipality ? `${uf}${municipality.code}` : (uf || 'br'),
    photoScope:office==='presidente' ? 'br' : (uf || 'br'),
    municipalityCode:municipality?.code || null, municipalityName:municipality?.name || null, sourceUrl:url
  });
  await persistSnapshot(result);
  return result;
}

async function stateSummaries(query) {
  const context=electionContext(query.year);
  if (!context.config) return UFS.map(uf=>({uf:uf.toUpperCase(),available:false}));
  const def=officeDefinition('presidente','',context);
  const settled=await Promise.allSettled(UFS.map(async uf=>{
    const url=resultUrl(def,context,uf,null), raw=await fetchJson(url,10000);
    const result=normalizeResult(raw,{year:context.year,cycle:context.config.cycle,office:'presidente',officeLabel:def.label,election:def.election,scope:uf,photoScope:'br',sourceUrl:url});
    return {uf:uf.toUpperCase(),available:true,sectionsPercentage:result.sections.percentage,winner:result.candidates[0] || null,sourceUrl:url};
  }));
  return settled.map((item,i)=>item.status==='fulfilled'?item.value:({uf:UFS[i].toUpperCase(),available:false}));
}

function resolveDirectory(template, context) {
  if (!template) return null;
  let value=String(template);
  const replacements={'<base>/<ambiente>':TSE_BASE,'<base>':'https://resultados.tse.jus.br','<ambiente>':'oficial','<ciclo>':context.cycle,'<cd_eleicao>':context.election,'<cd_pleito>':context.pleito,'<uf>':context.uf};
  for (const [from,to] of Object.entries(replacements)) value=value.split(from).join(to);
  if (value.startsWith('/')) value=`https://resultados.tse.jus.br${value}`;
  return value.replace(/\/$/,'');
}

async function sectionsConfigUrl(uf, context) {
  const fallback=`${TSE_BASE}/${context.config.cycle}/arquivo-urna/${context.config.pleito}/config/${uf}/${uf}-p${pad(context.config.pleito,6)}-cs.json`;
  if (context.year !== 2026) return fallback;
  try {
    const config=await fetchJson(`${TSE_BASE}/comum/config/ele-c.json`);
    const template=(config.arq || []).find(item=>String(item.tp || '').toLowerCase()==='cs')?.dir;
    const dir=resolveDirectory(template,{cycle:context.config.cycle,election:'6259',pleito:context.config.pleito,uf});
    return dir ? `${dir}/${uf}-p${pad(context.config.pleito,6)}-cs.json` : fallback;
  } catch { return fallback; }
}

async function getZones(query) {
  const context=electionContext(query.year);
  if (!context.config) return {ok:true,year:context.year,zones:[],available:false};
  const uf=String(query.uf || '').toLowerCase();
  const municipalityCode=String(query.municipalityCode || '').padStart(5,'0');
  if (!uf || !municipalityCode) throw new Error('UF e município são obrigatórios para listar zonas.');
  const url=await sectionsConfigUrl(uf,context), payload=await fetchJson(url,20000);
  const state=(payload.abr || []).find(x=>String(x.cd || '').toLowerCase()===uf) || payload.abr?.[0];
  const municipality=(state?.mu || []).find(m=>String(m.cd || '').padStart(5,'0')===municipalityCode);
  if (!municipality) throw new Error('Município não localizado no arquivo oficial de seções.');
  const zones=(municipality.zon || []).map(z=>({code:String(z.cd || '').replace(/^0+/,'') || '0',sections:(z.sec || []).map(s=>({number:String(s.ns || s.nsp || '').replace(/^0+/,'') || '0',original:String(s.nsp || s.ns || '').replace(/^0+/,'') || '0',auxiliaryDate:s.da || null,auxiliaryTime:s.ha || null}))}));
  return {ok:true,year:context.year,uf:uf.toUpperCase(),municipalityCode,municipalityName:municipality.nm || '',zones,sourceUrl:url,checkedAt:new Date().toISOString()};
}

module.exports=async function handler(req,res){
  const query=req.query || {}, action=String(query.action || 'result');
  try {
    if (action==='result') return send(res,200,await getResult(query));
    if (action==='state-summaries') {
      const states=await stateSummaries(query);
      return send(res,200,{ok:true,year:Number(query.year || 2026),office:'presidente',states,checkedAt:new Date().toISOString()},'public, s-maxage=15, stale-while-revalidate=45');
    }
    if (action==='municipalities') {
      const context=electionContext(query.year), uf=String(query.uf || '').toLowerCase();
      if (!uf) return send(res,400,{ok:false,error:'Informe a UF.'},'no-store');
      if (!context.config) return send(res,200,{ok:true,year:context.year,uf:uf.toUpperCase(),municipalities:[],available:false},'public, s-maxage=3600');
      const def=officeDefinition(String(query.office || 'presidente'),uf,context), data=await municipalityList(def.election,uf,context);
      return send(res,200,{ok:true,year:context.year,uf:uf.toUpperCase(),municipalities:data.municipalities,sourceUrl:data.sourceUrl},'public, s-maxage=86400, stale-while-revalidate=604800');
    }
    if (action==='zones') return send(res,200,await getZones(query),'public, s-maxage=300, stale-while-revalidate=1800');
    if (action==='timeline') {
      const years=[];
      for(let year=2000;year<=2030;year+=2){const ctx=electionContext(year);years.push({year,type:ctx.type,current:year===2026,future:ctx.future,integrated:!!ctx.config,archive:ctx.archive});}
      return send(res,200,{ok:true,years},'public, s-maxage=86400, stale-while-revalidate=604800');
    }
    return send(res,400,{ok:false,error:'Ação inválida.'},'no-store');
  } catch(error) {
    return send(res,502,{ok:false,error:'Não foi possível obter os dados eleitorais oficiais.',detail:error.message,checkedAt:new Date().toISOString()},'no-store');
  }
};