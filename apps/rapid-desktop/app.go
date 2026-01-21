package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
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

// AppService is the main service for the RAPID desktop app (Wails v2)
type AppService struct {
	ctx           context.Context
	daemonURL     string
	socketPath    string
	subscriptions map[string]*WebSocketSubscription
	subMutex      sync.RWMutex
}

// NewAppService creates a new AppService instance
func NewAppService() *AppService {
	homeDir, _ := os.UserHomeDir()
	// Use RAPID_DAEMON_URL env var, default to localhost:3200
	daemonURL := os.Getenv("RAPID_DAEMON_URL")
	if daemonURL == "" {
		daemonURL = "http://localhost:3200/rpc"
	}
	return &AppService{
		daemonURL:     daemonURL,
		socketPath:    filepath.Join(homeDir, ".rapid", "rapid.sock"),
		subscriptions: make(map[string]*WebSocketSubscription),
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *AppService) startup(ctx context.Context) {
	a.ctx = ctx
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

// rpcCall makes a JSON-RPC call to the daemon via HTTP
func (a *AppService) rpcCall(method string, params interface{}) (interface{}, error) {
	// Build request
	request := map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  method,
		"id":      time.Now().UnixNano(),
	}
	if params != nil {
		request["params"] = params
	}

	// Encode request body
	body, err := json.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("failed to encode request: %w", err)
	}

	// Make HTTP request
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Post(a.daemonURL, "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to connect to daemon: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	var response struct {
		Result interface{}            `json:"result"`
		Error  map[string]interface{} `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if response.Error != nil {
		return nil, fmt.Errorf("RPC error: %v", response.Error["message"])
	}

	return response.Result, nil
}

// GetDaemonStatus returns the daemon's current status
func (a *AppService) GetDaemonStatus() (*DaemonStatus, error) {
	result, err := a.rpcCall("daemon.status", nil)
	if err != nil {
		return &DaemonStatus{
			Running:    false,
			SocketPath: a.daemonURL,
		}, nil
	}

	data, _ := json.Marshal(result)
	var status DaemonStatus
	json.Unmarshal(data, &status)
	status.SocketPath = a.daemonURL
	return &status, nil
}

// GetAgents returns list of active agents
func (a *AppService) GetAgents() ([]Agent, error) {
	// Try to get agents from daemon
	// Use 0 to get all agents (no time filter)
	params := map[string]interface{}{
		"maxAgeSeconds": 0,
	}
	result, err := a.rpcCall("agents.list", params)
	if err != nil {
		// Return empty list if daemon is not running (no mock data)
		return []Agent{}, nil
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
func (a *AppService) GetTasks(status string) ([]Task, error) {
	// Try to get tasks from daemon
	params := map[string]interface{}{}
	if status != "" {
		params["status"] = status
	}

	result, err := a.rpcCall("tasks.list", params)
	if err != nil {
		// Return empty list if daemon is not running (no mock data)
		return []Task{}, nil
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
func (a *AppService) GetMessages(limit int) ([]Message, error) {
	if limit <= 0 {
		limit = 20
	}

	// Try to get messages from daemon
	params := map[string]interface{}{
		"limit": limit,
	}

	result, err := a.rpcCall("messages.list", params)
	if err != nil {
		// Return empty list if daemon is not running (no mock data)
		return []Message{}, nil
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
func (a *AppService) CreateTask(title, description, priority string, tags []string) (*Task, error) {
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
func (a *AppService) SpawnAgent(persona, worktree string) error {
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

	// Emit event via Wails v2 runtime
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, "rapid:agent:spawned", map[string]interface{}{
			"persona":  persona,
			"worktree": worktree,
			"result":   result,
		})
	}

	return nil
}

// StopAgent stops a running agent
func (a *AppService) StopAgent(agentID string) error {
	// Call the daemon to stop the agent
	params := map[string]interface{}{
		"agentId": agentID,
	}

	result, err := a.rpcCall("persona.stop", params)
	if err != nil {
		return fmt.Errorf("failed to stop agent: %w", err)
	}

	// Emit event via Wails v2 runtime
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, "rapid:agent:stopped", map[string]interface{}{
			"agentId": agentID,
			"result":  result,
		})
	}

	return nil
}

// GetConfig returns the current rapid.json configuration
func (a *AppService) GetConfig() (map[string]interface{}, error) {
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
func (a *AppService) SaveConfig(config map[string]interface{}) error {
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
func (a *AppService) Subscribe(eventType string) (string, error) {
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
func (a *AppService) Unsubscribe(subID string) error {
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
func (a *AppService) pollAndBroadcast(sub *WebSocketSubscription) {
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

					// Emit Wails v2 event
					if a.ctx != nil {
						eventData := map[string]interface{}{
							"type": sub.EventType,
							"data": data,
						}
						runtime.EventsEmit(a.ctx, "rapid:"+sub.EventType, eventData)
					}

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
func (a *AppService) SendMessage(targetAgent string, messageType string, content string) (string, error) {
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
	_, err := a.rpcCall("message.send", messagePayload)
	if err != nil {
		// Fall back to local event emission
		if a.ctx != nil {
			runtime.EventsEmit(a.ctx, "rapid:message:sent", map[string]interface{}{
				"type": messageType,
				"data": messagePayload,
			})
		}
	}

	// Also emit locally for immediate UI update
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, "rapid:messages", map[string]interface{}{
			"type": "message",
			"data": messagePayload,
		})
	}

	return messageID, nil
}

// GetChatHistory retrieves chat history with a specific agent or all messages
func (a *AppService) GetChatHistory(agentID string, limit int) ([]Message, error) {
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
