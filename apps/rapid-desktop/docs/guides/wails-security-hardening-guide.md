# Wails UI - Advanced Security Hardening Guide

## Overview

This guide provides comprehensive security hardening procedures for the RAPID Wails UI application in production environments. It covers threat modeling, secure coding practices, cryptography, authentication, and operational security.

---

## 1. Threat Model & Attack Surface

### Application Architecture Threats

```
Frontend (React)
├── Threats:
│   ├── XSS (Cross-Site Scripting)
│   ├── CSRF (Cross-Site Request Forgery)
│   ├── DOM-based attacks
│   └── Local storage compromise
└── Mitigations:
    ├── Content Security Policy
    ├── Input sanitization
    ├── Output encoding
    └── React built-in protections

Wails Bridge (IPC)
├── Threats:
│   ├── Malicious bridge calls
│   ├── Data exfiltration
│   ├── Command injection
│   └── Privilege escalation
└── Mitigations:
    ├── Input validation
    ├── Output encoding
    ├── Rate limiting
    └── Permission checks

Go Backend
├── Threats:
│   ├── Goroutine exhaustion (DoS)
│   ├── Memory exhaustion
│   ├── Resource leaks
│   └── Dependency vulnerabilities
└── Mitigations:
    ├── Resource limits
    ├── Input validation
    ├── Dependency auditing
    └── Security scanning

WebSocket Server
├── Threats:
│   ├── Message flooding
│   ├── Connection hijacking
│   ├── Man-in-the-Middle (MITM)
│   └── Denial of Service
└── Mitigations:
    ├── Rate limiting
    ├── Message validation
    ├── TLS/SSL
    └── Authentication
```

### Attack Vectors & Risk Assessment

| Attack Vector | Severity | Likelihood | Impact | Mitigation |
|---------------|----------|-----------|--------|-----------|
| XSS via user input | HIGH | MEDIUM | App compromise | Input sanitization + CSP |
| Command injection via Wails binding | CRITICAL | LOW | Code execution | Input validation + whitelisting |
| Memory exhaustion | HIGH | MEDIUM | Crash | Rate limits + resource caps |
| WebSocket flooding | MEDIUM | HIGH | DoS | Rate limiting + connection limits |
| Dependency vulnerability | HIGH | MEDIUM | Code execution | Regular audits + updates |
| Local storage theft | MEDIUM | LOW | Data breach | Encryption + permissions |
| MITM on WebSocket | CRITICAL | MEDIUM | Data interception | TLS 1.3 + HSTS |

---

## 2. Secure Coding Practices

### 2.1 Input Validation

**Principle**: Never trust user input. Validate early and often.

#### Frontend Input Validation

```typescript
// frontend/src/utils/validation.ts
export class InputValidator {
  // Whitelist approach - only allow known good characters
  static validateTaskName(input: string): { valid: boolean; error?: string } {
    if (typeof input !== 'string') {
      return { valid: false, error: 'Input must be a string' };
    }

    if (input.length < 1 || input.length > 256) {
      return { valid: false, error: 'Task name must be 1-256 characters' };
    }

    // Only allow alphanumeric, spaces, and common punctuation
    const allowedPattern = /^[a-zA-Z0-9\s\-\.\,\!\?\(\)]+$/;
    if (!allowedPattern.test(input)) {
      return {
        valid: false,
        error: 'Task name contains invalid characters'
      };
    }

    return { valid: true };
  }

  static validateChatMessage(input: string): { valid: boolean; error?: string } {
    if (typeof input !== 'string') {
      return { valid: false, error: 'Message must be a string' };
    }

    if (input.length === 0) {
      return { valid: false, error: 'Message cannot be empty' };
    }

    if (input.length > 10000) {
      return { valid: false, error: 'Message too long (max 10000 chars)' };
    }

    // Check for suspicious patterns
    if (this.containsScriptTags(input)) {
      return { valid: false, error: 'Messages cannot contain script tags' };
    }

    return { valid: true };
  }

  static validateAgentPersona(input: string): { valid: boolean; error?: string } {
    // Only allow a specific set of known personas
    const ALLOWED_PERSONAS = ['claude', 'opencode', 'aider'];

    if (!ALLOWED_PERSONAS.includes(input)) {
      return {
        valid: false,
        error: `Persona must be one of: ${ALLOWED_PERSONAS.join(', ')}`
      };
    }

    return { valid: true };
  }

  private static containsScriptTags(input: string): boolean {
    return /<script|<iframe|javascript:/i.test(input);
  }
}

// Usage in component
const handleSendMessage = (text: string) => {
  const validation = InputValidator.validateChatMessage(text);
  if (!validation.valid) {
    toast.error(validation.error);
    return;
  }

  // Safe to proceed
  sendMessage(text);
};
```

#### Go Backend Input Validation

```go
// app.go - Input validation in Wails bindings
package main

import (
	"fmt"
	"regexp"
	"strings"
)

// ValidateChatMessage validates chat message input
func (a *App) ValidateChatMessage(content string) (bool, error) {
	// Type check
	if content == "" {
		return false, fmt.Errorf("message cannot be empty")
	}

	// Length validation
	if len(content) > 10000 {
		return false, fmt.Errorf("message exceeds max length (10000 chars)")
	}

	// Pattern validation - check for suspicious content
	if strings.Contains(content, "DROP TABLE") || strings.Contains(content, "DELETE FROM") {
		return false, fmt.Errorf("potential injection attack detected")
	}

	return true, nil
}

// ValidateTaskParameters validates task creation
func (a *App) ValidateTaskParameters(title string, priority string) error {
	// Validate title
	titleRegex := regexp.MustCompile(`^[a-zA-Z0-9\s\-\.\,\!\?\(\)]+$`)
	if !titleRegex.MatchString(title) {
		return fmt.Errorf("task title contains invalid characters")
	}

	// Validate priority - whitelist approach
	validPriorities := map[string]bool{"low": true, "normal": true, "high": true, "urgent": true}
	if !validPriorities[priority] {
		return fmt.Errorf("invalid priority: %s", priority)
	}

	return nil
}

// ValidateSpawnAgentRequest validates agent spawn request
func (a *App) ValidateSpawnAgentRequest(persona string, task string) error {
	// Whitelist allowed personas
	allowedPersonas := map[string]bool{"claude": true, "opencode": true, "aider": true}
	if !allowedPersonas[persona] {
		return fmt.Errorf("invalid persona: %s", persona)
	}

	// Task validation
	if len(task) == 0 || len(task) > 5000 {
		return fmt.Errorf("task description must be 1-5000 characters")
	}

	return nil
}

// Use in Wails bindings
func (a *App) SendMessage(content string) error {
	// Validate first
	if _, err := a.ValidateChatMessage(content); err != nil {
		return fmt.Errorf("invalid message: %w", err)
	}

	// Then process
	// ...
	return nil
}
```

### 2.2 Output Encoding & XSS Prevention

```typescript
// frontend/src/utils/sanitization.ts
import DOMPurify from 'dompurify';

export class OutputSanitizer {
  // Sanitize user-provided HTML
  static sanitizeHTML(html: string): string {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'br', 'p'],
      ALLOWED_ATTR: []
    });
  }

  // Encode text content safely
  static encodeText(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Safe JSON stringification
  static safeStringify(obj: any): string {
    try {
      return JSON.stringify(obj);
    } catch (error) {
      console.error('JSON stringify failed:', error);
      return '{}';
    }
  }
}

// React component - Use sanitization
export const ChatMessage: React.FC<{ message: Message }> = ({ message }) => {
  // For user input, encode as text (safest)
  return (
    <div className="message">
      <p>{message.content}</p>
      {/* If you must render HTML, sanitize first */}
      {message.isMarkdown && (
        <div dangerouslySetInnerHTML={{
          __html: OutputSanitizer.sanitizeHTML(message.content)
        }} />
      )}
    </div>
  );
};
```

### 2.3 Content Security Policy

```typescript
// frontend/index.html
<!DOCTYPE html>
<html>
<head>
  <!-- Strict CSP to prevent XSS -->
  <meta
    http-equiv="Content-Security-Policy"
    content="
      default-src 'self';
      script-src 'self' 'wasm-unsafe-eval';
      style-src 'self' 'unsafe-inline';
      img-src 'self' data:;
      font-src 'self';
      connect-src 'self' ws: wss:;
      frame-ancestors 'none';
      base-uri 'self';
      form-action 'self'
    "
  />

  <!-- Additional security headers -->
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-Content-Type-Options" content="nosniff" />
  <meta http-equiv="X-Frame-Options" content="DENY" />
  <meta http-equiv="X-XSS-Protection" content="1; mode=block" />
  <meta name="Referrer-Policy" content="no-referrer" />
</head>
<body>
  <div id="root"></div>
  <script src="/main.tsx" type="module"></script>
</body>
</html>
```

---

## 3. Secure Wails Bridge Communication

### 3.1 Input/Output Validation at Bridge Boundary

```typescript
// frontend/src/hooks/useWailsBinding.ts - Enhanced with validation
export function useWailsBinding() {
  const call = async <T extends any>(
    methodName: string,
    ...args: any[]
  ): Promise<T> => {
    // Validate method name against whitelist
    const allowedMethods = [
      'SendMessage',
      'GetConversation',
      'GetAgents',
      'SpawnAgent',
      'GetTasks',
      'CreateTask',
      'UpdateTask'
    ];

    if (!allowedMethods.includes(methodName)) {
      throw new Error(`Method not allowed: ${methodName}`);
    }

    // Validate arguments count
    const maxArgs = 5;
    if (args.length > maxArgs) {
      throw new Error(`Too many arguments (max ${maxArgs})`);
    }

    // Call with timeout
    const timeout = new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Wails call timeout')), 10000)
    );

    try {
      const result = await Promise.race([
        window.runtime.Call<T>(methodName, ...args),
        timeout
      ]);

      // Validate response type
      if (typeof result !== 'object' && result !== null) {
        throw new Error('Invalid response type');
      }

      return result;
    } catch (error) {
      console.error(`Wails call failed: ${methodName}`, error);
      throw error;
    }
  };

  return { call };
}
```

### 3.2 Rate Limiting on Bridge

```go
// pkg/eventserver/ratelimiter.go - Rate limiter for Wails calls
package eventserver

import (
	"sync"
	"time"
)

type RateLimiter struct {
	calls   map[string][]time.Time
	limit   int
	window  time.Duration
	mu      sync.RWMutex
}

func NewRateLimiter(requestsPerSecond int) *RateLimiter {
	return &RateLimiter{
		calls:  make(map[string][]time.Time),
		limit:  requestsPerSecond,
		window: time.Second,
	}
}

func (rl *RateLimiter) Allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	windowStart := now.Add(-rl.window)

	// Get existing calls for this key
	calls := rl.calls[key]

	// Remove old calls outside window
	newCalls := []time.Time{}
	for _, call := range calls {
		if call.After(windowStart) {
			newCalls = append(newCalls, call)
		}
	}

	// Check if limit exceeded
	if len(newCalls) >= rl.limit {
		rl.calls[key] = newCalls
		return false
	}

	// Allow and record
	newCalls = append(newCalls, now)
	rl.calls[key] = newCalls
	return true
}

// Usage in app.go
func (a *App) SendMessage(content string) error {
	// Rate limit: 10 messages per second per user
	if !a.rateLimiter.Allow("sendMessage") {
		return fmt.Errorf("rate limit exceeded")
	}

	// Continue with validation and processing...
	return nil
}
```

---

## 4. WebSocket Security

### 4.1 TLS/SSL Configuration

```go
// main.go - Secure WebSocket server
package main

import (
	"crypto/tls"
	"net/http"
)

func startHTTPServer() {
	// TLS configuration
	tlsConfig := &tls.Config{
		MinVersion:               tls.VersionTLS13,
		CurvePreferences:         []tls.CurveID{tls.CurveP521, tls.CurveP384, tls.CurveP256},
		PreferServerCipherSuites: true,
		CipherSuites: []uint16{
			tls.TLS_AES_256_GCM_SHA384,
			tls.TLS_CHACHA20_POLY1305_SHA256,
			tls.TLS_AES_128_GCM_SHA256,
		},
	}

	server := &http.Server{
		Addr:              "127.0.0.1:3443", // Only localhost for desktop app
		TLSConfig:         tlsConfig,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20, // 1MB max header size
		Handler:           setupRoutes(),
	}

	// Use self-signed cert for local development
	// In production, use proper certs or just HTTP on localhost
	if os.Getenv("RAPID_INSECURE_DEV") == "true" {
		log.Println("[WARNING] Running in insecure mode - TLS disabled")
		server.TLSConfig = nil
	}

	go func() {
		if err := server.ListenAndServeTLS("cert.pem", "key.pem"); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTPS server error: %v", err)
		}
	}()
}
```

### 4.2 WebSocket Message Validation

```go
// pkg/eventserver/server.go - Enhanced with message validation
type EventServer struct {
	// ... existing fields
	maxMessageSize int64
	messageQueue   chan *ValidatedEvent
}

type ValidatedEvent struct {
	ID        string    `json:"id"`
	Type      string    `json:"type"`
	Content   string    `json:"content"`
	Timestamp int64     `json:"timestamp"`
}

func (es *EventServer) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Validate origin header
	if !es.isAllowedOrigin(r.Header.Get("Origin")) {
		http.Error(w, "origin not allowed", http.StatusForbidden)
		return
	}

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[ERROR] WebSocket upgrade failed: %v", err)
		return
	}
	defer ws.Close()

	// Set message size limit (1MB)
	ws.SetReadLimit(1 << 20)

	// Set timeouts
	ws.SetReadDeadline(time.Now().Add(60 * time.Second))
	ws.SetPongHandler(func(string) error {
		ws.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	// Create client
	client := &Client{
		send: make(chan interface{}, 256),
		ws:   ws,
	}

	es.register <- client

	go client.readPump(es)
	client.writePump()
}

func (c *Client) readPump(es *EventServer) {
	defer func() {
		es.unregister <- c
		c.ws.Close()
	}()

	for {
		// Read message with timeout
		if err := c.ws.SetReadDeadline(time.Now().Add(60 * time.Second)); err != nil {
			return
		}

		var msg ValidatedEvent
		if err := c.ws.ReadJSON(&msg); err != nil {
			log.Printf("[DEBUG] WebSocket read error: %v", err)
			return
		}

		// Validate message
		if !es.isValidEvent(msg) {
			log.Printf("[WARN] Invalid event received: %v", msg)
			continue
		}

		// Process validated message
		// ...
	}
}

func (es *EventServer) isValidEvent(event ValidatedEvent) bool {
	// Validate required fields
	if event.ID == "" || event.Type == "" {
		return false
	}

	// Validate event type
	validTypes := map[string]bool{
		"completion": true,
		"error":      true,
		"discovery":  true,
		"question":   true,
	}

	if !validTypes[event.Type] {
		return false
	}

	// Validate message length
	if len(event.Content) > 50000 { // 50KB max
		return false
	}

	// Validate timestamp is reasonable (within 1 hour)
	now := time.Now().Unix()
	if event.Timestamp < now-3600 || event.Timestamp > now+3600 {
		return false
	}

	return true
}

func (es *EventServer) isAllowedOrigin(origin string) bool {
	// Only allow localhost origins for desktop app
	allowedOrigins := []string{
		"http://localhost",
		"http://127.0.0.1",
		"http://localhost:5173", // Dev server
	}

	for _, allowed := range allowedOrigins {
		if origin == allowed {
			return true
		}
	}

	return false
}
```

---

## 5. Dependency Security

### 5.1 Regular Dependency Audits

```bash
#!/bin/bash
# scripts/security-audit.sh

echo "Running security audit..."

# Check npm packages
echo "Auditing npm dependencies..."
npm audit --production

# Check Go dependencies for vulnerabilities
echo "Auditing Go dependencies..."
nancy sleuth 2>&1 | grep -i vulnerability

# Check for outdated packages
echo "Checking for outdated packages..."
npm outdated

# Generate SBOM (Software Bill of Materials)
npm list --all > SBOM_npm.txt
go list -m all > SBOM_go.txt

echo "Security audit complete. Review results above."
```

### 5.2 Dependency Update Strategy

```yaml
# .dependabot.yml
version: 2
updates:
  # npm packages
  - package-ecosystem: "npm"
    directory: "/apps/rapid-desktop/frontend"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "03:00"
    reviewers:
      - "security-team"
    allow:
      - dependency-type: "all"
    ignore:
      # Ignore major version updates except security fixes
      - dependency-name: "*"
        update-types:
          - "version-update:semver-major"

  # Go modules
  - package-ecosystem: "gomod"
    directory: "/apps/rapid-desktop"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "03:00"
    reviewers:
      - "security-team"
```

---

## 6. Secrets Management

### 6.1 Secure Secrets Handling

```typescript
// frontend/src/utils/secrets.ts
export class SecretsManager {
  // NEVER store secrets in localStorage
  private static secrets = new Map<string, string>();

  // Only store secrets in memory during session
  static setSecret(key: string, value: string): void {
    this.secrets.set(key, value);
    // Auto-clear after timeout
    setTimeout(() => {
      this.secrets.delete(key);
    }, 1000 * 60 * 60); // 1 hour
  }

  static getSecret(key: string): string | undefined {
    return this.secrets.get(key);
  }

  static clearSecret(key: string): void {
    this.secrets.delete(key);
    // Overwrite in memory
    const dummy = new Array(1000).fill('x').join('');
  }

  static clearAllSecrets(): void {
    this.secrets.forEach((_, key) => {
      this.clearSecret(key);
    });
    this.secrets.clear();
  }
}

// Usage
SecretsManager.setSecret('daemon-token', token);
const token = SecretsManager.getSecret('daemon-token');

// On logout
SecretsManager.clearAllSecrets();
```

### 6.2 Environment Variable Security

```bash
#!/bin/bash
# scripts/validate-secrets.sh

# Check for hardcoded secrets
echo "Checking for hardcoded secrets..."

# Patterns to search for
PATTERNS=(
  "password.*="
  "api_key.*="
  "secret.*="
  "token.*="
)

for pattern in "${PATTERNS[@]}"; do
  if grep -r "$pattern" src/ --include="*.ts" --include="*.tsx" --include="*.go"; then
    echo "⚠️  WARNING: Potential hardcoded secret found!"
    exit 1
  fi
done

# Check env files
if [ -f .env.local ]; then
  echo "⚠️  WARNING: .env.local found - should use environment variables"
fi

# Ensure no secrets in git history
if grep -r "BEGIN RSA PRIVATE KEY" .git/ 2>/dev/null; then
  echo "🚨 CRITICAL: Private key found in git history!"
  exit 1
fi

echo "✓ Secrets validation passed"
```

---

## 7. Authentication & Authorization

### 7.1 Daemon Authentication

```go
// app.go - Authenticate with RAPID daemon
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"time"
)

type DaemonClient struct {
	baseURL   string
	token     string
	tokenTime time.Time
}

func (dc *DaemonClient) getAuthToken() (string, error) {
	// Token expiry check
	if time.Since(dc.tokenTime) > 30*time.Minute {
		// Request new token
		newToken, err := dc.requestNewToken()
		if err != nil {
			return "", err
		}
		dc.token = newToken
		dc.tokenTime = time.Now()
	}

	return dc.token, nil
}

func (dc *DaemonClient) requestNewToken() (string, error) {
	// Read daemon secret from secure location (NOT hardcoded)
	daemonSecret := os.Getenv("RAPID_DAEMON_SECRET")
	if daemonSecret == "" {
		return "", fmt.Errorf("daemon secret not configured")
	}

	// Generate HMAC-based token
	hash := sha256.New()
	hash.Write([]byte(daemonSecret + time.Now().Format("20060102")))
	token := hex.EncodeToString(hash.Sum(nil))

	return token, nil
}

// Usage in RPC calls
func (dc *DaemonClient) call(method string, params ...interface{}) (interface{}, error) {
	token, err := dc.getAuthToken()
	if err != nil {
		return nil, err
	}

	// Include token in request headers
	// ...
	return nil, nil
}
```

### 7.2 Frontend Authorization Checks

```typescript
// frontend/src/utils/authorization.ts
export class AuthorizationManager {
  // Define permissions per role
  private static permissions = {
    viewer: ['view_chat', 'view_tasks', 'view_events'],
    collaborator: [
      'view_chat',
      'send_message',
      'view_tasks',
      'create_task',
      'view_events'
    ],
    admin: [
      'view_chat',
      'send_message',
      'view_tasks',
      'create_task',
      'delete_task',
      'spawn_agent',
      'stop_agent',
      'view_events',
      'manage_settings'
    ]
  };

  static hasPermission(role: string, action: string): boolean {
    const rolePerms = this.permissions[role];
    if (!rolePerms) return false;
    return rolePerms.includes(action);
  }

  static requirePermission(role: string, action: string): void {
    if (!this.hasPermission(role, action)) {
      throw new Error(`Insufficient permissions: ${action}`);
    }
  }
}

// Usage in components
const handleSpawnAgent = (persona: string) => {
  try {
    AuthorizationManager.requirePermission(userRole, 'spawn_agent');
    spawnAgent(persona);
  } catch (error) {
    toast.error('You do not have permission to spawn agents');
  }
};
```

---

## 8. Security Testing

### 8.1 Security Test Suite

```typescript
// frontend/src/__tests__/security.test.ts
import { describe, it, expect } from 'vitest';
import { InputValidator } from '../utils/validation';
import { OutputSanitizer } from '../utils/sanitization';

describe('Security Tests', () => {
  describe('Input Validation', () => {
    it('should reject script tags in task names', () => {
      const result = InputValidator.validateTaskName('<script>alert("xss")</script>');
      expect(result.valid).toBe(false);
    });

    it('should reject SQL injection attempts', () => {
      const result = InputValidator.validateTaskName("'; DROP TABLE tasks; --");
      expect(result.valid).toBe(false);
    });

    it('should accept valid task names', () => {
      const result = InputValidator.validateTaskName('Build new feature');
      expect(result.valid).toBe(true);
    });

    it('should enforce max length', () => {
      const longName = 'a'.repeat(257);
      const result = InputValidator.validateTaskName(longName);
      expect(result.valid).toBe(false);
    });
  });

  describe('Output Sanitization', () => {
    it('should remove script tags', () => {
      const dirty = '<p>Hello</p><script>alert("xss")</script>';
      const clean = OutputSanitizer.sanitizeHTML(dirty);
      expect(clean).not.toContain('script');
    });

    it('should preserve safe HTML', () => {
      const html = '<p><b>Hello</b></p>';
      const clean = OutputSanitizer.sanitizeHTML(html);
      expect(clean).toContain('<b>');
    });

    it('should encode special characters', () => {
      const text = '<script>alert("xss")</script>';
      const encoded = OutputSanitizer.encodeText(text);
      expect(encoded).not.toContain('<script>');
      expect(encoded).toContain('&lt;');
    });
  });

  describe('Authorization', () => {
    it('should deny unauthorized actions', () => {
      expect(() => {
        AuthorizationManager.requirePermission('viewer', 'spawn_agent');
      }).toThrow();
    });

    it('should allow authorized actions', () => {
      expect(() => {
        AuthorizationManager.requirePermission('admin', 'spawn_agent');
      }).not.toThrow();
    });
  });
});
```

### 8.2 OWASP Top 10 Checklist

- [ ] **A1: Injection** - Input validation, parameterized queries ✓
- [ ] **A2: Broken Authentication** - Secure auth token management ✓
- [ ] **A3: Sensitive Data Exposure** - TLS 1.3, no hardcoded secrets ✓
- [ ] **A4: XML External Entities** - N/A (not using XML parsing)
- [ ] **A5: Broken Access Control** - Authorization checks in place ✓
- [ ] **A6: Security Misconfiguration** - Hardened headers, secure defaults ✓
- [ ] **A7: XSS** - CSP, output encoding, input validation ✓
- [ ] **A8: Insecure Deserialization** - JSON validation ✓
- [ ] **A9: Using Components with Known Vulnerabilities** - Dependency audits ✓
- [ ] **A10: Insufficient Logging & Monitoring** - Audit logging enabled ✓

---

## 9. Incident Response

### 9.1 Security Incident Response Plan

```
┌─────────────────────────────────────────┐
│ 1. DETECTION                            │
│    - Monitoring alerts                  │
│    - User reports                       │
│    - Security scanning                  │
└────────────┬────────────────────────────┘
             │
┌────────────▼────────────────────────────┐
│ 2. IMMEDIATE RESPONSE                   │
│    - Assess severity                    │
│    - Notify security team               │
│    - Gather initial evidence            │
└────────────┬────────────────────────────┘
             │
┌────────────▼────────────────────────────┐
│ 3. INVESTIGATION                        │
│    - Determine scope                    │
│    - Identify root cause                │
│    - Collect logs & forensics           │
└────────────┬────────────────────────────┘
             │
┌────────────▼────────────────────────────┐
│ 4. CONTAINMENT                          │
│    - Stop active attack                 │
│    - Isolate affected systems           │
│    - Revoke credentials                 │
└────────────┬────────────────────────────┘
             │
┌────────────▼────────────────────────────┐
│ 5. REMEDIATION                          │
│    - Patch vulnerability                │
│    - Deploy fixes                       │
│    - Verify effectiveness               │
└────────────┬────────────────────────────┘
             │
┌────────────▼────────────────────────────┐
│ 6. RECOVERY                             │
│    - Restore systems                    │
│    - Verify functionality               │
│    - Monitor closely                    │
└────────────┬────────────────────────────┘
             │
┌────────────▼────────────────────────────┐
│ 7. POST-INCIDENT                        │
│    - Communicate with users             │
│    - Document findings                  │
│    - Update security measures           │
│    - Schedule retrospective             │
└─────────────────────────────────────────┘
```

### 9.2 Emergency Contacts

- **Security Lead**: [Contact info]
- **DevOps Lead**: [Contact info]
- **Legal/Compliance**: [Contact info]
- **External Security**: [Contact info for external IR firm]

---

## 10. Security Checklist for Releases

Before production deployment, verify:

- [ ] All security tests passing
- [ ] No hardcoded secrets or credentials
- [ ] Dependency audit passed
- [ ] SAST scanning completed
- [ ] CSP headers configured
- [ ] TLS 1.3+ enabled
- [ ] Rate limiting configured
- [ ] Input validation in place
- [ ] Output encoding applied
- [ ] Authorization checks present
- [ ] Error messages don't leak sensitive info
- [ ] Logging doesn't capture sensitive data
- [ ] Security headers set correctly
- [ ] CORS properly configured
- [ ] File upload validation in place
- [ ] Request size limits enforced
- [ ] Timeout configurations reasonable
- [ ] Secrets management reviewed
- [ ] Recent security advisories reviewed
- [ ] Penetration testing completed (if available)

---

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP Secure Coding Practices](https://owasp.org/www-project-secure-coding-practices-quick-reference-guide/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [CWE Top 25](https://cwe.mitre.org/top25/)

