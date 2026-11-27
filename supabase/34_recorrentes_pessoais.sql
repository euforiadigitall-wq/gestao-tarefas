-- 34: recorrentes pessoais. Rodar depois do 33 (precisa do 27 e do 30).
-- A tarefa gerada por uma recorrente com [P], (P), P:, [Pessoal] ou [PSI] no título já nasce pessoal (o gatilho do script 27 pega o título).
-- Faltava a própria regra: sem isto, as outras admins veem "[P] ..." na tela Recorrentes e na prévia da Agenda.
-- Regra de visão igual à da tarefa pessoal: dono (quem faz, quem criou, quem é extra) e, se o dono é sócia, a outra sócia.
-- A política é RESTRITIVA: soma às que já existem, nunca afrouxa. Pode rodar de novo.

alter table gestao.recorrentes add column if not exists pessoal boolean not null default false;

create or replace function gestao._marcar_pessoal_recorrente() returns trigger
language plpgsql set search_path = gestao, public as $$
begin
  if new.titulo ~* '^\s*([\[(](p|pessoal|psi)[\])]|p\s*:)' then
    new.pessoal := true;
  end if;
  return new;
end;
$$;
drop trigger if exists recorrentes_marcar_pessoal on gestao.recorrentes;
create trigger recorrentes_marcar_pessoal before insert or update of titulo on gestao.recorrentes
  for each row execute function gestao._marcar_pessoal_recorrente();

update gestao.recorrentes set pessoal = true
 where not pessoal and titulo ~* '^\s*([\[(](p|pessoal|psi)[\])]|p\s*:)';

drop policy if exists recorrentes_pessoal on gestao.recorrentes;
create policy recorrentes_pessoal on gestao.recorrentes as restrictive for all to authenticated
  using (
    not pessoal
    or responsavel_id = auth.uid()
    or criado_por = auth.uid()
    or auth.uid() = any (responsaveis_extras)
    or (gestao.e_socia()
        and exists (select 1 from gestao.pessoas o where o.socia and o.id in (responsavel_id, criado_por)))
  )
  with check (
    not pessoal
    or responsavel_id = auth.uid()
    or criado_por = auth.uid()
    or auth.uid() = any (responsaveis_extras)
    or (gestao.e_socia()
        and exists (select 1 from gestao.pessoas o where o.socia and o.id in (responsavel_id, criado_por)))
  );

-- Conferência: recorrentes pessoais por dono
select coalesce(p.nome, '?') as dono, count(*) as recorrentes_pessoais
  from gestao.recorrentes r left join gestao.pessoas p on p.id = r.responsavel_id
 where r.pessoal group by p.nome;
