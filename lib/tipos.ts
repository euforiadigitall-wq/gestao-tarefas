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
}

export interface TarefaFila {
  id: string; // id da etapa
  tarefa_id: string;
  titulo: string;
  cliente: string | null;
  acao: string;
  prazo: string | null;
}
