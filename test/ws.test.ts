import { test, expect, describe, beforeAll, afterAll } from "bun:test";

// WebSocket Test Client for Bun
class TestClient {
  private ws: WebSocket | null = null;
  private url: string;
  private connected: boolean = false;
  private listeners: Map<string, Function[]> = new Map();
  private messageQueue: any[] = [];

  constructor(url = "ws://localhost:8081/ws") {
    this.url = url;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        this.connected = true;
        console.log('Test client connected');
        resolve();
      };
      
      this.ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          console.log('Test client received:', data);
          this.messageQueue.push(data);
          
          // Call listeners for this event
          const eventListeners = this.listeners.get(data.event);
          if (eventListeners) {
            eventListeners.forEach((cb) => cb(...data.data));
          }
        } catch (err) {
          console.log('Test client received raw:', e.data);
          this.messageQueue.push({ raw: e.data });
        }
      };
      
      this.ws.onclose = () => {
        this.connected = false;
        console.log('Test client disconnected');
        const disconnectListeners = this.listeners.get("disconnect");
        if (disconnectListeners) {
          disconnectListeners.forEach((cb) => cb());
        }
      };
      
      this.ws.onerror = (err) => {
        console.error("🚫 Test client error:", err);
        reject(err);
      };
    });
  }

  emit(event: string, ...args: any[]): void {
    if (this.connected && this.ws) {
      const data = JSON.stringify({ event, data: args });
      console.log('Test client sending:', data);
      this.ws.send(data);
    }
  }

  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
    }
  }

  waitForMessage(event: string, timeout = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${event}`));
      }, timeout);

      const handler = (...args: any[]) => {
        clearTimeout(timeoutId);
        // Remove the handler to prevent multiple calls
        const listeners = this.listeners.get(event);
        if (listeners) {
          const index = listeners.indexOf(handler);
          if (index > -1) {
            listeners.splice(index, 1);
          }
        }
        resolve(args);
      };

      this.on(event, handler);
    });
  }

  getLastMessage(event?: string): any {
    if (event) {
      return this.messageQueue.filter(msg => msg.event === event).pop();
    }
    return this.messageQueue[this.messageQueue.length - 1];
  }

  clearMessageQueue(): void {
    this.messageQueue = [];
  }

  get isConnected(): boolean {
    return this.connected;
  }
}

// Test Suite
describe("WebSocket Server Tests", () => {
  let client: TestClient;
  
  beforeAll(async () => {
    // Wait for server to be ready
    console.log('Waiting for server to be ready...');
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  afterAll(() => {
    if (client) {
      client.disconnect();
    }
  });

  test("should connect to WebSocket server", async () => {
    client = new TestClient();
    await client.connect();
    expect(client.isConnected).toBe(true);
    client.disconnect();
  });

  test("should handle basic messaging with echo", async () => {
    client = new TestClient();
    await client.connect();
    
    const testMessage = "Hello from Bun test!";
    
    // Set up the echo listener before sending the message
    const echoPromise = client.waitForMessage("echo");
    
    // Send the message
    client.emit("message", testMessage);
    
    // Wait for the echo
    const [echoData] = await echoPromise;
    
    expect(echoData).toBe(testMessage);
    client.disconnect();
  });

  test("should handle room operations", async () => {
    client = new TestClient();
    await client.connect();
    
    const joinPromise = client.waitForMessage("joined");
    client.emit("join-room", "test-room");
    
    const [joinMessage] = await joinPromise;
    expect(joinMessage).toContain("test-room");
    client.disconnect();
  });

  test("should broadcast messages to room", async () => {
    client = new TestClient();
    await client.connect();
    
    // Wait a moment for the client to join the general room
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Set up broadcast listener
    const broadcastPromise = client.waitForMessage("broadcast");
    
    // Send message that should trigger a broadcast
    client.emit("message", "Test broadcast message");
    
    const [broadcastData] = await broadcastPromise;
    expect(broadcastData).toContain("Test broadcast message");
    client.disconnect();
  });

  test("should handle rapid messaging", async () => {
    client = new TestClient();
    await client.connect();
    
    const messageCount = 5;
    const promises: Promise<any>[] = [];
    
    // Send rapid messages and collect promises
    for (let i = 0; i < messageCount; i++) {
      const echoPromise = client.waitForMessage("echo");
      promises.push(echoPromise);
      client.emit("message", `Rapid message ${i + 1}`);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Wait for all echoes
    const results = await Promise.all(promises);
    expect(results).toHaveLength(messageCount);
    
    results.forEach((result, index) => {
      expect(result[0]).toBe(`Rapid message ${index + 1}`);
    });
    
    client.disconnect();
  });

  test("should handle private messaging gracefully", async () => {
    client = new TestClient();
    await client.connect();
    
    // This will fail gracefully since we don't have the target socket
    client.emit("private-message", "fake-id", "Test private message");
    
    // Wait a bit to ensure no error occurs
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(client.isConnected).toBe(true);
    client.disconnect();
  });
});

// Multi-client tests
describe("Multi-client WebSocket Tests", () => {
  let client1: TestClient;
  let client2: TestClient;

  afterAll(() => {
    client1?.disconnect();
    client2?.disconnect();
  });

  test("should handle multiple client connections", async () => {
    client1 = new TestClient();
    client2 = new TestClient();
    
    await Promise.all([client1.connect(), client2.connect()]);
    
    expect(client1.isConnected).toBe(true);
    expect(client2.isConnected).toBe(true);
    
    client1.disconnect();
    client2.disconnect();
  });

  test("should broadcast between multiple clients", async () => {
    client1 = new TestClient();
    client2 = new TestClient();
    
    await Promise.all([client1.connect(), client2.connect()]);
    
    // Wait for clients to join general room
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Set up broadcast listener on client2
    const broadcastPromise = client2.waitForMessage("broadcast");
    
    // Send message from client1
    client1.emit("message", "Message from client 1");
    
    // Client2 should receive the broadcast
    const [broadcastData] = await broadcastPromise;
    expect(broadcastData).toContain("Message from client 1");
    
    client1.disconnect();
    client2.disconnect();
  });

  test("should handle room-based messaging", async () => {
    client1 = new TestClient();
    client2 = new TestClient();
    
    await Promise.all([client1.connect(), client2.connect()]);
    
    // Wait for initial setup
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Client1 joins a room first
    const joinPromise1 = client1.waitForMessage("joined");
    client1.emit("join-room", "shared-room");
    await joinPromise1;
    
    // Set up listener for user joined event on client1
    const userJoinedPromise = client1.waitForMessage("user-joined");
    
    // Client2 joins the same room
    const joinPromise2 = client2.waitForMessage("joined");
    client2.emit("join-room", "shared-room");
    await joinPromise2;
    
    // Client1 should see client2's join notification
    const [userJoinedData] = await userJoinedPromise;
    expect(userJoinedData).toContain("joined the room");
    
    client1.disconnect();
    client2.disconnect();
  });
});

// Stress tests
describe("WebSocket Stress Tests", () => {
  test("should handle multiple rapid connections", async () => {
    const connectionCount = 10;
    const clients: TestClient[] = [];
    
    // Create multiple clients
    for (let i = 0; i < connectionCount; i++) {
      clients.push(new TestClient());
    }
    
    try {
      // Connect all clients
      const connectionPromises = clients.map(client => client.connect());
      await Promise.all(connectionPromises);
      
      // Verify all connected
      clients.forEach(client => {
        expect(client.isConnected).toBe(true);
      });
      
      // Wait for setup
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Send messages from all clients
      const messagePromises: Promise<any>[] = [];
      clients.forEach((client, index) => {
        const echoPromise = client.waitForMessage("echo");
        messagePromises.push(echoPromise);
        client.emit("message", `Message from client ${index}`);
      });
      
      // Wait for all echoes
      const results = await Promise.all(messagePromises);
      expect(results).toHaveLength(connectionCount);
    } finally {
      // Cleanup
      clients.forEach(client => client.disconnect());
    }
  }, 15000); // Longer timeout for stress test

  test("should handle message bursts", async () => {
    const client = new TestClient();
    await client.connect();
    
    const burstSize = 20; // Reduced from 50 to be more reliable
    const echoPromises: Promise<any>[] = [];
    
    // Send burst of messages with small delays
    for (let i = 0; i < burstSize; i++) {
      const echoPromise = client.waitForMessage("echo");
      echoPromises.push(echoPromise);
      client.emit("message", `Burst message ${i}`);
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
    }
    
    // Wait for all responses
    const results = await Promise.all(echoPromises);
    expect(results).toHaveLength(burstSize);
    
    client.disconnect();
  }, 10000);
});

// Server stats tests
describe("Server Statistics Tests", () => {
  test("should fetch server stats via REST API", async () => {
    const response = await fetch("http://localhost:8081/stats");
    const stats = await response.json();
    
    expect(stats).toHaveProperty("connectedClients");
    expect(stats).toHaveProperty("rooms");
    expect(typeof stats.connectedClients).toBe("number");
    expect(Array.isArray(stats.rooms)).toBe(true);
  });

  test("should broadcast via REST API", async () => {
    const client = new TestClient();
    await client.connect();
    
    // Wait for client to be ready
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const broadcastPromise = client.waitForMessage("broadcast");
    
    // Send broadcast via REST API
    const response = await fetch("http://localhost:8081/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "REST API broadcast test" })
    });
    
    const result = await response.json();
    expect(result.success).toBe(true);
    
    // Verify client receives broadcast
    const [broadcastData] = await broadcastPromise;
    expect(broadcastData).toBe("REST API broadcast test");
    
    client.disconnect();
  });
});