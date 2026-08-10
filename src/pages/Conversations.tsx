import React, { useEffect, useMemo, useState } from "react";
import { useConversations, Message } from "@/context/ConversationsContext";
import { useLeads } from "@/context/LeadsContext";
import { useAuth } from "@/context/AuthContext";
import { useTasks } from "@/context/TasksContext";
import { useAppointments } from "@/context/AppointmentsContext";
import { useFollowUps } from "@/context/FollowUpsContext";
import { useCompanyMembers } from "@/hooks/useCompanyMembers";
import { ORIGIN_LABELS, STAGE_LABELS, STAGE_ORDER, LeadStage } from "@/types/lead";
import { APPOINTMENT_TYPE_LABELS, APPOINTMENT_TYPE_OPTIONS, AppointmentType } from "@/types/appointment";
import {
  Search, Send, Phone, CheckSquare, CalendarPlus, Clock, Sparkles,
  Inbox, User, UserX, PhoneIncoming, Bot, Activity, Users, Star,
  ChevronDown, ChevronRight, MessageCircle, Instagram, Lock, CheckCircle2,
} from "lucide-react";
import LeadDetailModal from "@/components/crm/LeadDetailModal";
import StageStepper from "@/components/crm/StageStepper";
import ConversationRightSidebar, { RightPanelKey } from "@/components/crm/ConversationRightSidebar";
import { SCRIPT_INSERT_EVENT } from "@/hooks/useScriptPanel";
import { useWaitingTime, waitingTierClasses } from "@/hooks/useWaitingTime";

const WaitingBadge: React.FC<{ since: string }> = ({ since }) => {
  const w = useWaitingTime(since);
  if (!w) return null;
  const c = waitingTierClasses[w.tier];
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${c.bg} ${c.text}`}>
      {w.label}
    </span>
  );
};
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type InboxKey = "all" | "mine" | "noowner" | "calls" | "unread" | "awaiting" | "pending_fup";

const formatTime = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin}m`;
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

const channelIcon = (channel?: string) => {
  if (channel === "instagram") return <Instagram className="w-3 h-3" />;
  return <MessageCircle className="w-3 h-3" />;
};

interface ConversationsProps {
  pendingLeadId?: string | null;
  onPendingHandled?: () => void;
}

const Conversations: React.FC<ConversationsProps> = ({ pendingLeadId, onPendingHandled }) => {
  const { conversations, loadMessages, sendMessage, markRead, assignConversation, setConversationStatus } = useConversations();
  const { leads, updateLead } = useLeads();
  const { user, role } = useAuth();
  const { addTask } = useTasks();
  const { addAppointment, appointments } = useAppointments();
  const { addFollowUp, followUps } = useFollowUps();
  const members = useCompanyMembers();
  const memberById = useMemo(() => Object.fromEntries(members.map(m => [m.userId, m])), [members]);

  const canEditOwner = role === "owner" || role === "admin" || role === "client";

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [activeInbox, setActiveInbox] = useState<InboxKey>("all");
  const [activeStage, setActiveStage] = useState<LeadStage | null>(null);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [rightPanel, setRightPanel] = useState<RightPanelKey | null>(null);

  const [expandedInbox, setExpandedInbox] = useState(true);
  const [expandedAI, setExpandedAI] = useState(true);
  const [expandedLifecycle, setExpandedLifecycle] = useState(true);
  const [expandedTeam, setExpandedTeam] = useState(false);
  const [expandedCustom, setExpandedCustom] = useState(false);

  const [taskOpen, setTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDate, setTaskDate] = useState("");
  const [apptOpen, setApptOpen] = useState(false);
  const [apptDate, setApptDate] = useState("");
  const [apptTime, setApptTime] = useState("09:00");
  const [apptType, setApptType] = useState<AppointmentType>("avaliacao");
  const [apptNotes, setApptNotes] = useState("");
  const [fupOpen, setFupOpen] = useState(false);
  const [fupDate, setFupDate] = useState("");
  const [fupTime, setFupTime] = useState("09:00");
  const [fupNotes, setFupNotes] = useState("");

  const leadsWithPendingFup = useMemo(
    () => new Set(followUps.filter(f => f.status !== "concluido").map(f => f.leadId)),
    [followUps]
  );

  const leadById = useMemo(() => Object.fromEntries(leads.map(l => [l.id, l])), [leads]);

  // Counters
  const counters = useMemo(() => {
    const c = {
      all: conversations.length,
      mine: 0,
      noowner: 0,
      unread: 0,
      awaiting: 0,
      pending_fup: 0,
      stages: {} as Record<string, number>,
    };
    conversations.forEach(conv => {
      const lead = leadById[conv.leadId];
      if (!lead) return;
      if (conv.assignedTo === user?.id) c.mine += 1;
      if (!conv.assignedTo) c.noowner += 1;
      if (conv.unreadCount > 0 || conv.isUnread) c.unread += 1;
      if (conv.awaitingReply) c.awaiting += 1;
      if (leadsWithPendingFup.has(lead.id)) c.pending_fup += 1;
      c.stages[lead.stage] = (c.stages[lead.stage] ?? 0) + 1;
    });
    return c;
  }, [conversations, leadById, user, leadsWithPendingFup]);

  const filtered = useMemo(() => {
    const list = conversations.filter(c => {
      const lead = leadById[c.leadId];
      if (!lead) return false;
      // inbox filter
      if (activeInbox === "mine" && c.assignedTo !== user?.id) return false;
      if (activeInbox === "noowner" && c.assignedTo) return false;
      if (activeInbox === "unread" && c.unreadCount === 0 && !c.isUnread) return false;
      if (activeInbox === "awaiting" && !c.awaitingReply) return false;
      if (activeInbox === "pending_fup" && !leadsWithPendingFup.has(lead.id)) return false;
      if (activeInbox === "calls") return false; // not implemented yet
      // stage filter
      if (activeStage && lead.stage !== activeStage) return false;
      // search
      if (search) {
        const s = search.toLowerCase();
        const phone = lead.phone.replace(/\D/g, "");
        const sDigits = s.replace(/\D/g, "");
        const matchesName = lead.name.toLowerCase().includes(s);
        const matchesPhone = sDigits ? phone.includes(sDigits) : false;
        if (!matchesName && !matchesPhone) return false;
      }
      return true;
    });
    // Sort: open first, then closed below
    return [...list].sort((a, b) => {
      const aClosed = a.status === "closed" ? 1 : 0;
      const bClosed = b.status === "closed" ? 1 : 0;
      if (aClosed !== bClosed) return aClosed - bClosed;
      return b.lastMessageAt.localeCompare(a.lastMessageAt);
    });
  }, [conversations, leadById, search, activeInbox, activeStage, leadsWithPendingFup, user]);

  const selected = selectedId ? conversations.find(c => c.id === selectedId) : null;
  const selectedLead = selected ? leadById[selected.leadId] : null;

  useEffect(() => {
    if (!selectedId) return;
    loadMessages(selectedId).then(setMessages);
    markRead(selectedId);
  }, [selectedId, loadMessages, markRead]);

  useEffect(() => {
    if (!pendingLeadId) return;
    const conv = conversations
      .filter(c => c.leadId === pendingLeadId)
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))[0];
    if (conv) {
      setActiveInbox("all");
      setActiveStage(null);
      setSelectedId(conv.id);
      onPendingHandled?.();
    }
  }, [pendingLeadId, conversations, onPendingHandled]);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ text: string }>;
      if (!ce.detail?.text) return;
      setInput(prev => prev ? prev + (prev.endsWith("\n") ? "" : "\n") + ce.detail.text : ce.detail.text);
    };
    window.addEventListener(SCRIPT_INSERT_EVENT, handler);
    return () => window.removeEventListener(SCRIPT_INSERT_EVENT, handler);
  }, []);


  const handleSend = async () => {
    if (!selectedId || !input.trim()) return;
    const msg = await sendMessage(selectedId, input);
    if (msg) setMessages(prev => [...prev, msg]);
    setInput("");
  };

  const leadAppointments = useMemo(
    () => selectedLead ? appointments.filter(a => a.leadId === selectedLead.id) : [],
    [appointments, selectedLead]
  );

  const handleCreateTask = async () => {
    if (!selectedLead || !taskTitle.trim()) return;
    await addTask({
      title: taskTitle.trim(),
      leadId: selectedLead.id,
      assignedTo: selected?.assignedTo ?? user?.id ?? "",
      dueDate: taskDate ? new Date(taskDate).toISOString() : null,
      status: "todo",
    });
    setTaskTitle(""); setTaskDate(""); setTaskOpen(false);
  };

  const handleCreateAppt = async () => {
    if (!selectedLead || !apptDate || !apptTime) return;
    const iso = new Date(`${apptDate}T${apptTime}:00`).toISOString();
    await addAppointment({
      leadId: selectedLead.id,
      assignedTo: selected?.assignedTo ?? user?.id ?? null,
      scheduledAt: iso,
      type: apptType,
      notes: apptNotes,
    });
    setApptDate(""); setApptTime("09:00"); setApptType("avaliacao"); setApptNotes(""); setApptOpen(false);
  };

  const SectionHeader: React.FC<{
    label: string;
    open: boolean;
    onToggle: () => void;
    icon?: React.ReactNode;
  }> = ({ label, open, onToggle, icon }) => (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
    >
      {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      {icon}
      <span>{label}</span>
    </button>
  );

  const NavItem: React.FC<{
    label: string;
    icon: React.ReactNode;
    count?: number;
    active?: boolean;
    onClick?: () => void;
    disabled?: boolean;
  }> = ({ label, icon, count, active, onClick, disabled }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-[13px] rounded-md mx-1.5 transition-colors ${
        active
          ? "bg-primary/10 text-primary font-medium"
          : disabled
          ? "text-muted-foreground/50 cursor-not-allowed"
          : "text-foreground/80 hover:bg-accent hover:text-foreground"
      }`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <span className={active ? "text-primary" : "text-muted-foreground"}>{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      {typeof count === "number" && count > 0 && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
          {count}
        </span>
      )}
    </button>
  );

  return (
    <div className="flex h-full bg-background">
      {/* Secondary sidebar (Respond.io-style) */}
      <aside className="w-56 border-r border-border bg-card/40 flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Conversas</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">Central de atendimento</p>
        </div>
        <div className="flex-1 overflow-y-auto py-2 space-y-1">
          {/* Inbox */}
          <div>
            <SectionHeader label="Inbox" open={expandedInbox} onToggle={() => setExpandedInbox(v => !v)} icon={<Inbox className="w-3 h-3" />} />
            {expandedInbox && (
              <div className="space-y-0.5">
                <NavItem label="Todas" icon={<Inbox className="w-3.5 h-3.5" />} count={counters.all} active={activeInbox === "all" && !activeStage} onClick={() => { setActiveInbox("all"); setActiveStage(null); }} />
                <NavItem label="Minhas" icon={<User className="w-3.5 h-3.5" />} count={counters.mine} active={activeInbox === "mine"} onClick={() => { setActiveInbox("mine"); setActiveStage(null); }} />
                <NavItem label="Sem responsável" icon={<UserX className="w-3.5 h-3.5" />} count={counters.noowner} active={activeInbox === "noowner"} onClick={() => { setActiveInbox("noowner"); setActiveStage(null); }} />
                <NavItem label="Ligações recebidas" icon={<PhoneIncoming className="w-3.5 h-3.5" />} count={0} active={activeInbox === "calls"} onClick={() => { setActiveInbox("calls"); setActiveStage(null); }} disabled />
              </div>
            )}
          </div>

          {/* AI Agents */}
          <div>
            <SectionHeader label="AI Agents" open={expandedAI} onToggle={() => setExpandedAI(v => !v)} icon={<Bot className="w-3 h-3" />} />
            {expandedAI && (
              <div className="space-y-0.5">
                <NavItem
                  label="Assistente Comercial IA"
                  icon={<Sparkles className="w-3.5 h-3.5" />}
                  count={counters.awaiting}
                  active={activeInbox === "awaiting"}
                  onClick={() => { setActiveInbox("awaiting"); setActiveStage(null); }}
                />
                <NavItem label="SDR IA" icon={<Sparkles className="w-3.5 h-3.5" />} disabled />
                <NavItem label="Follow-up IA" icon={<Sparkles className="w-3.5 h-3.5" />} disabled />
              </div>
            )}
          </div>

          {/* Lifecycle */}
          <div>
            <SectionHeader label="Lifecycle" open={expandedLifecycle} onToggle={() => setExpandedLifecycle(v => !v)} icon={<Activity className="w-3 h-3" />} />
            {expandedLifecycle && (
              <div className="space-y-0.5">
                {STAGE_ORDER.map(stage => (
                  <NavItem
                    key={stage}
                    label={STAGE_LABELS[stage]}
                    icon={<span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />}
                    count={counters.stages[stage] ?? 0}
                    active={activeStage === stage}
                    onClick={() => { setActiveStage(stage); setActiveInbox("all"); }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Team Inbox */}
          <div>
            <SectionHeader label="Team Inbox" open={expandedTeam} onToggle={() => setExpandedTeam(v => !v)} icon={<Users className="w-3 h-3" />} />
            {expandedTeam && (
              <div className="space-y-0.5">
                <NavItem label="Comercial" icon={<Users className="w-3.5 h-3.5" />} disabled />
                <NavItem label="Suporte" icon={<Users className="w-3.5 h-3.5" />} disabled />
                <NavItem label="Equipe A" icon={<Users className="w-3.5 h-3.5" />} disabled />
                <NavItem label="Equipe B" icon={<Users className="w-3.5 h-3.5" />} disabled />
              </div>
            )}
          </div>

          {/* Custom Inbox */}
          <div>
            <SectionHeader label="Custom Inbox" open={expandedCustom} onToggle={() => setExpandedCustom(v => !v)} icon={<Star className="w-3 h-3" />} />
            {expandedCustom && (
              <div className="space-y-0.5">
                <NavItem label="Follow-up pendente" icon={<Clock className="w-3.5 h-3.5" />} count={counters.pending_fup} active={activeInbox === "pending_fup"} onClick={() => { setActiveInbox("pending_fup"); setActiveStage(null); }} />
                <NavItem label="Leads VIP" icon={<Star className="w-3.5 h-3.5" />} disabled />
                <NavItem label="Campanhas" icon={<Sparkles className="w-3.5 h-3.5" />} disabled />
                <NavItem label="Reativação" icon={<Sparkles className="w-3.5 h-3.5" />} disabled />
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Conversation list */}
      <aside className="w-80 border-r border-border bg-card flex flex-col shrink-0">
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar nome ou telefone"
              className="w-full pl-8 pr-2 py-2 rounded-md bg-muted text-sm text-foreground placeholder:text-muted-foreground border-0 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="p-4 text-xs text-muted-foreground text-center">Nenhuma conversa</p>
          )}
          {filtered.map(c => {
            const lead = leadById[c.leadId];
            if (!lead) return null;
            const isActive = c.id === selectedId;
            const isUnreadVisual = c.unreadCount > 0 || c.isUnread;
            const owner = c.assignedTo ? memberById[c.assignedTo] : null;
            // simulated online indicator: last message within 5 minutes
            const isOnline = (Date.now() - new Date(c.lastMessageAt).getTime()) < 5 * 60 * 1000;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left px-3 py-3 border-b border-border flex gap-3 items-start hover:bg-accent/60 transition-colors ${isActive ? "bg-accent" : ""} ${c.status === "closed" ? "opacity-60" : ""}`}
              >
                <div className="relative shrink-0">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-primary flex items-center justify-center text-sm font-semibold ring-1 ring-border">
                    {lead.name.charAt(0).toUpperCase()}
                  </div>
                  {isOnline && c.status !== "closed" && (
                    <span className="absolute -bottom-0 -right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-card" title="Online" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm truncate ${isUnreadVisual ? "font-semibold text-foreground" : "font-medium text-foreground"}`}>{lead.name}</p>
                    <span className="text-[10px] text-muted-foreground shrink-0">{formatTime(c.lastMessageAt)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                    <span className="flex items-center gap-0.5">{channelIcon(c.channel)} {c.channel === "instagram" ? "Instagram" : "WhatsApp"}</span>
                    <span>•</span>
                    <span className="truncate">{ORIGIN_LABELS[lead.origin]}</span>
                  </div>
                  <p className={`text-xs truncate mt-1 ${isUnreadVisual ? "text-foreground" : "text-muted-foreground"}`}>{c.lastMessage || "—"}</p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-foreground font-medium truncate">{STAGE_LABELS[lead.stage]}</span>
                    {owner && (
                      <span className="text-[9px] flex items-center gap-1 text-muted-foreground">
                        <span className="w-3.5 h-3.5 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[8px] font-bold">
                          {owner.displayName.charAt(0).toUpperCase()}
                        </span>
                        <span className="truncate max-w-[60px]">{owner.displayName.split(" ")[0]}</span>
                      </span>
                    )}
                    {c.awaitingReply && c.status === "open" && (
                      <WaitingBadge since={c.lastMessageAt} />
                    )}
                  </div>
                </div>
                {c.unreadCount > 0 && (
                  <span className="bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 shrink-0">
                    {c.unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Chat panel + right rail wrapper */}
      <div className="flex-1 flex min-w-0 relative">
      <section className="flex-1 flex flex-col bg-muted/20 min-w-0">
        {!selected || !selectedLead ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Selecione uma conversa</p>
          </div>
        ) : (
          <>
            <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-card gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setOpenLeadId(selectedLead.id)}
                  className="flex items-center gap-3 text-left hover:opacity-80 min-w-0"
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
                    {selectedLead.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{selectedLead.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{selectedLead.phone}</p>
                  </div>
                </button>
                {/* Lifecycle stepper */}
                <StageStepper
                  value={selectedLead.stage}
                  size="sm"
                  onChange={s => updateLead(selectedLead.id, { stage: s })}
                />
                {/* Owner: admins edit, sellers read-only */}
                {canEditOwner ? (
                  <select
                    value={selected.assignedTo ?? ""}
                    onChange={e => assignConversation(selected.id, selectedLead.id, e.target.value || null)}
                    className="text-[11px] px-2 py-1.5 rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    title="Responsável"
                  >
                    <option value="">Sem responsável</option>
                    {members.map(m => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
                  </select>
                ) : (
                  <span className="text-[11px] px-2 py-1.5 rounded-md border border-border bg-muted text-muted-foreground flex items-center gap-1.5" title="Responsável (somente leitura)">
                    <User className="w-3 h-3" />
                    {selected.assignedTo ? (memberById[selected.assignedTo]?.displayName ?? "—") : "Sem responsável"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setFupOpen(true)}
                  className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md border border-border text-foreground hover:bg-accent"
                ><Clock className="w-3.5 h-3.5" /> Follow-up</button>
                <button
                  onClick={() => setTaskOpen(true)}
                  className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md border border-border text-foreground hover:bg-accent"
                ><CheckSquare className="w-3.5 h-3.5" /> Tarefa</button>
                <button
                  onClick={() => setApptOpen(true)}
                  className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90"
                ><CalendarPlus className="w-3.5 h-3.5" /> Agendar</button>
                {selected.status === "closed" ? (
                  <button
                    onClick={() => setConversationStatus(selected.id, "open")}
                    className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md border border-crm-success/40 text-crm-success bg-crm-success-light hover:opacity-90"
                    title="Reabrir conversa"
                  ><CheckCircle2 className="w-3.5 h-3.5" /> Abrir</button>
                ) : (
                  <button
                    onClick={() => setConversationStatus(selected.id, "closed")}
                    className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md border border-border text-foreground hover:bg-accent"
                    title="Fechar conversa"
                  ><Lock className="w-3.5 h-3.5" /> Fechar</button>
                )}
              </div>
            </header>

            {leadAppointments.length > 0 && (
              <div className="px-5 py-2 border-b border-border bg-card/50 text-xs text-muted-foreground flex flex-wrap gap-2">
                <span className="font-medium text-foreground">Agendamentos:</span>
                {leadAppointments.slice(0, 3).map(a => (
                  <span key={a.id} className="px-2 py-0.5 rounded bg-muted">
                    {APPOINTMENT_TYPE_LABELS[a.type]} — {new Date(a.scheduledAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-5 space-y-2">
              {messages.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-8">Nenhuma mensagem ainda</p>
              )}
              {messages.map(m => (
                <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[70%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                    m.direction === "outbound"
                      ? "bg-primary text-primary-foreground rounded-br-none"
                      : "bg-card text-foreground rounded-bl-none border border-border"
                  }`}>
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className={`text-[10px] mt-1 ${m.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {new Date(m.sentAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <footer className="border-t border-border bg-card p-3 flex gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Digite uma mensagem..."
                className="flex-1 rounded-md bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground border-0 focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="bg-primary text-primary-foreground rounded-md px-4 flex items-center gap-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-40"
              >
                <Send className="w-4 h-4" /> Enviar
              </button>
            </footer>
          </>
        )}
      </section>
        <ConversationRightSidebar
          lead={selectedLead}
          conversation={selected}
          messages={messages}
          activePanel={rightPanel}
          onSelectPanel={setRightPanel}
          onOpenLifecycle={() => { setRightPanel(null); setOpenLeadId(selectedLead?.id ?? null); }}
        />
      </div>

      <LeadDetailModal
        lead={openLeadId ? leadById[openLeadId] ?? null : null}
        open={!!openLeadId}
        onClose={() => setOpenLeadId(null)}
      />

      {/* Quick task dialog */}
      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nova tarefa{selectedLead ? ` — ${selectedLead.name}` : ""}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Título</label>
              <input value={taskTitle} onChange={e => setTaskTitle(e.target.value)}
                className="w-full mt-0.5 text-sm border border-input rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Vencimento</label>
              <input type="datetime-local" value={taskDate} onChange={e => setTaskDate(e.target.value)}
                className="w-full mt-0.5 text-sm border border-input rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setTaskOpen(false)} className="text-sm font-medium px-4 py-2 rounded-lg bg-muted text-muted-foreground hover:bg-accent">Cancelar</button>
              <button onClick={handleCreateTask} disabled={!taskTitle.trim()} className="text-sm font-medium px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40">Criar</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick appointment dialog */}
      <Dialog open={apptOpen} onOpenChange={setApptOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Novo agendamento{selectedLead ? ` — ${selectedLead.name}` : ""}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Data</label>
                <input type="date" value={apptDate} onChange={e => setApptDate(e.target.value)}
                  className="w-full mt-0.5 text-sm border border-input rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Horário</label>
                <input type="time" value={apptTime} onChange={e => setApptTime(e.target.value)}
                  className="w-full mt-0.5 text-sm border border-input rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Tipo</label>
              <select value={apptType} onChange={e => setApptType(e.target.value as AppointmentType)}
                className="w-full mt-0.5 text-sm border border-input rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring">
                {APPOINTMENT_TYPE_OPTIONS.map(t => <option key={t} value={t}>{APPOINTMENT_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Observações</label>
              <textarea value={apptNotes} onChange={e => setApptNotes(e.target.value)} rows={2}
                className="w-full mt-0.5 text-sm border border-input rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setApptOpen(false)} className="text-sm font-medium px-4 py-2 rounded-lg bg-muted text-muted-foreground hover:bg-accent">Cancelar</button>
              <button onClick={handleCreateAppt} disabled={!apptDate || !apptTime} className="text-sm font-medium px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40">Criar</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick follow-up dialog */}
      <Dialog open={fupOpen} onOpenChange={setFupOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Novo follow-up{selectedLead ? ` — ${selectedLead.name}` : ""}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Data</label>
                <input type="date" value={fupDate} onChange={e => setFupDate(e.target.value)}
                  className="w-full mt-0.5 text-sm border border-input rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Horário</label>
                <input type="time" value={fupTime} onChange={e => setFupTime(e.target.value)}
                  className="w-full mt-0.5 text-sm border border-input rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Observação</label>
              <textarea value={fupNotes} onChange={e => setFupNotes(e.target.value)} rows={2}
                className="w-full mt-0.5 text-sm border border-input rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setFupOpen(false)} className="text-sm font-medium px-4 py-2 rounded-lg bg-muted text-muted-foreground hover:bg-accent">Cancelar</button>
              <button onClick={async () => {
                if (!selectedLead || !fupDate) return;
                await addFollowUp({
                  leadId: selectedLead.id,
                  scheduledAt: new Date(`${fupDate}T${fupTime}:00`).toISOString(),
                  notes: fupNotes,
                  assignedTo: selected?.assignedTo ?? user?.id ?? null,
                });
                setFupOpen(false); setFupDate(""); setFupTime("09:00"); setFupNotes("");
              }} disabled={!selectedLead || !fupDate}
                className="text-sm font-medium px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40">Criar</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Conversations;
