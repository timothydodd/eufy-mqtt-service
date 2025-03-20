import mqtt from 'mqtt';
import { EufyService } from './eufy-service';
import { LoggingService } from './logging-service';

export interface MqttServiceConfig {
  brokerUrl: string;
  username?: string;
  password?: string;
  topic: string;
  clientId: string;
}

export class MqttService {
  private client: mqtt.MqttClient;
  private config: MqttServiceConfig;
  private connected = false;

  constructor(
    config: MqttServiceConfig,
    private eufyService: EufyService,
    private loggingService: LoggingService
  ) {
    this.config = config;

    // Initialize MQTT client
    this.client = mqtt.connect(this.config.brokerUrl, {
      username: this.config.username,
      password: this.config.password,
      clientId: this.config.clientId,
    });

    this.setupEventHandlers();
  }

  public async initialize(): Promise<void> {
    // Setup listeners for Eufy events
    this.setupEufyListeners();
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public async close(): Promise<void> {
    this.loggingService.info('Disconnecting from MQTT broker...');
    this.client.end();
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      this.loggingService.info('Connected to MQTT broker');
      this.connected = true;
    });

    this.client.on('error', (error) => {
      this.loggingService.error('MQTT error:', error);
    });

    this.client.on('close', () => {
      this.loggingService.info('Disconnected from MQTT broker');
      this.connected = false;
    });
  }

  private setupEufyListeners(): void {
    // Listen for status changes
    this.eufyService.on('statusChanged', (status: any) => {
      this.publishToMqtt(`${this.config.topic}/status`, status);
    });

    // Listen for device property changes
    this.eufyService.on('devicePropertyChanged', (data: any) => {
      this.publishToMqtt(`${this.config.topic}/${data.deviceName}/${data.property}`, data.value);
    });

    // Listen for device events
    this.eufyService.on('deviceEvent', (event: any) => {
      this.publishToMqtt(`${this.config.topic}/${event.deviceName}/event/${event.eventType}`, {
        timestamp: event.timestamp,
      });
    });
  }

  private publishToMqtt(topic: string, message: any): void {
    if (this.client.connected) {
      try {
        this.client.publish(topic, JSON.stringify(message), {
          qos: 1,
          retain: true,
        });
      } catch (error) {
        this.loggingService.error(`Error publishing to MQTT topic ${topic}:`, error);
      }
    } else {
      this.loggingService.error('Cannot publish to MQTT: not connected');
    }
  }
}
