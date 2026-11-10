const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const validString=(v,max=180)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const testKey=env=>typeof env.SHIPPO_TEST_TOKEN==='string'&&env.SHIPPO_TEST_TOKEN.startsWith('shippo_test_')&&env.SHIPPO_TEST_TOKEN.length>20;
const apiBase='https://api.goshippo.com';
function validateAddress(a){return a&&validString(a.name,120)&&validString(a.street1,180)&&validString(a.city,100)&&validString(a.state,30)&&validString(a.zip,20)&&a.country==='US'&&(!a.phone||validString(a.phone,50))}
function validateParcel(p){return p&&['length','width','height','weight'].every(k=>typeof p[k]==='number'&&Number.isFinite(p[k])&&p[k]>0&&p[k]<2000)&&p.distance_unit==='in'&&p.mass_unit==='kg'}
async function shippo(env,path,body){const response=await fetch(apiBase+path,{method:'POST',headers:{'authorization':'ShippoToken '+env.SHIPPO_TEST_TOKEN,'content-type':'application/json','accept':'application/json'},body:JSON.stringify(body)});const data=await response.json().catch(()=>({message:'Shippo returned unreadable response'}));if(!response.ok)throw Object.assign(new Error(typeof data?.message==='string'?data.message:'Shippo request failed'),{status:response.status});return data}
async function api(request,env,url){if(request.method==='GET'&&url.pathname==='/api/shippo/status')return json({configured:testKey(env),mode:'test',liveDisabled:true});if(request.method!=='POST')return json({error:'Unsupported method'},405);
 if(!testKey(env))return json({error:'Shippo test token is not configured. A shippo_test_ token must be installed as a server secret.'},503);
 let body;try{body=await request.json()}catch{return json({error:'Invalid JSON'},400)}
 try{
  if(url.pathname==='/api/shippo/rates'){if(!validateAddress(body?.from)||!validateAddress(body?.to)||!validateParcel(body?.parcel))return json({error:'Complete the sender, recipient, and positive package measurements. US addresses only.'},422);
    const payload={address_from:body.from,address_to:body.to,parcels:[body.parcel],async:false};
    const result=await shippo(env,'/shipments/',payload);const rates=(result.rates||[]).filter(r=>r&&r.object_id).map(r=>({id:r.object_id,provider:r.provider,service:r.servicelevel?.name||r.servicelevel_name||'',amount:r.amount,currency:r.currency,days:r.estimated_days,object_state:r.object_state,messages:r.messages}));
    return json({mode:'test',shipment_id:result.object_id,rates,shippo_messages:result.messages||[]});
  }
  if(url.pathname==='/api/shippo/test-label'){if(!validString(body?.rate_id,100))return json({error:'Select an existing test rate first'},422);const result=await shippo(env,'/transactions/',{rate:body.rate_id,label_file_type:'PDF_4x6',async:false});if(result.was_test!==true)return json({error:'Shippo did not confirm a test transaction. Label details withheld.'},502);return json({mode:'test',was_test:true,status:result.status,tracking_number:result.tracking_number||null,label_url:result.label_url||null,messages:result.messages||[],transaction_id:result.object_id});}
  return json({error:'Unknown API route'},404);
 }catch(e){return json({error:e.message||'Shippo request failed',upstream_status:e.status||null},e.status>=400&&e.status<=499?422:502)}
}
export function handler(assets){return {async fetch(request,env){const url=new URL(request.url);
 if(url.pathname.startsWith('/api/shippo/')){if(!request.headers.get('oai-authenticated-user-id'))return json({error:'Sign in to the private shipping app first'},401);return api(request,env,url)}
 const path=url.pathname==='/'?'/orders.html':url.pathname;const asset=assets[path];if(!asset)return new Response('Not found',{status:404});return new Response(asset.text,{headers:{'content-type':asset.type,'cache-control':'no-store','x-content-type-options':'nosniff'}});
}}}
