package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// WebSocketSubscription represents a subscription to real-time updates
type WebSocketSubscription struct {
	ID        string
	EventType string // 'agents', 'tasks', 'messages', 'status'
	Channel   chan interface{}
}

// AppService is the main service for the RAPID desktop app (Wails v3)
type AppService struct {
	daemonURL     string
	subscriptions map[string]*WebSocketSubscription
	subMutex      sync.RWMutex
}

// NewAppService creates a new AppService instance
func NewAppService() *AppService {
	daemonURL := os.Getenv("RAPID_DAEMON_URL")
	if daemonURL == "" {
		daemonURL = "http://localhost:3200"
	}
	return &AppService{
		daemonURL:     daemonURL,
		subscriptions: make(map[string]*WebSocketSubscription),
	}
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

// rpcResult holds the result of an async RPC call
type rpcResult struct {
	data interface{}
	err  error
}

// rpcCall makes a JSON-RPC call to the daemon via HTTP
// Uses goroutine to avoid blocking Wails event loop
func (a *AppService) rpcCall(method string, params interface{}) (interface{}, error) {
	log.Printf("[RPC] Starting call to %s at %s", method, a.daemonURL)

	// Build request
	request := map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  method,
		"id":      time.Now().UnixNano(),
	}
	if params != nil {
		request["params"] = params
	}

	body, err := json.Marshal(request)
	if err != nil {
		log.Printf("[RPC] Marshal error: %v", err)
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	log.Printf("[RPC] Sending request: %s", string(body))

	// Use channel to receive result from goroutine
	resultChan := make(chan rpcResult, 1)

	go func() {
		log.Printf("[RPC] Goroutine started, making HTTP call...")
		client := &http.Client{Timeout: 5 * time.Second}
		resp, err := client.Post(a.daemonURL+"/rpc", "application/json", bytes.NewReader(body))
		if err != nil {
			log.Printf("[RPC] HTTP error: %v", err)
			resultChan <- rpcResult{nil, fmt.Errorf("failed to connect to daemon: %w", err)}
			return
		}
		defer resp.Body.Close()

		log.Printf("[RPC] Got response status: %d", resp.StatusCode)

		if resp.StatusCode != http.StatusOK {
			resultChan <- rpcResult{nil, fmt.Errorf("daemon returned status %d", resp.StatusCode)}
			return
		}

		// Read response
		var response struct {
			Result interface{}            `json:"result"`
			Error  map[string]interface{} `json:"error"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
			log.Printf("[RPC] Decode error: %v", err)
			resultChan <- rpcResult{nil, fmt.Errorf("failed to read response: %w", err)}
			return
		}

		if response.Error != nil {
			log.Printf("[RPC] RPC error: %v", response.Error["message"])
			resultChan <- rpcResult{nil, fmt.Errorf("RPC error: %v", response.Error["message"])}
			return
		}

		log.Printf("[RPC] Success, sending result to channel")
		resultChan <- rpcResult{response.Result, nil}
	}()

	log.Printf("[RPC] Waiting on select...")
	// Wait for result with timeout
	select {
	case result := <-resultChan:
		log.Printf("[RPC] Got result from channel, err=%v", result.err)
		return result.data, result.err
	case <-time.After(10 * time.Second):
		log.Printf("[RPC] Timeout!")
		return nil, fmt.Errorf("RPC call timed out")
	}
}

// GetDaemonStatus returns the daemon's current status
func (a *AppService) GetDaemonStatus() (*DaemonStatus, error) {
	result, err := a.rpcCall("daemon.status", nil)
	if err != nil {
		// Daemon not running or not reachable
		return &DaemonStatus{
			Running:    false,
			SocketPath: a.daemonURL,
		}, nil
	}

	data, _ := json.Marshal(result)
	var status DaemonStatus
	json.Unmarshal(data, &status)
	status.Running = true
	status.SocketPath = a.daemonURL
	return &status, nil
}

// GetAgents returns list of active agents
func (a *AppService) GetAgents() ([]Agent, error) {
	// Try to get agents from daemon
	result, err := a.rpcCall("agents.list", nil)
	if err != nil {
		// Return empty array when daemon is not running (no fake data)
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
		// Return empty array when daemon is not running (no fake data)
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
		// Return empty array when daemon is not running (no fake data)
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

// SpawnAgent spawns a new agent with a persona using the daemon's agent.spawn RPC
func (a *AppService) SpawnAgent(persona, worktree string) error {
	log.Printf("[SpawnAgent] Spawning %s agent on worktree %s", persona, worktree)

	// Get project directory from environment or use current directory
	projectDir := os.Getenv("RAPID_PROJECT_DIR")
	if projectDir == "" {
		var err error
		projectDir, err = os.Getwd()
		if err != nil {
			return fmt.Errorf("failed to get project directory: %w", err)
		}
	}

	// Use daemon's agent.spawn RPC method instead of calling MCP directly
	params := map[string]interface{}{
		"projectDir": projectDir,
		"persona":    persona,
		"task":       fmt.Sprintf("Work on %s branch as %s agent", worktree, persona),
	}

	result, err := a.rpcCall("agent.spawn", params)
	if err != nil {
		log.Printf("[SpawnAgent] RPC error: %v", err)
		return fmt.Errorf("failed to spawn agent: %w", err)
	}

	log.Printf("[SpawnAgent] Agent spawned: %v", result)

	// Emit event via Wails v3 application
	app := application.Get()
	if app != nil {
		app.Event.Emit("rapid:agent:spawned", map[string]interface{}{
			"persona":  persona,
			"worktree": worktree,
			"result":   result,
		})
	}

	return nil
}

// StopAgent stops a running agent using the daemon's agent.stop RPC
func (a *AppService) StopAgent(agentID string) error {
	log.Printf("[StopAgent] Stopping agent %s", agentID)

	// Use daemon's agent.stop RPC method
	params := map[string]interface{}{
		"agentId": agentID,
	}

	result, err := a.rpcCall("agent.stop", params)
	if err != nil {
		log.Printf("[StopAgent] RPC error: %v", err)
		return fmt.Errorf("failed to stop agent: %w", err)
	}

	log.Printf("[StopAgent] Agent stopped: %v", result)

	// Emit event via Wails v3 application
	app := application.Get()
	if app != nil {
		app.Event.Emit("rapid:agent:stopped", map[string]interface{}{
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

					// Emit Wails v3 event
					app := application.Get()
					if app != nil {
						eventData := map[string]interface{}{
							"type": sub.EventType,
							"data": data,
						}
						app.Event.Emit("rapid:"+sub.EventType, eventData)
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
	app := application.Get()
	_, err := a.rpcCall("message.send", messagePayload)
	if err != nil {
		// Fall back to local event emission
		if app != nil {
			app.Event.Emit("rapid:message:sent", map[string]interface{}{
				"type": messageType,
				"data": messagePayload,
			})
		}
	}

	// Also emit locally for immediate UI update
	if app != nil {
		app.Event.Emit("rapid:messages", map[string]interface{}{
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

// LogEntry represents a single log entry from an agent
type LogEntry struct {
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"`
	Message   string `json:"message"`
	AgentID   string `json:"agentId,omitempty"`
}

// GetAgentLogs retrieves logs for a specific agent
// First tries to get logs from daemon (which has access to Docker volumes)
// Falls back to local file search if daemon is unavailable
func (a *AppService) GetAgentLogs(agentID string, limit int) ([]LogEntry, error) {
	if limit <= 0 {
		limit = 100
	}

	// First, try to get logs from daemon via RPC (daemon has access to Docker volumes)
	result, err := a.rpcCall("agent.logs", map[string]interface{}{
		"sessionId": agentID,
		"tail":      limit,
	})
	if err == nil && result != nil {
		// Parse daemon response
		data, _ := json.Marshal(result)
		var response struct {
			SessionID string `json:"sessionId"`
			Logs      string `json:"logs"`
			Error     string `json:"error,omitempty"`
		}
		if json.Unmarshal(data, &response) == nil && response.Logs != "" {
			// Parse the logs string into entries
			lines := bytes.Split(bytes.TrimSpace([]byte(response.Logs)), []byte("\n"))
			entries := make([]LogEntry, 0, len(lines))
			for _, line := range lines {
				if len(line) == 0 {
					continue
				}
				entries = append(entries, LogEntry{
					Message: string(line),
					Level:   "info",
					AgentID: agentID,
				})
			}
			if len(entries) > limit {
				entries = entries[len(entries)-limit:]
			}
			return entries, nil
		}
	}

	// Fall back to local file search
	return a.getAgentLogsFromFiles(agentID, limit)
}

// getAgentLogsFromFiles searches local filesystem for agent logs
// Agents now use a consistent "agent.log" filename in their worktree
func (a *AppService) getAgentLogsFromFiles(agentID string, limit int) ([]LogEntry, error) {
	// Try multiple locations for log files
	var logFile string
	var content []byte
	var err error

	cwd, _ := os.Getwd()

	// 1. Check worktrees first - agents write to worktree/.rapid/logs/agent.log
	worktreesDir := filepath.Join(cwd, ".worktrees")
	if entries, err := os.ReadDir(worktreesDir); err == nil {
		for _, entry := range entries {
			if entry.IsDir() {
				// New simple naming: agent.log
				worktreeLogFile := filepath.Join(worktreesDir, entry.Name(), ".rapid", "logs", "agent.log")
				if content, err = os.ReadFile(worktreeLogFile); err == nil {
					// Prioritize worktree matching agent name
					if strings.Contains(entry.Name(), agentID) || strings.Contains(agentID, entry.Name()) {
						logFile = worktreeLogFile
						break
					}
					// Keep as fallback if no better match found
					if logFile == "" {
						logFile = worktreeLogFile
					}
				}
			}
		}
	}

	// 2. Try project root for simple agent.log
	if logFile == "" {
		projectLogFile := filepath.Join(cwd, ".rapid", "logs", "agent.log")
		if content, err = os.ReadFile(projectLogFile); err == nil {
			logFile = projectLogFile
		}
	}

	// 3. Legacy: Try old naming patterns for backwards compatibility
	if logFile == "" {
		legacyLogFile := filepath.Join(cwd, ".rapid", "logs", fmt.Sprintf("agent-%s.log", agentID))
		if content, err = os.ReadFile(legacyLogFile); err == nil {
			logFile = legacyLogFile
		}
	}

	// 4. Try RAPID_PROJECT_DIR env var
	if logFile == "" {
		if projectDir := os.Getenv("RAPID_PROJECT_DIR"); projectDir != "" {
			envLogFile := filepath.Join(projectDir, ".rapid", "logs", "agent.log")
			if content, err = os.ReadFile(envLogFile); err == nil {
				logFile = envLogFile
			}
		}
	}

	// No log file found
	if logFile == "" {
		log.Printf("[GetAgentLogs] No logs found for agent: %s", agentID)
		// Return empty list if no log file exists
		return []LogEntry{}, nil
	}

	log.Printf("[GetAgentLogs] Found logs at: %s", logFile)

	// Parse log file (expecting line-delimited text or JSON)
	lines := bytes.Split(bytes.TrimSpace(content), []byte("\n"))
	entries := make([]LogEntry, 0)

	// Read from end to get most recent entries first
	for i := len(lines) - 1; i >= 0 && len(entries) < limit; i-- {
		if len(lines[i]) == 0 {
			continue
		}

		var entry LogEntry
		if err := json.Unmarshal(lines[i], &entry); err != nil {
			// If not JSON, treat as raw log message
			entry = LogEntry{
				Message: string(lines[i]),
				Level:   "info",
			}
		}
		entry.AgentID = agentID
		entries = append(entries, entry)
	}

	// Reverse to get chronological order
	for i, j := 0, len(entries)-1; i < j; i, j = i+1, j-1 {
		entries[i], entries[j] = entries[j], entries[i]
	}

	return entries, nil
}

// GetLogsDirectory retrieves list of available log files
func (a *AppService) GetLogsDirectory() ([]string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("failed to get home directory: %w", err)
	}

	logsDir := filepath.Join(homeDir, ".rapid", "logs")

	entries, err := os.ReadDir(logsDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []string{}, nil
		}
		return nil, fmt.Errorf("failed to read logs directory: %w", err)
	}

	var logFiles []string
	for _, entry := range entries {
		if !entry.IsDir() && filepath.Ext(entry.Name()) == ".log" {
			logFiles = append(logFiles, entry.Name())
		}
	}

	return logFiles, nil
}

// CallTool is a generic method to call any MCP tool through the daemon
// Routes all tool calls through the daemon's tools.call RPC method
// This avoids direct MCP calls and CORS issues
func (a *AppService) CallTool(toolName string, arguments map[string]interface{}) (map[string]interface{}, error) {
	log.Printf("[CallTool] Calling tool %s with args: %v", toolName, arguments)

	// Route through daemon RPC instead of calling MCP directly
	params := map[string]interface{}{
		"name":      toolName,
		"arguments": arguments,
	}

	result, err := a.rpcCall("tools.call", params)
	if err != nil {
		log.Printf("[CallTool] RPC error: %v", err)
		return nil, fmt.Errorf("failed to call tool %s: %w", toolName, err)
	}

	log.Printf("[CallTool] Got result: %v", result)

	// Convert result to map
	if resultMap, ok := result.(map[string]interface{}); ok {
		return resultMap, nil
	}

	// Wrap in map if needed
	return map[string]interface{}{"result": result}, nil
}

// UpdateTaskStatus updates a task's status via MCP
func (a *AppService) UpdateTaskStatus(taskID string, status string) error {
	_, err := a.CallTool("task_update", map[string]interface{}{
		"taskId": taskID,
		"status": status,
	})
	return err
}

// FetchApprovals retrieves pending approvals
func (a *AppService) FetchApprovals(status string, agentID string, limit int) ([]map[string]interface{}, error) {
	args := map[string]interface{}{}
	if status != "" {
		args["status"] = status
	}
	if agentID != "" {
		args["agentId"] = agentID
	}
	if limit > 0 {
		args["limit"] = limit
	}

	result, err := a.CallTool("approval_list", args)
	if err != nil {
		return nil, err
	}

	// Extract approvals from result
	if resultData, ok := result["result"].(map[string]interface{}); ok {
		if content, ok := resultData["content"].([]interface{}); ok {
			approvals := make([]map[string]interface{}, 0)
			for _, item := range content {
				if approval, ok := item.(map[string]interface{}); ok {
					approvals = append(approvals, approval)
				}
			}
			return approvals, nil
		}
	}

	return []map[string]interface{}{}, nil
}

// ApproveRequest approves a pending approval request
func (a *AppService) ApproveRequest(requestID string, reason string) error {
	args := map[string]interface{}{
		"requestId": requestID,
		"approved":  true,
	}
	if reason != "" {
		args["reason"] = reason
	}
	_, err := a.CallTool("approval_respond", args)
	return err
}

// RejectRequest rejects a pending approval request
func (a *AppService) RejectRequest(requestID string, reason string) error {
	args := map[string]interface{}{
		"requestId": requestID,
		"approved":  false,
	}
	if reason != "" {
		args["reason"] = reason
	}
	_, err := a.CallTool("approval_respond", args)
	return err
}

// SubmitVote submits a vote on a suggestion
func (a *AppService) SubmitVote(suggestionID string, vote string) error {
	_, err := a.CallTool("suggestion_vote", map[string]interface{}{
		"suggestionId": suggestionID,
		"vote":         vote,
	})
	return err
}

// OverrideSuggestion allows orchestrator to override a suggestion decision
func (a *AppService) OverrideSuggestion(suggestionID string, decision string, reason string) error {
	_, err := a.CallTool("suggestion_override", map[string]interface{}{
		"suggestionId": suggestionID,
		"decision":     decision,
		"reason":       reason,
	})
	return err
}
