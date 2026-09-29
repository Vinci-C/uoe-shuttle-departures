import { useCallback, useMemo, useState } from "react";
import {
  allConnections,
  deleteConnection,
  exportConnectionsJson,
  generateId,
  getActiveConnectionId,
  getDataset,
  getStop,
  importConnectionsJson,
  resolveFromPool,
  saveConnection,
  setActiveConnectionId,
  setDataset,
  setStop,
  type Connection,
  type StopCode,
} from "../config";
import { resetSupabaseClients } from "../lib/supabase";

export interface BoothConfig {
  connections: Connection[];
  activeConnection: Connection | null;
  activeConnectionId: string | null;
  dataset: string;
  stop: StopCode;

  selectConnection: (id: string) => void;
  upsertConnection: (connection: Omit<Connection, "id"> & { id?: string }) => void;
  removeConnection: (id: string) => void;
  changeDataset: (dataset: string) => void;
  newDataset: () => string;
  changeStop: (stop: StopCode) => void;
  exportJson: () => string;
  importJson: (text: string) => Connection[];
}

const DATASET_DATE = new Intl.DateTimeFormat("en-CA");

export function useBoothConfig(): BoothConfig {
  const [connections, setConnections] = useState<Connection[]>(() => allConnections());
  const [activeConnectionId, setActiveId] = useState<string | null>(() => getActiveConnectionId());
  const [dataset, setDatasetState] = useState<string>(() => getDataset());
  const [stop, setStopState] = useState<StopCode>(() => getStop());

  const selectConnection = useCallback((id: string) => {
    setActiveId(id);
    setActiveConnectionId(id);
    // The previous project's Supabase client must not outlive the switch.
    resetSupabaseClients();
  }, []);

  const upsertConnection = useCallback(
    (connection: Omit<Connection, "id"> & { id?: string }) => {
      const next: Connection = { ...connection, id: connection.id ?? generateId() };
      saveConnection(next);
      resetSupabaseClients();
      setConnections(allConnections());
      setActiveId(next.id);
      setActiveConnectionId(next.id);
    },
    [],
  );

  const removeConnection = useCallback((id: string) => {
    deleteConnection(id);
    resetSupabaseClients();
    setConnections(allConnections());
  }, []);

  const changeDataset = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setDataset(trimmed);
    setDatasetState(trimmed);
  }, []);

  const newDataset = useCallback(() => {
    const value = `demo-${DATASET_DATE.format(new Date())}`;
    setDataset(value);
    setDatasetState(value);
    return value;
  }, []);

  const changeStop = useCallback((value: StopCode) => {
    setStop(value);
    setStopState(value);
  }, []);

  const exportJson = useCallback(() => exportConnectionsJson(), []);

  const importJson = useCallback((text: string): Connection[] => {
    const imported = importConnectionsJson(text);
    resetSupabaseClients();
    setConnections(allConnections());
    return imported;
  }, []);

  // Memoised deliberately. `resolveFromPool` can hand back a fresh object, and an
  // unstable `activeConnection` identity makes every consumer effect re-run on every
  // render — which for `useBoardings` meant a query and a Realtime resubscribe per second.
  const activeConnection = useMemo(
    () => resolveFromPool(connections, activeConnectionId),
    [connections, activeConnectionId],
  );

  return {
    connections,
    activeConnection,
    activeConnectionId,
    dataset,
    stop,
    selectConnection,
    upsertConnection,
    removeConnection,
    changeDataset,
    newDataset,
    changeStop,
    exportJson,
    importJson,
  };
}
