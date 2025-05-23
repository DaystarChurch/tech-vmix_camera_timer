/**
 * Server that talks to vMix & listens for camera changes and pushes the shot duration timer to a browser
 */

import { createServer } from 'node:http';
import { readFile, existsSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import net from 'node:net';
import url from 'node:url';
import { WebSocketServer } from 'ws';

const parsedURL = url.parse(process.env.HOSTNAME || Object.values(os.networkInterfaces()).reduce((r, list) => r.concat(list.reduce((rr, i) => rr.concat(i.family==='IPv4' && !i.internal && i.address || []), [])), []).shift() ||  os.hostname() || '127.0.0.1');
const hostname = parsedURL.hostname ?? parsedURL.href;
const webServerPort = parsedURL.port || 3000;

const inputCount = 8; // Total number of inputs

let server = null; // HTTP server
let wss = null;    // WebSocket server
let vmix = null;   // vMix TCP connection
let isConnected = false; // Track connection state

// Read API_URL from command-line arguments
const apiUrl = process.argv[2] || process.env.VMIX_API_URL;
if (!apiUrl) {
  console.error("Error: vMix API URL must be provided as a command-line argument.");
  process.exit(1);
}

// Function to create and start the server
function startWebServer() {
  // Create HTTP server
  server = createServer((req, res) => {
    let filePath = join(process.cwd(), 'assets', req.url === '/' ? 'vmixActiveTimer.html' : req.url);
    if(!existsSync(filePath)) {
      filePath = join(process.cwd(), 'dist', req.url);
    }


    // Check if the requested file exists
    if (existsSync(filePath)) {
      readFile(filePath, (err, data) => {
        
        if (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'text/plain');
          res.end('Internal Server Error');
        } 
        else if(req.url.endsWith("vmixActiveTimer.js")) {
          // Replace the placeholder API_URL with the actual apiUrl
          const updatedData = data.toString().replace('const API_URL = "http://127.0.0.1', `const API_URL = "${apiUrl}`);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/javascript');
          res.end(updatedData);
        }
        else {
          // Serve the file with appropriate content type
          const ext = filePath.split('.').pop();
          const contentType = getContentType(ext);
          res.statusCode = 200;
          res.setHeader('Content-Type', contentType);
          res.end(data);
        }
      });
    } else {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain');
      res.end('Not Found');
    }
  });

  // Create WebSocket server
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    console.log('WebSocket connection established.');

    // Send a welcome message to the client
    ws.send(JSON.stringify({ message: 'WebSocket connection established.' }));

    // Handle incoming messages from the client
    ws.on('message', (message) => {
      console.log('Received message from client:', message);
    });

    // Handle WebSocket disconnection
    ws.on('close', () => {
      console.log('WebSocket connection closed.');
    });
  });

  // Start the HTTP and WebSocket server
  server.listen(webServerPort, hostname, () => {
    console.log(`Server running at http://${hostname}:${webServerPort}/`);
    console.log(`Using API_URL: ${apiUrl}`);
  });
}

// Helper function to determine content type based on file extension
function getContentType(ext) {
  switch (ext) {
    case 'html': return 'text/html';
    case 'js': return 'application/javascript';
    case 'css': return 'text/css';
    case 'json': return 'application/json';
    case 'png': return 'image/png';
    case 'jpg': return 'image/jpeg';
    case 'svg': return 'image/svg+xml';
    case 'ico': return 'image/x-icon';
    default: return 'application/octet-stream';
  }
}

// Fetch input names from vMix API
function fetchInputNames() {
  return new Promise((resolve, reject) => {
    const inputNames = [];
    let i = 1;

    const nameHandler = (data) => {
      const message = data.toString();
      console.debug('Received data from vMix:', message);

      // Extract the input name from the response
      const inputName = message.split("XMLTEXT OK ")[1]?.trim();
      if (inputName) {
        inputNames[i] = inputName;
        console.debug(`Input name for input ${i}: ${inputName}`);
      }

      // Check if all input names are fetched
      if (inputNames.length === inputCount) {
        vmix.removeListener('data', nameHandler);
        console.debug("All input names received.");
        resolve(inputNames); // Resolve the promise with the input names
      } else {
        i++;
        vmix.write(`XMLTEXT vmix/inputs/input[${i}]/@title\r\n`);
      }
    };

    // Start fetching input names
    vmix.on('data', nameHandler);
    vmix.write(`XMLTEXT vmix/inputs/input[${i}]/@title\r\n`);
  });
}

// Handle tally updates
function handleTallyUpdates(inputNames) {
  vmix.on('data', (data) => {
    const message = data.toString();
    console.debug('Received data from vMix:', message.trim());

    if (message.startsWith("TALLY OK")) {
      const tallyInput = (message.split(" ")[2].trim() || "").indexOf("1") + 1;
      const input = inputNames[tallyInput] || tallyInput;

      const tallyMessage = { tally: input };
      wss.clients.forEach((client) => {
        if (client.readyState === client.OPEN) {
          client.send(JSON.stringify(tallyMessage));
        }
      });
    }
  });

  // Subscribe to tally changes
  vmix.write("SUBSCRIBE TALLY\r\n");
}

// Connect to vMix API and listen for camera changes
// API: https://www.vmix.com/help25/index.htm?DeveloperAPI.html
function connectToVmixApi() {
  let retryDelay = 2000; // Initial retry delay in milliseconds
  const maxRetryDelay = 60000; // Maximum retry delay (1 minute)
  const parsedURL = url.parse(apiUrl);
  const host = parsedURL.hostname;
  const port = parsedURL.port || 8099;  // Default vMix API port

  const attemptConnection = () => {
    if(process.exiting) { return; } // Exit if the process is shutting down
    console.log(`Attempting to connect to vMix API at ${apiUrl}...`);

    vmix = net.connect(port, host, async () => {
      console.log(`Connected to vMix API ${ host}:${port}`);
      isConnected = true;
      wss.clients.forEach((client) => {
        if (client.readyState === client.OPEN) {
          client.send(JSON.stringify({ message: "Connected to vMix API" }));
        }
      });
      try {
        // Reset retry delay on successful connection
        retryDelay = 5000;

        // Fetch input names
        const inputNames = await fetchInputNames();
        console.debug("Input names fetched:", inputNames);

        // Start handling tally updates
        handleTallyUpdates(inputNames); 
      } catch (err) {
        console.error(err.message);
        vmix.end(); // Close the connection if fetching input names fails
        reject(err);
      }
    });

    vmix.on('error', (err) => {
      if(process.exiting) { return; } // Exit if the process is shutting down
      console.error("Error connecting to vMix API:", err.message);

      // Retry connection with backoff
      retryDelay = Math.min(retryDelay * 2, maxRetryDelay);
      console.log(`Retrying connection in ${retryDelay / 1000} seconds...`);
      setTimeout(attemptConnection, retryDelay);
    });

    vmix.on('close', () => {
      console.log("vMix connection failed.");
      isConnected = false;
      wss.clients.forEach((client) => {
        if (client.readyState === client.OPEN) {
          client.send(JSON.stringify({ message: "vMix connection failed." }));
        }
      });
      if(process.exiting) { return; } // Exit if the process is shutting down
      vmix = null; // Reset vMix connection

      // Retry connection with exponential backoff
      retryDelay = Math.min(retryDelay * 2, maxRetryDelay);
      console.log(`Retrying connection in ${retryDelay / 1000} seconds...`);
      setTimeout(attemptConnection, retryDelay);
    });
  };

  // Start the first connection attempt
  attemptConnection();
}

// Handle process termination and cleanup
function handleExit() {
  console.log("Shutting down cameraTimerServer...");
  process.exiting = true; // Indicate that the process is exiting

  // Close the vMix connection if it exists
  if (vmix) {
    vmix.write("UNSUBSCRIBE TALLY\r\n");
    vmix.end();
    vmix.destroy();
    vmix = null;
  }

  // Close the WebSocket server
  if (wss) {
    wss.close(() => {
      console.log("WebSocket server closed.");
    });
  }

  // Close the HTTP server
  if (server) {
    server.close(() => {
      console.log("HTTP server closed.");
      process.exit(0); // Exit the process
    });
  } else {
    process.exit(0); // Exit immediately if no server is running
  }
}

// Listen for termination signals
process.on('SIGINT', handleExit); // Handle Ctrl+C
process.on('SIGTERM', handleExit); // Handle termination signal

// Start the server and wait for a client connection
startWebServer();

connectToVmixApi();