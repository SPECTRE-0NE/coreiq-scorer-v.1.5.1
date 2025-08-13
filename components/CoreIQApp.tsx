'use client';
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from '@supabase/supabase-js'

// CoreIQ Scorer — Canvas Edition v1.5.0 (Supabase wired, cleaned for export)
// Login is email+password only. No magic links. CSV/JSONL exporters kept.
// This version removes hard-coded Supabase keys and shows a setup screen
// when env vars are missing. Self-tests retained.

// ========================= Supabase =========================
const SUPABASE_URL = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SUPABASE_URL) || '';
const SUPABASE_ANON_KEY = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY) || '';
export const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY) ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null

const debounce = (fn, wait = 700) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); }; };

// DB helpers
const packAudit = (a) => ({ id: a.id, client: a.client, status: a.status || 'DRAFT', data: a });
const unpackAudit = (row) => row.data;
async function fetchAudits() {
  const { data, error } = await supabase.from('audits').select('*').order('updated_at', { ascending: false })
  if (error) throw error; return (data || []).map(unpackAudit)
}
async function upsertAudit(audit) {
  const row = packAudit(audit)
  const { error } = await supabase.from('audits').upsert(row, { onConflict: 'id' })
  if (error) throw error
}
const upsertAuditDebounced = debounce(upsertAudit, 800)

// ========================= Config =========================
const WEIGHTS = { FUNCTIONALITY: 0.3, FRICTION: 0.25, DATA_FITNESS: 0.15, CHANGE_READINESS: 0.3 };
const ANCHOR_OVERRIDES = {
  sops: { left: "None", right: "Versioned" }, roles: { left: "Unclear", right: "RACI" }, systems: { left: "Spreadsheets", right: "Fit" },
  integration: { left: "Siloed", right: "Integrated" }, measurement: { left: "None", right: "Dashboards" }, manual_entry: { left: "High", right: "Low" },
  approvals: { left: "Slow", right: "Fast" }, duplication: { left: "Common", right: "None" }, rework: { left: "High", right: "Low" }, downtime: { left: "Frequent", right: "Rare" },
  completeness: { left: "Incomplete", right: "Complete" }, accuracy: { left: "Poor", right: "High" }, access: { left: "Gatekept", right: "Self-serve" },
  format: { left: "Unstandardised", right: "Standardised" }, standardisation: { left: "Inconsistent", right: "Strict" }, data_integration: { left: "Disconnected", right: "Unified" },
  leadership: { left: "Resistant", right: "Driving" }, culture: { left: "Static", right: "Innovates" }, past_adoption: { left: "Failed", right: "Successful" }, training: { left: "Reluctant", right: "Eager" }, resources: { left: "None", right: "Allocated" },
};


// ========================= Data (sub-criteria catalogue) =========================
const SUBS_BY_FN = {
  OPS: {
    FUNCTIONALITY: [
      { key: "sops", label: "Documented SOPs — order-to-cash, scheduling, QC.", description: "Coverage & currency of core SOPs.", anchor: { a0: "none", a3: "partial/key steps", a5: "versioned" } },
      { key: "roles", label: "Role Clarity — handoffs between teams.", description: "Clarity & enforcement of handoffs.", anchor: { a0: "unclear", a3: "mostly", a5: "RACI" } },
      { key: "systems", label: "System Coverage — WMS/ERP, scheduling, task mgmt.", description: "Fit-for-purpose coverage vs spreadsheets.", anchor: { a0: "sheets", a3: "single", a5: "fit" } },
      { key: "integration", label: "Integration — ERP↔inventory↔dispatch↔finance.", description: "Stability & breadth of integrations.", anchor: { a0: "siloed", a3: "partial", a5: "integrated" } },
      { key: "measurement", label: "Process Measurement — cycle time, OTIF, defect rate.", description: "How metrics are captured & surfaced.", anchor: { a0: "none", a3: "manual", a5: "dashboards" } },
    ],
    FRICTION: [
      { key: "manual_entry", label: "Manual Data Entry — % touch time.", description: "Share of work that’s manual.", anchor: { a0: "high", a3: "some", a5: "low" } },
      { key: "approvals", label: "Approval Bottlenecks — PO/job sign-offs.", description: "Time to decision.", anchor: { a0: "slow", a3: "ok", a5: "fast" } },
      { key: "duplication", label: "Duplication — double capture/rekey.", description: "Duplicate entry prevalence.", anchor: { a0: "common", a3: "some", a5: "none" } },
      { key: "rework", label: "Rework Rate — % jobs redone.", description: "Rework intensity.", anchor: { a0: "high", a3: "some", a5: "low" } },
      { key: "downtime", label: "System Downtime/Delays — planning/ERP.", description: "Outage/slowdown frequency.", anchor: { a0: "freq", a3: "monthly", a5: "rare" } },
    ],
    DATA_FITNESS: [
      { key: "completeness", label: "Data Completeness — item codes, BOMs, job IDs.", description: "Required fields present.", anchor: { a0: "incomplete", a3: "mixed", a5: "complete" } },
      { key: "accuracy", label: "Accuracy — stock deltas, route variance.", description: "Error frequency.", anchor: { a0: "poor", a3: "ok", a5: "high" } },
      { key: "access", label: "Accessibility — ops staff can self-serve.", description: "Appropriate self-serve access.", anchor: { a0: "gatekept", a3: "partial", a5: "self-serve" } },
      { key: "format", label: "Format Standardisation — units, SKUs, naming.", description: "Standards adherence.", anchor: { a0: "chaos", a3: "mostly", a5: "catalogue" } },
      { key: "data_integration", label: "Data Integration — ERP⇄WMS⇄BI.", description: "Unification level.", anchor: { a0: "none", a3: "some", a5: "unified" } },
    ],
    CHANGE_READINESS: [
      { key: "leadership", label: "Leadership Buy-in — ops head sponsorship.", description: "Sponsor energy.", anchor: { a0: "resist", a3: "neutral", a5: "driving" } },
      { key: "culture", label: "Innovation Culture — kaizen/continuous improvement.", description: "Continuous improvement cadence.", anchor: { a0: "never", a3: "adhoc", a5: "routine" } },
      { key: "past_adoption", label: "Past Tech Adoption — ERP upgrades succeeded?", description: "Track record of change.", anchor: { a0: "failed", a3: "mixed", a5: "success" } },
      { key: "training", label: "Training Willingness — floor teams upskill.", description: "Willingness to learn.", anchor: { a0: "reluctant", a3: "willing", a5: "eager" } },
      { key: "resources", label: "Resources — time/budget/SME available.", description: "Resourcing for improvement.", anchor: { a0: "none", a3: "limited", a5: "allocated" } },
    ],
  },
  CX: {
    FUNCTIONALITY: [
      { key: "sops", label: "SOPs — intake, triage, escalation, refunds.", description: "Process coverage.", anchor: { a0: "none", a3: "partial", a5: "versioned" } },
      { key: "roles", label: "Role Clarity — agent vs team lead vs QA.", description: "Ownership of tasks.", anchor: { a0: "unclear", a3: "mostly", a5: "RACI" } },
      { key: "systems", label: "System Coverage — helpdesk/CRM/telephony/KB.", description: "Tooling sufficiency.", anchor: { a0: "adhoc", a3: "single", a5: "fit" } },
      { key: "integration", label: "Integration — CRM↔helpdesk↔billing↔comms.", description: "Data flow between CX tools.", anchor: { a0: "siloed", a3: "partial", a5: "stable" } },
      { key: "measurement", label: "Measurement — SLA, FRT, AHT, CSAT/NPS in dashboards.", description: "Operational telemetry.", anchor: { a0: "none", a3: "manual", a5: "dashboards" } },
    ],
    FRICTION: [
      { key: "manual_entry", label: "Manual Entry — notes/rekeying between tools.", description: "Manual activity share.", anchor: { a0: "high", a3: "some", a5: "low" } },
      { key: "approvals", label: "Approval Bottlenecks — goodwill/discounts/RMAs.", description: "Time to authorise.", anchor: { a0: "slow", a3: "ok", a5: "fast" } },
      { key: "duplication", label: "Duplication — duplicate tickets/accounts.", description: "Duplicates prevalence.", anchor: { a0: "common", a3: "some", a5: "rare" } },
      { key: "rework", label: "Rework — reopened tickets % / transfers.", description: "Amount of rework.", anchor: { a0: "high", a3: "some", a5: "low" } },
      { key: "downtime", label: "Downtime/Delays — telephony/queue outages.", description: "Outage frequency.", anchor: { a0: "freq", a3: "monthly", a5: "rare" } },
    ],
    DATA_FITNESS: [
      { key: "completeness", label: "Completeness — CRM required fields, contact history.", description: "Data field fill.", anchor: { a0: "incomplete", a3: "mixed", a5: "complete" } },
      { key: "accuracy", label: "Accuracy — wrong contact/entitlement.", description: "Error rate.", anchor: { a0: "poor", a3: "ok", a5: "high" } },
      { key: "access", label: "Accessibility — 360° customer view.", description: "Context availability.", anchor: { a0: "fragmented", a3: "partial", a5: "unified" } },
      { key: "standardisation", label: "Standardisation — tagging, reasons, dispositions.", description: "Taxonomy discipline.", anchor: { a0: "inconsistent", a3: "improving", a5: "strict" } },
      { key: "data_integration", label: "Integration — events in one timeline.", description: "Timeline consolidation.", anchor: { a0: "none", a3: "partial", a5: "consolidated" } },
    ],
    CHANGE_READINESS: [
      { key: "leadership", label: "Leadership Buy-in — CX lead owns outcomes.", description: "Sponsor engagement.", anchor: { a0: "resist", a3: "neutral", a5: "driving" } },
      { key: "culture", label: "Innovation Culture — macros, AI, self-service experiments.", description: "Experiment cadence.", anchor: { a0: "static", a3: "adhoc", a5: "routine" } },
      { key: "past_adoption", label: "Past Adoption — helpdesk/CRM rollouts stuck or shipped?", description: "Rollout track record.", anchor: { a0: "failed", a3: "mixed", a5: "success" } },
      { key: "training", label: "Training — playbooks, QA coaching cadence.", description: "Enablement rigour.", anchor: { a0: "reluctant", a3: "willing", a5: "eager" } },
      { key: "resources", label: "Resources — content, ops engineer, budget.", description: "Capacity to execute.", anchor: { a0: "none", a3: "limited", a5: "allocated" } },
    ],
  },
  SALES_MARKETING: {
    FUNCTIONALITY: [
      { key: "sops", label: "SOPs — lead capture→handoff→close, campaign mgmt.", description: "Sales and marketing process coverage.", anchor: { a0: "none", a3: "partial", a5: "versioned" } },
      { key: "roles", label: "Role Clarity — SDR/AE/marketing ops defined.", description: "Ownership and handoffs across GTM roles.", anchor: { a0: "unclear", a3: "mostly", a5: "RACI" } },
      { key: "systems", label: "System Coverage — CRM, MAP, call tools, proposals.", description: "Tooling sufficiency.", anchor: { a0: "adhoc", a3: "single", a5: "fit" } },
      { key: "integration", label: "Integration — CRM⇄MAP↔ads↔billing.", description: "Closed-loop data flow.", anchor: { a0: "siloed", a3: "partial", a5: "integrated" } },
      { key: "measurement", label: "Measurement — funnel dashboards, CAC/LTV, win-loss.", description: "Operational & financial telemetry.", anchor: { a0: "none", a3: "manual", a5: "dashboards" } },
    ],
    FRICTION: [
      { key: "manual_entry", label: "Manual Entry — CRM updates by reps.", description: "Manual work share.", anchor: { a0: "high", a3: "some", a5: "low" } },
      { key: "approvals", label: "Approval Bottlenecks — discounts, contracts.", description: "Time to authorise.", anchor: { a0: "slow", a3: "ok", a5: "fast" } },
      { key: "duplication", label: "Duplication — duplicate leads/accounts.", description: "Duplicates prevalence.", anchor: { a0: "common", a3: "some", a5: "rare" } },
      { key: "rework", label: "Rework — poor handoffs, requalification.", description: "Amount of rework.", anchor: { a0: "high", a3: "some", a5: "low" } },
      { key: "downtime", label: "Downtime — tool outages, broken integrations.", description: "Outage frequency.", anchor: { a0: "freq", a3: "sometimes", a5: "rare" } },
    ],
    DATA_FITNESS: [
      { key: "completeness", label: "Completeness — CRM fields populated.", description: "Required field fill.", anchor: { a0: "incomplete", a3: "mixed", a5: "complete" } },
      { key: "accuracy", label: "Accuracy — attribution & pipeline data.", description: "Data correctness.", anchor: { a0: "poor", a3: "mixed", a5: "strong" } },
      { key: "access", label: "Accessibility — live dashboards for reps/managers.", description: "Appropriate access.", anchor: { a0: "opaque", a3: "partial", a5: "clear" } },
      { key: "standardisation", label: "Standardisation — stages, reasons, tags.", description: "Taxonomy consistency.", anchor: { a0: "inconsistent", a3: "improving", a5: "enforced" } },
      { key: "data_integration", label: "Closed-loop tracking from marketing to sales.", description: "Unified GTM model.", anchor: { a0: "none", a3: "partial", a5: "full" } },
    ],
    CHANGE_READINESS: [
      { key: "leadership", label: "Leadership Buy-in — CRO/Head of Sales/Marketing.", description: "Sponsor engagement.", anchor: { a0: "resist", a3: "neutral", a5: "driving" } },
      { key: "culture", label: "Innovation Culture — A/B testing, experimentation.", description: "Experiment cadence.", anchor: { a0: "static", a3: "adhoc", a5: "routine" } },
      { key: "past_adoption", label: "Past Adoption — CRM/MAP upgrades.", description: "Track record.", anchor: { a0: "failed", a3: "mixed", a5: "success" } },
      { key: "training", label: "Training — sales enablement sessions.", description: "Enablement.", anchor: { a0: "reluctant", a3: "willing", a5: "eager" } },
      { key: "resources", label: "Resources — ops support & budget.", description: "Capacity.", anchor: { a0: "none", a3: "limited", a5: "allocated" } },
    ],
  },
  FINANCE_ADMIN: {
    FUNCTIONALITY: [
      { key: "sops", label: "SOPs — budgeting, forecasting, month-end close.", description: "Finance process coverage.", anchor: { a0: "none", a3: "partial", a5: "versioned" } },
      { key: "roles", label: "Role Clarity — CFO, controllers, AP/AR, procurement.", description: "Ownership and handoffs.", anchor: { a0: "unclear", a3: "mostly", a5: "RACI" } },
      { key: "systems", label: "System Coverage — ERP, expense mgmt, procurement.", description: "Tooling sufficiency.", anchor: { a0: "sheets", a3: "single", a5: "fit" } },
      { key: "integration", label: "Integration — ERP↔bank↔payroll↔procurement.", description: "Data flow across finance tools.", anchor: { a0: "siloed", a3: "partial", a5: "integrated" } },
      { key: "measurement", label: "Measurement — cash flow, AR aging, BvA dashboards.", description: "Operational dashboards.", anchor: { a0: "none", a3: "manual", a5: "dashboards" } },
    ],
    FRICTION: [
      { key: "manual_entry", label: "Manual Entry — invoices, expenses, bank recs.", description: "Manual workload.", anchor: { a0: "high", a3: "some", a5: "low" } },
      { key: "approvals", label: "Approval Bottlenecks — PO approvals, expense sign-off.", description: "Time to approve.", anchor: { a0: "slow", a3: "ok", a5: "fast" } },
      { key: "duplication", label: "Duplication — duplicate vendor/customer records.", description: "Duplicates.", anchor: { a0: "common", a3: "some", a5: "none" } },
      { key: "rework", label: "Rework — correcting posting errors.", description: "Rework level.", anchor: { a0: "high", a3: "some", a5: "low" } },
      { key: "downtime", label: "Downtime — payroll, ERP outages.", description: "Outage frequency.", anchor: { a0: "freq", a3: "sometimes", a5: "rare" } },
    ],
    DATA_FITNESS: [
      { key: "completeness", label: "Completeness — required fields in finance systems.", description: "Data field fill.", anchor: { a0: "incomplete", a3: "mixed", a5: "complete" } },
      { key: "accuracy", label: "Accuracy — reconciliation variances.", description: "Error rate.", anchor: { a0: "high", a3: "some", a5: "low" } },
      { key: "access", label: "Accessibility — live reports for decision makers.", description: "Role-appropriate access.", anchor: { a0: "gatekept", a3: "partial", a5: "self-serve" } },
      { key: "standardisation", label: "Standardisation — chart of accounts, vendor codes.", description: "Standards adherence.", anchor: { a0: "chaotic", a3: "improv", a5: "enforced" } },
      { key: "data_integration", label: "Integration — automated sync across finance stack.", description: "Unification level.", anchor: { a0: "manual", a3: "semi", a5: "full" } },
    ],
    CHANGE_READINESS: [
      { key: "leadership", label: "Leadership Buy-in — CFO & finance leadership.", description: "Sponsor energy.", anchor: { a0: "resist", a3: "neutral", a5: "driving" } },
      { key: "culture", label: "Innovation Culture — adoption of fintech tools.", description: "Appetite for new tools.", anchor: { a0: "static", a3: "adhoc", a5: "routine" } },
      { key: "past_adoption", label: "Past Adoption — ERP migrations, automation success.", description: "Track record.", anchor: { a0: "failed", a3: "mixed", a5: "success" } },
      { key: "training", label: "Training — finance team enablement.", description: "Enablement cadence.", anchor: { a0: "reluctant", a3: "willing", a5: "eager" } },
      { key: "resources", label: "Resources — budget for transformation projects.", description: "Capacity to execute.", anchor: { a0: "none", a3: "limited", a5: "allocated" } },
    ],
  },
  INTERNAL_INTEL: {
    FUNCTIONALITY: [
      { key: "sops", label: "SOPs — data ingestion, incident runbooks, change mgmt.", description: "Operational SOPs for data & IT.", anchor: { a0: "none", a3: "partial", a5: "versioned" } },
      { key: "roles", label: "Role Clarity — data owners, admins, security.", description: "Ownership clarity.", anchor: { a0: "unclear", a3: "mostly", a5: "defined" } },
      { key: "systems", label: "System Coverage — warehouse/lake, ETL, BI, monitoring.", description: "Platform coverage.", anchor: { a0: "gaps", a3: "partial", a5: "complete" } },
      { key: "integration", label: "Integration — source ⇄ warehouse ⇄ BI.", description: "Pipeline connectivity.", anchor: { a0: "siloed", a3: "partial", a5: "integrated" } },
      { key: "measurement", label: "Measurement — data SLAs, quality, uptime.", description: "Operational telemetry.", anchor: { a0: "none", a3: "manual", a5: "dashboards" } },
    ],
    FRICTION: [
      { key: "manual_entry", label: "Manual Entry — CSV uploads, ad-hoc scripts.", description: "Manual operations.", anchor: { a0: "high", a3: "some", a5: "low" } },
      { key: "approvals", label: "Approval Bottlenecks — access requests, schemas.", description: "Time to approve.", anchor: { a0: "slow", a3: "ok", a5: "fast" } },
      { key: "duplication", label: "Duplication — redundant datasets/reports.", description: "Duplicate assets.", anchor: { a0: "common", a3: "some", a5: "rare" } },
      { key: "rework", label: "Rework — fixing broken pipelines.", description: "Fix-forward rate.", anchor: { a0: "high", a3: "some", a5: "low" } },
      { key: "downtime", label: "Downtime — system or integration outages.", description: "Failure frequency.", anchor: { a0: "freq", a3: "sometimes", a5: "rare" } },
    ],
    DATA_FITNESS: [
      { key: "completeness", label: "Completeness — coverage of required data sources.", description: "Source coverage.", anchor: { a0: "incomplete", a3: "mixed", a5: "complete" } },
      { key: "accuracy", label: "Accuracy — tests & anomaly detection.", description: "Data correctness.", anchor: { a0: "low", a3: "ok", a5: "high" } },
      { key: "access", label: "Accessibility — governed self-serve analytics.", description: "Self-serve with governance.", anchor: { a0: "gatekept", a3: "partial", a5: "self-serve" } },
      { key: "standardisation", label: "Standardisation — naming conventions, models.", description: "Standards consistency.", anchor: { a0: "inconsistent", a3: "improving", a5: "strict" } },
      { key: "data_integration", label: "Integration — unified semantic layer.", description: "Semantic unification.", anchor: { a0: "none", a3: "partial", a5: "unified" } },
    ],
    CHANGE_READINESS: [
      { key: "leadership", label: "Leadership Buy-in — CIO/Head of Data.", description: "Sponsor engagement.", anchor: { a0: "resist", a3: "neutral", a5: "driving" } },
      { key: "culture", label: "Innovation Culture — new tools experimentation.", description: "Experiment cadence.", anchor: { a0: "static", a3: "adhoc", a5: "routine" } },
      { key: "past_adoption", label: "Past Adoption — platform migrations.", description: "Track record.", anchor: { a0: "failed", a3: "mixed", a5: "success" } },
      { key: "training", label: "Training — analyst & engineer upskilling.", description: "Enablement.", anchor: { a0: "reluctant", a3: "willing", a5: "eager" } },
      { key: "resources", label: "Resources — bandwidth for improvements.", description: "Capacity.", anchor: { a0: "none", a3: "limited", a5: "allocated" } },
    ],
  },
};


// ========================= RAG & Rules (local-only MVP in canvas) =========================
const ATT_MAX_MB = 10; // MB per file
const VENDORS = [
  { id: "v-ipaas", name: "iPaaS Integration Layer", niche: "Integration/iPaaS", fns: ["OPS", "CX", "FINANCE_ADMIN"] },
  { id: "v-helpdesk", name: "Helpdesk + CRM Suite", niche: "CX Platform", fns: ["CX"] },
  { id: "v-erp", name: "Modern ERP", niche: "ERP", fns: ["OPS", "FINANCE_ADMIN"] },
  { id: "v-dwh", name: "Data Warehouse + BI", niche: "Data Platform", fns: ["INTERNAL_INTEL", "OPS", "FINANCE_ADMIN"] },
];

function formatBytes(bytes) {
  if (bytes == null) return ""; const mb = bytes / (1024 * 1024); if (mb >= 1) return `${mb.toFixed(1)} MB`; const kb = bytes / 1024; return `${kb.toFixed(0)} KB`;
}
const getAnchors = (it) => { const o = ANCHOR_OVERRIDES[it.key]; return { left: o?.left ?? it.anchor.a0, right: o?.right ?? it.anchor.a5 }; };
const normalise = (s) => (s == null ? null : Math.max(0, Math.min(5, s)) * 20);
const mean = (arr) => { const vals = arr.filter((x) => typeof x === "number"); return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0; };
const componentScore = (subs) => mean(subs.map((s) => normalise(s.score)));
const functionScore = (map) => map.FUNCTIONALITY * WEIGHTS.FUNCTIONALITY + map.FRICTION * WEIGHTS.FRICTION + map.DATA_FITNESS * WEIGHTS.DATA_FITNESS + map.CHANGE_READINESS * WEIGHTS.CHANGE_READINESS;
const overallScore = (fns) => (fns.length ? mean(fns) : 0);
const bandFor = (score) => (score >= 85 ? "Prime" : score >= 70 ? "Strong" : score >= 50 ? "Competent" : "Baseline");

function computeScores(audit) {
  const perFn = {}; const compOrder = ["FUNCTIONALITY", "FRICTION", "DATA_FITNESS", "CHANGE_READINESS"]; const compBuckets = { FUNCTIONALITY: [], FRICTION: [], DATA_FITNESS: [], CHANGE_READINESS: [] };
  const activeFns = audit.functions.filter((f) => audit.scope[f.name]);
  for (const fn of activeFns) {
    const map = { FUNCTIONALITY: 0, FRICTION: 0, DATA_FITNESS: 0, CHANGE_READINESS: 0 };
    for (const c of fn.components) { const cs = componentScore(c.sub); map[c.name] = cs; compBuckets[c.name].push(cs); }
    perFn[fn.name] = functionScore(map);
  }
  const overall = overallScore(Object.values(perFn));
  const perComponent = compOrder.map((k) => { const arr = compBuckets[k]; return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; });
  return { perFunction: perFn, perComponent, overall };
}

function computeFnComponentScores(audit) {
  const res = {}; const active = audit.functions.filter((f) => audit.scope[f.name]);
  for (const fn of active) { const m = { FUNCTIONALITY: 0, FRICTION: 0, DATA_FITNESS: 0, CHANGE_READINESS: 0 }; for (const c of fn.components) { m[c.name] = componentScore(c.sub); } res[fn.name] = m; }
  return res;
}

function collectNotesByFn(audit) {
  const out = {}; const active = audit.functions.filter((f) => audit.scope[f.name]);
  for (const fn of active) {
    const notes = []; let i = 0;
    for (const c of fn.components) {
      for (const s of c.sub) {
        if (s.note && String(s.note).trim()) { i += 1; notes.push({ id: `NOTE-${fn.name.toLowerCase()}-${s.key}-${i}`, fn: fn.name, component: c.name, text: String(s.note).trim() }); }
      }
    }
    out[fn.name] = notes;
  }
  return out;
}

function collectAttachmentsByFn(audit) {
  const out = {}; for (const k of ["OPS", "CX", "FINANCE_ADMIN", "SALES_MARKETING", "INTERNAL_INTEL"]) { if (audit.scope[k]) out[k] = (audit.attachments?.[k] || []); }
  return out;
}

function runRules(audit) {
  const comp = computeFnComponentScores(audit); const notes = collectNotesByFn(audit); const recs = {};
  const has = (fn, words) => { const blob = (notes[fn] || []).map((n) => n.text).join(" ").toLowerCase(); return words.some((w) => blob.includes(w)); };
  for (const fn of Object.keys(comp)) {
    const m = comp[fn]; const list = [];
    if (m.FRICTION < 60 && has(fn, ["duplicate", "rekey", "double capture", "manual entry"])) list.push({ title: "Eliminate duplicate data entry", rationale: "Friction and notes indicate rekeying.", vendors: VENDORS.filter((v) => v.id === "v-ipaas") });
    if (m.FUNCTIONALITY < 60 && has(fn, ["spreadsheet", "sheets", "manual process"])) { if (fn === "OPS" || fn === "FINANCE_ADMIN") list.push({ title: "Upgrade core system of record", rationale: "Functionality gaps with spreadsheet reliance.", vendors: VENDORS.filter((v) => v.id === "v-erp") }); }
    if (fn === "CX" && (m.DATA_FITNESS < 60 || m.FUNCTIONALITY < 60)) list.push({ title: "Unify CX stack & CRM", rationale: "Data fitness/functional gaps suggest fragmentation.", vendors: VENDORS.filter((v) => v.id === "v-helpdesk") });
    if (fn === "INTERNAL_INTEL" && (m.FUNCTIONALITY < 60 || m.DATA_FITNESS < 60)) list.push({ title: "Establish governed data platform", rationale: "Gaps in data fitness/functionality.", vendors: VENDORS.filter((v) => v.id === "v-dwh") });
    recs[fn] = list;
  }
  return recs;
}

function compileReportLocal(audit) {
  const scores = computeScores(audit); const comp = computeFnComponentScores(audit); const notes = collectNotesByFn(audit); const atts = collectAttachmentsByFn(audit); const recs = runRules(audit);
  const band = bandFor(scores.overall);
  const nowIso = new Date().toISOString();
  const functions = Object.keys(comp).map((fn) => {
    const compMap = comp[fn]; const sorted = Object.entries(compMap).sort((a, b) => a[1] - b[1]); const weaknesses = sorted.slice(0, 2).map(([k, v]) => ({ component: k, score: v }));
    const keyNotes = (notes[fn] || []).slice(0, 6);
    const findings = [
      ...weaknesses.map((w) => ({ statement: `${fn} ${w.component.toLowerCase()} is a weakness (${w.score.toFixed(0)}).`, evidence: keyNotes.slice(0, 2).map((n) => n.id) })),
      ...(keyNotes.length ? [{ statement: `Representative notes mention: "${keyNotes[0].text.slice(0, 120)}${keyNotes[0].text.length > 120 ? "…" : ""}"`, evidence: [keyNotes[0].id] }] : []),
    ];
    return {
      fn, score: scores.perFunction[fn] || 0,
      situation: `Baseline ${fn} score ${Math.round(scores.perFunction[fn] || 0)} with ${weaknesses.map((w) => w.component.toLowerCase()).join(" and ")} below target.`,
      complication: keyNotes.length ? `Notes indicate ${keyNotes[0].text.slice(0, 40).toLowerCase()}…` : `Limited documented evidence of specific blockers.`,
      findings, recommendations: recs[fn] || [], notes: keyNotes, attachments: atts[fn] || [],
    };
  });
  const topFn = functions.slice().sort((a, b) => a.score - b.score)[0];
  const executive = {
    headline: `${band} automation readiness (${scores.overall.toFixed(1)})`,
    bullets: [
      topFn ? `Primary gap in ${topFn.fn} — lowest function score ${topFn.score.toFixed(1)}.` : "Primary gap not determined.",
      `Weakest components: ${functions.flatMap((f) => f.findings.slice(0, 1).map((x) => x.statement.replace(/\\.$/, ""))).slice(0, 3).join("; ")}.`,
      `${Object.values(recs).reduce((a, b) => a + (b?.length || 0), 0)} vendor-linked recommendations prepared.`,
    ],
    citations: (functions[0]?.notes || []).slice(0, 2).map((n) => n.id),
  };
  const roadmap = {
    days_30: ["Stabilise data capture and remove obvious rekeying in one pilot process.", "Confirm owners, decision rights, and baseline metrics."],
    days_60: ["Deploy first integration or automation in the pilot function.", "Draft vendor shortlist and commercials for priority recs."],
    days_90: ["Scale to two additional processes; publish KPI uplift and savings estimate.", "Lock implementation plan with selected vendor(s)."],
  };
  const risks = ["Change fatigue", "Weak data foundations", "Under-resourced owners"];
  const next_steps = ["Approve pilot scope", "Share access for evidence extraction", "Schedule working session for vendor selection"];
  return { meta: { client: audit.client, generated_at: nowIso, band, overall_score: scores.overall }, executive_summary: executive, functions, roadmap, risks, next_steps };
}

// ========================= App Shell + Auth =========================
export default function App() { return supabase ? <AuthGate /> : <SetupNotice />; }

function AuthGate() {
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); setAuthReady(true); })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, s) => { setSession(s); setAuthReady(true); })
    return () => subscription.unsubscribe()
  }, [])

  if (!authReady) return (
    <div className="min-h-screen grid place-items-center">
      <div className="text-sm text-gray-600">Checking session…</div>
    </div>
  )
  if (!session) return <Login />
  return <RootApp session={session} />
}

function SetupNotice() {
  return (
    <div className="min-h-screen grid place-items-center bg-white p-6">
      <div className="w-full max-w-lg rounded-2xl border p-6 shadow-sm">
        <div className="text-lg font-semibold mb-2">CoreIQ by Curiata</div>
        <div className="text-sm text-gray-700">Environment not configured.</div>
        <ol className="mt-3 list-decimal pl-5 text-sm text-gray-700">
          <li>In Vercel → <b>Settings → Environment Variables</b>, add:</li>
          <li className="mt-1"><code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.</li>
          <li className="mt-1">Redeploy to apply. This message disappears once configured.</li>
        </ol>
      </div>
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function signInPassword(e){
    e.preventDefault();
    setLoading(true);
    setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setErr(error.message);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-4">
      <div className="w-full max-w-md rounded-2xl border p-6 shadow-sm">
        <div className="text-lg font-semibold mb-2">CoreIQ by Curiata</div>
        <div className="text-sm text-gray-600 mb-4">Sign in with email and password.</div>
        <form className="space-y-3" onSubmit={signInPassword}>
          <label className="grid gap-1 text-sm">
            <span>Email</span>
            <input className="rounded-md border px-2 py-1" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Password</span>
            <input className="rounded-md border px-2 py-1" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required />
          </label>
          {err && <div className="text-sm text-red-600">{err}</div>}
          <button disabled={loading} className="w-full rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
            {loading ? 'Please wait…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

function RootApp({ session }) {
  const [page, setPage] = useState("dashboard");
  const [audits, setAudits] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editAuditId, setEditAuditId] = useState(null);
  const [loading, setLoading] = useState(true)

  // Load audits after auth
  useEffect(() => { (async()=>{
    try {
      const rows = await fetchAudits()
      if (rows.length) { setAudits(rows) }
      else { const seed = seedAudit(); setAudits([seed]); await upsertAudit(seed) }
    } catch(e) { console.warn('Load failed, falling back to seed', e); const seed = seedAudit(); setAudits([seed]) }
    finally { setLoading(false) }
  })() }, [session?.user?.id])

  useEffect(() => { if (!selectedId && audits.length) setSelectedId(audits[0].id); }, [audits.length, selectedId]);
  const selectedAudit = useMemo(() => audits.find((a) => a.id === selectedId) || null, [audits, selectedId]);
  const scores = useMemo(() => (selectedAudit ? computeScores(selectedAudit) : { perFunction: {}, perComponent: [0, 0, 0, 0], overall: 0 }), [selectedAudit]);

  function updateAudit(id, mut) {
    setAudits((prev) => prev.map((a) => {
      if (a.id !== id) return a
      const next = mut({ ...a })
      upsertAuditDebounced(next)
      return next
    }));
  }
  function routeToWizard(id) { updateAudit(id, (a) => ({ ...a, status: "IN_PROGRESS", updatedAt: new Date() })); setSelectedId(id); setPage("wizard"); }
  function handleCreate(created, continueToWizard) { setAudits((prev) => [created, ...prev]); upsertAudit(created); setShowCreate(false); if (continueToWizard) routeToWizard(created.id); }
  function handleEditSave(updated) { updateAudit(updated.id, () => updated); setShowCreate(false); setEditAuditId(null); }

  useEffect(() => { try { runSelfTests(); } catch (e) { console.warn("Self-tests failed:", e); } }, []);

  if (loading) {
  return (
    <div className="min-h-screen grid place-items-center text-sm text-gray-600">Loading audits…</div>
  );
}

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="mx-auto max-w-6xl p-4">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold">CoreIQ by Curiata</h1>
          <div className="flex items-center gap-3">
            <nav className="hidden items-center gap-3 text-sm text-gray-600 sm:flex">
              <a className={navCx(page === "dashboard")} onClick={() => setPage("dashboard")}>Dashboard</a>
              <a className={navCx(!!selectedAudit && page === "wizard")} onClick={() => selectedAudit && setPage("wizard")}>Wizard</a>
              <a className={navCx(!!selectedAudit && page === "scoring")} onClick={() => selectedAudit && setPage("scoring")}>Scoring</a>
              <a className={navCx(!!selectedAudit && page === "report")} onClick={() => selectedAudit && setPage("report")}>Report</a>
            </nav>
            <div className="hidden sm:block text-xs text-gray-600">{session?.user?.email}</div>
            <button className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50" onClick={()=>supabase?.auth.signOut()}>Sign out</button>
            <button className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800" onClick={() => { setEditAuditId(null); setShowCreate(true); }}>Create Audit</button>
          </div>
        </header>

        {page === "dashboard" && (
          <Dashboard
            audits={audits.filter((a) => !a.archived)}
            onOpenCreate={() => { setEditAuditId(null); setShowCreate(true); }}
            onOpenWizard={(id) => routeToWizard(id)}
            onScoring={(id) => { setSelectedId(id); setPage("scoring"); }}
            onReport={(id) => { setSelectedId(id); setPage("report"); }}
            onArchive={(id) => updateAudit(id, (a) => ({ ...a, archived: true }))}
            onEdit={(id) => { setEditAuditId(id); setShowCreate(true); }}
            computeScores={computeScores}
          />
        )}

        {selectedAudit && page === "wizard" && (
          <Wizard
            audit={selectedAudit}
            setAudit={(a) => updateAudit(selectedAudit.id, () => a)}
            scores={scores}
            onBack={() => setPage("dashboard")}
          />
        )}
        {selectedAudit && page === "scoring" && <Scoring audit={selectedAudit} scores={scores} />}
        {selectedAudit && page === "report" && <Report audit={selectedAudit} />}

        {showCreate && (
          <CreateAuditModal
            existing={editAuditId ? audits.find((a) => a.id === editAuditId) || null : null}
            onClose={() => { setShowCreate(false); setEditAuditId(null); }}
            onCreate={handleCreate}
            onSaveEdit={handleEditSave}
          />
        )}
      </div>
    </div>
  );
}

function navCx(active) { return "cursor-pointer rounded-md px-2 py-1 hover:bg-gray-100 " + (active ? "bg-gray-100 text-gray-900" : "text-gray-600"); }

function Dashboard({ audits, onOpenCreate, onOpenWizard, onScoring, onReport, onArchive, onEdit, computeScores }) {
  const [menuOpen, setMenuOpen] = useState(null);
  if (audits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border p-10 text-center">
        <div className="mb-2 text-base font-semibold">No audits yet</div>
        <div className="mb-4 max-w-md text-sm text-gray-600">No audits yet. Create your first CoreIQ audit to begin.</div>
        <button className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:bg-gray-800" onClick={onOpenCreate}>Create Audit</button>
      </div>
    );
  }
  return (
    <div className="rounded-xl border p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium">Audits</div>
        <button className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800" onClick={onOpenCreate}>Create Audit</button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500"><th>Client</th><th>Title</th><th>Status</th><th>Band</th><th>Updated</th><th></th></tr>
        </thead>
        <tbody>
          {audits.map((a) => { const sc = computeScores(a); return (
            <tr key={a.id} className="border-t">
              <td className="py-2">{a.client}</td>
              <td>{a.title}</td>
              <td>{a.status}</td>
              <td><Band score={sc.overall} /></td>
              <td>{new Date(a.updatedAt).toLocaleString()}</td>
              <td className="relative">
                <button className="rounded px-2 py-1 text-gray-600 hover:bg-gray-100" onClick={() => setMenuOpen(menuOpen === a.id ? null : a.id)}>⋯</button>
                {menuOpen === a.id && (
                  <div className="absolute right-0 z-10 w-44 rounded-md border bg-white p-1 text-sm shadow">
                    <button className="block w-full rounded px-2 py-1 text-left hover:bg-gray-50" onClick={() => onOpenWizard(a.id)}>Open Wizard</button>
                    <button className="block w-full rounded px-2 py-1 text-left hover:bg-gray-50" onClick={() => onScoring(a.id)}>Scoring</button>
                    <button className="block w-full rounded px-2 py-1 text-left hover:bg-gray-50" onClick={() => onReport(a.id)}>Report</button>
                    <button className="block w-full rounded px-2 py-1 text-left hover:bg-gray-50" onClick={() => onEdit(a.id)}>Edit</button>
                    <button className="block w-full rounded px-2 py-1 text-left text-red-600 hover:bg-red-50" onClick={() => onArchive(a.id)}>Archive</button>
                  </div>
                )}
              </td>
            </tr>
          );})}
        </tbody>
      </table>
    </div>
  );
}

function Band({ score }) { const label = bandFor(score); const cx = label === "Prime" ? "bg-emerald-100 text-emerald-800" : label === "Strong" ? "bg-blue-100 text-blue-800" : label === "Competent" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-800"; return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${cx}`}>{label}</span>; }

function Wizard({ audit, setAudit, scores, onBack }) {
  const [activeByFn, setActiveByFn] = useState({ OPS: "FUNCTIONALITY", CX: "FUNCTIONALITY", SALES_MARKETING: "FUNCTIONALITY", FINANCE_ADMIN: "FUNCTIONALITY", INTERNAL_INTEL: "FUNCTIONALITY" });
  const [uploadError, setUploadError] = useState("");
  function setNda(v) { setAudit({ ...audit, nda: v, updatedAt: new Date() }); }

  async function handleAddFiles(fnName, fileList) {
    const files = Array.from(fileList || []); const max = ATT_MAX_MB * 1024 * 1024; const accepted = files.filter((f) => f.size <= max);
    if (accepted.length !== files.length) setUploadError(`Some files exceeded ${ATT_MAX_MB} MB and were skipped.`);

    const uploaded = []
    for (const f of accepted) {
      const path = `${audit.id}/${fnName}/${Date.now()}-${Math.random().toString(36).slice(2)}-${f.name}`
      const { data, error } = await supabase.storage.from('evidence').upload(path, f, { upsert: false })
      if (!error && data?.path) {
        uploaded.push({ name: f.name, size: f.size, type: f.type, addedAt: new Date().toISOString(), id: `ATT-${fnName.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, storagePath: data.path })
      }
    }

    const next = { ...audit }; next.attachments = next.attachments || { OPS: [], CX: [], FINANCE_ADMIN: [], SALES_MARKETING: [], INTERNAL_INTEL: [] }; next.attachments[fnName] = [ ...(next.attachments[fnName] || []), ...uploaded ]; next.updatedAt = new Date(); setAudit(next);
  }
  async function handleRemoveAttachment(fnName, idx) { const next = { ...audit }; const arr = (next.attachments && next.attachments[fnName]) ? [...next.attachments[fnName]] : []; const [removed] = arr.splice(idx, 1); next.attachments[fnName] = arr; next.updatedAt = new Date(); setAudit(next); if (removed?.storagePath) { try { await supabase.storage.from('evidence').remove([removed.storagePath]) } catch {} } }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-base font-semibold">Audit Wizard — {audit.client}</div>
          <div className="text-sm text-gray-600">{audit.title}</div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">NDA status</span>
          <select className="rounded-md border px-2 py-1 text-sm" value={audit.nda} onChange={(e) => setNda(e.target.value)}>
            <option value="SIGNED">SIGNED</option>
            <option value="SENT">SENT</option>
            <option value="NOT_SENT">NOT_SENT</option>
          </select>
          <Band score={scores.overall} />
          <button className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50" onClick={onBack}>Done</button>
        </div>
      </div>

      {audit.functions.filter((fn) => audit.scope[fn.name]).map((fn) => (
        <div key={fn.name} className="space-y-3 rounded-xl border p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">{fn.name.replace("_", " / ")}</div>
            <div className="text-xs text-gray-600">Function score: <b>{((scores.perFunction[fn.name] ?? 0)).toFixed(1)}</b></div>
          </div>

          <div className="mb-2 flex gap-2">
            {["FUNCTIONALITY", "FRICTION", "DATA_FITNESS", "CHANGE_READINESS"].map((c) => (
              <button key={c} className={`rounded-md border px-2 py-1 text-xs ${activeByFn[fn.name] === c ? "border-blue-200 bg-blue-50 text-blue-800" : "hover:bg-gray-50"}`} onClick={() => setActiveByFn({ ...activeByFn, [fn.name]: c })}>
                {c.replace("_", " ")}
              </button>
            ))}
          </div>

          {/* Evidence uploads (NDA-gated) */}
          <div className="rounded-md border p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-600">Evidence uploads (optional)</div>
              <input type="file" multiple disabled={audit.nda !== "SIGNED"} onChange={(e) => { handleAddFiles(fn.name, e.target.files); e.target.value = ""; }} />
            </div>
            {!!((audit.attachments?.[fn.name] || []).length) && (
              <ul className="mt-2 space-y-1 text-xs">
                {(audit.attachments?.[fn.name] || []).map((att, idx) => (
                  <li key={att.id} className="flex items-center justify-between">
                    <span className="truncate">{att.name} <span className="text-gray-500">({formatBytes(att.size)})</span></span>
                    <div className="flex items-center gap-2">
                      {att.storagePath && <SignedUrl path={att.storagePath} filename={att.name} />}
                      <button className="rounded px-2 py-0.5 text-red-600 hover:bg-red-50" onClick={() => handleRemoveAttachment(fn.name, idx)}>Remove</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {uploadError && <div className="mt-2 text-xs text-amber-700">{uploadError}</div>}
          </div>

          <ComponentPanel disabled={audit.nda !== "SIGNED"} fn={fn} comp={activeByFn[fn.name]} onChange={(subKey, field, value) => setAudit(updateSubInline(audit, fn.name, activeByFn[fn.name], subKey, field, value))} />
        </div>
      ))}
    </div>
  );
}

function SignedUrl({ path, filename }) {
  const [url, setUrl] = useState(null)
  useEffect(() => { let alive = true; (async()=>{ const { data } = await supabase.storage.from('evidence').createSignedUrl(path, 3600); if (alive) setUrl(data?.signedUrl || null) })(); return () => { alive = false } }, [path])
  if (!path) return null
  return url ? <a href={url} target="_blank" rel="noreferrer" className="text-xs text-blue-700 underline">Download</a> : <span className="text-xs text-gray-400">Link…</span>
}

function updateSubInline(audit, fnName, compName, key, field, value) {
  const next = { ...audit }; const fn = next.functions.find((f) => f.name === fnName); const comp = fn.components.find((c) => c.name === compName);
  const idx = comp.sub.findIndex((s) => s.key === key); const base = { key, score: 0, note: "" }; const current = idx >= 0 ? comp.sub[idx] : base;
  const merged = { ...current, [field]: field === "score" ? Number(value) : String(value) }; if (idx >= 0) comp.sub[idx] = merged; else comp.sub.push(merged);
  next.updatedAt = new Date(); return next;
}

function ComponentPanel({ fn, comp, onChange, disabled }) {
  const component = fn.components.find((c) => c.name === comp); const list = SUBS_BY_FN[fn.name][comp];
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {list.map((s) => { const existing = component.sub.find((x) => x.key === s.key); const score = existing?.score ?? 0; const note = existing?.note ?? ""; const anch = getAnchors(s);
        return (
          <div key={s.key} className="grid grid-cols-1 gap-2 rounded-lg border p-3 md:grid-cols-[1fr_220px]">
            <div>
              <div className="text-sm font-semibold">{s.label}</div>
              <div className="text-xs text-gray-600">{s.description}</div>
              <textarea className="mt-2 min-h-[82px] w-full rounded-md border p-2 text-sm" placeholder="Notes…" disabled={disabled} defaultValue={note} onBlur={(e) => onChange(s.key, "note", e.target.value)} />
              {disabled && <div className="pt-1 text-xs text-red-600">NDA not signed — edits disabled.</div>}
            </div>
            <div>
              <input className="w-full" type="range" min={0} max={5} step={1} value={score ?? 0} disabled={disabled} onChange={(e) => onChange(s.key, "score", Number(e.target.value))} />
              <div className="mt-1 flex justify-between text-[11px] text-gray-500">{[0, 1, 2, 3, 4, 5].map((n) => <span key={n}>{n}</span>)}</div>
              <div className="relative mt-1 h-5 text-[11px] text-gray-600">
                <span className="absolute left-0 max-w-[45%] truncate">0 {anch.left}</span>
                <span className="absolute right-0 max-w-[45%] truncate text-right">5 {anch.right}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Scoring({ audit }) {
  const scores = computeScores(audit); const compMeans = scores.perComponent;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-base font-semibold">Scoring Summary</div>
        <div className="flex items-center gap-3">
          <span className="text-sm">Overall: {scores.overall.toFixed(1)}</span>
          <Band score={scores.overall} />
          <button className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50" onClick={() => downloadCSVFull(audit)}>Download CSV (full)</button>
          <button className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50" onClick={() => downloadJSONL(audit)}>Download JSONL (full)</button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border p-3"><div className="mb-1 text-sm font-medium">Components (Radar)</div><Radar labels={["FUNCTIONALITY", "FRICTION", "DATA_FITNESS", "CHANGE_READINESS"]} values={compMeans} /></div>
        <div className="rounded-xl border p-3"><div className="mb-1 text-sm font-medium">Functions (Bar)</div><Bars labels={Object.keys(scores.perFunction)} values={Object.values(scores.perFunction)} /></div>
      </div>
    </div>
  );
}

function Report({ audit }) {
  const [compiled, setCompiled] = useState(null); const [loading, setLoading] = useState(false);
  const canCompile = audit.nda === "SIGNED";
  function onCompile() { if (!canCompile || loading) return; setLoading(true); setTimeout(() => { setCompiled(compileReportLocal(audit)); setLoading(false); }, 160); }
  function downloadJson() { if (!compiled) return; const blob = new Blob([JSON.stringify(compiled, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'coreiq_report.json'; a.click(); URL.revokeObjectURL(url); }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-base font-semibold">CoreIQ Report — {audit.client}</div>
          <div className="text-sm text-gray-600">{audit.title}</div>
        </div>
        <div className="flex items-center gap-2">
          <button className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50" disabled={!canCompile || loading} onClick={onCompile}>{loading ? 'Compiling…' : compiled ? 'Recompile' : 'Compile report'}</button>
          <button className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50" disabled={!compiled} onClick={downloadJson}>Export JSON</button>
        </div>
      </div>

      {!compiled && (
        <div className="rounded-xl border p-4 text-sm text-gray-700">
          <p className="mb-2">This will compile a multi-section report locally (no external API) using your notes, scores, and evidence metadata.</p>
          {audit.nda !== 'SIGNED' && <div className="mt-3 text-xs text-red-600">NDA must be SIGNED to compile.</div>}
          <ol className="mt-2 list-decimal pl-5"><li>Executive Summary</li><li>Function pages</li><li>Roadmap</li><li>Risks</li><li>Next Steps</li></ol>
        </div>
      )}

      {compiled && (
        <div className="space-y-4">
          {/* Cover */}
          <div className="rounded-xl border p-6">
            <div className="text-2xl font-bold">CoreIQ Report</div>
            <div className="mt-1 text-sm text-gray-600">Client: {compiled.meta.client}</div>
            <div className="text-sm text-gray-600">Generated: {new Date(compiled.meta.generated_at).toLocaleString()}</div>
            <div className="mt-3"><Band score={compiled.meta.overall_score} /></div>
          </div>

          {/* Executive Summary */}
          <div className="rounded-xl border p-4">
            <div className="mb-1 text-sm font-medium">Executive Summary</div>
            <div className="mb-2 font-semibold">{compiled.executive_summary.headline}</div>
            <ul className="list-disc pl-5 text-sm">{compiled.executive_summary.bullets.map((b, i) => (<li key={i}>{b}</li>))}</ul>
            {!!compiled.executive_summary.citations.length && <div className="mt-2 text-xs text-gray-500">Citations: {compiled.executive_summary.citations.join(', ')}</div>}
          </div>

          {/* Function pages */}
          {compiled.functions.map((sec) => (
            <div key={sec.fn} className="rounded-xl border p-4">
              <div className="mb-1 flex items-center justify-between"><div className="text-sm font-medium">{sec.fn.replace('_',' / ')}</div><div className="text-xs">Score: {sec.score.toFixed(1)}</div></div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs font-medium">Situation</div>
                  <div className="text-sm">{sec.situation}</div>
                  <div className="mt-2 text-xs font-medium">Complication</div>
                  <div className="text-sm">{sec.complication}</div>
                  {!!sec.findings.length && (
                    <div className="mt-3">
                      <div className="text-xs font-medium mb-1">Findings</div>
                      <ul className="list-disc pl-5 text-sm">{sec.findings.map((f,i)=>(<li key={i}>{f.statement} {f.evidence?.length ? <span className="text-gray-500 text-xs">[{f.evidence.join(', ')}]</span> : null}</li>))}</ul>
                    </div>
                  )}
                </div>
                <div>
                  {!!sec.recommendations.length && (
                    <div>
                      <div className="text-xs font-medium mb-1">Recommendations</div>
                      <ul className="text-sm space-y-1">{sec.recommendations.map((r,i)=>(
                        <li key={i}><div className="font-medium">{r.title}</div><div className="text-gray-600 text-xs">{r.rationale}</div><div className="mt-1 flex flex-wrap gap-1">{r.vendors.map(v=>(<span key={v.id} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{v.name}</span>))}</div></li>
                      ))}</ul>
                    </div>
                  )}
                  {!!sec.attachments.length && (
                    <div className="mt-3">
                      <div className="text-xs font-medium mb-1">Evidence</div>
                      <ul className="list-disc pl-5 text-sm">{sec.attachments.map((a)=>(<li key={a.id}>{a.name} <span className="text-gray-500">({formatBytes(a.size)})</span> <span className="text-gray-400 text-xs">[{a.id}]</span> {a.storagePath && <SignedUrl path={a.storagePath} filename={a.name} />}</li>))}</ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Roadmap */}
          <div className="rounded-xl border p-4">
            <div className="mb-1 text-sm font-medium">30 / 60 / 90-Day Roadmap</div>
            <div className="grid gap-3 md:grid-cols-3 text-sm">
              <div><div className="text-xs font-medium">30 days</div><ul className="mt-1 list-disc pl-5">{compiled.roadmap.days_30.map((x,i)=>(<li key={i}>{x}</li>))}</ul></div>
              <div><div className="text-xs font-medium">60 days</div><ul className="mt-1 list-disc pl-5">{compiled.roadmap.days_60.map((x,i)=>(<li key={i}>{x}</li>))}</ul></div>
              <div><div className="text-xs font-medium">90 days</div><ul className="mt-1 list-disc pl-5">{compiled.roadmap.days_90.map((x,i)=>(<li key={i}>{x}</li>))}</ul></div>
            </div>
          </div>

          {/* Risks & Next Steps */}
          <div className="rounded-xl border p-4">
            <div className="mb-1 text-sm font-medium">Risks</div>
            <ul className="list-disc pl-5 text-sm">{compiled.risks.map((r,i)=>(<li key={i}>{r}</li>))}</ul>
            <div className="mt-3 text-sm font-medium">Next Steps</div>
            <ul className="list-disc pl-5 text-sm">{compiled.next_steps.map((n,i)=>(<li key={i}>{n}</li>))}</ul>
          </div>
        </div>
      )}
    </div>
  );
}

// ========================= Export helpers (CSV & JSONL) =========================
function buildFullCatalogueRows(audit) {
  const header = ["Function", "Component", "SubKey", "Label", "Score", "Note", "AnchorLeft", "AnchorRight"]; const rows = [header];
  for (const fnName of Object.keys(SUBS_BY_FN)) {
    if (!audit.scope[fnName]) continue; const cat = SUBS_BY_FN[fnName]; const fnInst = audit.functions.find((f) => f.name === fnName);
    for (const compName of Object.keys(cat)) {
      const compInst = fnInst?.components.find((c) => c.name === compName);
      for (const q of cat[compName]) {
        const existing = compInst?.sub.find((s) => s.key === q.key); const score = typeof existing?.score === "number" ? existing.score : ""; const note = existing?.note ?? ""; const anch = getAnchors(q);
        rows.push([fnName, compName, q.key, q.label, score === "" ? "" : String(score), String(note), anch.left, anch.right]);
      }
    }
  }
  return rows;
}
function toCsv(rows) { return rows.map((r) => r.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",")).join("\n"); }
function downloadCSVFull(audit) { const csv = toCsv(buildFullCatalogueRows(audit)); const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "coreiq_full_export.csv"; a.click(); URL.revokeObjectURL(url); }
function buildJSONLRecords(audit) {
  const recs = [];
  for (const fnName of Object.keys(SUBS_BY_FN)) {
    if (!audit.scope[fnName]) continue; const cat = SUBS_BY_FN[fnName]; const fnInst = audit.functions.find((f) => f.name === fnName);
    for (const compName of Object.keys(cat)) {
      const compInst = fnInst?.components.find((c) => c.name === compName);
      for (const q of cat[compName]) {
        const existing = compInst?.sub.find((s) => s.key === q.key); const score = typeof existing?.score === "number" ? existing.score : null; const note = existing?.note ?? ""; const anch = getAnchors(q);
        recs.push({ schema: "coreiq.v1", audit_id: audit.id, client: audit.client, function: fnName, component: compName, subkey: q.key, label: q.label, score, note, anchor_left: anch.left, anchor_right: anch.right, score_pct: score == null ? null : score * 20, unanswered: score == null, component_weight: WEIGHTS[compName] ?? null, generated_at: new Date().toISOString() });
      }
    }
  }
  return recs;
}
function downloadJSONL(audit) { const jsonl = buildJSONLRecords(audit).map((r) => JSON.stringify(r)).join("\n"); const blob = new Blob([jsonl], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "coreiq_full_export.jsonl"; a.click(); URL.revokeObjectURL(url); }

// ========================= Charts (single declarations) =========================
function Bars({ labels, values }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return; const ctx = el.getContext("2d"); const w = (el.width = el.clientWidth), h = (el.height = 260);
    ctx.clearRect(0, 0, w, h); const max = Math.max(100, ...values); const barW = w / (values.length * 2); const pad = barW / 2; ctx.font = "12px system-ui"; ctx.textAlign = "center";
    for (let i = 0; i < values.length; i++) { const x = pad + i * (barW * 2) + barW / 2; const val = values[i]; const bh = (val / max) * (h - 40);
      ctx.fillStyle = "#dbeafe"; ctx.fillRect(x - barW / 2, h - 20 - bh, barW, bh); ctx.fillStyle = "#1e40af"; ctx.fillText(val.toFixed(1), x, h - 24 - bh); ctx.fillStyle = "#555"; ctx.fillText(String(labels[i]), x, h - 6); }
    ctx.strokeStyle = "#eee"; ctx.beginPath(); ctx.moveTo(10, h - 20); ctx.lineTo(w - 10, h - 20); ctx.stroke();
  }, [labels.join("|"), values.join(",")]);
  return <canvas ref={ref} className="w-full" />;
}

function Radar({ labels, values }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return; const ctx = el.getContext("2d"); const w = (el.width = el.clientWidth), h = (el.height = 260);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 24, N = labels.length; ctx.strokeStyle = "#eee";
    for (let g = 1; g <= 4; g++) { ctx.beginPath(); for (let i = 0; i < N; i++) { const ang = (Math.PI * 2 * i) / N - Math.PI / 2; const x = cx + ((r * g) / 4) * Math.cos(ang); const y = cy + ((r * g) / 4) * Math.sin(ang); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.closePath(); ctx.stroke(); }
    ctx.fillStyle = "#555"; ctx.font = "12px system-ui"; ctx.textAlign = "center"; labels.forEach((lab, i) => { const ang = (Math.PI * 2 * i) / N - Math.PI / 2; const x = cx + (r + 12) * Math.cos(ang); const y = cy + (r + 12) * Math.sin(ang); ctx.fillText(lab.replace("_", " "), x, y); });
    ctx.beginPath(); for (let i = 0; i < N; i++) { const val = (values[i] || 0) / 100; const ang = (Math.PI * 2 * i) / N - Math.PI / 2; const x = cx + r * val * Math.cos(ang); const y = cy + r * val * Math.sin(ang); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.closePath(); ctx.fillStyle = "rgba(37,99,235,0.20)"; ctx.strokeStyle = "rgba(37,99,235,0.70)"; ctx.fill(); ctx.stroke();
  }, [labels.join("|"), values.join(",")]);
  return <canvas ref={ref} className="w-full" />;
}

function seedAudit() {
  const mkComps = () => [ { name: "FUNCTIONALITY", sub: [] }, { name: "FRICTION", sub: [] }, { name: "DATA_FITNESS", sub: [] }, { name: "CHANGE_READINESS", sub: [] } ];
  const scope = { OPS: true, CX: true, FINANCE_ADMIN: true, SALES_MARKETING: true, INTERNAL_INTEL: true };
  return { id: "A" + Date.now(), client: "Durban Logistics", title: "CoreIQ PoC — Ops Baseline", status: "IN_PROGRESS", nda: "SIGNED", industry: "Logistics", contactName: "Primary Contact", contactEmail: "contact@example.com", ndaFileName: "NDA.pdf", scope,
    attachments: { OPS: [], CX: [], FINANCE_ADMIN: [], SALES_MARKETING: [], INTERNAL_INTEL: [] },
    functions: [ { name: "OPS", components: mkComps() }, { name: "CX", components: mkComps() }, { name: "FINANCE_ADMIN", components: mkComps() }, { name: "SALES_MARKETING", components: mkComps() }, { name: "INTERNAL_INTEL", components: mkComps() } ],
    updatedAt: new Date().toISOString(), };
}

function CreateAuditModal({ existing, onClose, onCreate, onSaveEdit }) {
  const EMPTY_SCOPE = { OPS: true, CX: false, FINANCE_ADMIN: false, SALES_MARKETING: false, INTERNAL_INTEL: false };
  const draftFromLS = (() => { try { return JSON.parse(localStorage.getItem("coreiq_create_draft") || "null"); } catch { return null; } })();
  const seed = existing ? { client: existing.client || "", industry: existing.industry || "", contactName: existing.contactName || "", contactEmail: existing.contactEmail || "", nda: existing.nda === "SIGNED" ? "SIGNED" : "NOT_SENT", file: null, scope: { ...existing.scope } } : (draftFromLS || { client: "", industry: "", contactName: "", contactEmail: "", nda: "NOT_SENT", file: null, scope: { ...EMPTY_SCOPE } });
  const [form, setForm] = useState(seed); const [error, setError] = useState("");
  useEffect(() => { if (!existing) { const toSave = { ...form, file: null }; try { localStorage.setItem("coreiq_create_draft", JSON.stringify(toSave)); } catch {} } }, [form.client, form.industry, form.contactName, form.contactEmail, form.nda, form.scope, existing]);
  function validate(requireFileForSigned) { if (!form.client.trim()) return "Client name is required."; if (!Object.values(form.scope).some(Boolean)) return "Select at least one function."; if (form.nda === "SIGNED" && requireFileForSigned) { if (!form.file && !existing?.ndaFileName) return "Upload signed NDA (PDF/DOCX, ≤10 MB)."; } return ""; }
  function buildAudit() {
    const mkComps = () => [ { name: "FUNCTIONALITY", sub: [] }, { name: "FRICTION", sub: [] }, { name: "DATA_FITNESS", sub: [] }, { name: "CHANGE_READINESS", sub: [] } ];
    const id = "A" + Date.now(); const fns = [ { name: "OPS", components: mkComps() }, { name: "CX", components: mkComps() }, { name: "FINANCE_ADMIN", components: mkComps() }, { name: "SALES_MARKETING", components: mkComps() }, { name: "INTERNAL_INTEL", components: mkComps() } ];
    const title = `CoreIQ Audit — ${form.client}`;
    return { id, client: form.client, title, status: "DRAFT", nda: form.nda, industry: form.industry || undefined, contactName: form.contactName || undefined, contactEmail: form.contactEmail || undefined, ndaFileName: form.file?.name || existing?.ndaFileName, scope: { ...form.scope }, attachments: { OPS: [], CX: [], FINANCE_ADMIN: [], SALES_MARKETING: [], INTERNAL_INTEL: [] }, functions: fns, updatedAt: new Date().toISOString() };
  }
  function onCreateContinue() { const err = validate(true); if (err) return setError(err); const a = buildAudit(); try { localStorage.removeItem("coreiq_create_draft"); } catch {} onCreate(a, true); }
  function onSaveDraft() { const err = validate(false); if (err) return setError(err); if (existing) { const updated = { ...existing, client: form.client, industry: form.industry || undefined, contactName: form.contactName || undefined, contactEmail: form.contactEmail || undefined, nda: form.nda, ndaFileName: form.file?.name || existing.ndaFileName, scope: { ...form.scope }, updatedAt: new Date().toISOString() }; onSaveEdit(updated); } else { const a = buildAudit(); onCreate(a, false); } }
  function onCancel() { try { if (!existing) localStorage.removeItem("coreiq_create_draft"); } catch {} onClose(); }
  function toggleScope(k) { setForm((f) => ({ ...f, scope: { ...f.scope, [k]: !f.scope[k] } })); }
  function onFileChange(file) { if (!file) return setForm((f) => ({ ...f, file: null })); const okType = /\.(pdf|docx?|PDF)$/.test(file.name); const okSize = file.size <= 10 * 1024 * 1024; if (!okType) return setError("File must be PDF or DOCX."); if (!okSize) return setError("File must be ≤10 MB."); setError(""); setForm((f) => ({ ...f, file })); }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white p-4 shadow-lg">
        <div className="mb-3 flex items-center justify-between"><div className="text-base font-semibold">{existing ? "Edit CoreIQ Audit" : "Create CoreIQ Audit"}</div><button className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100" onClick={onClose}>✕</button></div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm"><span>Client name <span className="text-red-600">*</span></span><input className="rounded-md border px-2 py-1" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} /></label>
          <label className="grid gap-1 text-sm"><span>Industry</span><input className="rounded-md border px-2 py-1" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} /></label>
          <label className="grid gap-1 text-sm"><span>Primary contact (name)</span><input className="rounded-md border px-2 py-1" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></label>
          <label className="grid gap-1 text-sm"><span>Primary contact (email)</span><input className="rounded-md border px-2 py-1" type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} /></label>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <fieldset className="rounded-md border p-3"><legend className="px-1 text-xs text-gray-600">NDA status</legend>
            <label className="mr-4 text-sm"><input type="radio" name="nda" checked={form.nda === "NOT_SENT"} onChange={() => setForm({ ...form, nda: "NOT_SENT" })} /> Unsigned</label>
            <label className="text-sm"><input type="radio" name="nda" checked={form.nda === "SIGNED"} onChange={() => setForm({ ...form, nda: "SIGNED" })} /> Signed</label>
            {form.nda === "SIGNED" && (<div className="mt-2 grid gap-1 text-sm"><label>Upload signed NDA (PDF/DOCX, ≤10 MB)</label><input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => onFileChange(e.target.files?.[0] || null)} />{(form.file || existing?.ndaFileName) && <div className="text-xs text-gray-600">{form.file?.name || existing?.ndaFileName}</div>}</div>)}
          </fieldset>
          <fieldset className="rounded-md border p-3"><legend className="px-1 text-xs text-gray-600">Include in this audit</legend>
            {["OPS", "CX", "FINANCE_ADMIN", "SALES_MARKETING", "INTERNAL_INTEL"].map((fn) => (<label key={fn} className="mr-4 inline-flex items-center gap-1 text-sm"><input type="checkbox" checked={form.scope[fn]} onChange={() => toggleScope(fn)} /> {fn.replace("_", " / ")}</label>))}
          </fieldset>
        </div>
        {error && <div className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button className="rounded-md px-3 py-1.5 text-sm hover:bg-gray-100" onClick={onCancel}>Cancel</button>
          <button className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50" onClick={onSaveDraft}>{existing ? "Save" : "Save as Draft"}</button>
          {!existing && <button className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800" onClick={onCreateContinue}>Create & Continue</button>}
        </div>
      </div>
    </div>
  );
}

// ========================= Self-tests =========================
let __tests_ran = false; function runSelfTests() {
  if (__tests_ran) return; __tests_ran = true;
  const log = (name, ok) => console.log(`TEST ${ok ? "✓" : "✗"} ${name}`);
  const near = (a, b, d = 1e-6) => Math.abs(a - b) <= d;

  // Existing tests (unchanged)
  log("normalise maps 0..5 to 0..100", near((normalise(0) || 0) + (normalise(5) || 0), 100));
  const c1 = componentScore([{ key: "k", score: 0 }, { key: "k2", score: 5 }]);
  log("componentScore averages correctly", near(c1, 50));
  const sumW = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  log("weights sum to 1", near(sumW, 1));
  const mkComps = () => [{ name: "FUNCTIONALITY", sub: [{ key: "x", score: 5 }] }, { name: "FRICTION", sub: [{ key: "x", score: 5 }] }, { name: "DATA_FITNESS", sub: [{ key: "x", score: 5 }] }, { name: "CHANGE_READINESS", sub: [{ key: "x", score: 5 }] }];
  const a = { id: "T", client: "Test", title: "T", status: "DRAFT", nda: "SIGNED", scope: { OPS: true, CX: false, FINANCE_ADMIN: false, SALES_MARKETING: false, INTERNAL_INTEL: false }, attachments: { OPS: [], CX: [], FINANCE_ADMIN: [], SALES_MARKETING: [], INTERNAL_INTEL: [] }, functions: [ { name: "OPS", components: mkComps() }, { name: "CX", components: mkComps() }, { name: "FINANCE_ADMIN", components: mkComps() }, { name: "SALES_MARKETING", components: mkComps() }, { name: "INTERNAL_INTEL", components: mkComps() } ], updatedAt: new Date().toISOString() };
  const sc = computeScores(a);
  log("computeScores respects scope (only OPS active)", Object.keys(sc.perFunction).length === 1 && sc.overall > 0);

  // Additional tests
  log("bandFor thresholds", bandFor(85) === "Prime" && bandFor(70) === "Strong" && bandFor(50) === "Competent" && bandFor(49.9) === "Baseline");

  const notesAudit = JSON.parse(JSON.stringify(a));
  notesAudit.functions[0].components[1].sub.push({ key: "duplication", score: 1, note: "Duplicate rekey and manual entry in ops" });
  const notesByFn = collectNotesByFn(notesAudit);
  log("collectNotesByFn extracts notes", Array.isArray(notesByFn.OPS) && notesByFn.OPS.length >= 1);

  const rulesOut = runRules(notesAudit);
  log("runRules suggests iPaaS when duplication present", (rulesOut.OPS || []).some(r => r.title.includes("duplicate data entry")));

  const anchorsTest = getAnchors({ key: "sops", anchor: { a0: "none", a5: "versioned" } });
  const anchorsFallback = getAnchors({ key: "unknown_key", anchor: { a0: "leftA0", a5: "rightA5" } });
  log("getAnchors override/fallback", anchorsTest.left === "None" && anchorsFallback.left === "leftA0");

  const compiled = compileReportLocal(notesAudit);
  log("compileReportLocal structure present", compiled && compiled.meta && compiled.functions && compiled.executive_summary);

  // Export tests
  const rowsFull = buildFullCatalogueRows(a);
  const opsCount = Object.values(SUBS_BY_FN.OPS).reduce((n, arr) => n + arr.length, 0);
  log("export CSV full header", Array.isArray(rowsFull[0]) && rowsFull[0].join(",") === "Function,Component,SubKey,Label,Score,Note,AnchorLeft,AnchorRight");
  log("export CSV includes full catalogue for active functions", rowsFull.length === 1 + opsCount);
  const jsonlRecs = buildJSONLRecords(a);
  log("export JSONL records count", jsonlRecs.length === opsCount);

  // New: CSV quoting & JSONL newline checks
  const csvProbe = toCsv([["Fn", "Label with, comma"]]);
  log("toCsv RFC4180 quoting", csvProbe == "\"Fn\",\"Label with, comma\"");
  const jsonlProbe = buildJSONLRecords(a).map(r => JSON.stringify(r)).join("\n");
  log("JSONL newline join count", jsonlProbe.split("\n").length === opsCount);
}
