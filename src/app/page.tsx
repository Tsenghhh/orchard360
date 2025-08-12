<ENTIRE UPDATED FILE CONTENT HERE — SAME AS BEFORE BUT WITH THESE CHANGES>
- Add at the top (under imports):
  const STATUS_FILTER_OPTIONS = ["all","New Planting","Replanting","Kneecapped","Grafted","Removed"] as const;
  type StatusFilter = (typeof STATUS_FILTER_OPTIONS)[number];

- Change state:
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

- In the Filters → Status <select>, map options without any:
  {STATUS_FILTER_OPTIONS.map(s => (<option key={s} value={s}>{s}</option>))}

- In that same <select>, change onChange to:
  onChange={(e)=> setStatusFilter(e.target.value as StatusFilter)}
