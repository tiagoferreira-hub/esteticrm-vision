// D1 — helpers puros do pós-operatório (espelham o gatilho SQL; testáveis e reusáveis
// caso a lógica seja movida para o cliente / Edge Function no futuro).
//
// ⚠️ DÍVIDA TÉCNICA — substituição de variáveis duplicada em duas linguagens.
// A mesma regra existe aqui (TS) e no gatilho PL/pgSQL do pós-op, em
// supabase/migrations/20260606150000_appointment_procedure_postop.sql:38-39,
// que faz `replace(v_msg, '{nome}', ...)` direto no banco. As duas podem
// divergir sem que nada acuse: o gatilho é a implementação que roda em
// produção para follow-ups pós-op, e o TS daqui alimenta o painel de script.
// Diferença conhecida e intencional: o gatilho apaga a variável sem valor
// (equivale a onMissing="blank", o default abaixo), enquanto o painel de
// script preserva o marcador (onMissing="keep").
// Consolidar quando o motor de mensagens sair do banco.

/** Dicionário de variáveis de um template. Valores vazios contam como ausentes. */
export type TemplateVars = Record<string, string | number | null | undefined>;

/**
 * O que fazer com uma variável sem valor:
 * - "blank": troca por string vazia (comportamento do gatilho PL/pgSQL do pós-op)
 * - "keep":  preserva o marcador `{nome}` visível, para quem escreve ver que falta preencher
 */
export type MissingVarMode = "blank" | "keep";

/** Marcador de variável: `{palavra}` — letras, números e underscore. */
export const TEMPLATE_VAR_REGEX = /\{([a-zA-Z0-9_]+)\}/g;

const resolve = (vars: TemplateVars, key: string): string | null => {
  const v = vars?.[key];
  if (v === undefined || v === null) return null;
  const s = String(v);
  return s.length > 0 ? s : null;
};

/**
 * Substitui `{variaveis}` num template.
 *
 * Genérico: aceita qualquer chave. A assinatura antiga (`{ nome, procedimento }`)
 * continua válida — é só um caso particular de TemplateVars.
 *
 * `onMissing` default "blank" preserva o comportamento histórico do pós-op.
 */
export function fillTemplate(
  text: string,
  vars: TemplateVars,
  onMissing: MissingVarMode = "blank",
): string {
  return (text || "").replace(TEMPLATE_VAR_REGEX, (match, key: string) => {
    const value = resolve(vars, key);
    if (value !== null) return value;
    return onMissing === "keep" ? match : "";
  });
}

// Data do toque pós-op: data do procedimento + N dias (preserva o horário).
export function postopDate(appointmentISO: string, offsetDays: number): string {
  const d = new Date(appointmentISO);
  d.setDate(d.getDate() + (offsetDays || 0));
  return d.toISOString();
}
