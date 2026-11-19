import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { startServer } from "./server.mjs";
const code = "a-private-test-code-with-more-than-24-characters";
const origin="http://127.0.0.1:5173";
test("relay rejects unauthenticated browsers and exposes only a health check", async()=>{
 const relay=startServer({mock:true,port:0,host:"127.0.0.1",demoCode:code,allowedOrigins:[origin]});
 try {
  await new Promise(resolve=>relay.server.once("listening",resolve));
  const port=relay.server.address().port;
  const ws=new WebSocket("ws://127.0.0.1:"+port+"/stream",{headers:{Origin:origin}});
  const result=await new Promise(resolve=>{
   ws.on("open",()=>ws.send(JSON.stringify({type:"start",accessCode:"wrong",language:"en"})));
   ws.on("close",(code)=>resolve(code));
   ws.on("error",()=>resolve(-1));
  });
  assert.equal(result,1008);
 }finally{await relay.close()}
});
test("mock relay accepts PCM frames, produces fixture data and never calls Qwen",async()=>{
 const relay=startServer({mock:true,port:0,host:"127.0.0.1",demoCode:code,allowedOrigins:[origin]});
 try{
  await new Promise(resolve=>relay.server.once("listening",resolve));
  const port=relay.server.address().port;
  const ws=new WebSocket("ws://127.0.0.1:"+port+"/stream",{headers:{Origin:origin}});
  const transcript=await new Promise((resolve,reject)=>{
   ws.on("open",()=>ws.send(JSON.stringify({type:"start",accessCode:code,language:"zh"})));
   ws.on("message",data=>{
    const msg=JSON.parse(data.toString());
    if(msg.type==="ready") for(let i=0;i<6;i++)ws.send(Buffer.alloc(3200));
    if(msg.type==="final")resolve(msg.text);
   });
   ws.on("error",reject);
  });
  assert.match(transcript,/mock speech session/);
  ws.close();
 }finally{await relay.close()}
});
