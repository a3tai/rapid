package websocket

import (
	"log"
	"sync"

	"github.com/gorilla/websocket"
)

// Client represents a connected WebSocket client
type Client struct {
	// The Hub this client is connected to
	Hub *Hub

	// The WebSocket connection
	Conn *websocket.Conn

	// A unique client ID
	ID string

	// Buffered channel of outbound messages
	Send chan []byte

	// Optional metadata for the client
	Metadata map[string]interface{}
}

// Hub maintains the set of active clients and broadcasts messages to them
type Hub struct {
	// Registered clients
	Clients map[*Client]bool

	// Inbound messages from clients
	Broadcast chan []byte

	// Register requests from the clients
	Register chan *Client

	// Unregister requests from clients
	Unregister chan *Client

	// Mutex for protecting Clients map
	mu sync.RWMutex
}

// NewHub creates a new Hub instance
func NewHub() *Hub {
	return &Hub{
		Broadcast:  make(chan []byte, 256),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
		Clients:    make(map[*Client]bool),
	}
}

// Run runs the Hub, listening for register/unregister requests and broadcasting messages
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.mu.Lock()
			h.Clients[client] = true
			h.mu.Unlock()
			log.Printf("[Hub] Client registered: %s (total: %d)", client.ID, len(h.Clients))

		case client := <-h.Unregister:
			h.mu.Lock()
			if _, ok := h.Clients[client]; ok {
				delete(h.Clients, client)
				close(client.Send)
				h.mu.Unlock()
				log.Printf("[Hub] Client unregistered: %s (total: %d)", client.ID, len(h.Clients))
			} else {
				h.mu.Unlock()
			}

		case message := <-h.Broadcast:
			h.mu.RLock()
			for client := range h.Clients {
				select {
				case client.Send <- message:
				default:
					// Client's send channel is full, close it
					go func(c *Client) {
						h.Unregister <- c
					}(client)
				}
			}
			h.mu.RUnlock()
		}
	}
}

// ClientCount returns the number of connected clients
func (h *Hub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.Clients)
}

// SendToAll broadcasts a message to all connected clients
func (h *Hub) SendToAll(message []byte) {
	h.Broadcast <- message
}

// SendToClient sends a message to a specific client
func (h *Hub) SendToClient(clientID string, message []byte) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for client := range h.Clients {
		if client.ID == clientID {
			select {
			case client.Send <- message:
				return true
			default:
				// Channel full
				return false
			}
		}
	}
	return false
}

// GetClientByID retrieves a client by its ID
func (h *Hub) GetClientByID(clientID string) *Client {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for client := range h.Clients {
		if client.ID == clientID {
			return client
		}
	}
	return nil
}

// GetAllClients returns a list of all connected clients
func (h *Hub) GetAllClients() []*Client {
	h.mu.RLock()
	defer h.mu.RUnlock()

	clients := make([]*Client, 0, len(h.Clients))
	for client := range h.Clients {
		clients = append(clients, client)
	}
	return clients
}

// Close closes the hub and all connections
func (h *Hub) Close() {
	h.mu.Lock()
	defer h.mu.Unlock()

	for client := range h.Clients {
		close(client.Send)
		client.Conn.Close()
	}
	h.Clients = make(map[*Client]bool)
}
