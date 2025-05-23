import net from 'node:net';

const mockVmixPort = 8099; // Port for the mock vMix server
const testMessages = [
  "TALLY OK 0001\r\n",
  "TALLY OK 0010\r\n",
  "TALLY OK 0100\r\n",
  "TALLY OK 1000\r\n",
]; // List of test strings to send

function sendTestMessages(socket) {
        // Send test messages to the client
        let index = 0;
        const interval = setInterval(() => {
          if (index < testMessages.length) {
            const message = testMessages[index];
            console.log(`Sending to client: ${message.trim()}`);
            socket.write(message);
            index++;
          } else {
            clearInterval(interval);
          }
        }, 10000); // Send a message every second
    }
function startMockVmixServer() {
  const server = net.createServer((socket) => {
    console.log("Mock vMix client connected.");



    // Handle incoming data from the client
    socket.on('data', (data) => {
      const message = data.toString().trim();
      console.log(`Received from client: ${message}`);

      // Give camera name
      if (message.startsWith("XMLTEXT") && message.includes("inputs/input")) {
        // Extract the input number from the message
        const inputNumber = message.match(/input\[(\d+)\]/)[1];
        socket.write(`XMLTEXT OK Camera ${inputNumber}\r\n`);
      }
      else if (message.startsWith("SUBSCRIBE TALLY")) {
        console.log("New subscription to tally changes.");
        sendTestMessages(socket);
      }
    });

    // Handle client disconnection
    socket.on('end', () => {
      console.log("Mock vMix client disconnected.");
    });

    // Handle errors
    socket.on('error', (err) => {
      console.error("Error in mock vMix server:", err.message);
    });
  });

  server.listen(mockVmixPort, () => {
    console.log(`Mock vMix server running on port ${mockVmixPort}`);
  });

  // Handle server shutdown
  server.on('close', () => {
    console.log("Mock vMix server closed.");
  });

  server.on('error', (err) => {
    console.error("Error in mock vMix server:", err.message);
  });

  return server;
}

// Start the mock vMix server
startMockVmixServer();