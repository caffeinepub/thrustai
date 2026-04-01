import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EngineConfig } from "../backend.d.ts";
import { useActor } from "./useActor";

export function useListConfigs() {
  const { actor, isFetching } = useActor();
  return useQuery<string[]>({
    queryKey: ["configs"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listConfigs();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useSaveConfig() {
  const { actor } = useActor();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (config: EngineConfig) => {
      if (!actor) throw new Error("Actor not ready");
      return actor.saveConfig(config);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["configs"] }),
  });
}

export function useLoadConfig() {
  const { actor } = useActor();
  return useMutation({
    mutationFn: async (name: string) => {
      if (!actor) throw new Error("Actor not ready");
      return actor.loadConfig(name);
    },
  });
}

export function useDeleteConfig() {
  const { actor } = useActor();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      if (!actor) throw new Error("Actor not ready");
      return actor.deleteConfig(name);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["configs"] }),
  });
}
