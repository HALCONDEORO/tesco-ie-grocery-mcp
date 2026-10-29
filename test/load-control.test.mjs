import test from "node:test";import assert from "node:assert/strict";
import {createLoadQueue,FetchFailure,failureResult,blockedHtml} from "../src/load-control.mjs";
import {searchProducts} from "../src/search.mjs";import {getProduct} from "../src/product.mjs";
test("simultaneous calls are serialized and starts spaced, including rejection",async()=>{let t=0,active=0;const starts=[];const q=createLoadQueue({now:()=>t,sleep:async ms=>{t+=ms}});const job=fail=>q(async()=>{assert.equal(active++,0);starts.push(t);await Promise.resolve();active--;if(fail)throw Error("synthetic");});const r=await Promise.allSettled([job(false),job(true),job(false)]);assert.deepEqual(starts,[0,2000,4000]);assert.equal(r[1].status,"rejected");});
test("typed refusals and Retry-After survive and stop remaining batch",async()=>{let n=0;const f=async()=>{n++;throw new FetchFailure("rate_limited","429","60")};const r=await searchProducts(f,[{query:"milk"},{query:"bread"}]);assert.equal(n,1);assert.equal(r[0].retry_after,"60");assert.equal(r[0].status,"rate_limited");assert.equal((await getProduct(f,"292769732")).status,"rate_limited");});
test("denial/challenge detection and timeout classification",()=>{assert.ok(blockedHtml("Access Denied Reference #x"));assert.ok(blockedHtml("<title>Verify you are human</title>"));assert.equal(failureResult({name:"TimeoutError",message:"slow"}).status,"timeout");});

test("actual security-check error shape is blocked in search, detail and doctor",async()=>{
  const html="<html><title>Error</title><h1>Oops... It looks like something is not right</h1><p>If you are seeing this page it is because your browser has failed some security checks.</p><p>Reference Id: synthetic</p></html>";
  assert.ok(blockedHtml(html));
  const {classifyPage,runDoctor}=await import("../src/doctor.mjs");
  assert.equal(classifyPage(html),"blocked");assert.equal((await runDoctor(async()=>html)).status,"blocked");
  let calls=0;const r=await searchProducts(async()=>{calls++;return html},[{query:"milk"},{query:"bread"}]);
  assert.equal(calls,1);assert.equal(r[0].status,"blocked");assert.equal((await getProduct(async()=>html,"292769732")).status,"blocked");
});
