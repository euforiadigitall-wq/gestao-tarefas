-- 30: tarefas [PSI] (atendimentos de psicologia) também viram pessoais. Rodar depois do 29.
-- Mesma regra do 27: só o dono e, se o dono é sócia (Iza ou Isa), a outra sócia veem.

create or replace function gestao._marcar_pessoal() returns trigger
language plpgsql set search_path = gestao, public as $$
begin
  if new.titulo ~* '^\s*([\[(](p|pessoal|psi)[\])]|p\s*:)' then
    new.pessoal := true;
  end if;
  return new;
end;
$$;

-- As que já existem
update gestao.tarefas set pessoal = true
 where not pessoal and titulo ~* '^\s*([\[(](p|pessoal|psi)[\])]|p\s*:)';

-- Conferência: quantas pessoais por dono
select coalesce(p.nome, '?') as dono, count(*) as pessoais
  from gestao.tarefas t left join gestao.pessoas p on p.id = t.responsavel_id
 where t.pessoal group by p.nome order by 2 desc;
