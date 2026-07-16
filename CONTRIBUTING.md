# Contribuindo com o AtendePRO

## Fluxo recomendado

1. Crie uma branch a partir de `develop`.
2. Faça alterações pequenas e focadas.
3. Execute `npm run lint` e `npm run build`.
4. Revise responsividade, permissões e isolamento por empresa.
5. Abra um pull request descrevendo o problema, a solução e os testes.

## Padrões

- TypeScript estrito; evite `any` sem justificativa.
- Regras críticas devem ser validadas também no banco/API.
- Não exponha chaves de serviço no cliente.
- Toda tabela multiempresa deve possuir `business_id` e política RLS.
- Mudanças em agenda devem testar concorrência e conflito de horários.
- Dados de saúde devem ter acesso restrito, auditoria e retenção definida.
