/**
 * Optional Qwen ASR WebSocket relay.
 * No paid connection is possible unless ASR_ENABLED=true and QWEN_API_KEY
 * are both configured. MOCK_ASR=true exercises the entire transport for free.
 * Never deploy with public access and no per-user quota / spending controls.
 */
import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import WebSocket, { WebSocketServer } from "ws";

const validLanguages = new Set(["auto","en","zh","yue","ja","ko","de","fr","es","pt","it"]);
function safeEquals(a, b) {
  const ha=createHash("sha256").update(a).digest();
  const hb=createHash("sha256").update(b).digest();
  return timingSafeEqual(ha,hb);
}
function parse(input) { try { return JSON.parse(input.toString()); } catch { return null; } }
function send(ws, message) { if(ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message)); }
function getUpstreamUrl() {
  const endpoint=process.env.QWEN_WS_ENDPOINT;
  if(!endpoint)throw Error("QWEN_WS_ENDPOINT must be configured using your Model Studio Workspace ID");
  const url=new URL(endpoint);
  const officialWorkspaceHost=/^[a-z0-9-]+\.(ap-southeast-1|cn-beijing)\.maas\.aliyuncs\.com$/i;
  if(url.protocol!=="wss:" || url.port || url.pathname!=="/api-ws/v1/realtime" ||
     !(officialWorkspaceHost.test(url.hostname) ||
       ["dashscope.aliyuncs.com","dashscope-intl.aliyuncs.com"].includes(url.hostname))) {
    throw Error("Unsupported Qwen WebSocket endpoint");
  }
  url.searchParams.set("model","qwen3-asr-flash-realtime");
  return url.href;
}

/** For local mock tests only, provide options directly. */
export function startServer(options = {}) {
  const mock=options.mock ?? process.env.MOCK_ASR === "true";
  const paidEnabled=options.paidEnabled ?? process.env.ASR_ENABLED === "true";
  const apiKey=options.apiKey ?? process.env.QWEN_API_KEY ?? "";
  const demoCode=options.demoCode ?? process.env.ASR_DEMO_ACCESS_CODE ?? "";
  const allowedOrigins=(options.allowedOrigins ?? (process.env.ALLOWED_ORIGINS || "").split(","))
    .filter(Boolean).map((value)=>value.trim());
  const port=options.port ?? Number(process.env.PORT||8789);
  const host=options.host ?? process.env.HOST ?? "127.0.0.1";
  const maxConcurrent=Number(process.env.MAX_ASR_CONNECTIONS||2);
  const maxSessionMs=Number(process.env.MAX_ASR_MINUTES||10)*60_000;
  let active=0;

  const http=createServer((req,res)=>{
    res.setHeader("Cache-Control","no-store");
    if(req.url==="/health") {
      res.writeHead(200,{"Content-Type":"application/json"});
      res.end(JSON.stringify({status:"ok",available:mock||paidEnabled&&!!apiKey,mode:mock?"mock":"qwen"}));
    } else {res.writeHead(404);res.end();}
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:45_000});
  http.on("upgrade",(req,socket,head)=>{
    const origin=req.headers.origin;
    const allowed=allowedOrigins.length>0 && origin && allowedOrigins.includes(origin);
    if(req.url!=="/stream" || !allowed) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n"); socket.destroy(); return;
    }
    wss.handleUpgrade(req,socket,head,(ws)=>wss.emit("connection",ws,req));
  });
  wss.on("connection",(client)=>{
    let authenticated=false,upstream=null,audioChunks=0,closed=false;
    let windowStart=Date.now(),audioBytes=0;
    const timer=setTimeout(()=>client.close(1000,"Time limit"),maxSessionMs);
    const authTimer=setTimeout(()=>{if(!authenticated)client.close(1008,"Authentication required");},7000);
    const safeClose=(reason)=>{
      if(closed)return;closed=true;
      if(upstream && upstream.readyState===WebSocket.OPEN){
        send(upstream,{type:"session.finish",event_id:"finish_"+Date.now()});
      }
      upstream?.close();client.close(1000,reason);
    };
    client.on("message",(data,binary)=>{
      if(!authenticated) {
        const msg=binary?null:parse(data);
        if(!msg || msg.type!=="start" ||
           !mock&&!paidEnabled ||
           !mock&&!apiKey ||
           demoCode.length<24 ||
           typeof msg.accessCode!=="string" || !safeEquals(msg.accessCode,demoCode) ||
           !validLanguages.has(msg.language) || active>=maxConcurrent) {
          client.close(1008,"Not authorized or relay disabled");return;
        }
        authenticated=true;active+=1;clearTimeout(authTimer);
        const language=msg.language;
        if(mock){
          send(client,{type:"ready",provider:"mock",language});
          return;
        }
        try {
          upstream=new WebSocket(getUpstreamUrl(),{
            headers:{"Authorization":"Bearer "+apiKey,"OpenAI-Beta":"realtime=v1"},
            handshakeTimeout:8000,
          });
          upstream.on("open",()=>{
            const config={
              type:"session.update",event_id:"session_"+Date.now(),
              session:{
                input_audio_format:"pcm",sample_rate:16000,
                turn_detection:{type:"server_vad",threshold:0.2,silence_duration_ms:600},
              },
            };
            if(language!=="auto")config.session.input_audio_transcription={language};
            send(upstream,config);
          });
          upstream.on("message",(event)=>{
            const msg=parse(event);if(!msg)return;
            if(msg.type==="session.updated"||msg.type==="session.created"){
              send(client,{type:"ready",provider:"qwen",language});return;
            }
            if(msg.type==="conversation.item.input_audio_transcription.text") {
              send(client,{type:"partial",text:String((msg.text||"")+(msg.stash||"")).slice(0,4000),language:msg.language||language});return;
            }
            if(msg.type==="conversation.item.input_audio_transcription.completed") {
              send(client,{type:"final",text:String(msg.transcript||"").slice(0,8000),
                language:msg.language||language});return;
            }
            if(msg.type==="error")send(client,{type:"error",message:"ASR provider rejected a request."});
          });
          upstream.on("error",()=>{send(client,{type:"error",message:"Speech service unavailable."});safeClose("ASR connection failed");});
          upstream.on("close",()=>safeClose("ASR service disconnected"));
        } catch {
          send(client,{type:"error",message:"Could not initialize speech service."});
          safeClose("Provider error");
        }
        return;
      }
      if(!binary)return;
      if(data.length>32_000){safeClose("Audio frame too large");return;}
      if(Date.now()-windowStart>1000){windowStart=Date.now();audioBytes=0;}
      audioBytes+=data.length;
      if(audioBytes>65_536){safeClose("Audio rate limit");return;}
      audioChunks+=1;
      if(mock) {
        // Deliberately synthetic, never transcribed by a model and never billed.
        if(audioChunks===6) send(client,{
          type:"final",
          text:"A sample transcript from a mock speech session. This is not a real transcription.",
          language:"en",
        });
      }else if(upstream?.readyState===WebSocket.OPEN) {
        send(upstream,{
          type:"input_audio_buffer.append",
          event_id:"audio_"+Date.now(),
          audio:Buffer.from(data).toString("base64"),
        });
      }
    });
    client.on("close",()=>{
      clearTimeout(timer);clearTimeout(authTimer);
      if(authenticated)active=Math.max(0,active-1);
      closed=true;upstream?.close();
    });
    client.on("error",()=>safeClose("Client disconnected"));
  });
  http.listen(port,host);
  return {server:http,wss,close:()=>new Promise((resolve)=>{
    for(const client of wss.clients)client.terminate();
    wss.close(()=>http.close(resolve));
  })};
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const relay=startServer();
  relay.server.on("listening",()=>{
    const addr=relay.server.address();
    console.log("Tick-Tock ASR relay listening on "+addr.address+":"+addr.port+
      " (paid calls "+(process.env.ASR_ENABLED==="true"?"requested":"disabled")+")");
  });
}
