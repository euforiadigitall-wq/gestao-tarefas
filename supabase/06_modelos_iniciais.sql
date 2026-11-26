-- Modelos de peça iniciais, tirados dos status das listas do ClickUp
-- (Conteúdos e Anúncios, Mensagens e E-mails, Materiais Pedagógicos, Site e Loja).
-- Rascunho para a Iza corrigir. Rode depois do 03. Pode rodar de novo sem duplicar.
-- Cada etapa usa um papel (copy, design, aprovador, social, site). Quem exerce o papel
-- é definido por cliente (gestao.cliente_papeis) e vale na hora de criar a tarefa.

do $$
declare
  m uuid;
begin
  -- Post ou anúncio: copy, aprovação, design, aprovação, publicação
  insert into gestao.modelos_peca (nome) values ('Post ou anúncio')
    on conflict (nome) do nothing;
  select id into m from gestao.modelos_peca where nome = 'Post ou anúncio';
  insert into gestao.modelos_etapa (modelo_id, ordem, nome, estado, papel, sla_dias_uteis) values
    (m, 1, 'Escrever copy',   'Copy criada',    'copy',      1),
    (m, 2, 'Aprovar copy',    'Copy aprovada',  'aprovador', 1),
    (m, 3, 'Fazer design',    'Design feito',   'design',    1),
    (m, 4, 'Aprovar design',  'Design aprovado','aprovador', 1),
    (m, 5, 'Publicar',        'Publicado',      'social',    1)
    on conflict (modelo_id, ordem) do nothing;

  -- Mensagem ou e-mail: copy, aprovação, disparo
  insert into gestao.modelos_peca (nome) values ('Mensagem ou e-mail')
    on conflict (nome) do nothing;
  select id into m from gestao.modelos_peca where nome = 'Mensagem ou e-mail';
  insert into gestao.modelos_etapa (modelo_id, ordem, nome, estado, papel, sla_dias_uteis) values
    (m, 1, 'Escrever copy', 'Copy criada',   'copy',      1),
    (m, 2, 'Aprovar copy',  'Copy aprovada', 'aprovador', 1),
    (m, 3, 'Disparar',      'Disparada',     'social',    1)
    on conflict (modelo_id, ordem) do nothing;

  -- Material pedagógico: design, aprovação, entrega
  insert into gestao.modelos_peca (nome) values ('Material pedagógico')
    on conflict (nome) do nothing;
  select id into m from gestao.modelos_peca where nome = 'Material pedagógico';
  insert into gestao.modelos_etapa (modelo_id, ordem, nome, estado, papel, sla_dias_uteis) values
    (m, 1, 'Fazer design',   'Design feito',    'design',    1),
    (m, 2, 'Aprovar design', 'Design aprovado', 'aprovador', 1),
    (m, 3, 'Entregar',       'Entregue',        'social',    1)
    on conflict (modelo_id, ordem) do nothing;

  -- Notícia do site: identificar e publicar
  insert into gestao.modelos_peca (nome) values ('Notícia do site')
    on conflict (nome) do nothing;
  select id into m from gestao.modelos_peca where nome = 'Notícia do site';
  insert into gestao.modelos_etapa (modelo_id, ordem, nome, estado, papel, sla_dias_uteis) values
    (m, 1, 'Identificar notícia', 'Notícia identificada', 'copy', 1),
    (m, 2, 'Publicar notícia',    'Notícia publicada',    'site', 1)
    on conflict (modelo_id, ordem) do nothing;
end $$;

-- Conferência: deve listar 4 modelos com suas etapas
select mp.nome as peca, me.ordem, me.nome as acao, me.estado, me.papel
from gestao.modelos_peca mp join gestao.modelos_etapa me on me.modelo_id = mp.id
order by mp.nome, me.ordem;
