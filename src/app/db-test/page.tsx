"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function DBTest() {
  const [out, setOut] = useState("Checking Supabase...");

  useEffect(() => {
    (async () => {
      const tables = ["sectors", "orchards", "blocks", "tree_events"];
      const results = await Promise.all(
        tables.map((t) => supabase.from(t).select("*", { count: "exact", head: true }))
      );
      const text = results
        .map((r, i) => `${tables[i]}: ${r.count ?? "?"}${r.error ? " (error)" : ""}`)
        .join("\n");
      setOut(text);
    })();
  }, []);

  return <pre className="p-6 text-sm">{out}</pre>;
}
