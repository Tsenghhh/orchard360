"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Plus, Trash2, Edit3, Settings, History, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

// Map DB -> UI types
const mapBlock = (b: any) => ({
  id: b.id,
  orchardId: b.orchard_id,
  name: b.name,
  variety: b.variety ?? "",
  structureType: b.structure_type ?? "",
  rowCount: b.row_count ?? 0,
  hectares: Number(b.hectares ?? 0),
  latitude: b.latitude ?? undefined,
  longitude: b.longitude ?? undefined,
  health: b.health ?? undefined,
});

const mapEvent = (e: any) => ({
  id: e.id,
  sectorId: e.sector_id,
  orchardId: e.orchard_id,
  blockId: e.block_id,
  quantity: e.quantity ?? 0,
  status: e.status as TreeStatus,
  tce: e.tce === null ? undefined : Number(e.tce),
  rootstock: e.rootstock ?? undefined,
  age: e.age ?? undefined,
  notes: e.notes ?? undefined,
  lastUpdated: e.last_updated ?? new Date().toISOString(),
});

/** ---------- Types ---------- */
type TreeStatus = "New Planting" | "Replanting" | "Kneecapped" | "Grafted" | "Removed";

type Sector = { id: string; name: string };
type Orchard = { id: string; sectorId: string; name: string };
type Block = {
  id: string;
  orchardId: string;
  name: string;
  variety: string;
  structureType: string;
  rowCount: number;
  hectares: number;
  latitude?: number;
  longitude?: number;
  health?: number;
};

type TreeRecord = {
  id: string;
  sectorId: string;
  orchardId: string;
  blockId: string;
  quantity: number;
  status: TreeStatus;
  tce?: number;
  rootstock?: string;
  age?: number;
  notes?: string;
  lastUpdated: string;
};

type AuditEntry = {
  id: string;
  at: string;
  who: string;
  entity: "sector"|"orchard"|"block"|"tree";
  entityId: string;
  message: string;
};

/** ---------- Storage Keys ---------- */
const LS_MASTER = "orchard360_v4_master";
const LS_TREES  = "orchard360_v4_trees";
const LS_AUDIT  = "orchard360_v4_audit";

/** ---------- Status filter typing ---------- */
const STATUS_FILTER_OPTIONS = ["all","New Planting","Replanting","Kneecapped","Grafted","Removed"] as const;
type StatusFilter = (typeof STATUS_FILTER_OPTIONS)[number];

/** ---------- Utils ---------- */
const uuid = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));
const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v));

/** ---------- Seed ---------- */
function seedMaster() {
  const sectors: Sector[] = [
    { id: uuid(), name: "Sector North" },
    { id: uuid(), name: "Sector South" },
  ];
  const orchards: Orchard[] = [
    { id: uuid(), sectorId: sectors[0].id, name: "Tutaekuri" },
    { id: uuid(), sectorId: sectors[0].id, name: "Puketapu" },
    { id: uuid(), sectorId: sectors[1].id, name: "Clive" },
  ];
  const blocks: Block[] = [
    { id: uuid(), orchardId: orchards[0].id, name: "B3", variety: "Jazz",       structureType: "Tall Spindle", rowCount: 20, hectares: 3.5, latitude: -39.5903, longitude: 176.8506, health: 88 },
    { id: uuid(), orchardId: orchards[2].id, name: "Q1", variety: "Envy",       structureType: "2D V",         rowCount: 18, hectares: 2.9, health: 76 },
    { id: uuid(), orchardId: orchards[1].id, name: "A2", variety: "Pink Lady",  structureType: "Tall Spindle", rowCount: 22, hectares: 4.2, health: 92 },
  ];
  const master = { sectors, orchards, blocks };
  localStorage.setItem(LS_MASTER, JSON.stringify(master));
  return master;
}
function loadMaster(): { sectors: Sector[]; orchards: Orchard[]; blocks: Block[] } {
  try {
    const s = localStorage.getItem(LS_MASTER);
    if (!s) return seedMaster();
    return JSON.parse(s);
  } catch {
    return seedMaster();
  }
}
function saveMaster(master: { sectors: Sector[]; orchards: Orchard[]; blocks: Block[] }) {
  localStorage.setItem(LS_MASTER, JSON.stringify(master));
}

function seedTrees(master: { sectors: Sector[]; orchards: Orchard[]; blocks: Block[] }): TreeRecord[] {
  const now = new Date().toISOString();
  const byNames = (sectorName: string, orchardName: string, blockName: string) => {
    const sector = master.sectors.find(s=>s.name===sectorName)!;
    const orchard = master.orchards.find(o=>o.name===orchardName && o.sectorId===sector.id)!;
    const block = master.blocks.find(b=>b.name===blockName && b.orchardId===orchard.id)!;
    return { sectorId: sector.id, orchardId: orchard.id, blockId: block.id };
  };
  const trees: TreeRecord[] = [
    { id: uuid(), ...byNames("Sector North","Tutaekuri","B3"), quantity: 1000, status:"New Planting", lastUpdated: now },
    { id: uuid(), ...byNames("Sector North","Tutaekuri","B3"), quantity:   18, status:"Kneecapped",   tce:0.45, notes:"Slight mite pressure", lastUpdated: now },
    { id: uuid(), ...byNames("Sector North","Tutaekuri","B3"), quantity:   19, status:"Grafted",      tce:0.48, lastUpdated: now },
    { id: uuid(), ...byNames("Sector South","Clive","Q1"),     quantity:    3, status:"Replanting",   tce:0.38, notes:"Trunk rub", lastUpdated: now },
    { id: uuid(), ...byNames("Sector South","Clive","Q1"),     quantity:    4, status:"Removed",      tce:0,    notes:"Removed winter 2024", lastUpdated: now },
    { id: uuid(), ...byNames("Sector North","Puketapu","A2"),  quantity:    1, status:"New Planting", tce:0.52, lastUpdated: now },
  ];
  localStorage.setItem(LS_TREES, JSON.stringify(trees));
  return trees;
}
function loadTrees(master: { sectors: Sector[]; orchards: Orchard[]; blocks: Block[] }): TreeRecord[] {
  try {
    const s = localStorage.getItem(LS_TREES);
    if (!s) return seedTrees(master);
    return JSON.parse(s);
  } catch {
    return seedTrees(master);
  }
}
function saveTrees(data: TreeRecord[]) {
  localStorage.setItem(LS_TREES, JSON.stringify(data));
}

function loadAudit(): AuditEntry[] {
  try {
    const s = localStorage.getItem(LS_AUDIT);
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}
function saveAudit(data: AuditEntry[]) {
  localStorage.setItem(LS_AUDIT, JSON.stringify(data));
}
function logAudit(setter: React.Dispatch<React.SetStateAction<AuditEntry[]>>, entry: Omit<AuditEntry,"id"|"at"|"who">) {
  const e: AuditEntry = { id: uuid(), at: new Date().toISOString(), who: "local", ...entry };
  setter(prev => {
    const nxt = [e, ...prev];
    saveAudit(nxt);
    return nxt;
  });
}

/** ---------- CSV ---------- */
function toCSV(records: TreeRecord[], master: { sectors: Sector[]; orchards: Orchard[]; blocks: Block[] }) {
  const getName = <T extends {id:string;name:string}>(arr: T[], id: string) => arr.find(x=>x.id===id)?.name ?? "";
  const getBlock = (id:string)=> master.blocks.find(b=>b.id===id);
  const header = ["id","sector","orchard","block","status","quantity","tce","notes","lastUpdated","variety","structureType","rowCount","hectares","latitude","longitude","blockHealth"];
  const rows = records.map(r => {
    const b = getBlock(r.blockId);
    return [
      r.id,
      getName(master.sectors, r.sectorId),
      getName(master.orchards, r.orchardId),
      getName(master.blocks, r.blockId),
      r.status,
      r.quantity,
      r.tce ?? "",
      (r.notes ?? "").replace(/\n/g," "),
      r.lastUpdated,
      b?.variety ?? "",
      b?.structureType ?? "",
      b?.rowCount ?? "",
      b?.hectares ?? "",
      b?.latitude ?? "",
      b?.longitude ?? "",
      b?.health ?? ""
    ];
  });
  return [header, ...rows].map(cols => cols.join(",")).join("\n");
}

/** ---------- UI ---------- */
export default function Page() {
  const [master, setMaster] = useState<{ sectors: Sector[]; orchards: Orchard[]; blocks: Block[] }>({ sectors: [], orchards: [], blocks: [] });
  const [records, setRecords] = useState<TreeRecord[]>([]);
  const [, setAudit] = useState<AuditEntry[]>([]); // we don't read audit yet
  const [query, setQuery] = useState("");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [orchardFilter, setOrchardFilter] = useState<string>("all");
  const [blockFilter, setBlockFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dense, setDense] = useState(false);
  const [editing, setEditing] = useState<TreeRecord | null>(null);
  const [showMasterMgr, setShowMasterMgr] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const hasSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
    // Fallback to local seed if no DB configured
    if (!hasSupabase) {
      const m = loadMaster();
      const t = loadTrees(m);
      const a = loadAudit();
      setMaster(m); setRecords(t); setAudit(a);
      return;
    }
  
    (async () => {
      // Load master data
      const [{ data: sectors }, { data: orchards }, { data: blocks }] = await Promise.all([
        supabase.from("sectors").select("*").order("name"),
        supabase.from("orchards").select("*").order("name"),
        supabase.from("blocks").select("*").order("name"),
      ]);
  
      setMaster({
        sectors: sectors ?? [],
        orchards: orchards ?? [],
        blocks: (blocks ?? []).map(mapBlock),
      });
  
      // Load events
      const { data: events } = await supabase
        .from("tree_events")
        .select("*")
        .order("last_updated", { ascending: false });
  
      setRecords((events ?? []).map(mapEvent));
      // Optional: let the user know this page is live from DB
      // toast.success("Loaded from Supabase");
    })();
  }, []);  
  useEffect(() => saveTrees(records), [records]);
  useEffect(() => saveMaster(master), [master]);

  const orchardsBySector = useMemo(() => {
    const map: Record<string, Orchard[]> = {};
    for (const o of master.orchards) (map[o.sectorId] ||= []).push(o);
    return map;
  }, [master.orchards]);
  const blocksByOrchard = useMemo(() => {
    const map: Record<string, Block[]> = {};
    for (const b of master.blocks) (map[b.orchardId] ||= []).push(b);
    return map;
  }, [master.blocks]);

  const filteredEvents = useMemo(() => records.filter(r => {
    if (sectorFilter!=="all" && r.sectorId!==sectorFilter) return false;
    if (orchardFilter!=="all" && r.orchardId!==orchardFilter) return false;
    if (blockFilter!=="all" && r.blockId!==blockFilter) return false;
    if (statusFilter!=="all" && r.status!==statusFilter) return false;
    const s = master.sectors.find(x=>x.id===r.sectorId)?.name ?? "";
    const o = master.orchards.find(x=>x.id===r.orchardId)?.name ?? "";
    const b = master.blocks.find(x=>x.id===r.blockId);
    const blob = `${s} ${o} ${b?.name ?? ""} ${b?.variety ?? ""} ${b?.structureType ?? ""} ${r.status} ${r.quantity} ${r.notes ?? ""}`.toLowerCase();
    const q = query.toLowerCase().trim();
    return q ? blob.includes(q) : true;
  }), [records, sectorFilter, orchardFilter, blockFilter, statusFilter, query, master]);

  const grouped = useMemo(() => {
    const g = new Map<string, { block: Block; sectorId: string; orchardId: string; events: TreeRecord[]; totalQty: number; lastUpdated: string }>();
    for (const ev of filteredEvents) {
      const block = master.blocks.find(b=>b.id===ev.blockId);
      if (!block) continue;
      const key = ev.blockId;
      if (!g.has(key)) g.set(key, { block, sectorId: ev.sectorId, orchardId: ev.orchardId, events: [], totalQty: 0, lastUpdated: ev.lastUpdated });
      const cur = g.get(key)!;
      cur.events.push(ev);
      cur.totalQty += Number(ev.quantity || 0);
      if (ev.lastUpdated > cur.lastUpdated) cur.lastUpdated = ev.lastUpdated;
    }
    for (const [,v] of g) v.events.sort((a,b)=>b.lastUpdated.localeCompare(a.lastUpdated));
    return Array.from(g.values()).sort((a,b)=>{
      const an = master.sectors.find(s=>s.id===a.sectorId)?.name ?? "";
      const bn = master.sectors.find(s=>s.id===b.sectorId)?.name ?? "";
      if (an!==bn) return an.localeCompare(bn);
      const ao = master.orchards.find(o=>o.id===a.orchardId)?.name ?? "";
      const bo = master.orchards.find(o=>o.id===b.orchardId)?.name ?? "";
      if (ao!==bo) return ao.localeCompare(bo);
      return a.block.name.localeCompare(b.block.name);
    });
  }, [filteredEvents, master]);

  const kpis = useMemo(() => {
    const totalTrees = filteredEvents.reduce((sum, ev)=> sum + (ev.quantity || 0), 0);
    const uniqueBlocks = grouped.length;
    const avgBlockHealth = (() => {
      const vals = grouped.map(g=>g.block.health).filter((x): x is number => typeof x === "number");
      return vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length) : 0;
    })();
    return { totalTrees, uniqueBlocks, avgBlockHealth };
  }, [filteredEvents, grouped]);

  function exportCSV() {
    const csv = toCSV(filteredEvents, master);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orchard360_export_${new Date().toISOString().slice(0,19)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      toast.error("Importer not wired to master yet. Use Export → modify → (coming soon).");
    };
    reader.readAsText(f);
  }

  function saveEdit(rec: TreeRecord) {
    if (!rec.sectorId) return toast.error("Select a sector");
    if (!rec.orchardId) return toast.error("Select an orchard");
    if (!rec.blockId) return toast.error("Select a block/lot");
    if (!rec.quantity || rec.quantity < 0) return toast.error("Quantity must be ≥ 0");
    const existing = records.find(x=>x.id===rec.id);
    rec.lastUpdated = new Date().toISOString();

    type DiffKey = keyof Pick<TreeRecord,"sectorId"|"orchardId"|"blockId"|"quantity"|"status"|"tce"|"notes"|"rootstock"|"age">;
    const fields: DiffKey[] = ["sectorId","orchardId","blockId","quantity","status","tce","notes","rootstock","age"];
    const getVal = <K extends DiffKey>(obj: TreeRecord | undefined, key: K): TreeRecord[K] | undefined =>
      obj ? obj[key] : undefined;

    const diffs: string[] = [];
    for (const k of fields) {
      const before = getVal(existing, k);
      const after: TreeRecord[typeof k] = rec[k];
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        diffs.push(`${String(k)}: ${before ?? "—"} → ${after ?? "—"}`);
      }
    }

    setRecords(prev => {
      const i = prev.findIndex(x=>x.id===rec.id);
      if (i===-1) return [rec, ...prev];
      const copy = [...prev]; copy[i]=rec; return copy;
    });

    if (diffs.length) {
      logAudit(setAudit, { entity: "tree", entityId: rec.id, message: diffs.join(" | ") });
    }
    setEditing(null);
    toast.success("Saved");
  }

  function removeRecord(id: string) {
    setRecords(prev => prev.filter(r => r.id !== id));
    logAudit(setAudit, { entity:"tree", entityId:id, message:"deleted" });
    toast("Entry deleted");
  }

  const getSectorName = (id:string)=> master.sectors.find(s=>s.id===id)?.name ?? "";
  const getOrchName   = (id:string)=> master.orchards.find(o=>o.id===id)?.name ?? "";
  const getBlock      = (id:string)=> master.blocks.find(b=>b.id===id);

  return (
    <div className="min-h-screen w-full bg-neutral-50 text-neutral-900">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 font-semibold"><span>🌳</span><span>Orchard360 – Lots & Trees Tracker</span></div>
          <div className="flex items-center gap-2">
            <button onClick={()=>setShowMasterMgr(true)} className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm hover:bg-neutral-100"><Settings className="h-4 w-4"/>Manage Master</button>
            <button onClick={exportCSV} className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm hover:bg-neutral-100"><Download className="h-4 w-4"/>Export</button>
            <input ref={fileRef} type="file" accept=".csv" onChange={onImport} className="text-sm" />
            <button onClick={()=>setEditing({
              id: uuid(),
              sectorId: master.sectors[0]?.id ?? "",
              orchardId: (()=>{ const s=master.sectors[0]?.id; return s ? (orchardsBySector[s]?.[0]?.id ?? "") : ""; })(),
              blockId: (()=>{ const o=master.sectors[0]?.id ? (orchardsBySector[master.sectors[0].id]?.[0]?.id) : ""; return o ? (blocksByOrchard[o]?.[0]?.id ?? "") : ""; })(),
              quantity: 0,
              status: "New Planting",
              lastUpdated: new Date().toISOString()
            })} className="inline-flex items-center gap-2 rounded bg-black px-3 py-2 text-sm text-white hover:opacity-90"><Plus className="h-4 w-4"/>Add Entry</button>
          </div>
        </div>
      </header>

      {/* Filters */}
      <section className="mx-auto max-w-6xl px-4 py-4">
        <div className="rounded-xl border bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-medium">Filters</div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={dense} onChange={e=>setDense(e.target.checked)} /> Dense table
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div className="col-span-2">
              <div className="text-xs text-neutral-600 mb-1">Search</div>
              <input className="w-full rounded border px-3 py-2 text-sm" placeholder="Search sector/orchard/block/variety, notes..." value={query} onChange={e=>setQuery(e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-neutral-600 mb-1">Sector</div>
              <select className="w-full rounded border px-3 py-2 text-sm" value={sectorFilter} onChange={e=>{ setSectorFilter(e.target.value); setOrchardFilter("all"); setBlockFilter("all"); }}>
                <option value="all">All</option>
                {master.sectors.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <div className="text-xs text-neutral-600 mb-1">Orchard</div>
              <select className="w-full rounded border px-3 py-2 text-sm" value={orchardFilter} onChange={e=>{ setOrchardFilter(e.target.value); setBlockFilter("all"); }}>
                <option value="all">All</option>
                {(sectorFilter==="all" ? master.orchards : (orchardsBySector[sectorFilter] ?? [])).map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div>
              <div className="text-xs text-neutral-600 mb-1">Block/Lot</div>
              <select className="w-full rounded border px-3 py-2 text-sm" value={blockFilter} onChange={e=>setBlockFilter(e.target.value)}>
                <option value="all">All</option>
                {(orchardFilter==="all" ? master.blocks : (blocksByOrchard[orchardFilter] ?? [])).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <div className="text-xs text-neutral-600 mb-1">Status</div>
              <select
                className="w-full rounded border px-3 py-2 text-sm"
                value={statusFilter}
                onChange={(e)=> setStatusFilter(e.target.value as StatusFilter)}
              >
                {STATUS_FILTER_OPTIONS.map(s => (<option key={s} value={s}>{s}</option>))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <section className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs text-neutral-600">Total Trees (sum of quantities)</div>
          <div className="text-2xl font-semibold">{kpis.totalTrees}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs text-neutral-600">Blocks / Lots</div>
          <div className="text-2xl font-semibold">{kpis.uniqueBlocks}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs text-neutral-600">Avg Block Health</div>
          <div className="text-2xl font-semibold">{kpis.avgBlockHealth}%</div>
        </div>
      </section>

      {/* Grouped Table */}
      <section className="mx-auto max-w-6xl px-4 py-4">
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className={`w-full ${dense ? "text-sm" : ""}`}>
            <thead className="bg-neutral-50 text-left">
              <tr>
                <th className="p-3"></th>
                <th className="p-3">Sector</th>
                <th className="p-3">Orchard</th>
                <th className="p-3">Block</th>
                <th className="p-3">Variety</th>
                <th className="p-3">Structure</th>
                <th className="p-3">Total Trees</th>
                <th className="p-3">Block Health</th>
                <th className="p-3">Block GPS</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(g=>{
                const exp = !!expanded[g.block.id];
                return (
                  <React.Fragment key={g.block.id}>
                    <tr className="border-t align-middle">
                      <td className="p-3 w-8">
                        <button className="rounded border px-1 py-1" onClick={()=>setExpanded(e=>({...e, [g.block.id]: !exp}))}>
                          {exp ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="p-3">{getSectorName(g.sectorId)}</td>
                      <td className="p-3">{getOrchName(g.orchardId)}</td>
                      <td className="p-3 font-medium">{g.block.name}</td>
                      <td className="p-3">{g.block.variety}</td>
                      <td className="p-3">{g.block.structureType}</td>
                      <td className="p-3">{g.totalQty}</td>
                      <td className="p-3">{typeof g.block.health==="number" ? `${g.block.health}%` : "—"}</td>
                      <td className="p-3 whitespace-nowrap text-xs">
                        {g.block.latitude && g.block.longitude ? (
                          <a className="underline" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${g.block.latitude},${g.block.longitude}`}>
                            {g.block.latitude.toFixed(5)}, {g.block.longitude.toFixed(5)}
                          </a>
                        ) : "—"}
                      </td>
                      <td className="p-3 text-right">
                        <div className="inline-flex gap-1">
                          <button className="rounded border px-2 py-1" onClick={()=>{
                            setEditing({
                              id: uuid(),
                              sectorId: g.sectorId,
                              orchardId: g.orchardId,
                              blockId: g.block.id,
                              quantity: 0,
                              status: "New Planting",
                              lastUpdated: new Date().toISOString()
                            });
                          }}><Plus className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                    {exp && (
                      <tr className="border-t bg-neutral-50">
                        <td></td>
                        <td colSpan={9} className="p-3">
                          <div className="mb-2 text-sm font-medium">Changes / Events</div>
                          <div className="overflow-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left">
                                  <th className="p-2">When</th>
                                  <th className="p-2">Status</th>
                                  <th className="p-2">Qty</th>
                                  <th className="p-2">TCE</th>
                                  <th className="p-2">Rootstock</th>
                                  <th className="p-2">Age</th>
                                  <th className="p-2">Notes</th>
                                  <th className="p-2 text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {g.events.map(ev=>(
                                  <tr key={ev.id} className="border-t">
                                    <td className="p-2 whitespace-nowrap">{new Date(ev.lastUpdated).toLocaleString()}</td>
                                    <td className="p-2">{ev.status}</td>
                                    <td className="p-2">{ev.quantity}</td>
                                    <td className="p-2">{ev.tce ?? "—"}</td>
                                    <td className="p-2">{ev.rootstock ?? "—"}</td>
                                    <td className="p-2">{ev.age ?? "—"}</td>
                                    <td className="p-2">{ev.notes ?? ""}</td>
                                    <td className="p-2 text-right">
                                      <div className="inline-flex gap-1">
                                        <button className="rounded border px-2 py-1" onClick={()=>setEditing(ev)}><Edit3 className="h-4 w-4" /></button>
                                        <button className="rounded border px-2 py-1" onClick={()=>removeRecord(ev.id)}><Trash2 className="h-4 w-4" /></button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                                {g.events.length===0 && <tr><td className="p-2 text-neutral-500" colSpan={8}>No events yet.</td></tr>}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {grouped.length===0 && (
                <tr><td className="p-4 text-center text-sm text-neutral-500" colSpan={10}>No results.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Entry Editor */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-4xl rounded-xl bg-white p-4">
            <div className="mb-2 text-lg font-semibold">{records.some(r=>r.id===editing.id) ? "Edit Entry" : "Add Entry"}</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <div className="text-xs mb-1">Sector</div>
                <select
                  className="w-full rounded border px-3 py-2 text-sm"
                  value={editing.sectorId}
                  onChange={e=>{
                    const sectorId = e.target.value;
                    const firstOrch = (orchardsBySector[sectorId] ?? [])[0]?.id ?? "";
                    const firstBlock = firstOrch ? (blocksByOrchard[firstOrch]?.[0]?.id ?? "") : "";
                    setEditing({...editing!, sectorId, orchardId: firstOrch, blockId: firstBlock});
                  }}
                >
                  <option value="">Select…</option>
                  {master.sectors.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div>
                <div className="text-xs mb-1">Orchard</div>
                <select
                  className="w-full rounded border px-3 py-2 text-sm"
                  value={editing.orchardId}
                  onChange={e=>{
                    const orchardId = e.target.value;
                    const firstBlock = (blocksByOrchard[orchardId] ?? [])[0]?.id ?? "";
                    setEditing({...editing!, orchardId, blockId: firstBlock});
                  }}
                >
                  <option value="">Select…</option>
                  {(orchardsBySector[editing.sectorId] ?? []).map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>

              <div>
                <div className="text-xs mb-1">Block / Lot</div>
                <select
                  className="w-full rounded border px-3 py-2 text-sm"
                  value={editing.blockId}
                  onChange={e=>setEditing({...editing!, blockId: e.target.value})}
                >
                  <option value="">Select…</option>
                  {(blocksByOrchard[editing.orchardId] ?? []).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              {/* Read-only block info */}
              <div className="md:col-span-3 rounded border bg-neutral-50 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium"><History className="h-4 w-4"/> Block Info</div>
                {getBlock(editing.blockId) ? (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3 text-sm">
                    <div><div className="text-xs text-neutral-600">Variety</div><div className="font-medium">{getBlock(editing.blockId)?.variety}</div></div>
                    <div><div className="text-xs text-neutral-600">Structure</div><div className="font-medium">{getBlock(editing.blockId)?.structureType}</div></div>
                    <div><div className="text-xs text-neutral-600">Rows</div><div className="font-medium">{getBlock(editing.blockId)?.rowCount}</div></div>
                    <div><div className="text-xs text-neutral-600">Hectares</div><div className="font-medium">{getBlock(editing.blockId)?.hectares}</div></div>
                    <div><div className="text-xs text-neutral-600">Block Health</div><div className="font-medium">{getBlock(editing.blockId)?.health ?? "—"}{typeof getBlock(editing.blockId)?.health==="number" ? "%" : ""}</div></div>
                    <div><div className="text-xs text-neutral-600">GPS</div><div className="font-medium">
                      {(getBlock(editing.blockId)?.latitude && getBlock(editing.blockId)?.longitude)
                        ? `${getBlock(editing.blockId)!.latitude!.toFixed(5)}, ${getBlock(editing.blockId)!.longitude!.toFixed(5)}`
                        : "—"}
                    </div></div>
                  </div>
                ) : <div className="text-sm text-neutral-500">Select a block to view details.</div>}
              </div>

              {/* Editable event fields */}
              <div>
                <div className="text-xs mb-1">Status</div>
                <select className="w-full rounded border px-3 py-2 text-sm" value={editing.status} onChange={e=>setEditing({...editing!, status: e.target.value as TreeStatus})}>
                  {(["New Planting","Replanting","Kneecapped","Grafted","Removed"] as const).map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div><div className="text-xs mb-1">Quantity (trees)</div><input type="number" className="w-full rounded border px-3 py-2 text-sm" value={editing.quantity} onChange={e=>setEditing({...editing!, quantity: Number(e.target.value) || 0})}/></div>
              <div><div className="text-xs mb-1">TCE (est.)</div><input type="number" step="0.01" className="w-full rounded border px-3 py-2 text-sm" value={editing.tce ?? 0} onChange={e=>setEditing({...editing!, tce: Number(e.target.value) || undefined})}/></div>
              <div><div className="text-xs mb-1">Rootstock</div><input className="w-full rounded border px-3 py-2 text-sm" value={editing.rootstock ?? ""} onChange={e=>setEditing({...editing!, rootstock: e.target.value || undefined})}/></div>
              <div><div className="text-xs mb-1">Age (yrs)</div><input type="number" className="w-full rounded border px-3 py-2 text-sm" value={editing.age ?? 0} onChange={e=>setEditing({...editing!, age: Number(e.target.value) || undefined})}/></div>
              <div className="md:col-span-3"><div className="text-xs mb-1">Notes</div><input className="w-full rounded border px-3 py-2 text-sm" value={editing.notes ?? ""} onChange={e=>setEditing({...editing!, notes: e.target.value || undefined})}/></div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded border px-3 py-2" onClick={()=>setEditing(null)}>Cancel</button>
              <button className="rounded bg-black px-3 py-2 text-white" onClick={()=>editing && saveEdit(editing)}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Master Manager */}
      {showMasterMgr && (
        <MasterManager
          master={master}
          records={records}
          onClose={()=>setShowMasterMgr(false)}
          setMaster={setMaster}
          setAudit={setAudit}
        />
      )}

      {/* Footer */}
      <footer className="mx-auto max-w-6xl px-4 py-10 text-xs text-neutral-600">
        <details>
          <summary className="cursor-pointer">CSV Template (events)</summary>
        <pre className="mt-2 rounded bg-neutral-100 p-3 overflow-x-auto">id,sector,orchard,block,status,quantity,tce,notes,lastUpdated,variety,structureType,rowCount,hectares,latitude,longitude,blockHealth</pre>
        </details>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => { localStorage.removeItem(LS_TREES); location.reload(); }}
            className="rounded border px-3 py-2"
          >
            Reset Events
          </button>
          <button
            onClick={() => { localStorage.removeItem(LS_MASTER); localStorage.removeItem(LS_TREES); localStorage.removeItem(LS_AUDIT); location.reload(); }}
            className="rounded border px-3 py-2"
          >
            Reset All
          </button>
        </div>
      </footer>
    </div>
  );
}

/** ---------- Master Manager Component ---------- */
function MasterManager(props: {
  master: { sectors: Sector[]; orchards: Orchard[]; blocks: Block[] };
  records: TreeRecord[]; // used for delete checks
  onClose: () => void;
  setMaster: React.Dispatch<React.SetStateAction<{ sectors: Sector[]; orchards: Orchard[]; blocks: Block[] }>>;
  setAudit: React.Dispatch<React.SetStateAction<AuditEntry[]>>;
}) {
  const { master, records, onClose, setMaster, setAudit } = props;

  const [sectorName, setSectorName] = useState("");
  const [orchName, setOrchName] = useState("");
  const [orchSector, setOrchSector] = useState("");
  const [blkName, setBlkName] = useState("");
  const [blkOrch, setBlkOrch] = useState("");
  const [blkVariety, setBlkVariety] = useState("");
  const [blkStruct, setBlkStruct] = useState("");
  const [blkRows, setBlkRows] = useState<number | "">("");
  const [blkHa, setBlkHa] = useState<number | "">("");
  const [blkLat, setBlkLat] = useState<number | "">("");
  const [blkLon, setBlkLon] = useState<number | "">("");
  const [blkHealth, setBlkHealth] = useState<number | "">("");

  function log(entity:"sector"|"orchard"|"block", entityId:string, message:string) {
    const e: AuditEntry = { id: uuid(), at: new Date().toISOString(), who: "local", entity, entityId, message };
    setAudit(prev => { const nxt=[e, ...prev]; localStorage.setItem(LS_AUDIT, JSON.stringify(nxt)); return nxt; });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-5xl rounded-xl bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-semibold">Master Data (Sectors → Orchards → Blocks)</div>
          <button className="rounded border px-3 py-2" onClick={onClose}>Close</button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Sectors */}
          <div className="rounded border p-3">
            <div className="mb-2 font-medium">Sectors</div>
            <div className="flex gap-2">
              <input className="w-full rounded border px-3 py-2 text-sm" placeholder="New sector name" value={sectorName} onChange={e=>setSectorName(e.target.value)} />
              <button
                className="rounded bg-black px-3 py-2 text-sm text-white"
                onClick={()=>{
                  const name = sectorName.trim(); if (!name) return;
                  const s: Sector = { id: uuid(), name };
                  setMaster(m=>({ ...m, sectors: [...m.sectors, s] }));
                  log("sector", s.id, `created: ${name}`);
                  setSectorName("");
                }}
              >Add</button>
            </div>
            <ul className="mt-3 space-y-1">
              {master.sectors.map(s=>(
                <li key={s.id} className="flex items-center justify-between rounded border px-2 py-1 text-sm">
                  <span>{s.name}</span>
                  <button
                    className="rounded border px-2 py-1"
                    onClick={()=>{
                      if (master.orchards.some(o=>o.sectorId===s.id)) return toast.error("Remove orchards under this sector first.");
                      setMaster(m=>({ ...m, sectors: m.sectors.filter(x=>x.id!==s.id) }));
                      log("sector", s.id, "deleted");
                    }}
                  >Delete</button>
                </li>
              ))}
            </ul>
          </div>

          {/* Orchards */}
          <div className="rounded border p-3">
            <div className="mb-2 font-medium">Orchards</div>
            <div className="grid grid-cols-3 gap-2">
              <select className="col-span-1 rounded border px-3 py-2 text-sm" value={orchSector} onChange={e=>setOrchSector(e.target.value)}>
                <option value="">Sector…</option>
                {master.sectors.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input className="col-span-1 rounded border px-3 py-2 text-sm" placeholder="Orchard name" value={orchName} onChange={e=>setOrchName(e.target.value)} />
              <button
                className="col-span-1 rounded bg-black px-3 py-2 text-sm text-white"
                onClick={()=>{
                  const name = orchName.trim(); if (!orchSector) return toast.error("Pick a sector"); if (!name) return;
                  const o: Orchard = { id: uuid(), sectorId: orchSector, name };
                  setMaster(m=>({ ...m, orchards: [...m.orchards, o] }));
                  log("orchard", o.id, `created: ${name}`);
                  setOrchName("");
                }}
              >Add</button>
            </div>
            <ul className="mt-3 space-y-1">
              {master.orchards.map(o=>(
                <li key={o.id} className="flex items-center justify-between rounded border px-2 py-1 text-sm">
                  <span>{(master.sectors.find(s=>s.id===o.sectorId)?.name) ?? "?"} — {o.name}</span>
                  <button
                    className="rounded border px-2 py-1"
                    onClick={()=>{
                      if (master.blocks.some(b=>b.orchardId===o.id)) return toast.error("Remove blocks under this orchard first.");
                      setMaster(m=>({ ...m, orchards: m.orchards.filter(x=>x.id!==o.id) }));
                      log("orchard", o.id, "deleted");
                    }}
                  >Delete</button>
                </li>
              ))}
            </ul>
          </div>

          {/* Blocks */}
          <div className="rounded border p-3">
            <div className="mb-2 font-medium">Blocks / Lots</div>
            <div className="grid grid-cols-3 gap-2">
              <select className="col-span-1 rounded border px-3 py-2 text-sm" value={blkOrch} onChange={e=>setBlkOrch(e.target.value)}>
                <option value="">Orchard…</option>
                {master.orchards.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <input className="col-span-1 rounded border px-3 py-2 text-sm" placeholder="Block name (e.g., B3)" value={blkName} onChange={e=>setBlkName(e.target.value)} />
              <button
                className="col-span-1 rounded bg-black px-3 py-2 text-sm text-white"
                onClick={()=>{
                  if (!blkOrch) return toast.error("Pick an orchard");
                  const name = blkName.trim(); if (!name) return;
                  const b: Block = {
                    id: uuid(),
                    orchardId: blkOrch,
                    name,
                    variety: blkVariety.trim() || "",
                    structureType: blkStruct.trim() || "",
                    rowCount: typeof blkRows==="number" ? blkRows : 0,
                    hectares: typeof blkHa==="number" ? blkHa : 0,
                    latitude: typeof blkLat==="number" ? blkLat : undefined,
                    longitude: typeof blkLon==="number" ? blkLon : undefined,
                    health: typeof blkHealth==="number" ? clamp(blkHealth,0,100) : undefined
                  };
                  setMaster(m=>({ ...m, blocks: [...m.blocks, b] }));
                  setBlkName(""); setBlkVariety(""); setBlkStruct(""); setBlkRows(""); setBlkHa(""); setBlkLat(""); setBlkLon(""); setBlkHealth("");
                }}
              >Add</button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <input className="rounded border px-3 py-2 text-sm" placeholder="Variety" value={blkVariety} onChange={e=>setBlkVariety(e.target.value)} />
              <input className="rounded border px-3 py-2 text-sm" placeholder="Structure Type" value={blkStruct} onChange={e=>setBlkStruct(e.target.value)} />
              <input className="rounded border px-3 py-2 text-sm" type="number" placeholder="Row Count" value={blkRows} onChange={e=>setBlkRows(e.target.value===""? "": Number(e.target.value))} />
              <input className="rounded border px-3 py-2 text-sm" type="number" step="0.01" placeholder="Hectares" value={blkHa} onChange={e=>setBlkHa(e.target.value===""? "": Number(e.target.value))} />
              <input className="rounded border px-3 py-2 text-sm" type="number" step="0.00001" placeholder="Latitude" value={blkLat} onChange={e=>setBlkLat(e.target.value===""? "": Number(e.target.value))} />
              <input className="rounded border px-3 py-2 text-sm" type="number" step="0.00001" placeholder="Longitude" value={blkLon} onChange={e=>setBlkLon(e.target.value===""? "": Number(e.target.value))} />
              <input className="rounded border px-3 py-2 text-sm" type="number" placeholder="Block Health (0–100)" value={blkHealth} onChange={e=>setBlkHealth(e.target.value===""? "": Number(e.target.value))} />
            </div>

            <ul className="mt-3 space-y-1">
              {master.blocks.map(b=>(
                <li key={b.id} className="flex items-center justify-between rounded border px-2 py-1 text-sm">
                  <span>{(master.orchards.find(o=>o.id===b.orchardId)?.name) ?? "?"} — {b.name} · {b.variety} · {b.structureType} · rows:{b.rowCount} · {b.hectares}ha</span>
                  <div className="flex items-center gap-2">
                    <button
                      className="rounded border px-2 py-1"
                      onClick={()=>{
                        setBlkOrch(b.orchardId);
                        setBlkName(b.name);
                        setBlkVariety(b.variety);
                        setBlkStruct(b.structureType);
                        setBlkRows(b.rowCount);
                        setBlkHa(b.hectares);
                        setBlkLat(b.latitude ?? "");
                        setBlkLon(b.longitude ?? "");
                        setBlkHealth(b.health ?? "");
                      }}
                    >Load to form</button>
                    <button
                      className="rounded border px-2 py-1"
                      onClick={()=>{
                        if (records.some(r=>r.blockId===b.id)) return toast.error("Remove events in this block first.");
                        setMaster(m=>({ ...m, blocks: m.blocks.filter(x=>x.id!==b.id) }));
                      }}
                    >Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => {
              localStorage.removeItem(LS_MASTER);
              const m = loadMaster();
              setMaster(m);
              toast.success("Master reset to seed");
            }}
            className="rounded border px-3 py-2 text-sm"
          >Reset Master (seed)</button>
          <button className="rounded bg-black px-3 py-2 text-sm text-white" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
