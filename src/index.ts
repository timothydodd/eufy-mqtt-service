import dotenv from "dotenv";
import path from "path";
import { ApiService } from "./services/api-service";
import { EufyService, EufyServiceConfig } from "./services/eufy-service";
import {
  LoggingService,
  LoggingServiceConfig,
  LogLevel,
} from "./services/logging-service";
import { MqttService, MqttServiceConfig } from "./services/mqtt-service";
import { WebSocketService } from "./services/websocket-service";

// Load environment variables
dotenv.config();

// Create Express app and HTTP server (shared between API and WebSocket)
// const app = express();
// const server = http.createServer(app);
const PORT = parseInt(process.env.WEB_PORT || "3000");

// Configuration
const config = {
  logging: {
    level: (process.env.LOG_LEVEL || "debug") as LogLevel,
    logToConsole: process.env.LOG_TO_CONSOLE !== "false",
    logToFile: process.env.LOG_TO_FILE === "true",
    logDir: path.join(__dirname, process.env.LOG_DIR || "logs"),
    logFileName: process.env.LOG_FILE_NAME || "eufy-mqtt-service.log",
    serviceContext: "eufy-mqtt-service",
  } as LoggingServiceConfig,
  eufy: {
    username: process.env.EUFY_USERNAME || "",
    password: process.env.EUFY_PASSWORD || "",
    country: process.env.EUFY_COUNTRY || "US",
    language: process.env.EUFY_LANGUAGE || "en",
    persistentDir: path.join(
      __dirname,
      process.env.PERSISTENT_DIR || "persistent"
    ),
    trustedDeviceName: process.env.TRUSTED_DEVICE_NAME || "eufy-mqtt-service",
    p2pConnectionSetup: parseInt(process.env.P2P_CONNECTION_SETUP || "1"),
    pollingIntervalMinutes: parseInt(
      process.env.POLLING_INTERVAL_MINUTES || "10"
    ),
    eventDurationSeconds: parseInt(process.env.EVENT_DURATION_SECONDS || "10"),
    acceptInvitations: process.env.ACCEPT_INVITATIONS === "true",
  } as EufyServiceConfig,
  mqtt: {
    brokerUrl: process.env.MQTT_BROKER_URL || "mqtt://localhost:1883",
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    topic: process.env.MQTT_TOPIC || "eufy/events",
    clientId:
      process.env.MQTT_CLIENT_ID ||
      `eufy-mqtt-${Math.random().toString(16).substring(2, 8)}`,
  } as MqttServiceConfig,
  api: {
    port: PORT,
    staticDir: path.join(__dirname, "public"),
  },
};

// Services
let loggingService: LoggingService = new LoggingService(config.logging);
let eufyService: EufyService;
let mqttService: MqttService;
let apiService: ApiService;
let webSocketService: WebSocketService;
// Validate config
if (!config.eufy.username || !config.eufy.password) {
  loggingService.error(
    "Error: EUFY_USERNAME and EUFY_PASSWORD environment variables are required"
  );
  process.exit(1);
}

// Helper function to clean up resources
async function cleanup() {
  try {
    loggingService.info("Starting application shutdown...");

    if (webSocketService) {
      loggingService.info("Closing WebSocket service...");
      await webSocketService.close();
    }

    if (apiService) {
      loggingService.info("Closing API service...");
      await apiService.close();
    }

    if (mqttService) {
      loggingService.info("Closing MQTT service...");
      await mqttService.close();
    }

    if (eufyService) {
      loggingService.info("Closing Eufy service...");
      await eufyService.close();
    }

    loggingService.info("Shutdown complete");
  } catch (error) {
    loggingService.error("Error during cleanup", error);
  }
}

// Main function to initialize and run the application
async function main() {
  try {
    // Initialize services
    loggingService.info("Initializing services...");

    // 1. Initialize Eufy Service (core service)
    eufyService = new EufyService(
      config.eufy,
      loggingService,
      config.logging.level as LogLevel
    );
    await eufyService.initialize();

    // 2. Initialize MQTT Service
    mqttService = new MqttService(config.mqtt, eufyService, loggingService);
    await mqttService.initialize();

    // 3. Initialize API Service
    apiService = new ApiService(config.api, eufyService, loggingService);
    var server = apiService.initialize();

    // 4. Initialize WebSocket Service (shares server with API)
    webSocketService = new WebSocketService(
      server,
      eufyService,
      loggingService
    );
    await webSocketService.initialize();

    // Keep the process running
    process.on("SIGINT", async () => {
      loggingService.info("Shutting down...");
      await cleanup();
      process.exit(0);
    });
  } catch (error) {
    loggingService.error("Error in main function:", error);
    await cleanup();
    process.exit(1);
  }
}

// Start the application
main().catch((error) => {
  loggingService.error("Fatal error:", error);
  process.exit(1);
});
