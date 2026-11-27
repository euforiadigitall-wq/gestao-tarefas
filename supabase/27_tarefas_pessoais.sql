-- 27: tarefas pessoais (privadas). Rodar depois do 26.
-- Regra: tarefa pessoal só é vista e editada por quem é dono dela (responsável, criador ou co-responsável)
-- e, quando o dono é sócia (Iza ou Isa), pela outra sócia. Admin comum (Bia) e membros (Jony etc.) não veem,
-- nem na agenda, nem no Hoje, nem em métricas feitas pela tela.
-- Marcação automática: título que começa com [P], (P), P: ou [Pessoal] vira pessoal sozinho.
-- A trava é feita com política RESTRITIVA: ela soma às regras que já existem e nunca as afrouxa.

alter table gestao.pessoas add column if not exists socia boolean not null default false;
alter table gestao.tarefas add column if not exists pessoal boolean not null default false;

-- Quem são as sócias (Iza e Isa), pelo apelido ou primeiro nome
update gestao.pessoas
   set socia = true
 where ativo and papel = 'admin'
   and lower(coalesce(nullif(apelido, ''), split_part(nome, ' ', 1))) in ('iza', 'isa');

create or replace function gestao.e_socia() returns boolean
language sql stable security definer set search_path = gestao, public as $$
  select exists (select 1 from gestao.pessoas where id = auth.uid() and ativo and socia);
$$;
revoke execute on function gestao.e_socia() from public, anon;
grant execute on function gestao.e_socia() to authenticated;

-- Pode ver/mexer nessa tarefa pessoal?
create or replace function gestao.pode_pessoal(p_tarefa uuid) returns boolean
language sql stable security definer set search_path = gestao, public as $$
  select not exists (select 1 from gestao.tarefas t where t.id = p_tarefa and t.pessoal)
      or exists (
        select 1 from gestao.tarefas t
        where t.id = p_tarefa and t.pessoal and gestao.ativa()
          and (t.responsavel_id = auth.uid()
               or t.criado_por = auth.uid()
               or gestao.e_responsavel(t.id)
               or (gestao.e_socia()
                   and exists (select 1 from gestao.pessoas o
                               where o.socia and o.id in (t.responsavel_id, t.criado_por))))
      );
$$;
revoke execute on function gestao.pode_pessoal(uuid) from public, anon;
grant execute on function gestao.pode_pessoal(uuid) to authenticated;

-- Marca sozinho pelo título; quem não pode ver a própria tarefa pessoal não consegue criá-la errada
create or replace function gestao._marcar_pessoal() returns trigger
language plpgsql set search_path = gestao, public as $$
begin
  if new.titulo ~* '^\s*([\[(](p|pessoal)[\])]|p\s*:)' then
    new.pessoal := true;
  end if;
  return new;
end;
$$;
drop trigger if exists tarefas_marcar_pessoal on gestao.tarefas;
create trigger tarefas_marcar_pessoal before insert or update of titulo on gestao.tarefas
  for each row execute function gestao._marcar_pessoal();

-- Política restritiva na própria tarefa
drop policy if exists tarefas_pessoal on gestao.tarefas;
create policy tarefas_pessoal on gestao.tarefas as restrictive for all to authenticated
  using (not pessoal or gestao.pode_pessoal(id))
  with check (not pessoal or gestao.pode_pessoal(id));

-- E em tudo que pendura na tarefa
do $$
declare t text;
begin
  foreach t in array array['tarefa_etapas', 'historico', 'checklist', 'comentarios', 'links', 'tarefa_responsaveis', 'tarefa_lancamentos'] loop
    if to_regclass('gestao.' || t) is not null then
      execute format('drop policy if exists %I on gestao.%I', t || '_pessoal', t);
      execute format('create policy %I on gestao.%I as restrictive for all to authenticated using (gestao.pode_pessoal(tarefa_id)) with check (gestao.pode_pessoal(tarefa_id))', t || '_pessoal', t);
    end if;
  end loop;
end $$;

-- As tarefas que já existem com [P] ou [Pessoal] no título passam a ser pessoais
update gestao.tarefas set pessoal = true
 where not pessoal and titulo ~* '^\s*([\[(](p|pessoal)[\])]|p\s*:)';

-- Conferência: quem é sócia e quantas tarefas ficaram pessoais, por dono
select 'socias' as o_que, nome as quem, apelido as detalhe from gestao.pessoas where socia
union all
select 'pessoais', coalesce(p.nome, '?'), count(*)::text
  from gestao.tarefas t left join gestao.pessoas p on p.id = t.responsavel_id
 where t.pessoal group by p.nome;
