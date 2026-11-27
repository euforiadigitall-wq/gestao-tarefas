-- Quem e responsavel (principal ou extra) de uma recorrente pode ler a regra, para ver a previa na Agenda.
-- Criar, editar e apagar continua so admin (policy recorrentes_admin).
-- Pode rodar de novo.
drop policy if exists recorrentes_leitura_responsavel on gestao.recorrentes;
create policy recorrentes_leitura_responsavel on gestao.recorrentes for select to authenticated
  using (ativo and (responsavel_id = auth.uid() or auth.uid() = any (responsaveis_extras)));

select count(*) as regras_ativas from gestao.recorrentes where ativo;
