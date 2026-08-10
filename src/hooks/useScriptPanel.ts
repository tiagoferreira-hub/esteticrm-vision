import { useCallback, useMemo, useState } from "react";
import { Lead } from "@/types/lead";
import { Conversation } from "@/context/ConversationsContext";
import { usePlaybooks, Script } from "@/context/PlaybooksContext";
import { useProcedures } from "@/context/ProceduresContext";
import { useAppointments } from "@/context/AppointmentsContext";
import { useCompanyMembers } from "@/hooks/useCompanyMembers";
import {
  ScriptVarKey, buildScriptVars, renderBlock, splitBlocks,
} from "@/lib/scriptTemplate";

/** Evento que leva o texto até o campo de mensagem da tela Conversas. */
export const SCRIPT_INSERT_EVENT = "crm:scriptInsert";

export interface UseScriptPanel {
  /** Todos os scripts da company — alimenta o seletor de override. */
  scripts: Script[];
  /** Script em exibição: o override manual, senão o ativo da etapa do lead. */
  activeScript: Script | null;
  overrideId: string | null;
  setOverrideId: (id: string | null) => void;
  /** Blocos inseríveis do script ativo, ainda com os marcadores crus. */
  blocks: string[];
  /** Variáveis resolvidas para o lead/conversa atual. */
  vars: Record<ScriptVarKey, string>;
  /** Interpola, insere no campo de mensagem e registra o uso. */
  insertBlock: (block: string) => void;
}

/**
 * Caminho único de "script ativo → blocos → interpolação → inserção".
 * Qualquer superfície que ofereça script deve consumir este hook — não
 * reimplementar o split nem o dispatch, sob pena de a telemetria subcontar.
 */
export function useScriptPanel(
  lead: Lead | null,
  conversation: Conversation | null,
): UseScriptPanel {
  const { scripts, recordUsage } = usePlaybooks();
  const { procedures } = useProcedures();
  const { appointments } = useAppointments();
  const members = useCompanyMembers();
  const [overrideId, setOverrideId] = useState<string | null>(null);

  const activeScript = useMemo(() => {
    if (!lead) return null;
    if (overrideId) return scripts.find(s => s.id === overrideId) ?? null;
    return scripts.find(s => s.stage === lead.stage && s.isActive) ?? null;
  }, [lead, scripts, overrideId]);

  const attendantName = useMemo(() => {
    const ownerId = conversation?.assignedTo ?? lead?.assignedTo ?? null;
    if (!ownerId) return null;
    return members.find(m => m.userId === ownerId)?.displayName ?? null;
  }, [conversation, lead, members]);

  const vars = useMemo(
    () => buildScriptVars({ lead, procedures, appointments, attendantName }),
    [lead, procedures, appointments, attendantName],
  );

  const blocks = useMemo(
    () => splitBlocks(activeScript?.content ?? ""),
    [activeScript],
  );

  const insertBlock = useCallback((block: string) => {
    const text = renderBlock(block, vars);
    window.dispatchEvent(new CustomEvent(SCRIPT_INSERT_EVENT, { detail: { text } }));
    // Telemetria: toda inserção conta, venha de onde vier.
    if (activeScript && conversation && lead) {
      recordUsage(activeScript.id, conversation.id, lead.id, lead.stage);
    }
  }, [vars, activeScript, conversation, lead, recordUsage]);

  return { scripts, activeScript, overrideId, setOverrideId, blocks, vars, insertBlock };
}
