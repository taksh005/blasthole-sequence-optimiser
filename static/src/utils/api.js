/**
 * api.js
 * All HTTP calls to the Flask backend.
 * Uses relative paths (/api/...) because Flask serves both
 * the frontend and the API from the same origin (localhost:5000).
 */

const BASE = "/api";

async function post(endpoint, body) {
  const res  = await fetch(`${BASE}${endpoint}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error + (data.details ? `: ${data.details}` : ""));
  return data;
}

async function get(endpoint, params = {}) {
  const qs  = new URLSearchParams(params).toString();
  const url = `${BASE}${endpoint}${qs ? "?" + qs : ""}`;
  const res  = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const api = {
  health:     ()       => get("/health"),
  delays:     ()       => get("/delays"),
  explosives: ()       => get("/explosives"),
  optimise:   (body)   => post("/optimise", body),
  pattern:    (body)   => post("/pattern", body),
  ppvCurve:   (params) => get("/ppv-curve", params),
};
