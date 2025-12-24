import { Kafka } from 'kafkajs';
import dotenv from 'dotenv';

dotenv.config();

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'integrahub-workers',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  retry: {
    initialRetryTime: 100,
    retries: 8
  }
});

export async function createConsumer(groupId, topics) {
  const consumer = kafka.consumer({
    groupId,
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
  });

  await consumer.connect();
  await consumer.subscribe({ topics, fromBeginning: false });
  
  console.log(`✅ Consumer connected: ${groupId} → [${topics.join(', ')}]`);
  
  return consumer;
}

export async function getConsumerLag(consumer, topic) {
  try {
    const offsets = await consumer
      .describeGroup()
      .then(group => group.members.map(m => m.memberAssignment));
    
    // Simplified lag calculation - in production use proper Kafka Admin API
    return 0; // Placeholder - implement proper lag detection
  } catch (error) {
    console.error('Error getting consumer lag:', error);
    return 0;
  }
}

export default kafka;
