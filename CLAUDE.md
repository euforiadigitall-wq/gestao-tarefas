# gestao-tarefas

Sistema interno de tarefas e lançamentos da EuforIA Digital. Substitui o ClickUp. Uso só da equipe.

## Regras do produto (decididas pela Iza)
- Lista plana: sem subtarefas, sem campos personalizados, sem pastas, sem tags, sem prioridades em vários níveis, sem cronômetro.
- Esteira: uma peça é um card. Cada tipo de peça tem a sua sequência de ações. O estado fica no particípio (Criada, Revisada, Aprovada, Publicada) e a próxima ação no infinitivo (Revisar). Tarefa futura aparece cinza, "na fila".
- Admins (Iza, Isa, Bia, Jony): criam tarefa com esteira, atribuem a outros, concluem e arquivam em massa, apagam, gerenciam acessos. Membros (Matheus, Rapha, Rafael Dev): só tarefa simples para si.
- Membro só vê clientes liberados (por área: Tráfego ou Lançamentos). Quem é responsável sempre vê a própria tarefa.
- Prazos em dias úteis, sem feriados.
- Lançamento: 6 etapas fixas (aquecimento, captação, abertura do carrinho, vendas, pós-vendas, debriefing); 8 entregáveis dentro delas (manychat, mensagens, páginas, anúncios, posts/stories, site principal, notícias, e-mails).
- Tarefas do portal Arco (clientes) ficam fora deste sistema.

## Técnico
- Next.js (App Router) + TypeScript + Tailwind 4 + Supabase. Deploy na Vercel.
- Mesmo projeto Supabase do CRM, schema próprio `gestao`. Os scripts estão em `supabase/` (rodar 01, 02, 03 nesta ordem).
- Toda regra de acesso está no banco (RLS e funções). A tela nunca decide permissão sozinha.
- No navegador e no servidor do app só a chave pública (`NEXT_PUBLIC_SUPABASE_ANON_KEY`). A `service_role` existe só no n8n (`n8n/`). Nunca colocar em código, env da Vercel ou commit.
- Tema claro e escuro via `data-theme` no `<html>` e tokens em `app/globals.css`. Qualquer cor nova entra como token nos dois temas.
- Textos da interface em português, direto, sem travessão e sem tom de propaganda.

## Estado
- Pronto: login, esqueci/nova senha, tela Hoje (atrasadas, na sua vez, na fila), tarefa simples, concluir, concluir etapa, devolver com motivo, ver o dia de outra pessoa (admin).
- Próximo: criar tarefa com esteira (admin), Quadro, Cronograma, lançamentos, Admin (pessoas, acessos, tipos de peça, papéis por cliente), seleção em massa, colar lista, comentários, busca, visão por cliente.
