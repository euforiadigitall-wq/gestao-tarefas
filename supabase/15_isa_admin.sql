-- 15: Isa como admin. Ela já tem usuário no Supabase (Authentication); aqui só entra na tabela de pessoas.
-- Pode rodar de novo. Se a Isa já estiver na tabela, vira admin e ativa.
insert into gestao.pessoas (id, nome, apelido, email, papel, ativo)
select u.id, 'Isa', 'Isa', lower(u.email), 'admin', true
from auth.users u
where lower(u.email) = 'contato@euforiadigital.com'
on conflict (id) do update set papel = 'admin', ativo = true, email = excluded.email;

-- Conferência: deve voltar 1 linha com papel admin. Se voltar vazio, o e-mail não existe em Authentication.
select nome, email, papel, ativo from gestao.pessoas where lower(email) = 'contato@euforiadigital.com';
