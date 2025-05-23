const API_URL = "http://127.0.0.1:8088/api/"; // vMix API URL
const POLL_INTERVAL = 5000; // Polling interval in milliseconds
let lastActive: string | null = null; // Last known active input
let activeStartTime = 0; // Start time for the active input
let activeDisplay: HTMLElement | null = null; // Element to display the active input
let timerDisplay: HTMLElement | null = null; // Element to display the timer
let retryDelay = POLL_INTERVAL; // Initial retry delay in milliseconds
const maxRetryDelay = 60000; // Maximum retry delay (1 minute)
let pollingInterval: number | null = null; // Reference to the polling interval
let wsConnected = false; // Flag to track WebSocket connection status

// Helper function to show messages in the browser
function showMessage(message: string, type: string = "default") {
    if (activeDisplay) {
        activeDisplay.classList.remove("error", "warning", "success");
        activeDisplay.classList.add(type);
        activeDisplay.innerText = message;
    }
    if(type !== "default") {
        console.warn(message);
    }
}

// Establish WebSocket connection with timeout fallback
function wsConnect() {
    const ws = new WebSocket(`ws://${window.location.host}`);

    // Set up polling as a fallback if WebSocket fails
    const wsTimeout = setTimeout(() => {
        if (!wsConnected) {
            showMessage("WebSocket connection failed, switching to polling.", "error");
            startPolling(); // Start polling if WebSocket fails
        }
    }, 10000); // 10-second timeout

    ws.onopen = () => {
        console.log("WebSocket connection established.");
        wsConnected = true;
        clearTimeout(wsTimeout); // Clear the timeout if WebSocket connects
        stopPolling(); // Stop polling if WebSocket reconnects
        showMessage("Connected");
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.debug("Message from server:", data);
        if (data.message === "vMix connection closed.") {
            showMessage("vMix connection closed, fallback to polling.","warning");
            wsConnected = false;
            startPolling(); // Start polling if WebSocket connection is lost
            return;
        }
        if(!wsConnected)
        {
            wsConnected = true;
            stopPolling(); // Stop polling if WebSocket is active
            showMessage("Reconnected to vMix");
        }
        if (data.tally) {
            const currentActive = data.tally;
            // If the active input changes, reset the timer
            if (currentActive !== lastActive) {
                lastActive = currentActive;
                activeStartTime = Date.now();
                showMessage(data.tally || "..."); // Use showMessage to display the tally
                console.log(`Active input changed to ${lastActive}. Timer reset.`);
            }
        }
    };

    ws.onclose = () => {
        console.log("WebSocket connection closed.");
        wsConnected = false;
        wsConnect(); // Attempt to reconnect
    };
}

// Start polling via fetchVmixData
function startPolling() {
    if (!pollingInterval) {
        console.log("Starting polling via fetchVmixData...");
        pollingInterval = setInterval(fetchVmixData, POLL_INTERVAL);
    }
}

// Stop polling via fetchVmixData
function stopPolling() {
    showMessage("");
    if (pollingInterval) {
        console.log("Stopping polling via fetchVmixData...");
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

// Fetch and process vMix API data
async function fetchVmixData() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

        const text = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");

        // Extract the <active> value
        const activeElement = xmlDoc.getElementsByTagName("active")[0];
        if (activeElement) {
            const currentActive = activeElement.textContent?.trim() || "";

            // If the active input changes, reset the timer
            if (currentActive !== lastActive) {
                lastActive = currentActive;
                activeStartTime = Date.now();
                showMessage(getInputName(xmlDoc, currentActive)); // Use showMessage to display the input name
                console.log(`Active input changed to ${lastActive}. Timer reset.`);
            }
        }

        // Reset retry delay on success
        retryDelay = 5000;
    } catch (error) {
        console.error("Error fetching vMix API:", error);

        // Stop polling and show the error message
        stopPolling();
        showMessage(`Error: ${error instanceof Error ? error.message : "Unknown error"}.  Check vMix.`,'error');

        // Retry after the current delay, if no websocket connection
        if(!wsConnected) {
            setTimeout(() => {
                console.log(`Retrying fetchVmixData in ${retryDelay / 1000} seconds...`);
                if(!wsConnected) fetchVmixData();
            }, retryDelay);
        }

        // Increase the retry delay for the next attempt (exponential backoff)
        retryDelay = Math.min(retryDelay * 2, maxRetryDelay);
    }
}

// Get the input name by active number
function getInputName(xmlDoc: Document, activeNumber: string): string {
    const inputs = xmlDoc.getElementsByTagName("input");
    for (let input of Array.from(inputs)) {
        if (input.getAttribute("number") === activeNumber) {
            return input.getAttribute("title") || "Unknown"; // Use the title attribute as the input name
        }
    }
    return "Unknown";
}

// Format time as MM:SS
function formatTime(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// Update the displayed timer
function updateTimerDisplay() {
    const elapsedTime = Math.floor((Date.now() - activeStartTime) / 1000); // Time in seconds
    if (timerDisplay) {
        timerDisplay.innerText = formatTime(elapsedTime);
    }
}

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
    activeStartTime = Date.now(); // Set the start time
    activeDisplay = document.getElementById("active"); // Get the active display element
    timerDisplay = document.getElementById("timer"); // Get the timer display element

    // Initialize WebSocket connection with timeout fallback
    wsConnect();

    // Start updating the timer regardless of WebSocket or polling
    setInterval(updateTimerDisplay, 1000);
});