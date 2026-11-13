import test from "node:test";
import assert from "node:assert/strict";
import {
  createRehearsalRun, readHistory, writeHistory, upsertHistory,
  historyForPresentation, historyOwner,
} from "../src/ai/history.ts";
import { buildHistoryHints, cueForSection, outlinePointsForSection } from "../src/ai/historyInsights.ts";

const sections = [{id:1,name:"Intro",target:60,actual:82},{id:2,name:"Results",target:45,actual:35}];
const metrics = {
  language:"en-US",unitLabel:"Words",rateLabel:"WPM (estimate)",words:14,wpm:90,
  sections: [
    { id:1,name:"Intro",words:8,wpm:80,actual:82,target:60 },
    { id:2,name:"Results",words:6,wpm:100,actual:35,target:45 },
  ],
};
function make(id, i, text = true) {
  return createRehearsalRun({
    id,owner:"demo@example.com",presentationId:"presentation1",title:"Pitch",
    presentationMode:"individual",timedSections:sections,metrics,includeTranscript:text,
    segments:[
      {sectionId:1,atSecond:5,text:"Hello everyone we welcome you to the project"},
      {sectionId:2,atSecond:20,text:"We will discuss our key results"},
    ], duration:117, now:i,
  });
}
function storage() {
  const m = new Map();
  return {
    getItem(k) {return m.get(k)??null},
    setItem(k,v) {m.set(k,v)},
  };
}
test("history is explicitly saved and remains scoped by presentation and profile",()=>{
  const mem=storage();
  assert.deepEqual(readHistory(mem),[]);
  const a=make("a",100);
  const b=make("b",200,false);
  assert.equal(writeHistory(mem,upsertHistory([a],b)),true);
  assert.deepEqual(readHistory(mem).map(x=>x.id),["b","a"]);
  assert.equal(historyForPresentation(readHistory(mem),"other@example.com","presentation1").length,0);
  assert.equal(historyForPresentation(readHistory(mem),"demo@example.com","other").length,0);
  assert.equal(historyForPresentation(readHistory(mem),"demo@example.com","presentation1").length,2);
  assert.equal(historyOwner(null),"guest:local-device");
});
test("transcripts require opt-in, and re-saving the same run doesn't duplicate",()=>{
 const a=make("same",100,false);
 assert.equal("transcript" in a.sections[0],false);
 const b=make("same",101,true);
 assert.match(b.sections[0].transcript,/Hello/);
 assert.equal(upsertHistory([a],b).length,1);
});
test("at least two consistent overruns produce a grounded Present hint",()=>{
 const runs=[make("a",100),make("b",200)];
 const hints=buildHistoryHints({runs,sections,outline:""});
 const hint=cueForSection(hints,1);
 assert.equal(hint?.kind,"over-time");
 assert.match(hint?.evidence??"",/2 of 2/);
 assert.equal(buildHistoryHints({runs:runs.slice(0,1),sections}).length,0);
});
test("exact text match is cautious and only section-tagged outline points count",()=>{
 assert.deepEqual(outlinePointsForSection("Intro: mention the business model\nResults: discuss earnings", "Intro"),["mention the business model"]);
 const runs=[make("a",100,true),make("b",200,true)];
 const hints=buildHistoryHints({runs,sections,outline:"Intro: mention the business model"});
 const h=hints.find(x=>x.kind==="outline");
 assert.ok(h);
 assert.match(h.evidence,/Exact phrase missing in 2 of 2 transcripts/);
 assert.equal(buildHistoryHints({runs:runs.map(r=>({...r,sections:r.sections.map(s=>({...s,transcript:undefined}))})),sections,outline:"Intro: mention the business model"}).some(x=>x.kind==="outline"),false);
});
test("corrupt storage does not break the app",()=>{
 assert.deepEqual(readHistory({getItem(){return "{not-json"}}),[]);
});
