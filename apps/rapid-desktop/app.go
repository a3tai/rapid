package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"time"
)

// App struct for Wails binding
type App struct {
	ctx        context.Context
	socketPath string
}

// NewApp creates a new App application struct
func NewApp() *App {
	homeDir, _ := os.UserHomeDir()
	return &App{
		socketPath: filepath.Join(homeDir, ".rapid", "rapid.sock"),
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
	// For MVP, return mock data until MCP integration is complete
	return []Agent{
		{ID: "orchestrator-1", Name: "orchestrator", Worktree: "main"},
		{ID: "worker-1", Name: "worker", Worktree: "feat/auth"},
		{ID: "designer-1", Name: "designer", Worktree: "main"},
	}, nil
}

// GetTasks returns list of tasks
func (a *App) GetTasks(status string) ([]Task, error) {
	// For MVP, return mock data
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

// GetMessages returns recent event bus messages
func (a *App) GetMessages(limit int) ([]Message, error) {
	if limit <= 0 {
		limit = 20
	}

	// For MVP, return mock data
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
	// This would call the daemon or MCP to spawn an agent
	return nil
}

// StopAgent stops a running agent
func (a *App) StopAgent(agentID string) error {
	// This would call the daemon or MCP to stop an agent
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
