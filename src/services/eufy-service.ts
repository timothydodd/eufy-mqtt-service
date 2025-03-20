import {
  Device,
  EufySecurity,
  EufySecurityConfig,
  Logger,
  LoginOptions,
  P2PConnectionType,
  Station,
} from "eufy-security-client";
import { EventEmitter } from "events";
import { existsSync, mkdirSync } from "fs";
import { LoggingService, LogLevel } from "./logging-service";

export interface EufyServiceConfig {
  username: string;
  password: string;
  country: string;
  language: string;
  persistentDir: string;
  trustedDeviceName: string;
  p2pConnectionSetup: number;
  pollingIntervalMinutes: number;
  eventDurationSeconds: number;
  acceptInvitations: boolean;
}

export interface DeviceInfo {
  name: string;
  serial: string;
  type: number;
  properties: any;
  stationSerial?: string;
}

export interface DeviceStatus {
  connected: boolean;
  devices: DeviceInfo[];
  lastEvents: any[];
}

export class EufyService extends EventEmitter {
  private api: EufySecurity | null = null;
  private config: EufyServiceConfig;
  private connected = false;
  private captchaId: string = "";
  private captchaImage: string = "";
  private waitingForCaptcha = false;
  private waitingForTfa = false;
  private deviceStatus: DeviceStatus = {
    connected: false,
    devices: [],
    lastEvents: [],
  };

  constructor(
    config: EufyServiceConfig,
    private logger: LoggingService,
    private loglevel: LogLevel
  ) {
    super();
    this.config = config;

    // Ensure persistent directory exists
    if (!existsSync(this.config.persistentDir)) {
      mkdirSync(this.config.persistentDir, { recursive: true });
    }
  }

  public async initialize(): Promise<void> {
    this.logger.info("Initializing Eufy Security client...");

    var logLevel =
      this.loglevel === LogLevel.DEBUG
        ? 1
        : this.loglevel === LogLevel.TRACE
        ? 0
        : 2;
    // Create configuration object
    const eufyConfig = {
      username: this.config.username,
      password: this.config.password,
      country: this.config.country,
      language: this.config.language,
      persistentDir: this.config.persistentDir,
      trustedDeviceName: this.config.trustedDeviceName,
      p2pConnectionSetup: P2PConnectionType.ONLY_LOCAL,
      pollingIntervalMinutes: this.config.pollingIntervalMinutes,
      eventDurationSeconds: this.config.eventDurationSeconds,
      acceptInvitations: this.config.acceptInvitations,

      logging: {
        level: logLevel,
        categories: [
          {
            category: "all",
            level: logLevel,
          },
        ],
      },
    } as EufySecurityConfig;

    // Initialize Eufy Security
    this.api = await EufySecurity.initialize(eufyConfig, {
      trace: (x: any) => this.logger.trace(x),
      debug: (x: any) => this.logger.debug(x),
      info: (x: any) => this.logger.info(x),
      warn: (x: any) => this.logger.warn(x),
      error: (x: any) => this.logger.error(x),
      fatal: (x: any) => this.logger.fatal(x),
    } as Logger);

    this.setupEventListeners();

    // Connect to Eufy Security
    try {
      await this.api.connect();
    } catch (error) {
      this.logger.error(
        "Initial connection failed. Will retry via TFA/captcha flow if needed:",
        error
      );
    }
  }

  public getDeviceStatus(): DeviceStatus {
    return this.deviceStatus;
  }

  public getCaptchaStatus(): { waiting: boolean; captchaImage: string | null } {
    return {
      waiting: this.waitingForCaptcha,
      captchaImage: this.waitingForCaptcha ? this.captchaImage : null,
    };
  }

  public getTfaStatus(): { waiting: boolean } {
    return { waiting: this.waitingForTfa };
  }

  public async submitCaptcha(captchaCode: string): Promise<boolean> {
    if (!captchaCode || !this.captchaId || !this.api) {
      return false;
    }

    this.logger.info(`Submitting captcha code: ${captchaCode}`);

    const connectOptions = {
      captcha: {
        captchaId: this.captchaId,
        captchaCode: captchaCode,
      },
    } as LoginOptions;

    this.waitingForCaptcha = false;
    this.emit("captchaStatus", { waiting: false });

    try {
      await this.api.connect(connectOptions);
      return true;
    } catch (error) {
      this.logger.error("Failed to connect with captcha:", error);
      return false;
    }
  }

  public async submitTfa(tfaCode: string): Promise<boolean> {
    if (!tfaCode || !this.api) {
      return false;
    }

    this.logger.info(`Submitting TFA code: ${tfaCode}`);

    const connectOptions = {
      verifyCode: tfaCode,
    } as LoginOptions;

    this.waitingForTfa = false;
    this.emit("tfaStatus", { waiting: false });

    try {
      await this.api.connect(connectOptions);
      return true;
    } catch (error) {
      this.logger.error("Failed to connect with TFA code:", error);
      return false;
    }
  }

  public async close(): Promise<void> {
    if (this.connected && this.api) {
      this.logger.info("Disconnecting from Eufy Security...");
      this.api.close();
    }
  }

  private setupEventListeners(): void {
    if (!this.api) return;

    // Add device when discovered
    this.api.on("device added", (device) => {
      this.logger.info(
        `Device added: ${device.getName()} (${device.getSerial()})`
      );

      // Update device status
      const deviceInfo = {
        name: device.getName(),
        serial: device.getSerial(),
        type: device.getDeviceType(),
        properties: device.getProperties(),
      };

      const existingDeviceIndex = this.deviceStatus.devices.findIndex(
        (d) => d.serial === device.getSerial()
      );

      if (existingDeviceIndex >= 0) {
        this.deviceStatus.devices[existingDeviceIndex] = deviceInfo;
      } else {
        this.deviceStatus.devices.push(deviceInfo);
      }

      this.emit("deviceStatus", this.deviceStatus);
    });

    // Listen for device events
    this.api.on("device property changed", (device, name, value: any) => {
      this.logger.info(
        `Device property changed: ${device.getName()} - ${name}: ${
          typeof value === "object" ? "Object/Buffer" : value
        }`
      );

      // Update device properties in status
      const deviceIndex = this.deviceStatus.devices.findIndex(
        (d) => d.serial === device.getSerial()
      );

      if (deviceIndex >= 0) {
        if (!this.deviceStatus.devices[deviceIndex].properties) {
          this.deviceStatus.devices[deviceIndex].properties = {};
        }

        // Set the property value
        this.setDeviceProperty(
          name,
          this.deviceStatus.devices[deviceIndex].properties,
          value,
          device.getName()
        );

        this.emit("deviceStatus", this.deviceStatus);
      }

      // Also emit a dedicated property changed event for real-time updates
      this.emit("devicePropertyChanged", {
        deviceName: device.getName(),
        property: name,
        value: value,
      });
    });

    // Setup device events
    this.setupDeviceEvents();

    // TFA handling
    this.api.on("tfa request", () => {
      this.logger.info(`TFA requested`);
      this.logger.info(`Check Email for code`);

      this.waitingForTfa = true;
      this.emit("tfaStatus", { waiting: true });
    });

    // Captcha handling
    this.api.on("captcha request", (id, captcha) => {
      this.captchaId = id;
      this.captchaImage = captcha;

      this.logger.info(`\n\nCaptcha requested: ${id}`);

      this.waitingForCaptcha = true;
      this.emit("captchaStatus", { waiting: true, captchaImage: captcha });
    });

 
    // Connection events
    this.api.on("connect", async () => {
      this.logger.info("Connected to Eufy Security");
      this.connected = true;
      this.deviceStatus.connected = true;
      this.waitingForCaptcha = false;
      this.waitingForTfa = false;

      this.emit("connectionStatus", { connected: true });
      this.emit("captchaStatus", { waiting: false });
      this.emit("tfaStatus", { waiting: false });
      this.emit("statusChanged", {
        status: "connected",
        timestamp: new Date().toISOString(),
      });

      // Publish all device properties when connected
      var devices = await this.api?.getDevices();
      this.deviceStatus.devices = [];

      devices?.forEach((d) => {
        // Process all properties, with special handling for images
        const properties: any = {};
        const rawProperties = d.getProperties();

      
        for (const key in rawProperties) {
          if (rawProperties.hasOwnProperty(key)) {
            const propValue = rawProperties[key];

            // Special handling for picture/image properties
            this.setDeviceProperty(
              key,
              properties,
              propValue,
              d.getName()
            );

            // Emit property changed event
            this.emit("devicePropertyChanged", {
              deviceName: d.getName(),
              property: key,
              value: propValue,
            });
          }
        }

        // Add to device status with processed properties
        this.deviceStatus.devices.push({
          name: d.getName(),
          serial: d.getSerial(),
          type: d.getDeviceType(),
          properties: properties,
          stationSerial: d?.getStationSerial(),
        });
      });

      this.emit("deviceStatus", this.deviceStatus);
    });

    this.api.on("close", () => {
      this.logger.info("Disconnected from Eufy Security");
      this.connected = false;
      this.deviceStatus.connected = false;

      this.emit("connectionStatus", { connected: false });
      this.emit("statusChanged", {
        status: "disconnected",
        timestamp: new Date().toISOString(),
      });

      // Try to reconnect
      setTimeout(async () => {
        if (!this.connected && this.api) {
          try {
            this.logger.info("Attempting to reconnect...");
            await this.api.connect();
          } catch (err) {
            this.logger.error("Failed to reconnect:", err);
          }
        }
      }, 30000); // Try to reconnect after 30 seconds
    });
  }

  private setupDeviceEvents(): void {
    if (!this.api) return;

    this.api.on("station close", (station: Station) => {
      this.logger.error(`Station connection closed for ${station.getSerial()}`);
    });

    this.api.on(
      "station connection error",
      (station: Station, error: Error) => {
        this.logger.error(
          `Station connection error for ${station.getSerial()}: ${
            error.message
          }`
        );
      }
    );

    // Listen for motion detection events
    this.api.on("device motion detected", (device, state) => {
      // Only trigger on the start of the event (state === true)
      if (state) {
        this.logger.info(`Motion detected on ${device.getName()}`);
        this.recordEvent(device.getName(), "motion");
        this.emit("deviceEvent", {
          deviceName: device.getName(),
          eventType: "motion",
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Listen for person detection events
    this.api.on("device person detected", (device, state, person) => {
      if (state) {
        this.logger.info(`Person detected on ${device.getName()}`);
        this.recordEvent(device.getName(), "person");
        this.emit("deviceEvent", {
          deviceName: device.getName(),
          eventType: "person",
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Listen for crying detection events (for indoor cameras)
    this.api.on("device crying detected", (device, state) => {
      if (state) {
        this.logger.info(`Crying detected on ${device.getName()}`);
        this.recordEvent(device.getName(), "crying");
        this.emit("deviceEvent", {
          deviceName: device.getName(),
          eventType: "crying",
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Listen for sound detection events
    this.api.on("device sound detected", (device, state) => {
      if (state) {
        this.logger.info(`Sound detected on ${device.getName()}`);
        this.recordEvent(device.getName(), "sound");
        this.emit("deviceEvent", {
          deviceName: device.getName(),
          eventType: "sound",
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Listen for pet detection events
    this.api.on("device pet detected", (device, state) => {
      if (state) {
        this.logger.info(`Pet detected on ${device.getName()}`);
        this.recordEvent(device.getName(), "pet");
        this.emit("deviceEvent", {
          deviceName: device.getName(),
          eventType: "pet",
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Listen for dog detection events
    this.api.on("device dog detected", (device, state) => {
      if (state) {
        this.logger.info(`Dog detected on ${device.getName()}`);
        this.recordEvent(device.getName(), "dog");
        this.emit("deviceEvent", {
          deviceName: device.getName(),
          eventType: "dog",
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Listen for vehicle detection events
    this.api.on("device vehicle detected", (device, state) => {
      if (state) {
        this.logger.info(`Vehicle detected on ${device.getName()}`);
        this.recordEvent(device.getName(), "vehicle");
        this.emit("deviceEvent", {
          deviceName: device.getName(),
          eventType: "vehicle",
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Listen for doorbell events
    this.api.on("device rings", (device, state) => {
      if (state) {
        this.logger.info(`Doorbell ring at ${device.getName()}`);
        this.recordEvent(device.getName(), "doorbell");
        this.emit("deviceEvent", {
          deviceName: device.getName(),
          eventType: "doorbell",
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Listen for package events
    this.api.on("device package delivered", (device, state) => {
      if (state) {
        this.logger.info(`Package delivered at ${device.getName()}`);
        this.recordEvent(device.getName(), "package");
        this.emit("deviceEvent", {
          deviceName: device.getName(),
          eventType: "package",
          timestamp: new Date().toISOString(),
        });
      }
    });
  }

  private recordEvent(deviceName: string, eventType: string): void {
    const eventInfo = {
      deviceName,
      eventType,
      timestamp: new Date().toISOString(),
    };

    this.deviceStatus.lastEvents.unshift(eventInfo);
    if (this.deviceStatus.lastEvents.length > 20) {
      this.deviceStatus.lastEvents.pop();
    }

    this.emit("deviceStatus", this.deviceStatus);
  }

  private setDeviceProperty(
    propName: string,
    properties: any,
    value: any,
    deviceName: string
  ): void {
    if (propName.toLowerCase() === "picture") {
      if (!!value) {
        if (Buffer.isBuffer(value?.data)) {
          properties[propName] = {
            type: "Buffer",
            data: Array.from(value?.data),
          };
        } else {
          this.logger.error("Invalid picture data received");
        }
      }
    } else {
      properties[propName] = value;
    }
  }

  private findStationForDevice(
    device: Device,
    stations: Station[]
  ): Station | null {
    var s = stations.find((s) => s.getSerial() === device.getStationSerial());

    return s || null;
  }

  public async getDevices(): Promise<DeviceInfo[]> {
    if (!this.api) return [];

    var devices = await this.api.getDevices();
    return devices.map((d) => ({
      name: d.getName(),
      serial: d.getSerial(),
      type: d.getDeviceType(),
      properties: d.getProperties(),
      stationSerial: d.getStationSerial(),
    }));
  }
}
