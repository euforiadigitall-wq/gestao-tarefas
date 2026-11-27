-- Refazer 13, 14, 15, 18, 19 e 20 nesta ordem. O 14 recria criar_tarefa_de_modelo; o 18 refaz a versão da automação por cima.
-- Todos podem rodar de novo.
-- 13: quem tem uma etapa numa tarefa passa a ver a tarefa inteira, mesmo quando a vez é de outra pessoa.
-- Antes, o dev de um "Site extra" avulso deixava de ver a peça enquanto ela estava com a Iza na revisão,
-- e não via a peça "na fila" antes da etapa dele. Quem não atua na tarefa continua sem ver.
-- Só leitura: quem não é a vez continua sem poder alterar a tarefa. Rodar depois do 12.

create or replace function gestao.atua_na_tarefa(p_tarefa uuid) returns boolean
language sql stable security definer set search_path = gestao, public as $$
  select exists (select 1 from gestao.tarefa_etapas e where e.tarefa_id = p_tarefa and e.responsavel_id = auth.uid());
$$;
revoke execute on function gestao.atua_na_tarefa(uuid) from public, anon;
grant execute on function gestao.atua_na_tarefa(uuid) to authenticated;

drop policy if exists tarefas_sel on gestao.tarefas;
create policy tarefas_sel on gestao.tarefas for select to authenticated using (
  gestao.ativa() and (
    gestao.e_admin()
    or responsavel_id = auth.uid()
    or criado_por = auth.uid()
    or gestao.atua_na_tarefa(id)
    or (cliente_id is not null and gestao.pode_ver(cliente_id, area_id))
  )
);

create or replace function gestao.pode_ver_tarefa(p_tarefa uuid) returns boolean
language sql stable security definer set search_path = gestao, public as $$
  select gestao.ativa() and exists (
    select 1 from gestao.tarefas t
    where t.id = p_tarefa
      and (gestao.e_admin()
           or t.responsavel_id = auth.uid()
           or t.criado_por = auth.uid()
           or gestao.atua_na_tarefa(t.id)
           or (t.cliente_id is not null and gestao.pode_ver(t.cliente_id, t.area_id)))
  );
$$;
-- 14: tipo único de tarefa, responsável padrão por função e membros escolhendo o tipo.
-- 1) gestao.papel_padrao: quem faz cada função quando ninguém escolhe (vale também para cliente avulso).
-- 2) criar_tarefa_de_modelo passa a usar, nesta ordem: responsável fixo do modelo, escolha na hora (só admin),
--    papel salvo do cliente, padrão da função.
-- 3) Membro pode criar peça a partir de um tipo: não escolhe pessoas, as etapas vão para os padrões. Só com
--    cliente que ele pode ver. Quem cria sempre enxerga a peça.
-- 4) Tipos novos: "Site" (Fazer, Revisar; Revisar devolvido volta para Fazer até aprovar) e "Calendário editorial".
-- Rodar depois do 13. Pode rodar de novo.

create table if not exists gestao.papel_padrao (
  papel text primary key,
  pessoa_id uuid not null references gestao.pessoas (id) on delete cascade
);
alter table gestao.papel_padrao enable row level security;
drop policy if exists papel_padrao_sel on gestao.papel_padrao;
create policy papel_padrao_sel on gestao.papel_padrao for select to authenticated using (gestao.ativa());
drop policy if exists papel_padrao_adm on gestao.papel_padrao;
create policy papel_padrao_adm on gestao.papel_padrao for all to authenticated
  using (gestao.e_admin()) with check (gestao.e_admin());
grant select, insert, update, delete on gestao.papel_padrao to authenticated;

-- Valores iniciais (ajustáveis em Admin > Papéis). Só entram se a função ainda não tem padrão.
insert into gestao.papel_padrao (papel, pessoa_id)
select x.papel, p.id
from (values ('site', 'rafael%dev%'), ('dev', 'rafael%dev%'), ('aprovador', 'iza%'), ('calendario', 'rapha%')) as x(papel, padrao)
cross join lateral (
  select id from gestao.pessoas where ativo and nome ilike x.padrao order by nome limit 1
) p
on conflict (papel) do nothing;

drop function if exists gestao.criar_tarefa_de_modelo(text, uuid, uuid, uuid, uuid, text, jsonb);
create or replace function gestao.criar_tarefa_de_modelo(
  p_titulo text, p_cliente uuid, p_modelo uuid,
  p_area uuid default null, p_entregavel uuid default null, p_bloco text default null,
  p_responsaveis jsonb default '{}'::jsonb, p_notas text default null
) returns uuid
language plpgsql security definer set search_path = gestao, public as $$
declare
  v_id uuid;
  v_primeira int;
  v_faltam text;
  v_adm boolean := gestao.e_admin() or gestao.e_servico();
  v_resp jsonb := coalesce(p_responsaveis, '{}'::jsonb);
begin
  if not v_adm then
    if not gestao.ativa() then
      raise exception 'sem permissao';
    end if;
    -- membro nao escolhe pessoas: as etapas seguem os padroes
    v_resp := '{}'::jsonb;
    if p_cliente is not null and not gestao.pode_ver(p_cliente, p_area) then
      raise exception 'voce nao tem acesso a esse cliente';
    end if;
    if p_entregavel is not null or nullif(p_bloco, '') is not null then
      raise exception 'apenas admin usa entregavel e bloco';
    end if;
  end if;
  if p_cliente is not null and p_area is null then
    raise exception 'escolha a area do cliente';
  end if;
  perform set_config('gestao.interno', '1', true);
  select min(ordem) into v_primeira from gestao.modelos_etapa where modelo_id = p_modelo;
  if v_primeira is null then
    raise exception 'modelo sem etapas';
  end if;

  select string_agg(distinct me.papel, ', ') into v_faltam
  from gestao.modelos_etapa me
  where me.modelo_id = p_modelo and me.responsavel_padrao is null
    and nullif(v_resp ->> me.papel, '') is null
    and not exists (select 1 from gestao.cliente_papeis cp where cp.cliente_id = p_cliente and cp.papel = me.papel)
    and not exists (select 1 from gestao.papel_padrao pp join gestao.pessoas pe on pe.id = pp.pessoa_id and pe.ativo where pp.papel = me.papel);
  if v_faltam is not null then
    raise exception 'defina quem faz o papel: %', v_faltam;
  end if;

  insert into gestao.tarefas (titulo, cliente_id, area_id, modelo_id, entregavel_id, bloco,
                              status, etapa_atual, criado_por, notas)
  values (p_titulo, p_cliente, p_area, p_modelo, p_entregavel, p_bloco,
          'em_andamento', v_primeira, auth.uid(), nullif(left(p_notas, 600), ''))
  returning id into v_id;

  insert into gestao.tarefa_etapas (tarefa_id, ordem, nome, estado, responsavel_id, sla_dias_uteis)
  select v_id, me.ordem, me.nome, me.estado,
         coalesce(me.responsavel_padrao, nullif(v_resp ->> me.papel, '')::uuid, cp.pessoa_id, pp.pessoa_id),
         me.sla_dias_uteis
  from gestao.modelos_etapa me
  left join gestao.cliente_papeis cp on cp.cliente_id = p_cliente and cp.papel = me.papel
  left join (select pp.papel, pp.pessoa_id from gestao.papel_padrao pp join gestao.pessoas pe on pe.id = pp.pessoa_id and pe.ativo) pp
         on pp.papel = me.papel
  where me.modelo_id = p_modelo;

  update gestao.tarefa_etapas set iniciada_em = now() where tarefa_id = v_id and ordem = v_primeira;
  update gestao.tarefas
  set responsavel_id = (select responsavel_id from gestao.tarefa_etapas where tarefa_id = v_id and ordem = v_primeira)
  where id = v_id;
  perform gestao._recalcular_prazos(v_id);
  insert into gestao.historico (tarefa_id, quem, acao, para_etapa) values (v_id, auth.uid(), 'criou', v_primeira);
  return v_id;
end;
$$;
revoke execute on function gestao.criar_tarefa_de_modelo(text, uuid, uuid, uuid, uuid, text, jsonb, text) from public, anon;
grant execute on function gestao.criar_tarefa_de_modelo(text, uuid, uuid, uuid, uuid, text, jsonb, text) to authenticated, service_role;

-- Tipos novos
do $$
declare m uuid;
begin
  insert into gestao.modelos_peca (nome) values ('Site') on conflict (nome) do nothing;
  select id into m from gestao.modelos_peca where nome = 'Site';
  insert into gestao.modelos_etapa (modelo_id, ordem, nome, estado, papel, sla_dias_uteis) values
    (m, 1, 'Fazer',   'Feito',    'site',      1),
    (m, 2, 'Revisar', 'Aprovado', 'aprovador', 1)
    on conflict (modelo_id, ordem) do nothing;

  insert into gestao.modelos_peca (nome) values ('Calendário editorial') on conflict (nome) do nothing;
  select id into m from gestao.modelos_peca where nome = 'Calendário editorial';
  insert into gestao.modelos_etapa (modelo_id, ordem, nome, estado, papel, sla_dias_uteis) values
    (m, 1, 'Criar',   'Criado',   'calendario', 1),
    (m, 2, 'Revisar', 'Revisado', 'aprovador',  1),
    (m, 3, 'Aprovar', 'Aprovado', 'aprovador',  1)
    on conflict (modelo_id, ordem) do nothing;
end $$;

select nome from gestao.modelos_peca order by nome;
-- 15: Isa como admin. Ela já tem usuário no Supabase (Authentication); aqui só entra na tabela de pessoas.
-- Pode rodar de novo. Se a Isa já estiver na tabela, vira admin e ativa.
insert into gestao.pessoas (id, nome, apelido, email, papel, ativo)
select u.id, 'Isa', 'Isa', lower(u.email), 'admin', true
from auth.users u
where lower(u.email) = 'contato@euforiadigital.com'
on conflict (id) do update set papel = 'admin', ativo = true, email = excluded.email;

-- Conferência: deve voltar 1 linha com papel admin. Se voltar vazio, o e-mail não existe em Authentication.
select nome, email, papel, ativo from gestao.pessoas where lower(email) = 'contato@euforiadigital.com';
-- 18: etapas que são da automação (n8n e rotinas do Claude), no lugar dos comentários do ClickUp.
-- Como era no ClickUp -> como fica aqui:
--   rotina gera o rascunho e comenta "RASCUNHO GERADO"  -> srv_entregar: comenta e passa a etapa para a revisão
--   você conclui a tarefa (aprova)                       -> Concluir etapa de revisão: libera a próxima
--   você comenta "REFAZER ..."                           -> Devolver com motivo: a etapa volta para a automação
--   rotina procurava tarefas sem a marca                 -> srv_pendentes_automacao: lista o que está na vez da automação
-- Papel "automacao" não tem pessoa: a etapa fica "na vez da automação" até alguém entregar.
-- Rodar depois do 17. Pode rodar de novo.

create or replace function gestao.criar_tarefa_de_modelo(
  p_titulo text, p_cliente uuid, p_modelo uuid,
  p_area uuid default null, p_entregavel uuid default null, p_bloco text default null,
  p_responsaveis jsonb default '{}'::jsonb, p_notas text default null
) returns uuid
language plpgsql security definer set search_path = gestao, public as $$
declare
  v_id uuid;
  v_primeira int;
  v_faltam text;
  v_adm boolean := gestao.e_admin() or gestao.e_servico();
  v_resp jsonb := coalesce(p_responsaveis, '{}'::jsonb);
begin
  if not v_adm then
    if not gestao.ativa() then
      raise exception 'sem permissao';
    end if;
    -- membro nao escolhe pessoas: as etapas seguem os padroes
    v_resp := '{}'::jsonb;
    if p_cliente is not null and not gestao.pode_ver(p_cliente, p_area) then
      raise exception 'voce nao tem acesso a esse cliente';
    end if;
    if p_entregavel is not null or nullif(p_bloco, '') is not null then
      raise exception 'apenas admin usa entregavel e bloco';
    end if;
  end if;
  if p_cliente is not null and p_area is null then
    raise exception 'escolha a area do cliente';
  end if;
  perform set_config('gestao.interno', '1', true);
  select min(ordem) into v_primeira from gestao.modelos_etapa where modelo_id = p_modelo;
  if v_primeira is null then
    raise exception 'modelo sem etapas';
  end if;

  select string_agg(distinct me.papel, ', ') into v_faltam
  from gestao.modelos_etapa me
  where me.modelo_id = p_modelo and me.responsavel_padrao is null and me.papel <> 'automacao'
    and nullif(v_resp ->> me.papel, '') is null
    and not exists (select 1 from gestao.cliente_papeis cp where cp.cliente_id = p_cliente and cp.papel = me.papel)
    and not exists (select 1 from gestao.papel_padrao pp join gestao.pessoas pe on pe.id = pp.pessoa_id and pe.ativo where pp.papel = me.papel);
  if v_faltam is not null then
    raise exception 'defina quem faz o papel: %', v_faltam;
  end if;

  insert into gestao.tarefas (titulo, cliente_id, area_id, modelo_id, entregavel_id, bloco,
                              status, etapa_atual, criado_por, notas)
  values (p_titulo, p_cliente, p_area, p_modelo, p_entregavel, p_bloco,
          'em_andamento', v_primeira, auth.uid(), nullif(left(p_notas, 600), ''))
  returning id into v_id;

  insert into gestao.tarefa_etapas (tarefa_id, ordem, nome, estado, responsavel_id, sla_dias_uteis)
  select v_id, me.ordem, me.nome, me.estado,
         case when me.papel = 'automacao' then null
              else coalesce(me.responsavel_padrao, nullif(v_resp ->> me.papel, '')::uuid, cp.pessoa_id, pp.pessoa_id) end,
         me.sla_dias_uteis
  from gestao.modelos_etapa me
  left join gestao.cliente_papeis cp on cp.cliente_id = p_cliente and cp.papel = me.papel
  left join (select pp.papel, pp.pessoa_id from gestao.papel_padrao pp join gestao.pessoas pe on pe.id = pp.pessoa_id and pe.ativo) pp
         on pp.papel = me.papel
  where me.modelo_id = p_modelo;

  update gestao.tarefa_etapas set iniciada_em = now() where tarefa_id = v_id and ordem = v_primeira;
  update gestao.tarefas
  set responsavel_id = (select responsavel_id from gestao.tarefa_etapas where tarefa_id = v_id and ordem = v_primeira)
  where id = v_id;
  perform gestao._recalcular_prazos(v_id);
  insert into gestao.historico (tarefa_id, quem, acao, para_etapa) values (v_id, auth.uid(), 'criou', v_primeira);
  return v_id;
end;
$$;
revoke execute on function gestao.criar_tarefa_de_modelo(text, uuid, uuid, uuid, uuid, text, jsonb, text) from public, anon;
grant execute on function gestao.criar_tarefa_de_modelo(text, uuid, uuid, uuid, uuid, text, jsonb, text) to authenticated, service_role;

do $$
declare m uuid;
begin
  insert into gestao.modelos_peca (nome) values ('Rascunho da rotina') on conflict (nome) do nothing;
  select id into m from gestao.modelos_peca where nome = 'Rascunho da rotina';
  insert into gestao.modelos_etapa (modelo_id, ordem, nome, estado, papel, sla_dias_uteis) values
    (m, 1, 'Gerar',   'Gerado',   'automacao', 1),
    (m, 2, 'Revisar', 'Aprovado', 'aprovador', 1)
    on conflict (modelo_id, ordem) do nothing;

  insert into gestao.modelos_peca (nome) values ('Encontro Arco') on conflict (nome) do nothing;
  select id into m from gestao.modelos_peca where nome = 'Encontro Arco';
  insert into gestao.modelos_etapa (modelo_id, ordem, nome, estado, papel, sla_dias_uteis) values
    (m, 1, 'Gerar esqueleto', 'Esqueleto gerado', 'automacao', 1),
    (m, 2, 'Revisar esqueleto', 'Esqueleto aprovado', 'aprovador', 1),
    (m, 3, 'Gerar deck',      'Deck gerado',      'automacao', 1),
    (m, 4, 'Revisar deck',    'Deck aprovado',    'aprovador', 1)
    on conflict (modelo_id, ordem) do nothing;
end $$;

-- Cria uma peça por tipo. Responsáveis por papel, com uuid OU nome/apelido (ex.: {"aprovador":"Isa"}).
create or replace function gestao.srv_criar_peca(
  p_titulo text, p_modelo text, p_responsaveis jsonb default '{}'::jsonb, p_notas text default null,
  p_depende_de uuid default null
) returns uuid
language plpgsql security definer set search_path = gestao, public as $$
declare
  v_modelo uuid;
  v_resp jsonb := '{}'::jsonb;
  r record;
  v_pessoa uuid;
  v_id uuid;
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  select id into v_modelo from gestao.modelos_peca where nome = p_modelo and ativo;
  if v_modelo is null then raise exception 'tipo nao encontrado: %', p_modelo; end if;
  for r in select key, value from jsonb_each_text(coalesce(p_responsaveis, '{}'::jsonb)) loop
    if r.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_pessoa := r.value::uuid;
    else
      select id into v_pessoa from gestao.pessoas
      where ativo and (lower(nome) = lower(r.value) or lower(apelido) = lower(r.value)) limit 1;
      if v_pessoa is null then raise exception 'pessoa nao encontrada: %', r.value; end if;
    end if;
    v_resp := v_resp || jsonb_build_object(r.key, v_pessoa::text);
  end loop;
  v_id := gestao.criar_tarefa_de_modelo(p_titulo, null, v_modelo, null, null, null, v_resp, p_notas);
  if p_depende_de is not null then
    perform set_config('gestao.interno', '1', true);
    update gestao.tarefas set depende_de = p_depende_de where id = v_id;
  end if;
  return v_id;
end;
$$;

-- O que está na vez da automação agora. Só entra tarefa cuja dependência já foi concluída.
-- "refazer" traz o motivo da devolução quando a última ação foi uma devolução (o antigo comentário REFAZER).
create or replace function gestao.srv_pendentes_automacao() returns jsonb
language plpgsql stable security definer set search_path = gestao, public as $$
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'tarefa_id', t.id, 'titulo', t.titulo, 'cliente', c.nome, 'tipo', mp.nome, 'etapa', te.nome,
      'notas', t.notas, 'prazo', te.prazo_previsto,
      'refazer', (select case when h.acao = 'devolveu' then h.motivo end from gestao.historico h
                  where h.tarefa_id = t.id order by h.quando desc limit 1)
    ) order by te.prazo_previsto nulls last, t.criado_em)
    from gestao.tarefas t
    join gestao.tarefa_etapas te on te.tarefa_id = t.id and te.ordem = t.etapa_atual
    join gestao.modelos_etapa me on me.modelo_id = t.modelo_id and me.ordem = t.etapa_atual
    join gestao.modelos_peca mp on mp.id = t.modelo_id
    left join gestao.clientes c on c.id = t.cliente_id
    where t.status <> 'concluida' and t.arquivada_em is null and me.papel = 'automacao'
      and (t.depende_de is null or exists (select 1 from gestao.tarefas d where d.id = t.depende_de and d.status = 'concluida'))
  ), '[]'::jsonb);
end;
$$;

-- A automação entrega: comenta (com o link e os pontos de revisão) e passa a etapa para quem revisa.
create or replace function gestao.srv_entregar(p_tarefa uuid, p_texto text, p_automacao text default 'Automação')
returns void
language plpgsql security definer set search_path = gestao, public as $$
declare
  t gestao.tarefas%rowtype;
  v_prox gestao.tarefa_etapas%rowtype;
  v_estado text;
  v_papel text;
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  perform set_config('gestao.interno', '1', true);
  select * into t from gestao.tarefas where id = p_tarefa and arquivada_em is null for update;
  if not found then raise exception 'tarefa nao encontrada'; end if;
  if t.status = 'concluida' or t.etapa_atual is null then raise exception 'tarefa sem etapa aberta'; end if;
  select papel into v_papel from gestao.modelos_etapa where modelo_id = t.modelo_id and ordem = t.etapa_atual;
  if v_papel is distinct from 'automacao' then raise exception 'a etapa atual nao e da automacao'; end if;
  insert into gestao.comentarios (tarefa_id, autor_id, automacao, texto)
  values (t.id, null, left(coalesce(nullif(trim(p_automacao), ''), 'Automação'), 80), p_texto);
  update gestao.tarefa_etapas set concluida_em = now() where tarefa_id = t.id and ordem = t.etapa_atual
  returning estado into v_estado;
  select * into v_prox from gestao.tarefa_etapas where tarefa_id = t.id and ordem > t.etapa_atual order by ordem limit 1;
  if found then
    update gestao.tarefa_etapas set iniciada_em = now() where id = v_prox.id;
    update gestao.tarefas set etapa_atual = v_prox.ordem, responsavel_id = v_prox.responsavel_id,
                              status = 'em_andamento', estado_atual = v_estado
    where id = t.id;
    perform gestao._recalcular_prazos(t.id);
    insert into gestao.historico (tarefa_id, quem, acao, de_etapa, para_etapa)
    values (t.id, null, 'avancou', t.etapa_atual, v_prox.ordem);
  else
    update gestao.tarefas set status = 'concluida', estado_atual = v_estado, concluida_em = now() where id = t.id;
    insert into gestao.historico (tarefa_id, quem, acao, de_etapa) values (t.id, null, 'concluiu', t.etapa_atual);
  end if;
end;
$$;

revoke execute on function gestao.srv_criar_peca(text, text, jsonb, text, uuid) from public, anon, authenticated;
revoke execute on function gestao.srv_pendentes_automacao() from public, anon, authenticated;
revoke execute on function gestao.srv_entregar(uuid, text, text) from public, anon, authenticated;
grant execute on function gestao.srv_criar_peca(text, text, jsonb, text, uuid) to service_role;
grant execute on function gestao.srv_pendentes_automacao() to service_role;
grant execute on function gestao.srv_entregar(uuid, text, text) to service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'gestao_n8n') then
    grant execute on function gestao.srv_criar_peca(text, text, jsonb, text, uuid) to gestao_n8n;
    grant execute on function gestao.srv_pendentes_automacao() to gestao_n8n;
    grant execute on function gestao.srv_entregar(uuid, text, text) to gestao_n8n;
  end if;
end $$;

select nome from gestao.modelos_peca order by nome;
-- 19: o que a rotina e o n8n precisam LER e CRIAR no gestão (o usuário gestao_n8n não lê tabelas, só chama funções).
-- Substitui o que a rotina lia no ClickUp:
--   ler comentários e descrição de uma tarefa       -> srv_ler_tarefa
--   buscar tarefas por nome e prazo                 -> srv_buscar_tarefas
--   criar tarefa já no cliente certo                -> srv_criar_peca (agora com cliente e área; área padrão: projetos)
--   saber desde quando o REFAZER (devolução) vale   -> srv_pendentes_automacao ganha devolvida_em
-- Rodar depois do 18. Pode rodar de novo.

drop function if exists gestao.srv_criar_peca(text, text, jsonb, text, uuid);
drop function if exists gestao.srv_criar_peca(text, text, jsonb, text, uuid, text);

create or replace function gestao.srv_criar_peca(
  p_titulo text, p_modelo text, p_responsaveis jsonb default '{}'::jsonb, p_notas text default null,
  p_depende_de uuid default null, p_cliente text default null, p_area text default 'projetos'
) returns uuid
language plpgsql security definer set search_path = gestao, public as $$
declare
  v_modelo uuid;
  v_cliente uuid;
  v_area uuid;
  v_resp jsonb := '{}'::jsonb;
  r record;
  v_pessoa uuid;
  v_id uuid;
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  select id into v_modelo from gestao.modelos_peca where nome = p_modelo and ativo;
  if v_modelo is null then raise exception 'tipo nao encontrado: %', p_modelo; end if;
  if nullif(trim(p_cliente), '') is not null then
    select id into v_cliente from gestao.clientes
    where ativo and lower(nome) = lower(trim(p_cliente)) limit 1;
    if v_cliente is null then
      select id into v_cliente from gestao.clientes
      where ativo and nome ilike '%' || trim(p_cliente) || '%' order by length(nome) limit 1;
    end if;
    if v_cliente is null then raise exception 'cliente nao encontrado: %', p_cliente; end if;
  end if;
  if v_cliente is not null then
    select id into v_area from gestao.areas where ativo and (lower(codigo) = lower(trim(p_area)) or lower(nome) = lower(trim(p_area))) limit 1;
    if v_area is null then raise exception 'area nao encontrada: %', p_area; end if;
  end if;
  for r in select key, value from jsonb_each_text(coalesce(p_responsaveis, '{}'::jsonb)) loop
    if r.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_pessoa := r.value::uuid;
    else
      select id into v_pessoa from gestao.pessoas
      where ativo and (lower(nome) = lower(r.value) or lower(apelido) = lower(r.value)) limit 1;
      if v_pessoa is null then raise exception 'pessoa nao encontrada: %', r.value; end if;
    end if;
    v_resp := v_resp || jsonb_build_object(r.key, v_pessoa::text);
  end loop;
  v_id := gestao.criar_tarefa_de_modelo(p_titulo, v_cliente, v_modelo, v_area, null, null, v_resp, p_notas);
  if p_depende_de is not null then
    perform set_config('gestao.interno', '1', true);
    update gestao.tarefas set depende_de = p_depende_de where id = v_id;
  end if;
  return v_id;
end;
$$;

-- Uma tarefa por inteiro: dados, etapa atual, comentários (do mais antigo ao mais novo) e a última devolução.
create or replace function gestao.srv_ler_tarefa(p_tarefa uuid) returns jsonb
language plpgsql stable security definer set search_path = gestao, public as $$
declare v jsonb;
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  select jsonb_build_object(
    'tarefa_id', t.id, 'titulo', t.titulo, 'cliente', c.nome, 'tipo', mp.nome,
    'status', t.status, 'concluida', t.status = 'concluida', 'concluida_em', t.concluida_em,
    'etapa', te.nome, 'papel_da_etapa', me.papel, 'responsavel', p.nome,
    'prazo', t.prazo, 'horario', t.horario, 'notas', t.notas, 'depende_de', t.depende_de,
    'ultima_devolucao', (select jsonb_build_object('motivo', h.motivo, 'quando', h.quando)
                         from gestao.historico h where h.tarefa_id = t.id and h.acao = 'devolveu'
                         order by h.quando desc limit 1),
    'comentarios', coalesce((select jsonb_agg(jsonb_build_object(
                       'autor', coalesce(pa.nome, cm.automacao, 'Alguém'), 'automacao', cm.autor_id is null,
                       'texto', cm.texto, 'quando', cm.criado_em) order by cm.criado_em)
                     from gestao.comentarios cm left join gestao.pessoas pa on pa.id = cm.autor_id
                     where cm.tarefa_id = t.id), '[]'::jsonb)
  ) into v
  from gestao.tarefas t
  left join gestao.clientes c on c.id = t.cliente_id
  left join gestao.modelos_peca mp on mp.id = t.modelo_id
  left join gestao.tarefa_etapas te on te.tarefa_id = t.id and te.ordem = t.etapa_atual
  left join gestao.modelos_etapa me on me.modelo_id = t.modelo_id and me.ordem = t.etapa_atual
  left join gestao.pessoas p on p.id = t.responsavel_id
  where t.id = p_tarefa;
  if v is null then raise exception 'tarefa nao encontrada'; end if;
  return v;
end;
$$;

-- Busca por pedaço do título e/ou intervalo de prazo. Sem comentários (use srv_ler_tarefa para isso).
create or replace function gestao.srv_buscar_tarefas(
  p_texto text default null, p_de date default null, p_ate date default null,
  p_incluir_concluidas boolean default false
) returns jsonb
language plpgsql stable security definer set search_path = gestao, public as $$
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  return coalesce((
    select jsonb_agg(x order by x ->> 'prazo', x ->> 'horario') from (
      select jsonb_build_object('tarefa_id', t.id, 'titulo', t.titulo, 'cliente', c.nome,
             'responsavel', p.nome, 'prazo', t.prazo, 'horario', t.horario,
             'status', t.status, 'concluida', t.status = 'concluida', 'tipo', mp.nome) as x
      from gestao.tarefas t
      left join gestao.clientes c on c.id = t.cliente_id
      left join gestao.pessoas p on p.id = t.responsavel_id
      left join gestao.modelos_peca mp on mp.id = t.modelo_id
      where t.arquivada_em is null
        and (p_incluir_concluidas or t.status <> 'concluida')
        and (nullif(trim(p_texto), '') is null or t.titulo ilike '%' || trim(p_texto) || '%')
        and (p_de is null or t.prazo >= p_de)
        and (p_ate is null or t.prazo <= p_ate)
      order by t.prazo nulls last limit 200
    ) q
  ), '[]'::jsonb);
end;
$$;

-- Pendências da automação: agora com a data da devolução (o REFAZER) para a rotina ignorar comentários antigos.
create or replace function gestao.srv_pendentes_automacao() returns jsonb
language plpgsql stable security definer set search_path = gestao, public as $$
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'tarefa_id', t.id, 'titulo', t.titulo, 'cliente', c.nome, 'tipo', mp.nome, 'etapa', te.nome,
      'notas', t.notas, 'prazo', te.prazo_previsto,
      'refazer', (select case when h.acao = 'devolveu' then h.motivo end from gestao.historico h
                  where h.tarefa_id = t.id order by h.quando desc limit 1),
      'devolvida_em', (select case when h.acao = 'devolveu' then h.quando end from gestao.historico h
                       where h.tarefa_id = t.id order by h.quando desc limit 1)
    ) order by te.prazo_previsto nulls last, t.criado_em)
    from gestao.tarefas t
    join gestao.tarefa_etapas te on te.tarefa_id = t.id and te.ordem = t.etapa_atual
    join gestao.modelos_etapa me on me.modelo_id = t.modelo_id and me.ordem = t.etapa_atual
    join gestao.modelos_peca mp on mp.id = t.modelo_id
    left join gestao.clientes c on c.id = t.cliente_id
    where t.status <> 'concluida' and t.arquivada_em is null and me.papel = 'automacao'
      and (t.depende_de is null or exists (select 1 from gestao.tarefas d where d.id = t.depende_de and d.status = 'concluida'))
  ), '[]'::jsonb);
end;
$$;

-- Põe uma linha no começo das notas (ex.: "**Pasta no Drive:** URL"), só se ainda não houver uma linha com o mesmo prefixo.
create or replace function gestao.srv_notas_inicio(p_tarefa uuid, p_linha text, p_prefixo text default null)
returns void
language plpgsql security definer set search_path = gestao, public as $$
declare v_notas text;
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  if nullif(trim(p_linha), '') is null then raise exception 'linha vazia'; end if;
  select coalesce(notas, '') into v_notas from gestao.tarefas where id = p_tarefa;
  if not found then raise exception 'tarefa nao encontrada'; end if;
  if p_prefixo is not null and position(p_prefixo in v_notas) > 0 then return; end if;
  perform set_config('gestao.interno', '1', true);
  update gestao.tarefas set notas = p_linha || case when v_notas = '' then '' else E'\n' || v_notas end where id = p_tarefa;
end;
$$;

-- Tipos que a rotina usa no lugar das tarefas "[PÁGINA] ..." do ClickUp.
do $$
declare m uuid;
begin
  insert into gestao.modelos_peca (nome) values ('Briefing de página') on conflict (nome) do nothing;
  select id into m from gestao.modelos_peca where nome = 'Briefing de página';
  insert into gestao.modelos_etapa (modelo_id, ordem, nome, estado, papel, sla_dias_uteis) values
    (m, 1, 'Gerar briefing',        'Briefing gerado',  'automacao', 1),
    (m, 2, 'Revisar briefing',      'Briefing aprovado', 'aprovador', 1),
    (m, 3, 'Entregar ao dev',       'Entregue ao dev',  'automacao', 1)
    on conflict (modelo_id, ordem) do nothing;
end $$;

revoke execute on function gestao.srv_criar_peca(text, text, jsonb, text, uuid, text, text) from public, anon, authenticated;
revoke execute on function gestao.srv_notas_inicio(uuid, text, text) from public, anon, authenticated;
grant execute on function gestao.srv_notas_inicio(uuid, text, text) to service_role;
revoke execute on function gestao.srv_ler_tarefa(uuid) from public, anon, authenticated;
revoke execute on function gestao.srv_buscar_tarefas(text, date, date, boolean) from public, anon, authenticated;
revoke execute on function gestao.srv_pendentes_automacao() from public, anon, authenticated;
grant execute on function gestao.srv_criar_peca(text, text, jsonb, text, uuid, text, text) to service_role;
grant execute on function gestao.srv_ler_tarefa(uuid) to service_role;
grant execute on function gestao.srv_buscar_tarefas(text, date, date, boolean) to service_role;
grant execute on function gestao.srv_pendentes_automacao() to service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'gestao_n8n') then
    grant execute on function gestao.srv_criar_peca(text, text, jsonb, text, uuid, text, text) to gestao_n8n;
    grant execute on function gestao.srv_notas_inicio(uuid, text, text) to gestao_n8n;
    grant execute on function gestao.srv_ler_tarefa(uuid) to gestao_n8n;
    grant execute on function gestao.srv_buscar_tarefas(text, date, date, boolean) to gestao_n8n;
    grant execute on function gestao.srv_pendentes_automacao() to gestao_n8n;
  end if;
end $$;

select proname from pg_proc where pronamespace = 'gestao'::regnamespace and proname like 'srv_%' order by 1;
-- 20: prazo na criação de peça pela automação (srv_criar_peca ganha p_prazo).
-- O prazo vale para a peça inteira, em dias úteis (sem feriados): as etapas do meio ficam com o SLA do tipo
-- e o que sobra vai para a última etapa. Prazo que já passou, ou menor que a soma dos SLAs, mantém os SLAs do tipo.
-- Rodar depois do 19. Pode rodar de novo.

drop function if exists gestao.srv_criar_peca(text, text, jsonb, text, uuid, text, text);

create or replace function gestao.srv_criar_peca(
  p_titulo text, p_modelo text, p_responsaveis jsonb default '{}'::jsonb, p_notas text default null,
  p_depende_de uuid default null, p_cliente text default null, p_area text default 'projetos', p_prazo date default null
) returns uuid
language plpgsql security definer set search_path = gestao, public as $$
declare
  v_modelo uuid;
  v_cliente uuid;
  v_area uuid;
  v_resp jsonb := '{}'::jsonb;
  r record;
  v_pessoa uuid;
  v_id uuid;
  v_dias int;
  v_outras int;
  v_ult uuid;
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  select id into v_modelo from gestao.modelos_peca where nome = p_modelo and ativo;
  if v_modelo is null then raise exception 'tipo nao encontrado: %', p_modelo; end if;
  if nullif(trim(p_cliente), '') is not null then
    select id into v_cliente from gestao.clientes
    where ativo and lower(nome) = lower(trim(p_cliente)) limit 1;
    if v_cliente is null then
      select id into v_cliente from gestao.clientes
      where ativo and nome ilike '%' || trim(p_cliente) || '%' order by length(nome) limit 1;
    end if;
    if v_cliente is null then raise exception 'cliente nao encontrado: %', p_cliente; end if;
  end if;
  if v_cliente is not null then
    select id into v_area from gestao.areas where ativo and (lower(codigo) = lower(trim(p_area)) or lower(nome) = lower(trim(p_area))) limit 1;
    if v_area is null then raise exception 'area nao encontrada: %', p_area; end if;
  end if;
  for r in select key, value from jsonb_each_text(coalesce(p_responsaveis, '{}'::jsonb)) loop
    if r.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_pessoa := r.value::uuid;
    else
      select id into v_pessoa from gestao.pessoas
      where ativo and (lower(nome) = lower(r.value) or lower(apelido) = lower(r.value)) limit 1;
      if v_pessoa is null then raise exception 'pessoa nao encontrada: %', r.value; end if;
    end if;
    v_resp := v_resp || jsonb_build_object(r.key, v_pessoa::text);
  end loop;
  v_id := gestao.criar_tarefa_de_modelo(p_titulo, v_cliente, v_modelo, v_area, null, null, v_resp, p_notas);
  if p_depende_de is not null then
    perform set_config('gestao.interno', '1', true);
    update gestao.tarefas set depende_de = p_depende_de where id = v_id;
  end if;
  if p_prazo is not null then
    -- prazo da peça inteira em dias úteis: o que sobra depois das outras etapas vai para a última
    select count(*) into v_dias from generate_series(current_date + 1, p_prazo, interval '1 day') d
    where extract(isodow from d) < 6;
    select id into v_ult from gestao.tarefa_etapas where tarefa_id = v_id order by ordem desc limit 1;
    select coalesce(sum(sla_dias_uteis), 0) into v_outras from gestao.tarefa_etapas where tarefa_id = v_id and id <> v_ult;
    perform set_config('gestao.interno', '1', true);
    update gestao.tarefa_etapas set sla_dias_uteis = greatest(1, v_dias - v_outras) where id = v_ult;
    perform gestao._recalcular_prazos(v_id);
  end if;
  return v_id;
end;
$$;

revoke execute on function gestao.srv_criar_peca(text, text, jsonb, text, uuid, text, text, date) from public, anon, authenticated;
grant execute on function gestao.srv_criar_peca(text, text, jsonb, text, uuid, text, text, date) to service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'gestao_n8n') then
    grant execute on function gestao.srv_criar_peca(text, text, jsonb, text, uuid, text, text, date) to gestao_n8n;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Onboarding Arco no gestão: o n8n (fluxo "Arco · Onboarding") chama uma função só, e a regra fica no banco.
-- Acha ou cria o cliente e monta as 7 tarefas do onboarding, com os mesmos prazos em dias úteis que tinham no ClickUp.
-- Pode ser chamada duas vezes para o mesmo cliente (a Autentique repete webhook): o que já existe é pulado.
-- ---------------------------------------------------------------------------------------------
create or replace function gestao.srv_garantir_cliente(p_nome text) returns uuid
language plpgsql security definer set search_path = gestao, public as $$
declare v uuid; v_nome text := trim(p_nome);
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  if coalesce(v_nome, '') = '' then raise exception 'informe o cliente'; end if;
  select id into v from gestao.clientes where lower(nome) = lower(v_nome) limit 1;
  if v is null then
    insert into gestao.clientes (nome) values (v_nome) returning id into v;
  elsif not (select ativo from gestao.clientes where id = v) then
    update gestao.clientes set ativo = true where id = v;
  end if;
  return v;
end;
$$;

create or replace function gestao.srv_onboarding_arco(p_cliente text, p_rodape text default '') returns jsonb
language plpgsql security definer set search_path = gestao, public as $$
declare
  v_nome text := trim(p_cliente);
  v_cli uuid;
  v_hoje date := current_date;
  v_rod text := case when coalesce(p_rodape, '') = '' then '' else E'\n\n' || p_rodape end;
  v_pesq uuid;
  v_id uuid;
  v_criadas text[] := '{}';
  v_puladas text[] := '{}';
  v_itens jsonb;
  v_res jsonb;
begin
  if not gestao.e_servico() then raise exception 'apenas servico'; end if;
  v_cli := gestao.srv_garantir_cliente(v_nome);

  -- tarefas de pessoa (simples): Bia agenda e encerra a coleta; Isa analisa o diagnóstico
  v_itens := jsonb_build_array(
    jsonb_build_object('titulo', '[ARCO] ' || v_nome || ' · Agendar reunião de diagnóstico (Encontro 1)', 'cliente', v_nome, 'area', 'projetos', 'responsavel', 'Bia',
      'prazo', gestao.add_dias_uteis(v_hoje, 4),
      'notas', 'Marcar no mesmo dia em que a pesquisa de audiência sobe. A data do Encontro 1 fica para depois do mapa da persona (dia útil 9). Convite com os dois e-mails da EuforIA.' || v_rod),
    jsonb_build_object('titulo', '[ARCO] ' || v_nome || ' · Analisar diagnóstico', 'cliente', v_nome, 'area', 'projetos', 'responsavel', 'Isa',
      'prazo', gestao.add_dias_uteis(v_hoje, 3),
      'notas', 'A pré-análise da IA aparece na página do cliente no admin do portal assim que ele envia o formulário. Prazo de 2 dias a partir da devolução.' || v_rod),
    jsonb_build_object('titulo', '[ARCO] ' || v_nome || ' · Encerrar coleta da pesquisa de audiência', 'cliente', v_nome, 'area', 'projetos', 'responsavel', 'Bia',
      'prazo', gestao.add_dias_uteis(v_hoje, 8),
      'notas', '4 dias de coleta.' || v_rod)
  );
  v_res := gestao.importar_tarefas(v_itens, true, true);

  -- peças da rotina (Claude gera, a Isa revisa)
  if exists (select 1 from gestao.tarefas where titulo = '[ARCO] ' || v_nome || ' · Pesquisa de mercado' and cliente_id = v_cli and arquivada_em is null) then
    select id into v_pesq from gestao.tarefas where titulo = '[ARCO] ' || v_nome || ' · Pesquisa de mercado' and cliente_id = v_cli and arquivada_em is null order by criado_em desc limit 1;
    v_puladas := array_append(v_puladas, 'Pesquisa de mercado'::text);
  else
    v_pesq := gestao.srv_criar_peca('[ARCO] ' || v_nome || ' · Pesquisa de mercado', 'Rascunho da rotina', '{"aprovador":"Isa"}'::jsonb,
      'Em paralelo ao diagnóstico. Leitura em 4 passos: tamanho, modelo, vão, benchmark.' || v_rod, null, v_nome, 'projetos', gestao.add_dias_uteis(v_hoje, 3));
    v_criadas := array_append(v_criadas, 'Pesquisa de mercado'::text);
  end if;

  if exists (select 1 from gestao.tarefas where titulo = '[ARCO] ' || v_nome || ' · Subir pesquisa de audiência' and cliente_id = v_cli and arquivada_em is null) then
    v_puladas := array_append(v_puladas, 'Subir pesquisa de audiência'::text);
  else
    perform gestao.srv_criar_peca('[ARCO] ' || v_nome || ' · Subir pesquisa de audiência', 'Rascunho da rotina', '{"aprovador":"Isa"}'::jsonb,
      'Só depois do diagnóstico analisado e da pesquisa de mercado concluída. A rotina gera o formulário e o convite; revisar, mandar ao cliente e concluir. Cliente sobe em 1 dia.' || v_rod,
      v_pesq, v_nome, 'projetos', gestao.add_dias_uteis(v_hoje, 4));
    v_criadas := array_append(v_criadas, 'Subir pesquisa de audiência'::text);
  end if;

  if exists (select 1 from gestao.tarefas where titulo = '[ARCO] ' || v_nome || ' · Mapa da persona' and cliente_id = v_cli and arquivada_em is null) then
    v_puladas := array_append(v_puladas, 'Mapa da persona'::text);
  else
    perform gestao.srv_criar_peca('[ARCO] ' || v_nome || ' · Mapa da persona', 'Rascunho da rotina', '{"aprovador":"Isa"}'::jsonb,
      '1 dia após o fim da coleta, cruzando formulário, pesquisa de mercado e pesquisa de audiência.' || v_rod, null, v_nome, 'projetos', gestao.add_dias_uteis(v_hoje, 9));
    v_criadas := array_append(v_criadas, 'Mapa da persona'::text);
  end if;

  if exists (select 1 from gestao.tarefas where titulo = '[ARCO] ' || v_nome || ' · Preparar Encontro 1' and cliente_id = v_cli and arquivada_em is null) then
    v_puladas := array_append(v_puladas, 'Preparar Encontro 1'::text);
  else
    perform gestao.srv_criar_peca('[ARCO] ' || v_nome || ' · Preparar Encontro 1', 'Encontro Arco', '{"aprovador":"Isa"}'::jsonb,
      'Skill preparacao-encontro-arco: esqueleto aprovado antes do deck.' || v_rod, null, v_nome, 'projetos', gestao.add_dias_uteis(v_hoje, 9));
    v_criadas := array_append(v_criadas, 'Preparar Encontro 1'::text);
  end if;

  return jsonb_build_object('cliente', v_nome, 'cliente_id', v_cli,
    'tarefas_simples', v_res, 'pecas_criadas', to_jsonb(v_criadas), 'pecas_ja_existiam', to_jsonb(v_puladas),
    'total_criadas', coalesce(jsonb_array_length(v_res -> 'criadas'), 0) + coalesce(array_length(v_criadas, 1), 0));
end;
$$;

revoke execute on function gestao.srv_garantir_cliente(text) from public, anon, authenticated;
revoke execute on function gestao.srv_onboarding_arco(text, text) from public, anon, authenticated;
grant execute on function gestao.srv_garantir_cliente(text) to service_role;
grant execute on function gestao.srv_onboarding_arco(text, text) to service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'gestao_n8n') then
    grant execute on function gestao.srv_garantir_cliente(text) to gestao_n8n;
    grant execute on function gestao.srv_onboarding_arco(text, text) to gestao_n8n;
  end if;
end $$;
