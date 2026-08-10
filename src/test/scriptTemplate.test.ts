import { describe, it, expect } from "vitest";
import {
  splitBlocks, tokenizeTemplate, renderBlock, buildScriptVars, pickReferenceAppointment,
} from "@/lib/scriptTemplate";
import { fillTemplate } from "@/lib/postop";
import { Lead } from "@/types/lead";
import { Appointment } from "@/types/appointment";
import { Procedure } from "@/types/procedure";

const lead = (over: Partial<Lead> = {}): Lead => ({
  id: "lead-1", name: "Ana", phone: "11999998888", origin: "manual",
  stage: "agendado", service: "Botox", value: 1200, lastMessage: "",
  lastInteraction: "", observations: "", createdAt: "", ...over,
});

const appt = (over: Partial<Appointment> = {}): Appointment => ({
  id: "a1", leadId: "lead-1", assignedTo: null, scheduledAt: "2026-08-20T14:30:00.000Z",
  durationMinutes: 60, type: "avaliacao", status: "agendado", notes: "", createdAt: "", ...over,
});

const procedure = (over: Partial<Procedure> = {}): Procedure => ({
  id: "p1", name: "Preenchimento Labial", category: "", description: "", price: 0,
  workMinutes: 0, isRecurring: false, recurrenceDays: null, indications: "",
  contraindications: "", relevantInfo: "", active: true, followups: [], ...over,
});

describe("splitBlocks", () => {
  it("quebra por linha em branco, apara e descarta vazios", () => {
    expect(splitBlocks("Bloco A\nsegunda linha\n\n\nBloco B\n\n  ")).toEqual([
      "Bloco A\nsegunda linha", "Bloco B",
    ]);
  });

  it("não impõe teto de blocos (a caixa antiga cortava em 5)", () => {
    const content = Array.from({ length: 8 }, (_, i) => `B${i}`).join("\n\n");
    expect(splitBlocks(content)).toHaveLength(8);
  });

  it("tolera conteúdo vazio", () => {
    expect(splitBlocks("")).toEqual([]);
  });
});

describe("renderBlock — variável sem valor é preservada", () => {
  it("substitui as resolvidas e mantém o marcador das vazias", () => {
    expect(renderBlock("Oi {nome}, dia {dia1}?", { nome: "Ana" }))
      .toBe("Oi Ana, dia {dia1}?");
  });

  it("NUNCA produz string vazia no lugar da variável", () => {
    expect(renderBlock("Oi {nome}!", {})).toBe("Oi {nome}!");
    expect(renderBlock("Oi {nome}!", { nome: "" })).toBe("Oi {nome}!");
  });

  it("o modo blank do pós-op segue intacto (default de fillTemplate)", () => {
    expect(fillTemplate("Oi {nome}!", {})).toBe("Oi !");
  });
});

describe("tokenizeTemplate", () => {
  it("separa texto, variável resolvida e variável vazia", () => {
    expect(tokenizeTemplate("Oi {nome}, {hora}", { nome: "Ana" })).toEqual([
      { kind: "text", text: "Oi " },
      { kind: "filled", text: "Ana", name: "nome" },
      { kind: "text", text: ", " },
      { kind: "missing", text: "{hora}", name: "hora" },
    ]);
  });

  it("é estável em chamadas repetidas (regex global sem estado residual)", () => {
    const run = () => tokenizeTemplate("{nome} e {nome}", { nome: "Ana" });
    expect(run()).toEqual(run());
    expect(run().filter(s => s.kind === "filled")).toHaveLength(2);
  });

  it("texto sem variável vira um único segmento", () => {
    expect(tokenizeTemplate("sem variavel", {})).toEqual([
      { kind: "text", text: "sem variavel" },
    ]);
  });
});

describe("pickReferenceAppointment", () => {
  const now = new Date("2026-08-10T12:00:00.000Z");

  it("prefere o próximo agendamento futuro", () => {
    const list = [
      appt({ id: "passado", scheduledAt: "2026-08-01T10:00:00.000Z" }),
      appt({ id: "futuro", scheduledAt: "2026-08-20T14:30:00.000Z" }),
    ];
    expect(pickReferenceAppointment(list, "lead-1", now)?.id).toBe("futuro");
  });

  it("sem futuro, cai no mais recente já ocorrido", () => {
    const list = [
      appt({ id: "velho", scheduledAt: "2026-07-01T10:00:00.000Z" }),
      appt({ id: "recente", scheduledAt: "2026-08-05T10:00:00.000Z" }),
    ];
    expect(pickReferenceAppointment(list, "lead-1", now)?.id).toBe("recente");
  });

  it("ignora cancelados e agendamentos de outro lead", () => {
    const list = [
      appt({ id: "cancelado", status: "cancelado" }),
      appt({ id: "outro", leadId: "lead-2" }),
    ];
    expect(pickReferenceAppointment(list, "lead-1", now)).toBeNull();
  });

  it("lead sem agendamento devolve null", () => {
    expect(pickReferenceAppointment([], "lead-1", now)).toBeNull();
  });
});

describe("buildScriptVars", () => {
  const now = new Date("2026-08-10T12:00:00.000Z");

  it("monta as variáveis do lead", () => {
    const v = buildScriptVars({ lead: lead(), attendantName: "Carolina", now });
    expect(v.nome).toBe("Ana");
    expect(v.telefone).toBe("11999998888");
    expect(v.servico).toBe("Botox");
    expect(v.etapa).toBe("📅 Agendado");
    expect(v.atendente).toBe("Carolina");
    expect(v.valor).toContain("1.200");
  });

  it("procedimento de interesse (D2) tem precedência sobre o serviço", () => {
    const v = buildScriptVars({
      lead: lead({ procedureInterestId: "p1" }),
      procedures: [procedure()],
      now,
    });
    expect(v.procedimento).toBe("Preenchimento Labial");
  });

  it("sem interesse declarado, procedimento cai no serviço do lead", () => {
    expect(buildScriptVars({ lead: lead(), now }).procedimento).toBe("Botox");
  });

  it("lead SEM agendamento: data e hora ficam vazias, nunca 'undefined'", () => {
    const v = buildScriptVars({ lead: lead(), appointments: [], now });
    expect(v.data).toBe("");
    expect(v.hora).toBe("");
    // e o marcador sobrevive à interpolação, em vez de virar texto quebrado
    expect(renderBlock("Te espero {data} às {hora}.", v))
      .toBe("Te espero {data} às {hora}.");
  });

  it("com agendamento, data e hora são preenchidas", () => {
    const v = buildScriptVars({ lead: lead(), appointments: [appt()], now });
    expect(v.data).not.toBe("");
    expect(v.hora).toMatch(/\d{2}:\d{2}/);
  });

  it("valor zero não vira 'R$ 0,00' — fica vazio para sinalizar ausência", () => {
    expect(buildScriptVars({ lead: lead({ value: 0 }), now }).valor).toBe("");
  });

  it("sem lead, devolve todas as chaves vazias sem quebrar", () => {
    const v = buildScriptVars({ lead: null });
    expect(Object.values(v).every(x => x === "")).toBe(true);
  });
});
