-- Insert test pharmacy
INSERT INTO "Pharmacy" (cnpj, name, state, city, "rawJson", "createdAt", "updatedAt") 
VALUES ('05927228000145', 'Farmácia Teste', 'SP', 'São Paulo', '{}', NOW(), NOW()) 
ON CONFLICT DO NOTHING
RETURNING id, cnpj, name;
