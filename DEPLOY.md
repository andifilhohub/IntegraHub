# IntegraHub - Guia de Deploy

## 📋 Pré-requisitos

### Infraestrutura Necessária
- **Node.js**: 20.x ou superior
- **PostgreSQL**: 14.x ou superior
- **Apache Kafka**: 3.x (com Zookeeper ou KRaft)
- **MinIO** ou **AWS S3**: Object storage
- **Docker** e **Docker Compose**: Para ambiente local/staging
- **Kubernetes**: Para produção (opcional, mas recomendado)

### Recursos Mínimos Recomendados

#### Ambiente de Desenvolvimento
- **API**: 1 instância, 512MB RAM, 0.5 CPU
- **Workers**: 1 chunker + 2 upsert, 1GB RAM total, 1 CPU
- **PostgreSQL**: 1GB RAM, 1 CPU, 20GB storage
- **Kafka**: 1GB RAM, 1 CPU, 10GB storage
- **MinIO**: 512MB RAM, 0.5 CPU, 50GB storage

#### Ambiente de Produção
- **API**: 3-5 instâncias, 1GB RAM cada, 1 CPU cada
- **Workers**: 1 chunker + 4-8 upsert, 4GB RAM total, 4 CPU
- **PostgreSQL**: 4GB RAM, 2 CPU, 100GB SSD
- **Kafka**: 4GB RAM, 2 CPU, 100GB SSD, 3 brokers
- **MinIO/S3**: 2GB RAM, 1 CPU, 500GB storage (ou S3 ilimitado)

---

## 🐳 Deploy Local (Docker Compose)

### 1. Clonar Repositório
```bash
git clone https://github.com/andifilhohub/IntegraHub.git
cd IntegraHub
```

### 2. Configurar Variáveis de Ambiente
```bash
cp .env.example .env
# Editar .env com suas credenciais
```

### 3. Subir Infraestrutura
```bash
# Subir PostgreSQL, Kafka, Zookeeper, MinIO
docker-compose up -d

# Verificar se todos os serviços estão rodando
docker-compose ps
```

**Serviços rodando**:
- PostgreSQL: `localhost:5432`
- Kafka: `localhost:9092`
- Zookeeper: `localhost:2181`
- MinIO: `localhost:9000` (Console: `localhost:9001`)

### 4. Executar Migrações
```bash
# Migrações já foram aplicadas, mas para reaplicar:
PGPASSWORD=<sua_senha> psql -h localhost -U integrahub_user -d integra_hub -f migrations/001-initial-schema.sql
PGPASSWORD=<sua_senha> psql -h localhost -U integrahub_user -d integra_hub -f migrations/002-add-product-fields.sql
PGPASSWORD=<sua_senha> psql -h localhost -U integrahub_user -d integra_hub -f migrations/003-create-batch-tables.sql
PGPASSWORD=<sua_senha> psql -h localhost -U integrahub_user -d integra_hub -f migrations/004-add-product-unique-constraint.sql
```

### 5. Instalar Dependências
```bash
npm install
```

### 6. Iniciar Aplicação

**Terminal 1 - API**:
```bash
npm run dev
```

**Terminal 2 - Workers**:
```bash
npm run workers
```

### 7. Verificar Saúde
```bash
# Health check da API
curl http://localhost:3000/health

# Verificar workers rodando
ps aux | grep node
```

### 8. Testar Pipeline
```bash
# Teste simples
./test-pipeline.sh

# Teste de stress
./stress-test-simple.sh 10 100 100
```

---

## ☸️ Deploy em Kubernetes

### 1. Preparar Imagens Docker

#### Dockerfile para API
```dockerfile
# Criar: Dockerfile.api
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src ./src
COPY .env.example ./.env

EXPOSE 3000

CMD ["node", "src/index.js"]
```

#### Dockerfile para Workers
```dockerfile
# Criar: Dockerfile.workers
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src ./src
COPY .env.example ./.env

CMD ["node", "src/workers/orchestrator.js"]
```

#### Build e Push
```bash
# Build
docker build -t seu-registry/integrahub-api:latest -f Dockerfile.api .
docker build -t seu-registry/integrahub-workers:latest -f Dockerfile.workers .

# Push para registry
docker push seu-registry/integrahub-api:latest
docker push seu-registry/integrahub-workers:latest
```

### 2. Kubernetes Manifests

#### Namespace
```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: integrahub
```

#### ConfigMap
```yaml
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: integrahub-config
  namespace: integrahub
data:
  NODE_ENV: "production"
  PORT: "3000"
  KAFKA_BROKERS: "kafka-service:9092"
  KAFKA_TOPIC_BATCHES_RECEIVED: "batches.received"
  KAFKA_TOPIC_CHUNKS_READY: "chunks.ready"
  CHUNK_SIZE: "1000"
  MIN_UPSERT_WORKERS: "2"
  MAX_UPSERT_WORKERS: "8"
```

#### Secrets
```yaml
# k8s/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: integrahub-secrets
  namespace: integrahub
type: Opaque
stringData:
  DATABASE_URL: "postgresql://user:password@postgres-service:5432/integra_hub"
  STORAGE_ACCESS_KEY: "minioadmin"
  STORAGE_SECRET_KEY: "minioadmin"
  VALID_API_KEYS: "sua-api-key-aqui"
```

#### Deployment - API
```yaml
# k8s/api-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: integrahub-api
  namespace: integrahub
spec:
  replicas: 3
  selector:
    matchLabels:
      app: integrahub-api
  template:
    metadata:
      labels:
        app: integrahub-api
    spec:
      containers:
      - name: api
        image: seu-registry/integrahub-api:latest
        ports:
        - containerPort: 3000
        envFrom:
        - configMapRef:
            name: integrahub-config
        - secretRef:
            name: integrahub-secrets
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: integrahub-api-service
  namespace: integrahub
spec:
  selector:
    app: integrahub-api
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: LoadBalancer
```

#### Deployment - Chunker Worker
```yaml
# k8s/chunker-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: integrahub-chunker
  namespace: integrahub
spec:
  replicas: 1  # Sempre 1 chunker
  selector:
    matchLabels:
      app: integrahub-chunker
  template:
    metadata:
      labels:
        app: integrahub-chunker
    spec:
      containers:
      - name: chunker
        image: seu-registry/integrahub-workers:latest
        command: ["node", "src/workers/chunker.js"]
        envFrom:
        - configMapRef:
            name: integrahub-config
        - secretRef:
            name: integrahub-secrets
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
```

#### Deployment - Upsert Workers
```yaml
# k8s/upsert-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: integrahub-upsert
  namespace: integrahub
spec:
  replicas: 4  # 4 upsert workers
  selector:
    matchLabels:
      app: integrahub-upsert
  template:
    metadata:
      labels:
        app: integrahub-upsert
    spec:
      containers:
      - name: upsert
        image: seu-registry/integrahub-workers:latest
        command: ["node", "src/workers/upsert.js"]
        envFrom:
        - configMapRef:
            name: integrahub-config
        - secretRef:
            name: integrahub-secrets
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
```

#### HorizontalPodAutoscaler
```yaml
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: integrahub-api-hpa
  namespace: integrahub
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: integrahub-api
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: integrahub-upsert-hpa
  namespace: integrahub
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: integrahub-upsert
  minReplicas: 2
  maxReplicas: 16
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

### 3. Deploy no Kubernetes
```bash
# Criar namespace
kubectl apply -f k8s/namespace.yaml

# Criar configurações
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml

# Deploy aplicação
kubectl apply -f k8s/api-deployment.yaml
kubectl apply -f k8s/chunker-deployment.yaml
kubectl apply -f k8s/upsert-deployment.yaml

# Deploy auto-scaling
kubectl apply -f k8s/hpa.yaml

# Verificar pods
kubectl get pods -n integrahub

# Verificar serviços
kubectl get svc -n integrahub
```

### 4. Verificar Deploy
```bash
# Logs da API
kubectl logs -f deployment/integrahub-api -n integrahub

# Logs dos workers
kubectl logs -f deployment/integrahub-chunker -n integrahub
kubectl logs -f deployment/integrahub-upsert -n integrahub

# Status dos pods
kubectl get pods -n integrahub -w
```

---

## 🔧 Serviços de Infraestrutura

### PostgreSQL

#### Usando RDS (AWS)
```bash
# Criar instância RDS
aws rds create-db-instance \
  --db-instance-identifier integrahub-postgres \
  --db-instance-class db.t3.medium \
  --engine postgres \
  --engine-version 14.10 \
  --master-username integrahub_user \
  --master-user-password <senha> \
  --allocated-storage 100 \
  --storage-type gp3 \
  --vpc-security-group-ids <security-group-id> \
  --backup-retention-period 7 \
  --multi-az

# Atualizar DATABASE_URL no secrets
DATABASE_URL=postgresql://integrahub_user:<senha>@<rds-endpoint>:5432/integra_hub
```

#### Usando Cloud SQL (GCP)
```bash
# Criar instância
gcloud sql instances create integrahub-postgres \
  --database-version=POSTGRES_14 \
  --tier=db-custom-2-8192 \
  --region=us-central1 \
  --backup \
  --backup-start-time=02:00

# Criar usuário
gcloud sql users create integrahub_user \
  --instance=integrahub-postgres \
  --password=<senha>

# Criar database
gcloud sql databases create integra_hub \
  --instance=integrahub-postgres
```

### Kafka

#### Usando MSK (AWS)
```bash
# Criar cluster MSK
aws kafka create-cluster \
  --cluster-name integrahub-kafka \
  --broker-node-group-info file://broker-config.json \
  --kafka-version 3.5.1 \
  --number-of-broker-nodes 3

# broker-config.json:
{
  "InstanceType": "kafka.m5.large",
  "ClientSubnets": ["subnet-xxx", "subnet-yyy", "subnet-zzz"],
  "SecurityGroups": ["sg-xxx"],
  "StorageInfo": {
    "EbsStorageInfo": {
      "VolumeSize": 100
    }
  }
}

# Atualizar KAFKA_BROKERS no config
KAFKA_BROKERS=b-1.xxx.kafka.us-east-1.amazonaws.com:9092,b-2.xxx...
```

#### Usando Confluent Cloud
```bash
# Criar cluster no console: https://confluent.cloud
# Obter bootstrap servers e credenciais

# Atualizar config
KAFKA_BROKERS=pkc-xxx.us-east-1.aws.confluent.cloud:9092
KAFKA_SASL_USERNAME=<api-key>
KAFKA_SASL_PASSWORD=<api-secret>
```

### MinIO / S3

#### Usando S3 (AWS)
```bash
# Criar bucket
aws s3 mb s3://integrahub-batches --region us-east-1

# Configurar lifecycle policy (opcional)
aws s3api put-bucket-lifecycle-configuration \
  --bucket integrahub-batches \
  --lifecycle-configuration file://lifecycle.json

# lifecycle.json:
{
  "Rules": [{
    "Id": "DeleteOldPayloads",
    "Status": "Enabled",
    "Expiration": { "Days": 30 },
    "Filter": { "Prefix": "batches/" }
  }]
}

# Atualizar config
STORAGE_ENDPOINT=s3.us-east-1.amazonaws.com
STORAGE_BUCKET=integrahub-batches
STORAGE_ACCESS_KEY=<access-key>
STORAGE_SECRET_KEY=<secret-key>
STORAGE_USE_SSL=true
```

#### Usando MinIO (Self-hosted)
```bash
# Deploy MinIO no Kubernetes
kubectl apply -f https://raw.githubusercontent.com/minio/minio/master/docs/orchestration/kubernetes/minio-standalone.yaml

# Criar bucket via console ou mc client
mc alias set myminio http://minio-service:9000 minioadmin minioadmin
mc mb myminio/integrahub-batches
```

---

## 🚀 Processo de Deploy Completo

### 1. Preparação
```bash
# Verificar código
git status
git pull origin main

# Executar testes locais
npm test
./test-pipeline.sh
```

### 2. Build
```bash
# Build imagens Docker
docker build -t seu-registry/integrahub-api:v1.0.0 -f Dockerfile.api .
docker build -t seu-registry/integrahub-workers:v1.0.0 -f Dockerfile.workers .

# Push para registry
docker push seu-registry/integrahub-api:v1.0.0
docker push seu-registry/integrahub-workers:v1.0.0
```

### 3. Deploy
```bash
# Atualizar imagens no Kubernetes
kubectl set image deployment/integrahub-api api=seu-registry/integrahub-api:v1.0.0 -n integrahub
kubectl set image deployment/integrahub-chunker chunker=seu-registry/integrahub-workers:v1.0.0 -n integrahub
kubectl set image deployment/integrahub-upsert upsert=seu-registry/integrahub-workers:v1.0.0 -n integrahub

# Verificar rollout
kubectl rollout status deployment/integrahub-api -n integrahub
kubectl rollout status deployment/integrahub-chunker -n integrahub
kubectl rollout status deployment/integrahub-upsert -n integrahub
```

### 4. Verificação Pós-Deploy
```bash
# Verificar health
kubectl exec -it deployment/integrahub-api -n integrahub -- curl localhost:3000/health

# Verificar logs
kubectl logs -f deployment/integrahub-api -n integrahub --tail=100

# Testar endpoint
curl -X POST https://seu-dominio.com/v1/inovafarma/products \
  -H "Content-Type: application/json" \
  -H "X-Inova-Api-Key: <sua-key>" \
  -H "X-Inova-Load-Type: delta" \
  -d '[{"CNPJ":"05927228000145","PRODUCTID":1,"TITLE":"Test",...}]'
```

### 5. Rollback (se necessário)
```bash
# Voltar para versão anterior
kubectl rollout undo deployment/integrahub-api -n integrahub
kubectl rollout undo deployment/integrahub-workers -n integrahub

# Ou para versão específica
kubectl rollout history deployment/integrahub-api -n integrahub
kubectl rollout undo deployment/integrahub-api --to-revision=2 -n integrahub
```

---

## 📊 Monitoramento Pós-Deploy

### Verificar Saúde dos Serviços
```bash
# API
curl https://seu-dominio.com/health

# PostgreSQL
PGPASSWORD=<senha> psql -h <endpoint> -U integrahub_user -d integra_hub -c "SELECT 1"

# Kafka
kafka-topics.sh --bootstrap-server <kafka-endpoint> --list

# MinIO/S3
aws s3 ls s3://integrahub-batches/
```

### Métricas Importantes
- Taxa de requisições/segundo na API
- Kafka consumer lag
- Throughput de produtos processados
- Taxa de erro de batches
- Uso de CPU/memória dos pods

---

## 🔐 Checklist de Segurança

- [ ] Secrets em Kubernetes Secrets ou Vault (não em ConfigMaps)
- [ ] HTTPS habilitado (TLS certificates)
- [ ] Network policies configuradas
- [ ] Rate limiting habilitado
- [ ] API keys rotacionadas regularmente
- [ ] Backups automáticos do PostgreSQL
- [ ] Logs centralizados (CloudWatch, Stackdriver, etc)
- [ ] Alertas configurados

---

## 📞 Troubleshooting

### API não responde
```bash
# Verificar logs
kubectl logs deployment/integrahub-api -n integrahub

# Verificar conectividade Kafka
kubectl exec -it deployment/integrahub-api -n integrahub -- nc -zv kafka-service 9092

# Verificar conectividade PostgreSQL
kubectl exec -it deployment/integrahub-api -n integrahub -- nc -zv postgres-service 5432
```

### Workers não processam
```bash
# Verificar Kafka lag
kafka-consumer-groups.sh --bootstrap-server <kafka> --group upsert-workers --describe

# Reiniciar workers
kubectl rollout restart deployment/integrahub-upsert -n integrahub
```

### Database connection pool esgotado
```bash
# Verificar conexões ativas
SELECT count(*) FROM pg_stat_activity WHERE datname='integra_hub';

# Aumentar pool size no código ou escalar pods
```

---

**Autor**: IntegraHub Team  
**Última atualização**: 2025-12-23
