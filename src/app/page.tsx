"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Plus, Trash2, Edit3, MapPin, Sprout } from "lucide-react";

type TreeStatus = "OK" | "Attention" | "Removed" | "New";
type TreeRecord = {
  id: string;
  orchard: string;
  block: string;
  row: number;
  tree: number;
  variety: string;
  rootstock?: string;
  age?: number;
  healthScore: number;
  tce?: number;
  notes?: string;
  status: TreeStatus;
  latitude?: number;
  longitude?: number;
  lastUpdated: string;
};

const LS_KEY = "orchard360_mvp_v1";
const uuid = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));
const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v));

function seedData(): TreeRecord[] {
  const now = new Date().toISOString();
  const sample: TreeRecord[] = [
    { id: uuid(), orchard: "Tutaekuri", block: "B3", row: 12, tree: 18, variety: "Jazz", rootstock: "M9", age: 5, healthScore: 86, tce: 0.45, notes: "Slight mite pressure", status: "Attention", latitude: -39.5903, longitude: 176.8506, lastUpdated: now },
    { id: uuid(), orchard: "Tutaekuri", block: "B3", row: 12, tree: 19, variety: "Jazz", rootstock: "M9", age: 5, healthScore: 92, tce: 0.48, status: "OK", latitude: -39.5903, longitude: 176.8506, lastUpdated: now },
    { id: uuid(), orchard: "Clive", block: "Q1", row: 7, tree: 3, variety: "Envy", rootstock: "M26", age: 3, healthScore: 77, tce: 0.38, notes: "Trunk rub", status: "Attention", lastUpdated: now },
    { id: uuid(), orchard: "Clive", block: "Q1", row: 7, tree: 4, variety: "Envy", rootstock: "M26", age: 3, healthScore: 0, tce: 0, notes: "Removed winter 2024", status: "Removed", lastUpdated: now },
    { id: uuid(), orchard: "Puketapu", block: "A2", row: 1, tree: 1, variety: "Pink Lady", rootstock: "MM106", age: 6, healthScore: 95, tce: 0.52, status: "OK", lastUpdated: now },
  ];
  if (typeof window !== "undefined") localStorage.setItem(LS_KEY, JSON.stringify(sample));
  return sample;
}
function loadData(): TreeRecord[] {
  try {
    const s = typeof window !== "undefined" ? localStorage.getItem(LS_KEY) : null;
    if (!s) return seedData();
    return JSON.parse(s) as TreeRecord[];
  } catch {
    return seedData();
  }
}
function saveData(data: TreeRecord[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}
function toCSV(records: TreeRecord[]) {
  const header = ["id","orchard","block","row","tree","variety","rootstock","age","healthScore","tce","notes","status","latitude","longitude","lastUpdated"];
  const rows = records.map(r => [
    r.id, r.orchard, r.block, r.row, r.tree, r.variety, r.rootstock ?? "", r.age ?? "", r.healthScore, r.tce ?? "", (r.notes ?? "").replace(/\n/g," "), r.status, r.latitude ?? "", r.longitude ?? "", r.lastUpdated
  ]);
  return [header, ...rows].map(cols => cols.join(",")).join("\n");
}
function fromCSV(text: string): TreeRecord[] {
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift()?.split(",") ?? [];
  const idx = Object.fromEntries(header.map((h,i)=>[h,i]));
  return lines.map(line => {
    const cols = line.split(",");
    const get = (k: string) => cols[idx[k]] ?? "";
    return {
      id: get("id") || uuid(),
      orchard: get("orchard") || "Unknown",
      block: get("block") || "",
      row: Number(get("row") || 0),
      tree: Number(get("tree") || 0),
      variety: get("variety") || "",
      rootstock: get("rootstock") || undefined,
      age: get("age") ? Number(get("age")) : undefined,
      healthScore: clamp(Number(get("healthScore") || 0)),
      tce: get("tce") ? Number(get("tce")) : undefined,
      notes: get("notes") || undefined,
      status: (get("status") as TreeStatus) || "OK",
      latitude: get("latitude") ? Number(get("latitude")) : undefined,
      longitude: get("longitude") ? Number(get("longitude")) : undefined,
      lastUpdated: get("lastUpdated") || new Date().toISOString(),
    } as TreeRecord;
  });
}

export default function Page() {
  const [records, setRecords] = useState<TreeRecord[]>([]);
  const [query, setQuery] = useState("");
  const [orchardFilter, setOrchardFilter] = useState<string>("all");
  const [blockFilter, setBlockFilter] = useState<string>("all");
  const [varietyFilter, setVarietyFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<TreeStatus | "all">("all");
  const [dense, setDense] = useState(false);
  const [editing, setEditing] = useState<TreeRecord | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => setRecords(loadData()), []);
  useEffect(() => saveData(records), [records]);

  const orchards = useMemo(() => Array.from(new Set(records.map(r=>r.orchard))).sort(), [records]);
  const blocks = useMemo(() => Array.from(new Set(records.filter(r=>orchardFilter==="all"||r.orchard===orchardFilter).map(r=>r.block))).sort(), [records, orchardFilter]);
  const varieties = useMemo(() => Array.from(new Set(records.map(r=>r.variety))).sort(), [records]);

  const filtered = useMemo(() => records.filter(r => {
    if (orchardFilter!=="all" && r.orchard!==orchardFilter) return false;
    if (blockFilter!=="all" && r.block!==blockFilter) return false;
    if (varietyFilter!=="all" && r.variety!==varietyFilter) return false;
    if (statusFilter!=="all" && r.status!==statusFilter) return false;
    const q = query.toLowerCase().trim();
    if (!q) return true;
    const blob = `${r.orchard} ${r.block} ${r.variety} ${r.row}-${r.tree} ${r.notes ?? ""}`.toLowerCase();
    return blob.includes(q);
  }), [records, orchardFilter, blockFilter, varietyFilter, statusFilter, query]);

  const kpis = useMemo(() => {
    const totalTrees = filtered.length;
    const uniqueBlocks = new Set(filtered.map(r=>`${r.orchard}:${r.block}`)).size;
    const avgHealth = totalTrees ? Math.round(filtered.reduce((a,b)=>a+b.healthScore,0)/totalTrees) : 0;
    const issues = filtered.filter(r=>r.status==="Attention").length;
    return { totalTrees, uniqueBlocks, avgHealth, issues };
  }, [filtered]);

  function startCreate() {
    const now = new Date().toISOString();
    setEditing({
      id: uuid(), orchard: orchards[0] || "Tutaekuri", block: blocks[0] || "A1", row: 1, tree: 1,
      variety: varieties[0] || "Jazz", healthScore: 90, status: "New", lastUpdated: now
    });
  }
  function saveEdit(rec: TreeRecord) {
    rec.lastUpdated = new Date().toISOString();
    setRecords(prev => {
      const i = prev.findIndex(x=>x.id===rec.id);
      if (i===-1) return [rec, ...prev];
      const copy = [...prev]; copy[i]=rec; return copy;
    });
    setEditing(null);
    toast.success("Saved");
  }
  function removeRecord(id: string) {
    setRecords(prev => prev.filter(r => r.id !== id));
    toast("Tree deleted");
  }
  function exportCSV() {
    const csv = toCSV(filtered);
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
      try {
        const incoming = fromCSV(String(reader.result));
        setRecords(prev => {
          const byId = new Map(prev.map(r => [r.id, r] as const));
          for (const rec of incoming) byId.set(rec.id, rec);
          return Array.from(byId.values());
        });
        toast.success("Imported");
        if (fileRef.current) fileRef.current.value = "";
      } catch (err) {
        console.error(err);
        toast.error("Import failed. Check CSV format.");
      }
    };
    reader.readAsText(f);
  }

  return (
    <div className="min-h-screen w-full bg-neutral-50 text-neutral-900">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 font-semibold"><span>🌳</span><span>Orchard360 – Lots & Trees Tracker</span></div>
          <div className="flex items-center gap-2">
            <button onClick={exportCSV} className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm hover:bg-neutral-100"><Download className="h-4 w-4"/>Export</button>
            <input ref={fileRef} type="file" accept=".csv" onChange={onImport} className="text-sm" />
            <button onClick={startCreate} className="inline-flex items-center gap-2 rounded bg-black px-3 py-2 text-sm text-white hover:opacity-90"><Plus className="h-4 w-4"/>Add Tree</button>
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
              <input className="w-full rounded border px-3 py-2 text-sm" placeholder="Search orchard, block, variety, 12-18, notes..." value={query} onChange={e=>setQuery(e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-neutral-600 mb-1">Orchard</div>
              <select className="w-full rounded border px-3 py-2 text-sm" value={orchardFilter} onChange={e=>setOrchardFilter(e.target.value)}>
                <option value="all">All</option>
                {orchards.map(o=><option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <div className="text-xs text-neutral-600 mb-1">Block/Lot</div>
              <select className="w-full rounded border px-3 py-2 text-sm" value={blockFilter} onChange={e=>setBlockFilter(e.target.value)}>
                <option value="all">All</option>
                {blocks.map(b=><option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <div className="text-xs text-neutral-600 mb-1">Variety</div>
              <select className="w-full rounded border px-3 py-2 text-sm" value={varietyFilter} onChange={e=>setVarietyFilter(e.target.value)}>
                <option value="all">All</option>
                {varieties.map(v=><option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <div className="text-xs text-neutral-600 mb-1">Status</div>
              <select className="w-full rounded border px-3 py-2 text-sm" value={statusFilter} onChange={e=>setStatusFilter(e.target.value as any)}>
                {["all","OK","Attention","Removed","New"].map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <section className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 md:grid-cols-4">
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs text-neutral-600">Total Trees</div>
          <div className="text-2xl font-semibold">{kpis.totalTrees}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs text-neutral-600">Blocks / Lots</div>
          <div className="text-2xl font-semibold">{kpis.uniqueBlocks}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs text-neutral-600">Avg Health</div>
          <div className="text-2xl font-semibold">{kpis.avgHealth}%</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-xs text-neutral-600">Issues (Attention)</div>
              <div className="text-2xl font-semibold">{kpis.issues}</div>
            </div>
            <Sprout className="h-7 w-7" />
          </div>
        </div>
      </section>

      {/* Table */}
      <section className="mx-auto max-w-6xl px-4 py-4">
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className={`w-full ${dense ? "text-sm" : ""}`}>
            <thead className="bg-neutral-50 text-left">
              <tr>
                <th className="p-3">Orchard</th>
                <th className="p-3">Block</th>
                <th className="p-3">Row</th>
                <th className="p-3">Tree</th>
                <th className="p-3">Variety</th>
                <th className="p-3">Health</th>
                <th className="p-3">Status</th>
                <th className="p-3">TCE</th>
                <th className="p-3">GPS</th>
                <th className="p-3">Notes</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r=>(
                <tr key={r.id} className="border-t align-top">
                  <td className="p-3">{r.orchard}</td>
                  <td className="p-3">{r.block}</td>
                  <td className="p-3">{r.row}</td>
                  <td className="p-3">{r.tree}</td>
                  <td className="p-3">{r.variety}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 rounded bg-neutral-200">
                        <div className="h-2 rounded bg-green-500" style={{width: `${clamp(r.healthScore)}%`}} />
                      </div>
                      <span>{r.healthScore}%</span>
                    </div>
                  </td>
                  <td className="p-3">{r.status}</td>
                  <td className="p-3">{r.tce ?? "—"}</td>
                  <td className="p-3 whitespace-nowrap text-xs">
                    {r.latitude && r.longitude ? (
                      <a className="inline-flex items-center gap-1 underline" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${r.latitude},${r.longitude}`}>
                        <MapPin className="h-4 w-4" /> {r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}
                      </a>
                    ) : "—"}
                  </td>
                  <td className="p-3 max-w-[300px] whitespace-pre-wrap">{r.notes || ""}</td>
                  <td className="p-3 text-right">
                    <div className="inline-flex gap-1">
                      <button className="rounded border px-2 py-1" onClick={()=>setEditing(r)}><Edit3 className="h-4 w-4" /></button>
                      <button className="rounded border px-2 py-1" onClick={()=>removeRecord(r.id)}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length===0 && (
                <tr><td className="p-4 text-center text-sm text-neutral-500" colSpan={11}>No trees match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Editor */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white p-4">
            <div className="mb-2 text-lg font-semibold">{records.some(r=>r.id===editing.id) ? "Edit Tree" : "Add Tree"}</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div><div className="text-xs mb-1">Orchard</div><input className="w-full rounded border px-3 py-2 text-sm" value={editing.orchard} onChange={e=>setEditing({...editing!, orchard: e.target.value})}/></div>
              <div><div className="text-xs mb-1">Block/Lot</div><input className="w-full rounded border px-3 py-2 text-sm" value={editing.block} onChange={e=>setEditing({...editing!, block: e.target.value})}/></div>
              <div><div className="text-xs mb-1">Variety</div><input className="w-full rounded border px-3 py-2 text-sm" value={editing.variety} onChange={e=>setEditing({...editing!, variety: e.target.value})}/></div>

              <div><div className="text-xs mb-1">Row</div><input type="number" className="w-full rounded border px-3 py-2 text-sm" value={editing.row} onChange={e=>setEditing({...editing!, row: Number(e.target.value)})}/></div>
              <div><div className="text-xs mb-1">Tree</div><input type="number" className="w-full rounded border px-3 py-2 text-sm" value={editing.tree} onChange={e=>setEditing({...editing!, tree: Number(e.target.value)})}/></div>
              <div><div className="text-xs mb-1">Health (0–100)</div><input type="number" className="w-full rounded border px-3 py-2 text-sm" value={editing.healthScore} onChange={e=>setEditing({...editing!, healthScore: clamp(Number(e.target.value))})}/></div>

              <div><div className="text-xs mb-1">Rootstock</div><input className="w-full rounded border px-3 py-2 text-sm" value={editing.rootstock ?? ""} onChange={e=>setEditing({...editing!, rootstock: e.target.value || undefined})}/></div>
              <div><div className="text-xs mb-1">Age (yrs)</div><input type="number" className="w-full rounded border px-3 py-2 text-sm" value={editing.age ?? 0} onChange={e=>setEditing({...editing!, age: Number(e.target.value) || undefined})}/></div>
              <div><div className="text-xs mb-1">TCE (est.)</div><input type="number" step="0.01" className="w-full rounded border px-3 py-2 text-sm" value={editing.tce ?? 0} onChange={e=>setEditing({...editing!, tce: Number(e.target.value) || undefined})}/></div>

              <div className="md:col-span-2"><div className="text-xs mb-1">Notes</div><input className="w-full rounded border px-3 py-2 text-sm" value={editing.notes ?? ""} onChange={e=>setEditing({...editing!, notes: e.target.value || undefined})}/></div>
              <div>
                <div className="text-xs mb-1">Status</div>
                <select className="w-full rounded border px-3 py-2 text-sm" value={editing.status} onChange={e=>setEditing({...editing!, status: e.target.value as TreeStatus})}>
                  {(["OK","Attention","Removed","New"] as const).map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div><div className="text-xs mb-1">Latitude</div><input type="number" className="w-full rounded border px-3 py-2 text-sm" value={editing.latitude ?? 0} onChange={e=>setEditing({...editing!, latitude: Number(e.target.value) || undefined})}/></div>
              <div><div className="text-xs mb-1">Longitude</div><input type="number" className="w-full rounded border px-3 py-2 text-sm" value={editing.longitude ?? 0} onChange={e=>setEditing({...editing!, longitude: Number(e.target.value) || undefined})}/></div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded border px-3 py-2" onClick={()=>setEditing(null)}>Cancel</button>
              <button className="rounded bg-black px-3 py-2 text-white" onClick={()=>editing && saveEdit(editing)}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="mx-auto max-w-6xl px-4 py-10 text-xs text-neutral-600">
        <details>
          <summary className="cursor-pointer">CSV Template</summary>
          <pre className="mt-2 rounded bg-neutral-100 p-3 overflow-x-auto">id,orchard,block,row,tree,variety,rootstock,age,healthScore,tce,notes,status,latitude,longitude,lastUpdated</pre>
        </details>
        <div className="mt-4">
          <button
            onClick={() => { localStorage.removeItem(LS_KEY); location.reload(); }}
            className="rounded border px-3 py-2"
          >
            Reset Data
          </button>
        </div>
      </footer>
    </div>
  );
}
