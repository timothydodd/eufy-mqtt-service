# Eufy To MQTT Service

<div align="center">
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js"/>
  <img src="https://img.shields.io/badge/MQTT-3C5280?style=for-the-badge&logo=eclipse-mosquitto&logoColor=white" alt="MQTT"/>
  <img src="https://img.shields.io/badge/Docker-2CA5E0?style=for-the-badge&logo=docker&logoColor=white" alt="Docker"/>
</div>

A service that connects your Eufy Security cameras to MQTT, enabling easy integration with home automation systems like Home Assistant, Node-RED, or any other MQTT-compatible platform.

This project is NOT affiliated with, endorsed by, or connected to Anker or Eufy Security in any way. This is an independent, community-driven project that uses the Eufy security API.


## 📋 Prerequisites

- Node.js 16 or later
- Eufy Security account with cameras set up
- MQTT broker (like Mosquitto, HiveMQ, EMQ X, etc.)

## 📦 Installation

### Option 1: Running locally

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/eufy-mqtt-service.git
   cd eufy-mqtt-service
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file with your configuration:
   ```bash
   cp .env.example .env
   ```
   Then edit the `.env` file with your Eufy and MQTT credentials.

4. Compile TypeScript:
   ```bash
   npm run build
   ```

5. Start the service:
   ```bash
   npm start
   ```

6. Access the web interface:
   Open your browser and navigate to http://localhost:3000 (or your configured port)

### Option 2: Using Docker

1. Create a `.env` file with your configuration as described above.

2. Build the Docker image:
   ```bash
   docker build -t eufy-mqtt-service .
   ```

3. Run the container:
   ```bash
   docker run -d --name eufy-mqtt -p 3000:3000 -v $(pwd)/persistent:/app/persistent --env-file .env eufy-mqtt-service
   ```

4. Access the web interface:
   Open your browser and navigate to http://localhost:3000

## 🌐 Web Interface

The service includes a web interface that provides:

1. **Authentication Handling**:
   - Displays captcha images when required by Eufy
   - Provides a form to submit two-factor authentication codes
   - No need to restart the service when authentication challenges occur

2. **Device Status**:
   - Shows all connected devices
   - Displays device properties and their current values
   - Shows connection status

3. **Event History**:
   - Lists recent events from all devices
   - Shows timestamps for when events occurred

To access the web interface, open your browser and navigate to `http://localhost:3000` (or your configured port).

## 🔑 Authentication Flow

The authentication process is now much easier:

1. Start the service with your Eufy credentials in the `.env` file
2. If Eufy requires a captcha or two-factor authentication:
   - The web interface will automatically show the appropriate form
   - For captcha, you'll see the image directly in your browser
   - For 2FA, you'll get a form to enter the code sent to your email
3. Submit the required information through the web interface
4. The service will continue the authentication process automatically

## 📡 MQTT Topics

The service publishes events to the following topic structure:

- `eufy/events/status` - Connection status
- `eufy/events/{device-name}/{property}` - Device property values
- `eufy/events/{device-name}/event/motion` - Motion detection events
- `eufy/events/{device-name}/event/person` - Person detection events
- `eufy/events/{device-name}/event/pet` - Pet detection events
- `eufy/events/{device-name}/event/dog` - Dog detection events
- `eufy/events/{device-name}/event/vehicle` - Vehicle detection events
- `eufy/events/{device-name}/event/sound` - Sound detection events
- `eufy/events/{device-name}/event/crying` - Crying detection events
- `eufy/events/{device-name}/event/doorbell` - Doorbell ring events
- `eufy/events/{device-name}/event/package` - Package delivery events

## 📝 Message Format

Event messages are published in JSON format:

```json
{
  "timestamp": "2023-04-25T15:30:45.123Z"
}
```

Property values are published as JSON with the actual property value:

```json
"75"
```

or

```json
true
```

The status message has this format:

```json
{
  "status": "connected",
  "timestamp": "2023-04-25T15:30:45.123Z"
}
```

## ⚙️ Configuration Options

Set these values in your `.env` file:

| Variable | Description | Default |
|----------|-------------|---------|
| EUFY_USERNAME | Your Eufy Security email address | - |
| EUFY_PASSWORD | Your Eufy Security password | - |
| EUFY_COUNTRY | Your country code | US |
| EUFY_LANGUAGE | Your language code | en |
| PERSISTENT_DIR | Directory to store persistent data | ./persistent |
| TRUSTED_DEVICE_NAME | Name of your device in Eufy | eufy-mqtt-service |
| P2P_CONNECTION_SETUP | P2P connection type (2=quickest, 1=prefer P2P)| 1 |
| POLLING_INTERVAL_MINUTES | How often to poll Eufy cloud | 10 |
| EVENT_DURATION_SECONDS | Duration to consider events active | 10 |
| ACCEPT_INVITATIONS | Whether to accept device sharing invitations | false |
| WEB_PORT | Port for the web interface | 3000 |
| MQTT_BROKER_URL | URL of your MQTT broker | mqtt://localhost:1883 |
| MQTT_USERNAME | MQTT username (if required) | - |
| MQTT_PASSWORD | MQTT password (if required) | - |
| MQTT_TOPIC | Base topic for all events | eufy/events |
| MQTT_CLIENT_ID | Client ID for MQTT connection | eufy-mqtt-service |

## 🛠️ Troubleshooting

- **Service not connecting to Eufy**: Check your Eufy credentials and ensure you can log in to the Eufy Security app
- **MQTT messages not being received**: Verify your MQTT broker configuration and test with an MQTT client
- **Web interface not loading**: Make sure port 3000 (or your configured port) is accessible
- **Captcha or 2FA not working**: Try refreshing the web interface and submitting again

## 📄 License

MIT

## 🙏 Acknowledgements

This project uses the excellent [eufy-security-client](https://github.com/bropat/eufy-security-client) library.
