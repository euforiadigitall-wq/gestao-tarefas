// Filtro do PostgREST: tarefas em que a pessoa é a responsável principal ou uma das co-responsáveis.
// Só aceita UUID, porque o texto entra direto no filtro.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function filtroResponsavel(id: string): string {
  if (!UUID.test(id)) return "id.is.null";
  return `responsavel_id.eq.${id},co_responsavel_ids.cs.{${id}}`;
}
