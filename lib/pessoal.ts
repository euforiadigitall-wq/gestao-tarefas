// Mesma regra do gatilho do banco (script 30): título que começa com [P], (P), P:, [Pessoal] ou [PSI] vira tarefa pessoal.
const MARCA = /^\s*([[(](p|pessoal|psi)[\])]|p\s*:)\s*/i;

export const ehPessoal = (titulo: string) => MARCA.test(titulo);
export const semMarca = (titulo: string) => titulo.replace(MARCA, "") || titulo;
// Ao marcar a caixinha, o título ganha [P] no começo (o banco faz o resto)
export const comMarca = (titulo: string) => (ehPessoal(titulo) ? titulo : `[P] ${titulo}`);
