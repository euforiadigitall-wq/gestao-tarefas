# EuforIA Tarefas

Sistema interno de tarefas da EuforIA Digital.

## Rodar no seu computador
```bash
npm install
cp .env.example .env.local   # preencha NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

## Publicar na Vercel
1. Vercel, Add New, Project, escolha este repositório.
2. Em Environment Variables, crie as três variáveis de `.env.example` (a chave é a pública, anon ou publishable).
3. Deploy. Depois, em `NEXT_PUBLIC_SITE_URL`, use o endereço final e faça Redeploy.
4. No Supabase, Authentication, URL Configuration: coloque o endereço do sistema em Site URL e acrescente `https://SEU-ENDERECO/auth/callback` em Redirect URLs. Sem isso o "esqueci minha senha" não funciona.

## Banco e automações
- `supabase/01_gestao_v2.sql`, `02_gestao_v3.sql`, `03_pessoas.sql`: rodar nesta ordem no SQL Editor.
- `n8n/`: dois fluxos (enviar avisos por e-mail a cada 5 minutos; rotina das 8h).
