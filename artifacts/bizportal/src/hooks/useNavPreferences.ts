import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const QUERY_KEY = ["nav-preferences"] as const;

async function fetchNavPrefs(): Promise<string[]> {
  const r = await fetch("/api/nav-preferences", { credentials: "include" });
  if (!r.ok) return [];
  const data = (await r.json()) as { hiddenItems?: string[] };
  return data.hiddenItems ?? [];
}

async function saveNavPrefs(hiddenItems: string[]): Promise<void> {
  await fetch("/api/nav-preferences", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hiddenItems }),
  });
}

export function useNavPreferences() {
  const qc = useQueryClient();

  const { data: hiddenItems = [] } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchNavPrefs,
    staleTime: 5 * 60_000,
  });

  const mutation = useMutation({
    mutationFn: saveNavPrefs,
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<string[]>(QUERY_KEY);
      qc.setQueryData(QUERY_KEY, next);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(QUERY_KEY, ctx.prev);
    },
  });

  const toggle = (key: string) => {
    const next = hiddenItems.includes(key)
      ? hiddenItems.filter((k) => k !== key)
      : [...hiddenItems, key];
    mutation.mutate(next);
  };

  const reset = () => mutation.mutate([]);

  return { hiddenItems, toggle, reset };
}
