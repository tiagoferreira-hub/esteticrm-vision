// Regras puras do script operacional (painel de script na tela Conversas).
// Caminho ÚNICO: script ativo → blocos → interpolação → inserção.
// Não duplicar esta lógica em componentes.

import { TemplateVars, TEMPLATE_VAR_REGEX, fillTemplate } from "@/lib/postop";
import { Lead, STAGE_LABELS } from "@/types/lead";
import { Appointment } from "@/types/appointment";
import { Procedure } from "@/types/procedure";

/** Variáveis suportadas no P0. `{dia1}`/`{dia2}` NÃO entram: são literais que a atendente digita por cima. */
export const SCRIPT_VAR_KEYS = [
  "nome", "telefone", "servico", "valor", "etapa",
  "procedimento", "data", "hora", "atendente",
] as const;

export type ScriptVarKey = typeof SCRIPT_VAR_KEYS[number];

/**
 * Quebra o conteúdo do script em blocos inseríveis.
 * Regra única: uma linha em branco separa blocos. Sem teto de quantidade.
 */
export function splitBlocks(content: string): string[] {
  return (content || "")
    .split(/\n{2,}/)
    .map(b => b.trim())
    .filter(Boolean);
}

export type SegmentKind = "text" | "filled" | "missing";

export interface TemplateSegment {
  kind: SegmentKind;
  /** Texto a exibir: o valor resolvido, ou o próprio marcador quando não há valor. */
  text: string;
  /** Nome da variável — presente em "filled" e "missing". */
  name?: string;
}

/**
 * Quebra um bloco em segmentos para renderização, para que a variável sem valor
 * possa ser destacada visualmente em vez de sumir.
 *
 * Qualquer `{marcador}` sem valor vira "missing" — inclusive `{dia1}`/`{dia2}`,
 * que assim aparecem sinalizados como "falta preencher".
 */
export function tokenizeTemplate(text: string, vars: TemplateVars): TemplateSegment[] {
  const src = text || "";
  const segments: TemplateSegment[] = [];
  let cursor = 0;

  // O regex é global; zerar lastIndex evita estado residual entre chamadas.
  TEMPLATE_VAR_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TEMPLATE_VAR_REGEX.exec(src)) !== null) {
    const [marker, key] = match;
    if (match.index > cursor) {
      segments.push({ kind: "text", text: src.slice(cursor, match.index) });
    }
    const raw = vars?.[key];
    const value = raw === undefined || raw === null ? "" : String(raw);
    segments.push(
      value.length > 0
        ? { kind: "filled", text: value, name: key }
        : { kind: "missing", text: marker, name: key },
    );
    cursor = match.index + marker.length;
  }

  if (cursor < src.length) {
    segments.push({ kind: "text", text: src.slice(cursor) });
  }
  return segments;
}

/**
 * Texto final inserido no campo de mensagem.
 * Variável sem valor é PRESERVADA como `{marcador}` — nunca vira string vazia.
 */
export function renderBlock(text: string, vars: TemplateVars): string {
  return fillTemplate(text, vars, "keep");
}

// ── Montagem das variáveis a partir do estado da conversa ────────────────────

const isValidDate = (d: Date) => !Number.isNaN(d.getTime());

/**
 * Agendamento de referência para `{data}`/`{hora}`: o próximo futuro; na falta
 * dele, o mais recente já ocorrido. Cancelados são ignorados.
 * Lead sem agendamento → null (as variáveis ficam vazias, nunca "undefined").
 */
export function pickReferenceAppointment(
  appointments: Appointment[],
  leadId: string,
  now: Date = new Date(),
): Appointment | null {
  const mine = (appointments ?? [])
    .filter(a => a.leadId === leadId && a.status !== "cancelado")
    .filter(a => isValidDate(new Date(a.scheduledAt)))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  if (mine.length === 0) return null;
  const future = mine.find(a => new Date(a.scheduledAt).getTime() >= now.getTime());
  return future ?? mine[mine.length - 1];
}

export interface ScriptVarsInput {
  lead: Lead | null;
  procedures?: Procedure[];
  appointments?: Appointment[];
  /** Nome de exibição do responsável pela conversa. */
  attendantName?: string | null;
  now?: Date;
}

/**
 * Constrói o dicionário de variáveis do P0. Pura e tolerante: qualquer dado
 * ausente vira string vazia, e o consumidor decide se preserva o marcador.
 */
export function buildScriptVars({
  lead, procedures = [], appointments = [], attendantName, now = new Date(),
}: ScriptVarsInput): Record<ScriptVarKey, string> {
  const empty: Record<ScriptVarKey, string> = {
    nome: "", telefone: "", servico: "", valor: "", etapa: "",
    procedimento: "", data: "", hora: "", atendente: "",
  };
  if (!lead) return empty;

  const interest = lead.procedureInterestId
    ? procedures.find(p => p.id === lead.procedureInterestId)
    : undefined;

  const appt = pickReferenceAppointment(appointments, lead.id, now);
  const apptDate = appt ? new Date(appt.scheduledAt) : null;

  return {
    ...empty,
    nome: lead.name ?? "",
    telefone: lead.phone ?? "",
    servico: lead.service ?? "",
    valor: lead.value > 0
      ? lead.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : "",
    etapa: STAGE_LABELS[lead.stage] ?? "",
    // Interesse declarado (D2) tem precedência; senão o serviço do lead.
    procedimento: interest?.name ?? lead.service ?? "",
    data: apptDate ? apptDate.toLocaleDateString("pt-BR") : "",
    hora: apptDate
      ? apptDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      : "",
    atendente: attendantName ?? "",
  };
}
