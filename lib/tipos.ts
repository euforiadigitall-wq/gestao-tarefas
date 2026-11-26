export type Papel = "admin" | "membro";

export interface Pessoa {
  id: string;
  nome: string;
  apelido: string | null;
  email: string | null;
  papel: Papel;
  ativo: boolean;
}

export interface Opcao {
  id: string;
  nome: string;
}

export interface Area {
  id: string;
  codigo: string;
  nome: string;
}

// Linha da view gestao.v_tarefas
export interface TarefaView {
  id: string;
  titulo: string;
  cliente_id: string | null;
  cliente: string | null;
  area: string | null;
  responsavel_id: string | null;
  responsavel: string | null;
  status: "a_fazer" | "em_andamento" | "concluida";
  etapa_atual: number | null;
  estado_atual: string;
  proxima_acao: string | null;
  prazo: string | null;
  prazo_vez: string | null;
  atrasada: boolean;
  bloco: string | null;
  notas: string | null;
  lancamentos?: EtiquetaLanc[] | null;
}

export interface TarefaFila {
  id: string; // id da etapa
  tarefa_id: string;
  titulo: string;
  cliente: string | null;
  acao: string;
  prazo: string | null;
  lancamentos?: EtiquetaLanc[] | null;
}

export interface ClienteAdmin {
  id: string;
  nome: string;
  ativo: boolean;
}

export interface PessoaAdmin {
  id: string;
  nome: string;
  apelido: string | null;
  email: string | null;
  papel: Papel;
  ativo: boolean;
}

// Linha de gestao.acessos. area_id nulo = todas as areas do cliente.
export interface Acesso {
  pessoa_id: string;
  cliente_id: string;
  area_id: string | null;
}

export interface TarefaLink {
  id: string;
  tarefa_id: string;
  titulo: string;
  url: string;
}

export const PAPEIS_CLIENTE = [
  { codigo: "copy", nome: "Copy" },
  { codigo: "aprovador", nome: "Aprovação" },
  { codigo: "design", nome: "Design" },
  { codigo: "social", nome: "Publicação e disparo" },
  { codigo: "site", nome: "Site" },
  { codigo: "dev", nome: "Dev" },
] as const;

export interface ModeloPeca {
  id: string;
  nome: string;
  etapas: { ordem: number; nome: string; estado: string; papel: string | null }[];
}

export interface PapelCliente {
  cliente_id: string;
  papel: string;
  pessoa_id: string;
}

// Etiqueta do lançamento, mostrada em todo card de tarefa
export interface EtiquetaLanc {
  id: string;
  codigo: string;
  cor: string;
}

export interface LancamentoOpcao {
  id: string;
  codigo: string;
  cor: string;
  nome: string;
}
