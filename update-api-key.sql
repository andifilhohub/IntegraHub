-- Atualizar chave de API para o CNPJ 05927228000145
UPDATE "Pharmacy" 
SET "apiKey" = 'JFiennsli3iNLL2@DFDsdfdAS!JDISkddkLndJKJKN!@;sadffd:kjasjk',
    "updatedAt" = NOW()
WHERE cnpj = '05927228000145';

-- Verificar resultado
SELECT cnpj, "apiKey" FROM "Pharmacy" WHERE cnpj = '05927228000145';
