import { Kafka } from 'kafkajs';
import dotenv from 'dotenv';

dotenv.config();

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'integrahub-api',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  retry: {
    initialRetryTime: 100,
    retries: 8
  }
});

const producer = kafka.producer({
  allowAutoTopicCreation: true,
  transactionTimeout: 30000,
});

let isConnected = false;

export async function connectProducer() {
  if (!isConnected) {
    await producer.connect();
    isConnected = true;
    console.log('✅ Kafka producer connected');
  }
  return producer;
}

export async function publishBatchReceived(batchId, cnpj, loadType) {
  const topic = process.env.KAFKA_TOPIC_BATCHES_RECEIVED || 'batches.received';
  
  await producer.send({
    topic,
    messages: [{
      key: cnpj,
      value: JSON.stringify({
        batchId,
        cnpj,
        loadType,
        timestamp: new Date().toISOString()
      }),
      headers: {
        'event-type': 'batch.received',
        'batch-id': batchId
      }
    }]
  });
}

export async function disconnectProducer() {
  if (isConnected) {
    await producer.disconnect();
    isConnected = false;
  }
}

export default producer;
