package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// WebSocketSubscription represents a subscription to real-time updates
type WebSocketSubscription struct {
	ID        string
	EventType string // 'agents', 'tasks', 'messages', 'status'
	Channel   chan interface{}
}

// App struct for Wails binding
type App struct {
	ctx           context.Context
	socketPath    string
	subscriptions map[string]*WebSocketSubscription
	subMutex      sync.RWMutex
}

// NewApp creates a new App application struct
func NewApp() *App {
	homeDir, _ := os.UserHomeDir()
	return &App{
		socketPath:    filepath.Join(homeDir, ".rapid", "rapid.sock"),
		subscriptions: make(map[string]*WebSocketSubscription),
	}
}

// startup is called when the app starts
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// shutdown is called when the app is closing
func (a *App) shutdown(ctx context.Context) {
	// Cleanup if needed
}

// Agent represents an agent on the event bus
type Agent struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Worktree string `json:"worktree,omitempty"`
	Session  string `json:"session,omitempty"`
}

// Task represents a task in the system
type Task struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Description string   `json:"description,omitempty"`
	Status      string   `json:"status"`
	Priority    string   `json:"priority"`
	AssignedTo  string   `json:"assignedTo,omitempty"`
	CreatedAt   string   `json:"createdAt"`
	UpdatedAt   string   `json:"updatedAt"`
	Tags        []string `json:"tags,omitempty"`
}

// Message represents an event bus message
type Message struct {
	ID        string                 `json:"id"`
	Type      string                 `json:"type"`
	FromAgent Agent                  `json:"fromAgent"`
	Timestamp string                 `json:"timestamp"`
	Payload   map[string]interface{} `json:"payload"`
}

// DaemonStatus represents the daemon's status
type DaemonStatus struct {
	Running    bool   `json:"running"`
	PID        int    `json:"pid,omitempty"`
	SocketPath string `json:"socketPath"`
	Version    string `json:"version,omitempty"`
	Uptime     int64  `json:"uptime,omitempty"`
	Sessions   int    `json:"sessions,omitempty"`
}

// rpcCall makes a JSON-RPC call to the daemon
func (a *App) rpcCall(method string, params interface{}) (interface{}, error) {
	conn, err := net.DialTimeout("unix", a.socketPath, 5*time.Second)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to daemon: %w", err)
	}
	defer conn.Close()

	// Build request
	request := map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  method,
		"id":      time.Now().UnixNano(),
	}
	if params != nil {
		request["params"] = params
	}

	// Send request
	encoder := json.NewEncoder(conn)
	if err := encoder.Encode(request); err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}

	// Read response
	var response struct {
		Result interface{}            `json:"result"`
		Error  map[string]interface{} `json:"error"`
	}
	decoder := json.NewDecoder(conn)
	if err := decoder.Decode(&response); err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if response.Error != nil {
		return nil, fmt.Errorf("RPC error: %v", response.Error["message"])
	}

	return response.Result, nil
}

// GetDaemonStatus returns the daemon's current status
func (a *App) GetDaemonStatus() (*DaemonStatus, error) {
	result, err := a.rpcCall("daemon.status", nil)
	if err != nil {
		return &DaemonStatus{
			Running:    false,
			SocketPath: a.socketPath,
		}, nil
	}

	data, _ := json.Marshal(result)
	var status DaemonStatus
	json.Unmarshal(data, &status)
	return &status, nil
}

// GetAgents returns list of active agents
func (a *App) GetAgents() ([]Agent, error) {
	// Try to get agents from daemon
	result, err := a.rpcCall("agents.list", nil)
	if err != nil {
		// Fallback to mock data if daemon is not running
		return []Agent{
			{ID: "orchestrator-1", Name: "orchestrator", Worktree: "main"},
			{ID: "worker-1", Name: "worker", Worktree: "feat/auth"},
			{ID: "designer-1", Name: "designer", Worktree: "main"},
		}, nil
	}

	// Parse the result
	data, _ := json.Marshal(result)
	var response struct {
		Agents []Agent `json:"agents"`
	}
	if err := json.Unmarshal(data, &response); err != nil {
		// Try parsing as direct array
		var agents []Agent
		if err := json.Unmarshal(data, &agents); err != nil {
			return nil, fmt.Errorf("failed to parse agents: %w", err)
		}
		return agents, nil
	}

	return response.Agents, nil
}

// GetTasks returns list of tasks
func (a *App) GetTasks(status string) ([]Task, error) {
	// Try to get tasks from daemon
	params := map[string]interface{}{}
	if status != "" {
		params["status"] = status
	}

	result, err := a.rpcCall("tasks.list", params)
	if err != nil {
		// Fallback to mock data if daemon is not running
		tasks := []Task{
			{
				ID:         "task-1",
				Title:      "Implement authentication",
				Status:     "in_progress",
				Priority:   "high",
				AssignedTo: "worker-1",
				CreatedAt:  time.Now().Add(-2 * time.Hour).Format(time.RFC3339),
				UpdatedAt:  time.Now().Add(-30 * time.Minute).Format(time.RFC3339),
				Tags:       []string{"feature", "auth"},
			},
			{
				ID:        "task-2",
				Title:     "Review PR #42",
				Status:    "pending",
				Priority:  "normal",
				CreatedAt: time.Now().Add(-1 * time.Hour).Format(time.RFC3339),
				UpdatedAt: time.Now().Add(-1 * time.Hour).Format(time.RFC3339),
				Tags:      []string{"review"},
			},
			{
				ID:         "task-3",
				Title:      "Fix build errors",
				Status:     "completed",
				Priority:   "urgent",
				AssignedTo: "worker-1",
				CreatedAt:  time.Now().Add(-3 * time.Hour).Format(time.RFC3339),
				UpdatedAt:  time.Now().Add(-1 * time.Hour).Format(time.RFC3339),
				Tags:       []string{"bug", "ci"},
			},
		}

		if status != "" {
			var filtered []Task
			for _, t := range tasks {
				if t.Status == status {
					filtered = append(filtered, t)
				}
			}
			return filtered, nil
		}

		return tasks, nil
	}

	// Parse the result
	data, _ := json.Marshal(result)
	var response struct {
		Tasks []Task `json:"tasks"`
	}
	if err := json.Unmarshal(data, &response); err != nil {
		// Try parsing as direct array
		var tasks []Task
		if err := json.Unmarshal(data, &tasks); err != nil {
			return nil, fmt.Errorf("failed to parse tasks: %w", err)
		}
		return tasks, nil
	}

	return response.Tasks, nil
}

// GetMessages returns recent event bus messages
func (a *App) GetMessages(limit int) ([]Message, error) {
	if limit <= 0 {
		limit = 20
	}

	// Try to get messages from daemon
	params := map[string]interface{}{
		"limit": limit,
	}

	result, err := a.rpcCall("messages.list", params)
	if err != nil {
		// Fallback to mock data if daemon is not running
		return []Message{
			{
				ID:        "msg-1",
				Type:      "completion",
				FromAgent: Agent{ID: "worker-1", Name: "worker"},
				Timestamp: time.Now().Add(-5 * time.Minute).Format(time.RFC3339),
				Payload: map[string]interface{}{
					"title":   "Task completed",
					"content": "Implemented user authentication module",
				},
			},
			{
				ID:        "msg-2",
				Type:      "discovery",
				FromAgent: Agent{ID: "designer-1", Name: "designer"},
				Timestamp: time.Now().Add(-10 * time.Minute).Format(time.RFC3339),
				Payload: map[string]interface{}{
					"title":   "Found existing pattern",
					"content": "Discovered auth middleware in src/middleware/auth.ts",
				},
			},
			{
				ID:        "msg-3",
				Type:      "coordination",
				FromAgent: Agent{ID: "orchestrator-1", Name: "orchestrator"},
				Timestamp: time.Now().Add(-15 * time.Minute).Format(time.RFC3339),
				Payload: map[string]interface{}{
					"title":   "Task assigned",
					"content": "Assigned auth implementation to worker-1",
				},
			},
		}, nil
	}

	// Parse the result
	data, _ := json.Marshal(result)
	var response struct {
		Messages []Message `json:"messages"`
	}
	if err := json.Unmarshal(data, &response); err != nil {
		// Try parsing as direct array
		var messages []Message
		if err := json.Unmarshal(data, &messages); err != nil {
			return nil, fmt.Errorf("failed to parse messages: %w", err)
		}
		return messages, nil
	}

	return response.Messages, nil
}

// CreateTask creates a new task
func (a *App) CreateTask(title, description, priority string, tags []string) (*Task, error) {
	task := &Task{
		ID:          fmt.Sprintf("task-%d", time.Now().UnixNano()),
		Title:       title,
		Description: description,
		Status:      "pending",
		Priority:    priority,
		CreatedAt:   time.Now().Format(time.RFC3339),
		UpdatedAt:   time.Now().Format(time.RFC3339),
		Tags:        tags,
	}
	return task, nil
}

// SpawnAgent spawns a new agent with a persona
func (a *App) SpawnAgent(persona, worktree string) error {
	// Call MCP server HTTP endpoint to spawn agent
	mcpURL := os.Getenv("RAPID_MCP_URL")
	if mcpURL == "" {
		mcpURL = "http://localhost:3100"
	}

	// Build MCP tool call request
	toolCall := map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  "tools/call",
		"id":      time.Now().UnixNano(),
		"params": map[string]interface{}{
			"name": "persona_spawn",
			"arguments": map[string]interface{}{
				"name": persona,
				"task": fmt.Sprintf("Work on %s branch as %s agent", worktree, persona),
			},
		},
	}

	body, err := json.Marshal(toolCall)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	resp, err := http.Post(mcpURL+"/mcp", "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to call MCP server: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("MCP server returned status %d", resp.StatusCode)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("failed to decode response: %w", err)
	}

	// Log spawn success
	runtime.EventsEmit(a.ctx, "rapid:agent:spawned", map[string]interface{}{
		"persona":  persona,
		"worktree": worktree,
		"result":   result,
	})

	return nil
}

// StopAgent stops a running agent
func (a *App) StopAgent(agentID string) error {
	// Call the daemon to stop the agent
	params := map[string]interface{}{
		"agentId": agentID,
	}

	result, err := a.rpcCall("persona.stop", params)
	if err != nil {
		return fmt.Errorf("failed to stop agent: %w", err)
	}

	// Log stop success
	runtime.EventsEmit(a.ctx, "rapid:agent:stopped", map[string]interface{}{
		"agentId": agentID,
		"result":  result,
	})

	return nil
}

// GetConfig returns the current rapid.json configuration
func (a *App) GetConfig() (map[string]interface{}, error) {
	configPath := filepath.Join(".", "rapid.json")
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, err
	}

	var config map[string]interface{}
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, err
	}

	return config, nil
}

// SaveConfig saves the rapid.json configuration
func (a *App) SaveConfig(config map[string]interface{}) error {
	configPath := filepath.Join(".", "rapid.json")

	// Marshal config to JSON with indentation
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	// Write to file with newline at end
	if err := os.WriteFile(configPath, append(data, '\n'), 0644); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}

	return nil
}

// Subscribe creates a WebSocket subscription for real-time updates
// Returns a subscription ID that can be used to unsubscribe
func (a *App) Subscribe(eventType string) (string, error) {
	if eventType != "agents" && eventType != "tasks" && eventType != "messages" && eventType != "status" {
		return "", fmt.Errorf("invalid event type: %s", eventType)
	}

	subID := fmt.Sprintf("%s-%d", eventType, time.Now().UnixNano())
	subscription := &WebSocketSubscription{
		ID:        subID,
		EventType: eventType,
		Channel:   make(chan interface{}, 100), // Buffered channel
	}

	a.subMutex.Lock()
	a.subscriptions[subID] = subscription
	a.subMutex.Unlock()

	// Start polling for updates in background
	go a.pollAndBroadcast(subscription)

	return subID, nil
}

// Unsubscribe removes a WebSocket subscription
func (a *App) Unsubscribe(subID string) error {
	a.subMutex.Lock()
	sub, exists := a.subscriptions[subID]
	if !exists {
		a.subMutex.Unlock()
		return fmt.Errorf("subscription not found: %s", subID)
	}
	delete(a.subscriptions, subID)
	a.subMutex.Unlock()

	close(sub.Channel)
	return nil
}

// pollAndBroadcast polls daemon for updates and broadcasts via Wails events
func (a *App) pollAndBroadcast(sub *WebSocketSubscription) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	var lastData interface{}

	for {
		select {
		case <-ticker.C:
			var data interface{}
			var err error

			switch sub.EventType {
			case "agents":
				data, err = a.GetAgents()
			case "tasks":
				// Fetch tasks with status filter empty to get all
				data, err = a.GetTasks("")
			case "messages":
				data, err = a.GetMessages(20)
			case "status":
				data, err = a.GetDaemonStatus()
			}

			if err == nil && data != nil {
				// Only emit if data changed to avoid flooding
				dataJSON, _ := json.Marshal(data)
				lastDataJSON, _ := json.Marshal(lastData)

				if string(dataJSON) != string(lastDataJSON) {
					lastData = data

					// Emit Wails event
					eventData := map[string]interface{}{
						"type": sub.EventType,
						"data": data,
					}
					runtime.EventsEmit(a.ctx, "rapid:"+sub.EventType, eventData)

					// Also try to send on channel for compatibility
					select {
					case sub.Channel <- data:
					default:
						// Channel full, skip
					}
				}
			}
		}
	}
}

// SendMessage sends a message to an agent or broadcasts to all agents
func (a *App) SendMessage(targetAgent string, messageType string, content string) (string, error) {
	if messageType != "coordination" && messageType != "discovery" && messageType != "completion" &&
	   messageType != "error" && messageType != "question" && messageType != "learning" {
		return "", fmt.Errorf("invalid message type: %s", messageType)
	}

	if content == "" {
		return "", fmt.Errorf("message content cannot be empty")
	}

	messageID := fmt.Sprintf("msg-%d", time.Now().UnixNano())

	// Create message structure
	messagePayload := map[string]interface{}{
		"id":        messageID,
		"type":      messageType,
		"fromAgent": map[string]string{"id": "orchestrator", "name": "orchestrator"},
		"timestamp": time.Now().Format(time.RFC3339),
		"content":   content,
		"target":    targetAgent, // "all" for broadcast or specific agent ID
	}

	// Send via RPC to daemon (if available)
	// This would integrate with the actual event bus on the daemon
	_, err := a.rpcCall("message.send", messagePayload)
	if err != nil {
		// Fall back to local event emission
		runtime.EventsEmit(a.ctx, "rapid:message:sent", map[string]interface{}{
			"type": messageType,
			"data": messagePayload,
		})
	}

	// Also emit locally for immediate UI update
	runtime.EventsEmit(a.ctx, "rapid:messages", map[string]interface{}{
		"type": "message",
		"data": messagePayload,
	})

	return messageID, nil
}

// GetChatHistory retrieves chat history with a specific agent or all messages
func (a *App) GetChatHistory(agentID string, limit int) ([]Message, error) {
	if limit <= 0 {
		limit = 50
	}

	messages, err := a.GetMessages(limit)
	if err != nil {
		return nil, err
	}

	// Filter by agent if not "all"
	if agentID != "all" && agentID != "" {
		var filtered []Message
		for _, msg := range messages {
			if msg.FromAgent.ID == agentID || msg.FromAgent.Name == agentID {
				filtered = append(filtered, msg)
			}
		}
		return filtered, nil
	}

	return messages, nil
}
