import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { EufyService } from './eufy-service';
import { LoggingService } from './logging-service';

export class WebSocketService {
  private io: SocketIOServer;
  private connectedClients: Map<string, Date> = new Map(); // Track client connections with timestamp

  constructor(
    server: http.Server,
    private eufyService: EufyService,
    private logger: LoggingService
  ) {
    // Initialize Socket.IO server
    this.io = new SocketIOServer(server);

    // Setup connection event
    this.setupSocketEvents();

    // Setup Eufy event listeners
    this.setupEufyListeners();
  }

  public async initialize(): Promise<void> {
    this.logger.info('WebSocket service initialized');

    // Set up a periodic check for websocket health
    setInterval(() => {
      this.logConnectionStatus();
    }, 60000); // Every minute
  }

  public async close(): Promise<void> {
    this.logger.info('Closing WebSocket service...');
    this.io.close();
  }

  private setupSocketEvents(): void {
    this.io.on('connection', (socket) => {
      this.logger.info(`Client connected to socket: ${socket.id}`);

      // Record new connection
      this.connectedClients.set(socket.id, new Date());

      // Send initial status
      const deviceStatus = this.eufyService.getDeviceStatus();
      const captchaStatus = this.eufyService.getCaptchaStatus();
      const tfaStatus = this.eufyService.getTfaStatus();

      socket.emit('connectionStatus', { connected: deviceStatus.connected });
      socket.emit('captchaStatus', captchaStatus);
      socket.emit('tfaStatus', tfaStatus);
      socket.emit('deviceStatus', deviceStatus);

      // Connection verification
      socket.on('verifyConnection', (callback) => {
        if (typeof callback === 'function') {
          const isEufyConnected = this.eufyService.getDeviceStatus().connected;
          callback({
            socketConnected: true,
            eufyConnected: isEufyConnected,
            timestamp: new Date().toISOString(),
          });
          this.logger.debug(`Verification response sent to client ${socket.id}`);
        } else {
          this.logger.warn(`Received verifyConnection without callback from ${socket.id}`);
        }
      });

      // Set up ping/pong for connection health checking
      socket.on('ping', (callback) => {
        if (typeof callback === 'function') {
          callback({ timestamp: new Date().toISOString() });
        }
      });

      socket.on('disconnect', () => {
        this.logger.info(`Client disconnected from socket: ${socket.id}`);
        this.connectedClients.delete(socket.id);
      });
    });
  }

  private setupEufyListeners(): void {
    // Setup event listeners on the EufyService

    // Forward connection status changes
    this.eufyService.on('connectionStatus', (status) => {
      this.io.emit('connectionStatus', status);
    });

    // Forward captcha status changes
    this.eufyService.on('captchaStatus', (status) => {
      this.io.emit('captchaStatus', status);
    });

    // Forward TFA status changes
    this.eufyService.on('tfaStatus', (status) => {
      this.io.emit('tfaStatus', status);
    });

    // Forward device status changes
    this.eufyService.on('deviceStatus', (status) => {
      this.io.emit('deviceStatus', status);
    });

    // Forward device events
    this.eufyService.on('deviceEvent', (event) => {
      this.io.emit('deviceEvent', event);
    });

    // Forward device property changes - important for real-time updates
    this.eufyService.on('devicePropertyChanged', (data) => {
      this.io.emit('devicePropertyChanged', data);
      this.logger.debug(`Property change forwarded: ${data.deviceName} - ${data.property}`);
    });
  }

  // Log connection status for monitoring
  private logConnectionStatus(): void {
    const now = new Date();
    const activeConnections = this.connectedClients.size;

    // Remove stale connections (older than 5 minutes with no activity)
    for (const [socketId, timestamp] of this.connectedClients.entries()) {
      const age = now.getTime() - timestamp.getTime();
      if (age > 300000) {
        // 5 minutes
        this.logger.info(`Removing stale connection tracking for ${socketId} (${age / 1000}s old)`);
        this.connectedClients.delete(socketId);
      }
    }

    // Log current connection status
    this.logger.info(`WebSocket status: ${activeConnections} active connections`);
    if (activeConnections > 0) {
      this.logger.debug(`WebSocket clients: ${Array.from(this.connectedClients.keys()).join(', ')}`);
    }
  }
}
