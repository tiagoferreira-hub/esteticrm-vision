# A7 CRM — Roadmap de Produto (fonte da verdade técnica)

> Documento durável. Sobrevive a /compact e a novas sessões.
> **Escopo:** o que o sistema faz e em que ordem é construído.
> Preço, contrato, caixa e prospecção estão em `A7_Plan_Business.txt`. Não duplicar aqui.
> Última atualização: 10/08/2026 (renumeração de fases: automações = F6).

---

## 1. Visão de produto

CRM **multi-tenant** para **saúde & bem-estar** (clínicas de estética como nicho de entrada),
com arquitetura de **plataforma**: o mesmo sistema reaplicável em outros nichos depois
(advogados, hotelaria, gestores). Owner (Tiago) onboarda clientes; cada cliente = uma `company`.

**Regra de arquitetura:** toda feature nasce **genérica** e ganha **preset por nicho** depois.

**Posicionamento do produto (o que ele resolve):**
clínica que perde paciente no WhatsApp por demora, falta de follow-up e ausência de script.
O sistema ataca isso em três camadas — **registrar** (CRM), **conduzir** (script + automação)
e **diagnosticar** (auditoria por IA).

---

## 2. Stack & acessos

- Local: `C:\projetos\A7-CRM` · React + Vite + TS + Tailwind/shadcn · Supabase JS
- Banco: Supabase próprio, ref `xydhsjngwwsyqehpdhcf` (`https://xydhsjngwwsyqehpdhcf.supabase.co`)
- Hospedagem: **Vercel**, produção `a7-crm-ashy.vercel.app` (deploy automático ao mergear na `main`)
- Login owner: Tiago
- **Segredos** (não gravados aqui): senha do banco (Session Pooler,
  `aws-1-sa-east-1.pooler.supabase.com:5432`, user `postgres.xydhsjngwwsyqehpdhcf`) e
  Supabase Access Token (`sbp_...`). Reenviar no chat se a sessão perder.

## 3. Convenções de trabalho

- Fluxo por feature: migration → backend → frontend → `npm test` + `npm run build` → branch → PR
- **O assistente NÃO mergeia na `main`** e não faz escrita direta no banco.
  O usuário faz o merge (Create PR → Merge → Confirm).
  `supabase db push` e `functions deploy` são permitidos ao assistente.
- Migrations são aditivas e podem ser aplicadas antes do merge; o código só as usa após o merge.

---

## 4. MAPA DAS FASES

Leitura rápida do estado geral. Detalhe de cada fase nas seções seguintes.

```
  F0  Fundação multi-tenant .................... ✅ CONCLUÍDA
  F1  Captação e origem do lead ................ ✅ CONCLUÍDA
  F2  Agenda e ciclo de vida ................... ✅ CONCLUÍDA
  F3  Motor de automação (infra) ............... ✅ CONCLUÍDA
  F4  Gestão comercial e metas ................. ✅ CONCLUÍDA
  ──────────────────────────────────────────────────────────────
  F5  Script operacional no atendimento ........ 🔨 EM ANDAMENTO  ← foco atual
  F6  Fluxos de trabalho / automações .......... ⏭️ PRÓXIMA
  F7  Integrações e rastreio de conversões ..... 🔒 DEP. EXTERNA (Meta)
  F8  Níveis de acesso e permissões ............ 📋 PLANEJADA
  F9  Agente de IA — Auditoria ................. 📋 PLANEJADA
  F10 Repaginação de design .................... ⏸️ ADIADA (decisão do dono)
  F11 Multi-nicho / preset ..................... 🔭 HORIZONTE
```

**Distinção importante entre F3 e F6:** F3 é o **motor** (tabela `workflow_runs`, gatilhos,
executor). Está pronto. F6 é o **conteúdo**: os fluxos de verdade, escritos, testados e ativados.
Hoje existem 4 fluxos de exemplo, todos em **Rascunho**, nenhum rodou.

**Dependência que muda a ordem:** boa parte dos fluxos termina em *"Enviar WhatsApp"*, e envio
real só existe depois de F7. Por isso F6 é dividida em dois níveis — ver seção 7.

---

## 5. FASES CONCLUÍDAS (F0–F4)

Tudo abaixo está **mergeado na `main` e em produção**. Nenhum PR aberto.

### F0 — Fundação multi-tenant
RLS + `current_company_id()` / `current_role()` + `lifecycle_events` (histórico de etapas).

### F1 — Captação e origem do lead
- Palavra-chave → etapa (`keyword_rules`)
- Origem/UTM do lead: canais, badges, filtro
- Indicações v1: aba Indicações, ranking de indicadores, `referred_by_lead_id`
- Captura pública de indicação (`/indique/<ref>`, Edge Function — sem login)

### F2 — Agenda e ciclo de vida
- Visão semana/dia, arrastar para reagendar, modal, status → funil, `duration_minutes`
- Catálogo de Procedimentos: custo, tempo, plano recorrente + recall,
  indicações/contra-indicações, cronograma pós-procedimento
- Pós-op automático: ao marcar "compareceu", gera follow-ups personalizados
  (`{nome}` / `{procedimento}`) nas datas certas — gatilho no banco, sem cron

### F3 — Motor de automação (infraestrutura)
- Motor de automação (`workflow_runs`) com gatilhos e ações
- Lembretes por tempo (cron)
- Reativação personalizada pelo procedimento de interesse
- 6 modelos prontos na interface + 4 fluxos de exemplo criados

> ⚠️ O motor está pronto. O **conteúdo** dos fluxos é a F6 — os 4 atuais são exemplos
> de teste, não a biblioteca definitiva.

### F4 — Gestão comercial e metas
- Metas e comissão por vendedor (progress bars, edição inline, estimativa)
- Lead scoring (badge Quente/Morno/Frio + número no `LeadCard`)
- Top-10 leads por score
- Relatório de conversão: win rate, ticket, conversão por origem/canal/vendedor, motivos de perda

> 📍 **Onde fica na interface:** `Relatórios → aba Usuários` (`src/pages/Reports.tsx`,
> componente `MetasReport`). **Não existe** aba chamada "Metas/Comissão" — anotado aqui
> porque já se perdeu tempo procurando.
> Migration `20260616120000_metas_comissao.sql` **está aplicada** (tabela `sales_targets` responde 200).

---

## 6. F5 — SCRIPT OPERACIONAL NO ATENDIMENTO 🔨

**Problema que resolve:** hoje o Playbook é um **documento para ler**. Documento ninguém abre
no meio do atendimento. Precisa virar **teleprompter**: contexto certo, na hora certa, em 1 clique.

**Estado atual:** playbook básico existe (8 Regras, Funil, Perfis P1–P4, Objeções, KPIs,
Sempre/Nunca). Conteúdo genérico e incompleto — falta P5–P7 e o funil completo.

### F5.1 — Completar o conteúdo
- [ ] Perfis de paciente P5, P6, P7
- [ ] Funil completo: pré-comparecimento, no-show, follow-up 24/48/72h,
      reativação, pós-procedimento, recall
- [ ] Objeções ampliadas com resposta pronta por perfil

### F5.2 — Painel de script contextual (o "teleprompter")
- [ ] Painel lateral na tela **Conversas**, aberto junto com o chat
- [ ] Detecta a **etapa atual do lead** e mostra só o bloco de script daquela etapa
- [ ] Detecta o **perfil (P1–P7)** — manual no v1, sugerido por IA no v2
- [ ] Variáveis resolvidas em tempo real: `{nome}`, `{procedimento}`, `{valor}`
- [ ] Botão **inserir no campo de mensagem** (1 clique, sem copiar/colar)
- [ ] Bloco de objeções sempre acessível, colapsado
- [ ] Contador de tempo desde a última mensagem do lead (KPI: 1ª resposta < 5min)

### F5.3 — Playbook por cliente
- [ ] Cada `company` tem seu playbook editável (hoje é seed único: Luminae)
- [ ] Versionamento: guardar versão anterior ao editar → permite medir antes/depois
- [ ] Preset "Estética" como padrão ao criar company nova

**Critério de pronto:** a atendente da clínica piloto responde um lead inteiro
usando só o painel, sem abrir outra aba.

---

## 7. F6 — FLUXOS DE TRABALHO / AUTOMAÇÕES ⏭️

**O que é:** construir a biblioteca real de automações da clínica. O motor (F3) já existe;
falta o conteúdo. Os 4 fluxos que estão no sistema hoje são **exemplos de teste** — os títulos
não são definitivos e a biblioteca final não precisa segui-los.

### Dois níveis — por causa da dependência de canal

| Nível | Ações | Roda hoje? |
|---|---|---|
| **N1 — Interno** | criar tarefa, mudar etapa, atribuir vendedor, marcar tag, notificar | ✅ Sim, sem depender de F7 |
| **N2 — Mensagem** | enviar WhatsApp / Instagram / TikTok ao lead | ❌ Só após F7 |

> Um fluxo N2 pode ser **escrito e configurado** agora; só não dispara mensagem real.
> Estratégia: montar todos, ativar os N1 imediatamente, e os N2 no dia em que o canal subir.
> Enquanto isso, o N2 gera **tarefa para a atendente enviar manualmente** — assim o fluxo
> já entrega valor antes da integração.

### Classificação — complexidade × prioridade

Complexidade: 🟢 baixa (gatilho simples + 1-2 ações) · 🟡 média (condição/ramificação ou
janela de tempo) · 🔴 alta (múltiplas condições, dados externos, decisão por IA)

Prioridade: **P0** destrava o piloto · **P1** entra no primeiro mês do cliente · **P2** depois

| # | Fluxo | Gatilho | Nível | Compl. | Prior. |
|---|---|---|---|---|---|
| 1 | Boas-vindas ao novo lead | lead criado | N2 | 🟢 | P0 |
| 2 | Alerta de 1ª resposta (>5min sem responder) | lead sem resposta | N1 | 🟢 | P0 |
| 3 | Follow-up 24h / 48h / 72h sem resposta | tempo | N2 | 🟡 | P0 |
| 4 | Confirmação de agendamento (D-1) | agendamento | N2 | 🟢 | P0 |
| 5 | Recuperação de no-show | não compareceu | N2 | 🟡 | P0 |
| 6 | Distribuição / atribuição automática de lead | lead criado | N1 | 🟡 | P1 |
| 7 | Pós-procedimento (já existe via gatilho no banco) | compareceu | N2 | 🟡 | P1 |
| 8 | Reativação de lead frio | inatividade X dias | N2 | 🟡 | P1 |
| 9 | Reativação por procedimento de interesse | mudança de etapa | N2 | 🟡 | P1 |
| 10 | Recall por procedimento (Botox 120d, Skinbooster 180d…) | data do catálogo | N2 | 🟡 | P1 |
| 11 | Pedido de indicação após fechar | fechou | N2 | 🟢 | P1 |
| 12 | Resgate de "achei caro" / objeção de preço | motivo de perda | N2 | 🔴 | P2 |
| 13 | Aniversário / data comemorativa | data | N2 | 🟢 | P2 |
| 14 | Escalar lead parado em etapa há X dias | tempo em etapa | N1 | 🟡 | P2 |
| 15 | Roteamento por perfil de paciente (P1–P7) | classificação | N2 | 🔴 | P2 |

> A tabela é ponto de partida, não decisão fechada. Revisar fluxo a fluxo antes de construir.

### Tarefas da fase
- [ ] Revisar a lista acima e fechar a biblioteca definitiva
- [ ] Marcar cada fluxo como N1 ou N2 no próprio modelo de dados (campo novo)
- [ ] Limpar os 4 fluxos de exemplo ou promovê-los à versão final
- [ ] Ativar todos os N1 — hoje nenhum fluxo está ativo
- [ ] Fallback automático: fluxo N2 sem canal conectado → cria tarefa em vez de falhar em silêncio
- [ ] Log de execução visível ao cliente (o que disparou, quando, para quem)
- [ ] Proteção anti-spam: teto de mensagens por lead por período
- [ ] Preset "Estética" — biblioteca padrão aplicada ao criar company nova

**Critério de pronto:** a clínica piloto roda uma semana inteira com os P0 ativos e nenhum
lead fica sem follow-up por esquecimento.

---

## 8. F7 — INTEGRAÇÕES E RASTREIO DE CONVERSÕES 🔒

**Camada do sistema, não do agente.** As integrações entram no CRM; agente e fluxos consomem.

### Pré-requisito único — A7 como Tech Provider na Meta
O WABA de cada cliente fica **no CNPJ do cliente** (modelo correto, decidido).
Mas o **App da A7** precisa ser verificado no Business Manager e passar em App Review para
`whatsapp_business_messaging` + `whatsapp_business_management`. Isso usa o CNPJ da A7,
é feito **uma vez** e serve para todos os clientes via **Embedded Signup**
(o cliente autoriza dentro do seu sistema; você nunca toca na conta dele).

- [ ] MEI → ME (ver `A7_Plan_Business.txt`, é bloqueio administrativo, não técnico)
- [ ] Verificação do Business Manager da A7
- [ ] App Review

### F7.0 — Conversões personalizadas por palavra-chave ⚡ INDEPENDENTE
Não depende de nada acima. `keyword_rules` já existe no banco.
- [ ] Disparar evento de conversão para o Gerenciador de Anúncios quando a regra casa
- [ ] Mapear regra → evento customizado (ex.: "agendou" → `Schedule`)
- [ ] Clínica passa a otimizar campanha por **agendamento**, não por clique

> Essa é a peça mais barata e a que mais vende. Pode ser feita junto com F5.

### F7.1 — WhatsApp Cloud API
- [ ] Embedded Signup no painel do cliente
- [ ] Webhook de recebimento → inbox real
- [ ] Envio + janela de 24h + templates HSM aprovados
- [ ] Aviso de export obrigatório antes da migração do número

### F7.2 — Instagram Direct
Conta profissional + permissões de mensagens. Mais simples se o BM já estiver verificado.
Tem endpoint de conversas com janela retroativa — diferente do WhatsApp.

### F7.3 — TikTok Business Messaging
Menor prioridade. Registro no Developer Portal, credenciais da Business Messaging API,
autorização da conta e webhooks. **Janela de 48h** após a última interação do usuário —
fora dela não se envia nada até ele iniciar contato de novo.
Só faz sentido quando a clínica rodar Instant Messaging Ads.

### F7.4 — Rastreio de conversões no Gerenciador (completo)
- [ ] Eventos do funil enviados ao Gerenciador: `Lead`, `Schedule`, `Purchase`
- [ ] Conversions API (server-side) — não depende de pixel no site
- [ ] Atribuição de volta: qual campanha/anúncio gerou o lead que fechou
- [ ] Relatório de custo por agendamento e custo por venda, por campanha

### F7.5 — Auditoria contínua
Plugar F9 no stream dos canais. Mesmo agente, outra fonte de entrada.

---

---

## 9. F8 — NÍVEIS DE ACESSO E PERMISSÕES 📋

**Problema que resolve:** hoje quem entra na company vê tudo. Numa clínica com 3 atendentes,
uma vendedora não deveria ver a meta e a comissão da outra, nem o faturamento total.

Base já existe: `current_role()` foi criado na F0. Falta o modelo de papéis e a aplicação
na interface.

### F8.1 — Papéis
- [ ] **Owner (A7)** — painel do proprietário, todas as companies
- [ ] **Admin da clínica** — tudo dentro da própria company
- [ ] **Gestor / recepção** — funil inteiro, agenda, relatórios da equipe, sem financeiro
- [ ] **Vendedor / atendente** — só o que é dele (ver F8.2)
- [ ] **Somente leitura** — para o parceiro (Mariana/Vini) acompanhar sem editar

### F8.2 — Visão do vendedor
- [ ] Perfil próprio: dados, foto, canal de atendimento
- [ ] Meus leads — só os atribuídos a ele
- [ ] Meus resultados — minha meta, meu progresso, minha comissão estimada
- [ ] Meta da equipe — número agregado, **sem** abrir o resultado individual dos colegas
- [ ] Minhas tarefas — fila do dia, com o que vence hoje em destaque
- [ ] Meu ranking (opcional, ligável/desligável pelo admin — gamificação pode virar pressão tóxica)

### F8.3 — Aplicação técnica
- [ ] Políticas RLS por papel (não só por company)
- [ ] Menu lateral e abas renderizados conforme papel
- [ ] Convite de usuário com escolha de papel
- [ ] Log de auditoria: quem mudou etapa, quem editou meta

**Critério de pronto:** logar como vendedora e não conseguir ver comissão de ninguém,
nem por interface nem por chamada direta ao banco.

---

## 10. F9 — AGENTE DE IA · AUDITORIA 📋

Primeiro agente do sistema. **Não é o atendente (Alma)** — é o analista.

**Fluxo:** histórico de conversas → análise → relatório → sugestões de melhoria no script.

### Fonte de dados — decisão importante

A Cloud API do WhatsApp é **forward-only**: passa a receber mensagens a partir do momento em que
o webhook é assinado, e **não existe endpoint de backfill**. Migrar o número para a API ainda
**desativa o WhatsApp Business app** naquele número, deixando o histórico preso no aparelho.

Consequência: **auditoria por API é impossível no dia 1** — conectaria e teria zero conversas.
Portanto são dois momentos distintos, e ambos permanecem no produto:

| | Auditoria inicial | Auditoria contínua |
|---|---|---|
| Fonte | Upload de `.txt` exportado do WhatsApp | Stream da API (F7) |
| Quando | Pré-venda / semana 1 do onboarding | Recorrente, mensal |
| Serve para | Diagnosticar e **vender** | Monitorar e melhorar |

> O upload **não é provisório**. Continua existindo depois da API, porque é o único jeito de
> enxergar o passado. Vira etapa obrigatória do onboarding: *"exporte as conversas antes de
> migrarmos o número"* — senão o cliente perde o histórico dele.

### F9.1 — Ingestão
- [ ] Upload de `.txt` (export nativo do WhatsApp) + parser
- [ ] Parser de print/imagem (OCR) como fallback
- [ ] Normalização para um formato interno único — **interface de entrada abstrata**,
      para que F7.5 troque só a fonte, não a análise

### F9.2 — Análise
- [ ] Cálculo dos KPIs objetivos: tempo de 1ª resposta, taxa Novo→Agendada,
      Agendada→Compareceu, Compareceu→Fechou, nº de follow-ups por lead perdido
- [ ] Análise qualitativa por IA: aderência às 8 Regras, perfil não identificado,
      objeção mal contornada, conversa abandonada sem follow-up
- [ ] Classificação de cada conversa perdida por **motivo**

### F9.3 — Relatório
- [ ] Relatório antes/depois com número (é o artefato comercial)
- [ ] Top 5 buracos com exemplo real de conversa
- [ ] Estimativa de receita perdida (nº de leads perdidos × ticket médio do catálogo)
- [ ] Exportável em PDF

### F9.4 — Sugestões
- [ ] Sugestões de ajuste no script, ancoradas nos erros encontrados
- [ ] Aplicar sugestão direto no playbook (gera nova versão — ver F5.3)

**Critério de pronto:** rodar na clínica da Mariana e produzir um relatório que ela leia
e entenda sem você explicar.

---

---

## 11. F10 — REPAGINAÇÃO DE DESIGN ⏸️

Feedback do dono: **margens ruins, pouco prático**. Carta branca para redesenhar
(densidade, margens, praticidade, responsividade). Depois: guia + pop-ups de navegação.

**Adiado por decisão explícita** — não destrava receita. Reavaliar após o case da Mariana.

## 12. F11 — MULTI-NICHO 🔭

Configurabilidade por vertical: preset de etapas, catálogo, playbook, biblioteca de fluxos
e automações por nicho. Só depois de estética estar consolidada.

---

## 13. Notas técnicas úteis

- Etapas do funil (reais): `lead_entrou, hot_lead, agendado, compareceu, fechou, lead_frio, perdido`
  (labels em `src/types/lead.ts`). Mudança de etapa centralizada em
  `LeadsContext.moveLead(..., {trigger})`.
- Tabelas-chave: `lifecycle_events, keyword_rules, procedures, procedure_followups,
  workflow_runs, sales_targets`; colunas novas em `leads` (UTM, `referred_by_lead_id`)
  e `appointments` (`duration_minutes, procedure_id`).
- Utils puros testados: `keywordMatcher, leadCapture, conversion, referral, calendar, postop`.
- Seed do playbook: `supabase/seeds/luminae_playbook.sql`.

## 14. Dados de demonstração

Company **"Clínica Bella Pelle (Demo)"** (Painel do Proprietário → Acessar CRM):
5 procedimentos com pós-op (Botox, Preench. Labial, Limpeza, Skinbooster, Olheiras),
11 leads no funil, 3 agendamentos, 2 indicações. Criada via seed (script removido após uso).

**Vazios conhecidos na demo** (não são bugs, são configuração pendente):
Serviços, Regras de palavra-chave, Tarefas, Disparos (envio real depende de F7).
