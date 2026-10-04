# ApuraBrasil

Painel web para acompanhamento e exploração dos resultados oficiais das Eleições 2026 no Brasil.

## Fontes oficiais

- TSE Resultados: arquivos JSON oficiais de divulgação (`EA20`, configuração de municípios e seções).
- IBGE: malhas geográficas de estados, municípios e distritos/regiões.

## Navegação

Brasil → Estado → Município → Distrito/Região, com zonas e seções eleitorais no painel lateral.

## Cargos

- Presidente
- Governador
- Senador
- Deputado Federal
- Deputado Estadual / Distrital

## Persistência

O backend grava snapshots no Supabase quando as variáveis abaixo estiverem configuradas no Vercel:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

O schema está em `supabase/schema.sql`. A tabela tem RLS habilitado e não permite acesso direto por `anon` ou `authenticated`; a gravação é feita somente pelo backend.

## Deploy

Projeto preparado para Vercel, com interface estática e funções serverless em `/api`.

## Observação

O ApuraBrasil não realiza a totalização oficial. Ele consulta e apresenta os arquivos oficiais disponibilizados pela Justiça Eleitoral.
