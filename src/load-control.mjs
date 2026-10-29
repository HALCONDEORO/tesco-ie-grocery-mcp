// One process-wide queue. No automatic retries or challenge evasion.
export class FetchFailure extends Error {
  constructor(status, message, retryAfter = null) { super(message); this.status = status; this.retryAfter = retryAfter; }
}
export function blockedHtml(html) {
  return /browser has failed some security checks/i.test(html) || /access denied/i.test(html) && /reference #/i.test(html) || /<title[^>]*>[^<]*(?:captcha|verify you are human|just a moment)/i.test(html);
}
export function createLoadQueue({intervalMs = 2000, now = Date.now, sleep = ms => new Promise(r=>setTimeout(r,ms))} = {}) {
  let tail = Promise.resolve(), last = null;
  return run => {
    const job = tail.then(async()=>{
      if (last !== null) { const delay = intervalMs - (now()-last); if (delay>0) await sleep(delay); }
      last = now();
      return run();
    });
    tail = job.catch(()=>{});
    return job;
  };
}
export function failureResult(e) {
  const status = ["blocked","rate_limited","timeout"].includes(e?.status) ? e.status : /timeout/i.test(e?.name ?? "") ? "timeout" : "fetch_error";
  return {status, error: `tesco.ie fetch failed: ${e.message}`, ...(e.retryAfter ? {retry_after: e.retryAfter} : {})};
}
