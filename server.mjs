import http from 'node:http';
import { readFile, writeFile, rename, mkdir, chmod } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
try { process.chdir(ROOT); } catch {}
loadEnv();
const PORT = Number(process.env.PORT || process.env.FREESHOP_PORT || 8787);
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' || process.env.PORT ? '0.0.0.0' : '127.0.0.1');

let BASE, API_KEY, WEBHOOK_SECRET, WEBHOOK_OLD;
function refreshConfig() {
  loadEnv();
  BASE=(process.env.TFC_API_BASE_URL || 'https://tcf-pay.infra.dongobada.com').replace(/\/$/, '');
  API_KEY=process.env.TFC_API_KEY || '';
  WEBHOOK_SECRET=process.env.TFC_WEBHOOK_SECRET || '';
  WEBHOOK_OLD=(process.env.TFC_WEBHOOK_OLD_SECRETS || '').split(',').map(s => s.trim()).filter(Boolean);
}
refreshConfig();
const DATA_PATH = process.env.VERCEL ? path.join('/tmp', 'store.json') : path.join(ROOT, 'data', 'store.json');
const sample = [
  { id:'pi_demo_a93f2', name:'Awa Kaboré', phone:'+22670123456', amount:45000, amountReceived:45000, operator:'ORANGE_MONEY', status:'succeeded', created:'2026-10-19T09:42:00.000Z', description:'Commande #FS-1048', mode:'demo' },
  { id:'pi_demo_c26d8', name:'Issa Ouédraogo', phone:'+22665789012', amount:125000, amountReceived:0, operator:'MOOV_MONEY', status:'requires_payment', created:'2026-10-19T09:18:00.000Z', description:'Commande #FS-1047', mode:'demo' },
  { id:'pi_demo_f50a1', name:'Mariam Diallo', phone:'+22676112233', amount:18500, amountReceived:18500, operator:'ORANGE_MONEY', status:'succeeded', created:'2026-10-18T16:05:00.000Z', description:'Commande #FS-1046', mode:'demo' },
  { id:'pi_demo_b02e7', name:'Ousmane Sawadogo', phone:'+22666443322', amount:68000, amountReceived:0, operator:'YAS_TG', status:'failed', created:'2026-10-18T14:27:00.000Z', description:'Commande #FS-1045', mode:'demo' },
  { id:'pi_demo_d91c3', name:'Fatou Traoré', phone:'+22670556677', amount:32000, amountReceived:0, operator:'MOOV_MONEY', status:'requires_payment', created:'2026-10-17T11:30:00.000Z', description:'Commande #FS-1044', mode:'demo' }
];
let store = { intents: [], requests: {}, events: {}, lastSequence: {} };

function loadEnv() {
  const filename = path.join(ROOT, '.env');
  if (!existsSync(filename)) return;
  for (const line of requireText(filename).split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || match[2].startsWith('#')) continue;
    const value = match[2].replace(/^(["'])(.*)\1$/, '$2');
    process.env[match[1]] = value;
  }
}
function requireText(file) {
  try { return awaitlessRead(file); } catch { return ''; }
}
function awaitlessRead(file) {
  // Environment files are tiny and read before the server starts.
  return readFileSync(file, 'utf8');
}
async function loadStore() {
  try {
    if (existsSync(DATA_PATH)) {
      store = { ...store, ...JSON.parse(await readFile(DATA_PATH, 'utf8')) };
    }
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('Impossible de lire store.json:', e.message);
  }
}
async function saveStore() {
  try {
    await mkdir(path.dirname(DATA_PATH), { recursive:true });
    const tmp = `${DATA_PATH}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(store, null, 2), { mode:0o600 });
    await rename(tmp, DATA_PATH);
  } catch (e) {
    console.warn('Avertissement saveStore:', e.message);
  }
}
function send(res, status, body, extra = {}) {
  const bytes = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', ...extra });
  res.end(bytes);
}
function html(res, body) {
  res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'" });
  res.end(body);
}
async function readBody(req, limit = 64 * 1024) {
  if (req.body) {
    if (typeof req.body === 'object') return Buffer.from(JSON.stringify(req.body));
    return Buffer.from(String(req.body));
  }
  const chunks=[]; let size=0;
  for await (const c of req) { size += c.length; if (size > limit) throw Object.assign(new Error('Requête trop volumineuse.'), { status:413 }); chunks.push(c); }
  return Buffer.concat(chunks);
}
async function jsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const b = await readBody(req);
  try { return JSON.parse(b.toString('utf8')); }
  catch { throw Object.assign(new Error('Corps JSON invalide.'), { status:400 }); }
}
function cleanIntent(i) {
  const instructions=i.instructions || {};
  return {
    id: i.id || '', name: i.payer_name || i.name || 'Client', phone: i.payer_msisdn || i.phone || '',
    amount: Number(i.amount || 0), amountReceived: Number(i.amount_received ?? i.amountReceived ?? 0), currency: i.currency || 'XOF',
    operator: i.operator || instructions.operator || '', status: String(i.status || 'requires_payment').toLowerCase(),
    created: i.created_at || i.created || new Date().toISOString(), description: i.description || '',
    reference: i.reference_code || instructions.reference_code || '', collectMsisdn: i.collect_msisdn || instructions.collect_msisdn || '',
    instructions: instructions.steps_fr || (Array.isArray(i.instructions) ? i.instructions : []),
    ussdHint: instructions.ussd_hint || i.ussdHint || '', expires: i.expires_at || i.expires || null,
    mode: API_KEY ? (API_KEY.startsWith('sk_live_')?'live':'test') : 'demo'
  };
}
async function tfc(route, { method='GET', body, idempotencyKey } = {}) {
  refreshConfig();
  if (!API_KEY) throw Object.assign(new Error('TFC_API_KEY n’est pas configurée.'), { status:503, code:'integration_not_configured' });
  const headers={ Authorization:`Bearer ${API_KEY}`, Accept:'application/json' };
  if (body !== undefined) headers['Content-Type']='application/json';
  if (idempotencyKey) headers['Idempotency-Key']=idempotencyKey;
  let response;
  try { response=await fetch(`${BASE}${route}`, { method, headers, body:body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(20000) }); }
  catch (e) { throw Object.assign(new Error('TFC PAY est injoignable pour le moment. Réessaie avec la même demande.'), { status:502, code:'provider_unreachable' }); }
  const raw=await response.text(); let data;
  try { data=raw ? JSON.parse(raw) : {}; } catch { data={ message:raw }; }
  if (!response.ok) {
    console.error('TFC PAY erreur', response.status, data?.code, data?.request_id);
    throw Object.assign(new Error(data.message || 'TFC PAY a refusé la demande.'), { status:response.status, code:data.code || 'provider_error', request_id:data.request_id });
  }
  return data;
}
function verifySignature(raw, header) {
  if (!header || !WEBHOOK_SECRET) return false;
  const pairs=header.split(',').map(x=>x.trim().split('='));
  const ts=pairs.find(([k])=>k==='t')?.[1];
  const signatures=pairs.filter(([k])=>k==='v1').map(([,v])=>v).filter(v=>/^[0-9a-f]{64}$/i.test(v));
  const t=Number(ts); if (!Number.isSafeInteger(t) || Math.abs(Math.floor(Date.now()/1000)-t)>300) return false;
  for (const secret of [WEBHOOK_SECRET,...WEBHOOK_OLD]) {
    const expected=crypto.createHmac('sha256',secret).update(`${ts}.`).update(raw).digest();
    for (const hex of signatures) { const got=Buffer.from(hex,'hex'); if(got.length===expected.length && crypto.timingSafeEqual(got,expected)) return true; }
  }
  return false;
}
async function handleWebhook(req,res) {
  const raw=await readBody(req,1024*1024);
  if (!verifySignature(raw, req.headers['tfc-signature'])) return send(res,400,{ error:'invalid_signature' });
  let event; try { event=JSON.parse(raw.toString('utf8')); } catch { return send(res,400,{error:'invalid_json'}); }
  if (!event?.id || typeof event.id !== 'string' || !event.id.startsWith('evt_')) return send(res,400,{error:'invalid_event'});
  if (store.events[event.id]) return send(res,200,{received:true,deduplicated:true});
  store.events[event.id]=new Date().toISOString();
  const object=event.data?.object || {}, resourceId=object.id;
  const known=new Set(['payment_intent.settled','payment_intent.amount_mismatch','payment_intent.cancelled']);
  if (known.has(event.type) && resourceId) {
    const seq=Number(event.sequence || 0), previous=Number(store.lastSequence[resourceId] || 0);
    if (!seq || seq >= previous) {
      const existing=store.intents.find(x=>x.id===resourceId);
      const rawStatus=String(object.status || (event.type.endsWith('.cancelled')?'cancelled':'')).toLowerCase();
      const status=event.type.endsWith('.cancelled')?'cancelled':rawStatus || 'requires_payment';
      if (existing) {
        existing.status=status;
        if (Number.isFinite(Number(object.amount_received))) existing.amountReceived=Number(object.amount_received);
      } else store.intents.push(cleanIntent({ ...object, status }));
      if (seq) store.lastSequence[resourceId]=seq;
    }
  }
  await saveStore();
  return send(res,200,{received:true});
}
function mime(file) { return ({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream'; }

await loadStore();
export async function handler(req, res) {
  const host=req.headers.host || '';
  const url=new URL(req.url,`http://${host || 'localhost'}`);
  try {
    if (url.pathname==='/api/tfc/webhook' && req.method==='POST') return await handleWebhook(req,res);

    if (url.pathname.startsWith('/api/') && req.method!=='GET' && req.headers.origin) {
      const originClean=req.headers.origin.replace(/^https?:\/\//,'').split(':')[0];
      const hostClean=host.split(':')[0];
      if (originClean!==hostClean && !['127.0.0.1','localhost'].includes(originClean)) {
        return send(res,403,{error:'origin_forbidden'});
      }
    }
    if (url.pathname==='/api/config' && req.method==='GET') return send(res,200,{configured:Boolean(API_KEY),webhookConfigured:Boolean(WEBHOOK_SECRET),mode:API_KEY?'tfc':'demo',environment:API_KEY?.startsWith('sk_live_')?'live':'test',currency:'XOF',baseUrl:BASE});
    if (url.pathname==='/api/config' && req.method==='POST') {
      const input=await jsonBody(req);
      const nextKey=String(input.apiKey||'').trim(), nextBase=String(input.baseUrl||BASE).trim().replace(/\/$/,'');
      const nextWebhook=String(input.webhookSecret||'').trim();
      if (nextKey && (!/^sk_(test|live)_/.test(nextKey) || nextKey.length>500 || /\s/.test(nextKey))) return send(res,422,{error:{code:'invalid_api_key_format',message:'La clé doit être une clé TFC PAY de test (sk_test_…) ou LIVE (sk_live_…).'}});
      if (nextWebhook && (!nextWebhook.startsWith('whsec_') || nextWebhook.length>500 || /\s/.test(nextWebhook))) return send(res,422,{error:{code:'invalid_webhook_secret_format',message:'Vérifie le secret webhook TFC PAY (format whsec_…).'}});
      let parsed; try { parsed=new URL(nextBase); } catch { return send(res,422,{error:{code:'invalid_api_base_url',message:'Adresse API invalide.'}}); }
      if (parsed.protocol!=='https:' || !['tcf-pay.infra.dongobada.com','api.tfcpay.com'].includes(parsed.hostname) || parsed.username || parsed.password || parsed.search || parsed.hash) return send(res,422,{error:{code:'invalid_api_base_url',message:'Choisis un serveur API TFC PAY officiel en HTTPS.'}});
      if (!nextKey && !API_KEY) return send(res,422,{error:{code:'api_key_required',message:'Saisis ta clé API TFC PAY pour activer la connexion.'}});
      process.env.TFC_API_BASE_URL=nextBase;
      if (nextKey) process.env.TFC_API_KEY=nextKey;
      if (nextWebhook) process.env.TFC_WEBHOOK_SECRET=nextWebhook;
      await writeFile(path.join(ROOT,'.env'),[
        '# Secrets TFC PAY — fichier local, exclu de Git.',
        `TFC_API_BASE_URL=${process.env.TFC_API_BASE_URL}`,
        `TFC_API_KEY=${process.env.TFC_API_KEY || ''}`,
        `TFC_WEBHOOK_SECRET=${process.env.TFC_WEBHOOK_SECRET || ''}`,
        `TFC_WEBHOOK_OLD_SECRETS=${process.env.TFC_WEBHOOK_OLD_SECRETS || ''}`,
        `FREESHOP_PORT=${PORT}`,
        ''
      ].join('\n'),{mode:0o600});
      await chmod(path.join(ROOT,'.env'),0o600);
      refreshConfig();
      return send(res,200,{configured:Boolean(API_KEY),webhookConfigured:Boolean(WEBHOOK_SECRET),mode:'tfc',environment:API_KEY?.startsWith('sk_live_')?'live':'test'});
    }
    if (url.pathname==='/api/payment-intents' && req.method==='GET') {
      if (!API_KEY) return send(res,200,{mode:'demo',data:sample.map(cleanIntent)});
      const qs=new URLSearchParams(); for (const k of ['status','from','to','msisdn','min_amount_minor','max_amount_minor','q']) if(url.searchParams.has(k)) qs.set(k,url.searchParams.get(k));
      const result=await tfc(`/v1/payment-intents${qs.size?'?'+qs:''}`);
      const data=(result.data || []).map(raw=>{const cached=store.intents.find(x=>x.id===raw.id)||store.intents.find(x=>x.reference&&x.reference===raw.reference_code);return cleanIntent({...cached,...raw,payer_name:raw.payer_name||cached?.name,description:raw.description||cached?.description})});
      return send(res,200,{mode:'tfc',data,has_more:Boolean(result.has_more)});
    }
    if (url.pathname==='/api/payment-intents/stats' && req.method==='GET') {
      if (!API_KEY) return send(res,200,{mode:'demo',data:[]});
      const now=new Date(), from=`${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}-01`;
      const result=await tfc(`/v1/payment-intents/stats?group_by=month&from=${encodeURIComponent(from)}`);
      return send(res,200,{mode:'tfc',data:result.data || [],currency:result.currency || 'XOF'});
    }
    if (url.pathname==='/api/wallets' && req.method==='GET') {
      refreshConfig();
      if (!API_KEY) return send(res,200,{mode:'demo',wallets:[{id:'wal_demo_xof',currency:'XOF',environment:'DEMO',status:'active',available_minor:150000,reserved_minor:0,created_at:new Date().toISOString()}]});
      const result=await tfc('/v1/wallets');
      return send(res,200,{mode:'tfc',wallets:result.data || []});
    }
    if (url.pathname==='/api/payment-intents' && req.method==='POST') {
      refreshConfig();
      if (!API_KEY) return send(res,503,{error:{code:'integration_not_configured',message:'Configure d’abord TFC_API_KEY dans le fichier .env.'}});
      const input=await jsonBody(req), {name,phone,amount,operator,description,requestId}=input;
      const cleanPhone=String(phone || '').replace(/[\s()-]/g,'');
      if (!cleanPhone || !/^\+[1-9]\d{7,14}$/.test(cleanPhone)) return send(res,422,{error:{code:'invalid_phone',message:'Numéro de téléphone au format international requis (ex: +22670000000).'}});
      if (!Number.isSafeInteger(amount) || amount<=0) return send(res,422,{error:{code:'invalid_amount',message:'Montant entier supérieur à 0 requis (en F CFA).'}});
      const cleanName=String(name || '').trim();
      if (!cleanName) return send(res,422,{error:{code:'invalid_name',message:'Nom du client requis.'}});
      if (typeof requestId!=='string' || !/^[0-9a-f-]{36}$/i.test(requestId)) return send(res,422,{error:{code:'invalid_request_id',message:'Identifiant de demande invalide.'}});
      const cleanOp=String(operator || '').trim();
      const body={
        amount,
        currency:'XOF',
        payer_msisdn:cleanPhone,
        payer_name:cleanName,
        ...(cleanOp && cleanOp!=='AUTO' ? {operator:cleanOp} : {}),
        ...(description?.trim()?{description:description.trim()}:{})
      };
      const bodyHash=crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
      let operation=store.requests[requestId];
      if (operation && operation.bodyHash!==bodyHash) return send(res,409,{error:{code:'idempotency_key_reused',message:'Cette demande existe déjà avec des informations différentes.'}});
      if (operation?.response) return send(res,200,{intent:operation.response,replayed:true});
      if (!operation) { operation={bodyHash,key:crypto.randomUUID(),status:'sending',created:new Date().toISOString()}; store.requests[requestId]=operation; await saveStore(); }
      try {
        const result=await tfc('/v1/payment-intents',{method:'POST',body,idempotencyKey:operation.key});
        const intent=cleanIntent({ ...result, payer_name:body.payer_name,payer_msisdn:body.payer_msisdn,operator:result.instructions?.operator||body.operator||'',description:body.description });
        operation.response=intent; operation.status='created';
        const old=store.intents.findIndex(x=>x.id===intent.id); if(old>=0)store.intents[old]=intent;else store.intents.unshift(intent);
        await saveStore(); return send(res,201,{intent});
      } catch (e) {
        operation.status='retryable'; operation.errorCode=e.code || 'provider_error'; await saveStore();
        return send(res,e.status || 502,{error:{code:e.code || 'provider_error',message:e.message,request_id:e.request_id}});
      }
    }
    if (url.pathname==='/api/orphan-payments/search' && req.method==='POST') {
      refreshConfig();
      if (!API_KEY) return send(res,503,{error:{code:'integration_not_configured',message:'Configure d’abord TFC_API_KEY.'}});
      const input=await jsonBody(req);
      const searchBody={ currency:'XOF' };
      if (input.phone) searchBody.payer_msisdn=String(input.phone).replace(/[\s()-]/g,'');
      if (input.amount && Number.isSafeInteger(Number(input.amount))) searchBody.amount=Number(input.amount);
      const result=await tfc('/v1/orphan-payments/search',{method:'POST',body:searchBody});
      return send(res,200,result);
    }
    if (url.pathname.startsWith('/api/orphan-payments/') && url.pathname.endsWith('/claim') && req.method==='POST') {
      refreshConfig();
      if (!API_KEY) return send(res,503,{error:{code:'integration_not_configured',message:'Configure d’abord TFC_API_KEY.'}});
      const parts=url.pathname.split('/');
      const id=parts[3];
      const input=await jsonBody(req);
      const claimBody={
        payer_msisdn:String(input.phone||'').replace(/[\s()-]/g,''),
        amount:Number(input.amount)
      };
      const result=await tfc(`/v1/orphan-payments/${encodeURIComponent(id)}/claim`,{method:'POST',body:claimBody});
      const intent=cleanIntent({ ...result, payer_name:input.name||'Client (paiement orphelin)', payer_msisdn:claimBody.payer_msisdn });
      const old=store.intents.findIndex(x=>x.id===intent.id);
      if(old>=0) store.intents[old]=intent; else store.intents.unshift(intent);
      await saveStore();
      return send(res,200,{claimed:true,intent});
    }
    if (url.pathname==='/api/unclaimed-payments/verify' && req.method==='POST') {
      refreshConfig();
      if (!API_KEY) return send(res,503,{error:{code:'integration_not_configured',message:'Configure d’abord TFC_API_KEY.'}});
      const input=await jsonBody(req);
      const verifyBody={
        amount:Number(input.amount),
        currency:'XOF',
        recipient_msisdn:String(input.recipientPhone||input.phone||'').replace(/[\s()-]/g,'')
      };
      const result=await tfc('/v1/unclaimed-payments/verify',{method:'POST',body:verifyBody});
      if(result.claimed && result.payment_intent_id) {
        try {
          const pi=await tfc(`/v1/payment-intents/${encodeURIComponent(result.payment_intent_id)}`);
          const intent=cleanIntent(pi);
          const old=store.intents.findIndex(x=>x.id===intent.id);
          if(old>=0) store.intents[old]=intent; else store.intents.unshift(intent);
          await saveStore();
          result.intent=intent;
        } catch {}
      }
      return send(res,200,result);
    }
    const match=url.pathname.match(/^\/api\/payment-intents\/([^/]+)$/);
    if (match && req.method==='GET') {
      if (!API_KEY) { const i=sample.find(x=>x.id===decodeURIComponent(match[1])); return i?send(res,200,{intent:cleanIntent(i)}):send(res,404,{error:{code:'not_found'}}); }
      const targetId=decodeURIComponent(match[1]);
      const result=await tfc(`/v1/payment-intents/${encodeURIComponent(targetId)}`);
      const old=store.intents.find(x=>x.id===result.id||x.id===targetId||(x.reference&&x.reference===result.reference_code));
      const intent=cleanIntent({ ...old, ...result, payer_name:result.payer_name||old?.name, payer_msisdn:result.payer_msisdn||old?.phone, description:result.description||old?.description });
      const idx=store.intents.findIndex(x=>x.id===intent.id||x.id===targetId);
      if(idx>=0) store.intents[idx]=intent; else store.intents.unshift(intent);
      await saveStore();
      return send(res,200,{intent});
    }
    const piCancelMatch = url.pathname.match(/^\/api\/payment-intents\/([^/]+)\/cancel$/);
    if (piCancelMatch && req.method==='POST') {
      refreshConfig();
      if (!API_KEY) return send(res, 503, { error: { code: 'integration_not_configured', message: 'Configure d’abord TFC_API_KEY.' } });
      const targetId = decodeURIComponent(piCancelMatch[1]);
      try {
        const result = await tfc(`/v1/payment-intents/${encodeURIComponent(targetId)}/cancel`, { method: 'POST', body: {} });
        const old = store.intents.findIndex(x => x.id === targetId || (x.reference && x.reference === targetId));
        if (old >= 0) store.intents[old].status = 'cancelled';
        await saveStore();
        return send(res, 200, { cancelled: true, intent: result });
      } catch (e) {
        if (e.code === 'intent_not_cancellable') {
          return send(res, 409, { error: { code: 'intent_not_cancellable', message: 'Cette intention de paiement ne peut plus être annulée dans son état actuel.', request_id: e.request_id } });
        }
        return send(res, e.status || 500, { error: { code: e.code || 'provider_error', message: e.message, request_id: e.request_id } });
      }
    }
    if (url.pathname==='/api/payouts' && req.method==='GET') {
      refreshConfig();
      if (!API_KEY) return send(res, 200, { mode: 'demo', data: [] });
      const qs = new URLSearchParams();
      for (const k of ['status', 'from', 'to', 'msisdn', 'min_amount_minor', 'max_amount_minor', 'q']) {
        if (url.searchParams.has(k)) qs.set(k, url.searchParams.get(k));
      }
      const result = await tfc(`/v1/payouts${qs.size ? '?' + qs : ''}`);
      return send(res, 200, { mode: 'tfc', data: result.data || [], has_more: Boolean(result.has_more) });
    }
    if (url.pathname==='/api/payouts' && req.method==='POST') {
      refreshConfig();
      if (!API_KEY) return send(res, 503, { error: { code: 'integration_not_configured', message: 'Configure d’abord TFC_API_KEY.' } });
      const body = await readBody(req);
      const amount = Number(body.amount);
      const recipient_msisdn = String(body.recipient_msisdn || body.phone || '').trim();
      const recipient_name = String(body.recipient_name || body.name || '').trim();
      if (!amount || amount < 1) return send(res, 400, { error: { code: 'invalid_amount', message: 'Montant invalide.' } });
      if (!recipient_msisdn) return send(res, 400, { error: { code: 'invalid_phone', message: 'Numéro du bénéficiaire requis.' } });
      const payoutPayload = {
        amount,
        currency: 'XOF',
        recipient_msisdn,
        ...(recipient_name ? { recipient_name } : {}),
        ...(body.description ? { description: String(body.description).trim() } : {})
      };
      const idempotencyKey = String(body.requestId || `payout_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
      try {
        const result = await tfc('/v1/payouts', {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
          body: payoutPayload
        });
        return send(res, 201, { payout: result });
      } catch (e) {
        return send(res, e.status || 500, { error: { code: e.code || 'provider_error', message: e.message, request_id: e.request_id } });
      }
    }
    const payoutMatch = url.pathname.match(/^\/api\/payouts\/([^/]+)$/);
    if (payoutMatch && req.method==='GET') {
      refreshConfig();
      if (!API_KEY) return send(res, 404, { error: { code: 'not_found' } });
      const result = await tfc(`/v1/payouts/${encodeURIComponent(payoutMatch[1])}`);
      return send(res, 200, { payout: result });
    }
    const payoutCancelMatch = url.pathname.match(/^\/api\/payouts\/([^/]+)\/cancel$/);
    if (payoutCancelMatch && req.method==='POST') {
      refreshConfig();
      if (!API_KEY) return send(res, 503, { error: { code: 'integration_not_configured', message: 'Configure d’abord TFC_API_KEY.' } });
      const targetId = decodeURIComponent(payoutCancelMatch[1]);
      try {
        const result = await tfc(`/v1/payouts/${encodeURIComponent(targetId)}/cancel`, { method: 'POST', body: {} });
        return send(res, 200, { cancelled: true, payout: result });
      } catch (e) {
        if (e.code === 'insufficient_scope') {
          return send(res, 403, {
            error: {
              code: 'insufficient_scope',
              message: 'Votre clé API TFC PAY actuelle n’a pas la portée « payout:cancel ». Cochez la permission « payout:cancel » sur votre clé dans la console TFC PAY.',
              request_id: e.request_id
            }
          });
        }
        if (e.code === 'payout_not_cancellable') {
          return send(res, 409, {
            error: {
              code: 'payout_not_cancellable',
              message: 'Ce décaissement ne peut plus être annulé car il a déjà été envoyé ou exécuté par l’opérateur.',
              request_id: e.request_id
            }
          });
        }
        return send(res, e.status || 500, { error: { code: e.code || 'provider_error', message: e.message, request_id: e.request_id } });
      }
    }
    if (url.pathname==='/api/payment-intents/sync' && req.method==='POST') {
      if (!API_KEY) return send(res,200,{mode:'demo'});
      const results=await tfc('/v1/payment-intents');
      for(const raw of results.data||[]){
        const old=store.intents.find(x=>x.id===raw.id||(x.reference&&x.reference===raw.reference_code));
        const intent=cleanIntent({ ...old, ...raw, payer_name:raw.payer_name||old?.name, payer_msisdn:raw.payer_msisdn||old?.phone, description:raw.description||old?.description });
        const idx=store.intents.findIndex(x=>x.id===intent.id);
        if(idx>=0) store.intents[idx]=intent; else store.intents.push(intent);
      }
      await saveStore();
      return send(res,200,{mode:'tfc',data:(results.data||[]).map(raw=>{const cached=store.intents.find(x=>x.id===raw.id||(x.reference&&x.reference===raw.reference_code));return cleanIntent({...cached,...raw,payer_name:raw.payer_name||cached?.name,payer_msisdn:raw.payer_msisdn||cached?.phone,description:raw.description||cached?.description});}),has_more:Boolean(results.has_more)});
    }
    if (url.pathname==='/api/payment-intents' && req.method==='DELETE') return send(res,405,{error:{code:'not_supported',message:'Les intentions sont conservées pour garder l’historique des paiements.'}});
    if (req.method==='GET') {
      const relative=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
      const file=path.resolve(ROOT,'.'+relative);
      if (!file.startsWith(ROOT+path.sep) || !existsSync(file)) return send(res,404,{error:'not_found'});
      return res.writeHead(200,{'Content-Type':mime(file),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'"}).end(await readFile(file));
    }
    return send(res,404,{error:'not_found'});
  } catch(e) {
    console.error('Erreur locale:',e.message);
    if (!res.headersSent) send(res,e.status||500,{error:{code:e.code||'internal_error',message:e.status?e.message:'Erreur interne. Consulte les journaux de l’application.'}});
  }
}
export default handler;

const server=http.createServer(handler);
if (!process.env.VERCEL) {
  server.listen(PORT,HOST,()=>{
    const address=`http://${HOST}:${PORT}`;
    console.log(`Freeshop est ouvert : ${address} (${API_KEY?`TFC PAY ${API_KEY.startsWith('sk_live_')?'LIVE':'TEST'}`:'mode démonstration'})`);
    if (process.env.FREESHOP_NO_OPEN!=='1' && process.env.NODE_ENV!=='production' && !process.env.PORT) {
      try {
        const opener=spawn('xdg-open',[`http://127.0.0.1:${PORT}`],{detached:true,stdio:'ignore'}); opener.unref();
      } catch {}
    }
  });
  server.on('error',error=>{
    if(error.code==='EADDRINUSE'){
      const opener=spawn('xdg-open',[`http://127.0.0.1:${PORT}`],{detached:true,stdio:'ignore'}); opener.unref();
      return;
    }
    console.error('Impossible de démarrer Freeshop :',error.message);
  });
  for (const sig of ['SIGINT','SIGTERM']) process.on(sig,()=>server.close(()=>process.exit(0)));
}
