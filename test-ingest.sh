#!/bin/bash

# Test product payload
curl -X POST http://localhost:3000/v1/inovafarma/products \
  -H "Content-Type: application/json" \
  -H 'X-Inova-Api-Key: JFiennsli3iNLL2@DFDsdfdAS!JDISkddkLndJKJKN!@;sadffd:kjasjk' \
  -H "X-Inova-Load-Type: full" \
  -H "Idempotency-Key: test-batch-001" \
  -d '[{
    "CNPJ":"05927228000145",
    "INDICE":0,
    "PRODUCTID":"25901",
    "EAN":"7896094921399",
    "TITLE":"Buscopan Composto Cx 20Cpr",
    "DESCRIPTION":"Buscopan Composto Cx 20Cpr",
    "SHOPID":1,
    "PRICE":27.04,
    "PRICEPROMO":25.5,
    "WHOLESALEPRICE":0,
    "WHOLESALEMIN":0,
    "QUANTITY":4.0,
    "CATEGORY":"ETICOS",
    "MEASURE":0,
    "NCM":"30044990",
    "BRAND":"Boehringer",
    "IMAGELINK":"",
    "SIZE":1.0,
    "COLOR":"",
    "DATACADASTROPRODUTO":"2025-12-10T11:49:18.623",
    "DATAATUALIZACAOPRODUTO":"2025-12-10T11:49:18.623",
    "DATAATUALIZACAOESTOQUE":"2025-12-10T11:49:18.623"
  }]'
