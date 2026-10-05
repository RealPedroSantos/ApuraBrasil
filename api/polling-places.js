const AdmZip = require('adm-zip');
const { parse } = require('csv-parse/sync');

const CKAN_PACKAGE = 'https://dadosabertos.tse.jus.br/api/3/action/package_show?id=eleitorado-2026';
const RESOURCE_ID = '300626b4-2b24-4d2e-b4fc-46b569cfffe5';
let resourcePromise = null;
let rowsPromise = null;

function send(res,status,payload,cache='public, s-maxage=3600, stale-while-revalidate=86400'){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control',cache);
  res.setHeader('Access-Control-Allow-Origin','*');
  res.end(JSON.stringify(payload));
}
function norm(v){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();}
function numeric(v){const n=Number(String(v??'').replace(/\./g,'').replace(',','.'));return Number.isFinite(n)?n:0;}
function pick(row,names){for(const name of names){if(row[name]!==undefined&&row[name]!==null&&String(row[name]).trim()!=='')return row[name];}const keys=Object.keys(row);for(const name of names){const found=keys.find(k=>norm(k)===norm(name));if(found&&String(row[found]??'').trim()!=='')return row[found];}return '';}

async function fetchJson(url,timeout=20000){const c=new AbortController();const t=setTimeout(()=>c.abort(),timeout);try{const r=await fetch(url,{signal:c.signal,headers:{Accept:'application/json'}});if(!r.ok)throw new Error(`HTTP ${r.status}`);return await r.json();}finally{clearTimeout(t);}}
async function fetchBuffer(url,timeout=60000){const c=new AbortController();const t=setTimeout(()=>c.abort(),timeout);try{const r=await fetch(url,{signal:c.signal});if(!r.ok)throw new Error(`HTTP ${r.status}`);return Buffer.from(await r.arrayBuffer());}finally{clearTimeout(t);}}

async function resource(){
  if(resourcePromise)return resourcePromise;
  resourcePromise=(async()=>{
    const payload=await fetchJson(CKAN_PACKAGE);
    const resources=payload?.result?.resources||[];
    const item=resources.find(r=>String(r.id)===RESOURCE_ID)||resources.find(r=>norm(r.name).includes('ELEITORADO POR LOCAL DE VOTACAO'));
    if(!item?.url)throw new Error('Recurso de locais de votação não localizado no catálogo do TSE.');
    return item;
  })();
  try{return await resourcePromise;}catch(e){resourcePromise=null;throw e;}
}

async function allRows(){
  if(rowsPromise)return rowsPromise;
  rowsPromise=(async()=>{
    const meta=await resource();
    const buffer=await fetchBuffer(meta.url,90000);
    let text='';
    if(String(meta.mimetype||'').includes('zip')||/\.zip(?:\?|$)/i.test(meta.url)){
      const zip=new AdmZip(buffer);
      const entry=zip.getEntries().find(e=>!e.isDirectory&&/\.csv$/i.test(e.entryName))||zip.getEntries().find(e=>!e.isDirectory);
      if(!entry)throw new Error('ZIP do TSE sem arquivo de dados.');
      const data=entry.getData();
      text=data.toString('latin1');
      if(!/[A-Z_]+;[A-Z_]+/.test(text.slice(0,400)))text=data.toString('utf8');
    }else{
      text=buffer.toString('latin1');
      if(!/[A-Z_]+;[A-Z_]+/.test(text.slice(0,400)))text=buffer.toString('utf8');
    }
    return parse(text,{columns:true,delimiter:';',quote:'"',skip_empty_lines:true,relax_column_count:true,relax_quotes:true,bom:true,trim:true});
  })();
  try{return await rowsPromise;}catch(e){rowsPromise=null;throw e;}
}

function normalizedPlace(row){
  const uf=String(pick(row,['SG_UF','UF'])).toUpperCase();
  const municipality=String(pick(row,['NM_MUNICIPIO','NM_LOCALIDADE','MUNICIPIO'])).trim();
  const municipalityCode=String(pick(row,['CD_MUNICIPIO','CD_LOCALIDADE_TSE','CD_MUNICIPIO_TSE'])).replace(/\D/g,'');
  const zone=String(pick(row,['NR_ZONA','ZONA'])).replace(/\D/g,'');
  const code=String(pick(row,['NR_LOCAL_VOTACAO','NR_LOCAL','CD_LOCAL_VOTACAO'])).replace(/\D/g,'');
  const name=String(pick(row,['NM_LOCAL_VOTACAO','NM_LOCVOT','DS_LOCAL_VOTACAO'])).trim();
  const address=String(pick(row,['DS_LOCAL_VOTACAO_ENDERECO','DS_ENDERECO','DS_LOCAL_VOTACAO'])).trim();
  const neighborhood=String(pick(row,['NM_BAIRRO','DS_BAIRRO','BAIRRO'])).trim();
  const zipCode=String(pick(row,['NR_CEP','CEP'])).replace(/\D/g,'');
  const latitude=Number(String(pick(row,['NR_LATITUDE','LATITUDE','TSE_LAT','LAT'])).replace(',','.'));
  const longitude=Number(String(pick(row,['NR_LONGITUDE','LONGITUDE','TSE_LONG','LONG'])).replace(',','.'));
  const electorate=numeric(pick(row,['QT_ELEITOR','QT_ELEITORES','QT_ELEITORADO']));
  return {uf,municipality,municipalityCode,zone,code,name,address,neighborhood,zipCode,latitude:Number.isFinite(latitude)?latitude:null,longitude:Number.isFinite(longitude)?longitude:null,electorate};
}

module.exports=async function handler(req,res){
  try{
    const uf=String(req.query?.uf||'').toUpperCase().replace(/[^A-Z]/g,'');
    const municipalityName=norm(req.query?.municipalityName||'');
    const municipalityCode=String(req.query?.municipalityCode||'').replace(/\D/g,'');
    if(!uf||(!municipalityName&&!municipalityCode))return send(res,400,{ok:false,error:'Informe UF e município.'},'no-store');
    const rows=await allRows();
    const seen=new Map();
    for(const row of rows){
      const place=normalizedPlace(row);
      if(place.uf!==uf)continue;
      if(municipalityCode&&place.municipalityCode&&place.municipalityCode!==municipalityCode)continue;
      if(!municipalityCode&&municipalityName&&norm(place.municipality)!==municipalityName)continue;
      const key=`${place.zone}|${place.code}`;
      const current=seen.get(key);
      if(!current)seen.set(key,place); else if(place.electorate>current.electorate)seen.set(key,place);
    }
    const places=[...seen.values()].sort((a,b)=>a.zone.localeCompare(b.zone,undefined,{numeric:true})||a.code.localeCompare(b.code,undefined,{numeric:true}));
    const neighborhoodsMap=new Map();
    for(const place of places){
      const label=place.neighborhood||'Bairro não informado';
      const key=norm(label)||'NAO INFORMADO';
      const entry=neighborhoodsMap.get(key)||{name:label,places:0,electorate:0,zones:new Set()};
      entry.places++;entry.electorate+=Number(place.electorate||0);if(place.zone)entry.zones.add(place.zone);neighborhoodsMap.set(key,entry);
    }
    const neighborhoods=[...neighborhoodsMap.values()].map(x=>({name:x.name,places:x.places,electorate:x.electorate,zones:[...x.zones].sort((a,b)=>Number(a)-Number(b))})).sort((a,b)=>b.electorate-a.electorate||a.name.localeCompare(b.name,'pt-BR'));
    const meta=await resource();
    return send(res,200,{ok:true,source:'TSE Dados Abertos — Eleitorado por local de votação 2026',derived:true,uf,municipality:places[0]?.municipality||req.query?.municipalityName||'',places,neighborhoods,sourceUrl:meta.url,checkedAt:new Date().toISOString()},'public, s-maxage=21600, stale-while-revalidate=86400');
  }catch(error){return send(res,502,{ok:false,error:'Não foi possível carregar os locais de votação do TSE.',detail:error.message},'no-store');}
};