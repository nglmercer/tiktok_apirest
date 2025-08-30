const tiktokUsername = 'addaa.23';
const websocketUrl = 'ws://localhost:8081/ws';
// Create WebSocket connection
const ws = new WebSocket(websocketUrl);

// Connection opened
ws.addEventListener('open', (event) => {
    console.log('Connected to WebSocket server');
    
    // Send username to the server
    ws.send(JSON.stringify({ event: 'live:tiktok', data: tiktokUsername }));
});

// Listen for messages
ws.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    console.log('Received:', Object.keys(data));
    fetch('http://localhost:9001/webhook', {
        method: 'POST',
        body: JSON.stringify(data)
    })
});

// Handle errors
ws.addEventListener('error', (error) => {
    console.error('WebSocket error:', error);
});

// Handle connection close
ws.addEventListener('close', () => {
    console.log('Disconnected from WebSocket server');
});
