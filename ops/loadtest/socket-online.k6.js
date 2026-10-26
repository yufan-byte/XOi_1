/** Preproduction only. Authenticated online connections, NO chat/model/upload/write events.
 * Prepare distinct, short-lived test identities. Never print packets or tokens.
 * This file is syntax-checked locally; 2000-VU production capacity is NOT certified here.
 */
import ws from "k6/ws";
import encoding from "k6/encoding";
import {check} from "k6";
import {Rate,Trend} from "k6/metrics";
const base=String(__ENV.BASE_URL||"http://127.0.0.1:12121").replace(/\/$/,"");
const target=Number(__ENV.VUS||20),hold=Number(__ENV.HOLD_SECONDS||900);
if(!Number.isInteger(target)||target<1||target>2000||!Number.isInteger(hold)||hold<60||hold>3600)throw new Error("Invalid online test limits");
let raw;try{raw=JSON.parse(__ENV.TOKENS_JSON||"[]");}catch{throw new Error("TOKENS_JSON must be injected as secret JSON");}
if(!Array.isArray(raw)||raw.length<target)throw new Error("Every online VU requires a different isolated test-user token");
const identities=new Set();
const tokens=raw.slice(0,target).map(value=>{
  if(typeof value!=="string")throw new Error("Invalid test identity");const token=value.replace(/^(Bearer\s+)+/i,"");
  let id;try{id=JSON.parse(encoding.b64decode(token.split(".")[1],"rawurl","s")).id;}catch{throw new Error("Invalid test identity");}
  if(!Number.isSafeInteger(id)||id<=0||identities.has(id))throw new Error("Online capacity test requires distinct account IDs, not many tokens for one account");
  identities.add(id);return "Bearer "+token;
});
const failures=new Rate("socket_session_failures"),readyMs=new Trend("socket_auth_ready_ms");
export const options={scenarios:{online:{executor:"ramping-vus",startVUs:0,stages:[{duration:"1m",target:Math.max(1,Math.floor(target/4))},{duration:"2m",target},{duration:__ENV.DURATION||"30m",target},{duration:"1m",target:0}],gracefulRampDown:"5s"}},thresholds:{checks:["rate>0.99"],socket_session_failures:["rate<0.01"],socket_auth_ready_ms:["p(95)<2000"]}};
export default function(){
  let authenticated=false,failed=false;const started=Date.now();
  const response=ws.connect(base.replace(/^http/,"ws")+"/socket.io/?EIO=4&transport=websocket",{tags:{kind:"online-no-generation"}},socket=>{
    socket.on("message",message=>{
      if(message==="2"){socket.send("3");return;}
      if(message.startsWith("0")){socket.send('40/api/socket/aiAssistant,'+JSON.stringify({token:tokens[(__VU-1)%tokens.length]}));return;}
      if(message.startsWith("40/api/socket/aiAssistant,")){authenticated=true;readyMs.add(Date.now()-started);return;}
      if(message.startsWith("44")){failed=true;socket.close();}
    });
    socket.on("error",()=>{failed=true;});
    socket.setTimeout(()=>{if(!authenticated){failed=true;socket.close();}},15000);
    socket.setTimeout(()=>socket.close(),hold*1000);
  });
  const ok=response&&response.status===101&&authenticated&&!failed;failures.add(!ok);check(response,{"authenticated online session, no model events":()=>ok});
}
