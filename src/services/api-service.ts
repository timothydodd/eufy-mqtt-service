import bodyParser from 'body-parser';
import express, { Application, Request, Response } from 'express';
import * as http from 'http';
import path from 'path';
import { EufyService } from './eufy-service';
import { LoggingService } from './logging-service';

export interface ApiServiceConfig {
  port: number;
  staticDir: string;
}

export class ApiService {
  private app: Application;
  private server: http.Server | null = null;
  private port: number;

  constructor(
    config: ApiServiceConfig,
    private eufyService: EufyService,
    private logger: LoggingService
  ) {
    this.port = config.port;

    // Create Express app
    this.app = express();

    // Configure Express
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true }));
    this.app.use(express.static(config.staticDir));

    // Setup routes
    this.setupRoutes();
  }

  public initialize(): http.Server {
    // Start the server
    this.server = this.app.listen(this.port, () => {
      this.logger.info(`API service running at http://localhost:${this.port}`);
    });
    return this.server;
  }

  public async close(): Promise<void> {
    if (this.server) {
      this.logger.info('Shutting down API server...');
      this.server.close();
    }
  }

  private setupRoutes(): void {
    // Serve main HTML
    this.app.get('/', (req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
    });

    // Get devices endpoint
    this.app.get('/api/devices', async (req: Request, res: Response) => {
      try {
        const devices = await this.eufyService.getDevices();
        res.json({ success: true, devices });
      } catch (error) {
        this.logger.error('Error getting devices', error);
        res.status(500).json({ success: false, error: 'Failed to get devices' });
      }
    });

    // API status endpoint
    this.app.get('/api/status', (req: Request, res: Response) => {
      res.json(this.eufyService.getDeviceStatus());
    });

    // WebSocket connection health check endpoint
    this.app.get('/api/websocket-status', (req: Request, res: Response) => {
      res.json({
        server_time: new Date().toISOString(),
        server_status: 'running',
        eufy_connected: this.eufyService.getDeviceStatus().connected,
      });
    });

    // Captcha submission endpoint
    this.app.post('/submit-captcha', async (req: Request, res: any) => {
      try {
        const { captchaCode } = req.body;

        if (!captchaCode) {
          return res.status(400).json({ success: false, message: 'Invalid captcha code' });
        }

        const success = await this.eufyService.submitCaptcha(captchaCode);

        if (success) {
          return res.json({ success: true });
        } else {
          return res.status(500).json({
            success: false,
            message: 'Failed to connect with captcha',
          });
        }
      } catch (error) {
        this.logger.error('Failed to connect with captcha:', error);
        return res.status(500).json({ success: false, message: 'Failed to connect with captcha' });
      }
    });

    // TFA submission endpoint
    this.app.post('/submit-tfa', async (req: Request, res: any) => {
      try {
        const { tfaCode } = req.body;

        if (!tfaCode) {
          return res.status(400).json({ success: false, message: 'Invalid TFA code' });
        }

        const success = await this.eufyService.submitTfa(tfaCode);

        if (success) {
          return res.json({ success: true });
        } else {
          return res.status(500).json({
            success: false,
            message: 'Failed to connect with TFA code',
          });
        }
      } catch (error) {
        this.logger.error('Failed to connect with TFA code:', error);
        return res.status(500).json({ success: false, message: 'Failed to connect with TFA code' });
      }
    });
  }
}
