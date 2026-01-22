# RAPID Architecture Diagrams

Visual representations of the RAPID multi-agent system components and workflows.

## System Architecture Diagram

```mermaid
graph TB
    subgraph "RAPID Multi-Agent System"
        orch["Orchestrator Agent<br/>(Task Assignment)"]
        bus["Event Bus<br/>(Redis)"]

        subgraph "Worker Agents"
            w1["Worker 1<br/>(Haiku)"]
            w2["Worker 2<br/>(Sonnet)"]
            designer["Designer<br/>(Architecture)"]
        end

        subgraph "Isolated Worktrees"
            wt1[".worktrees/feat-auth/"]
            wt2[".worktrees/fix-perf/"]
            wt3[".worktrees/design-sys/"]
        end

        subgraph "MCP Tools"
            fs["Filesystem"]
            exec["Exec"]
            net["Network"]
            sec["Secrets"]
            eb["Event Bus"]
            persona["Personas"]
            tasks["Tasks"]
        end
    end

    orch -->|coordinates| bus
    bus -->|assigns| w1
    bus -->|assigns| w2
    bus -->|assigns| designer

    w1 -->|uses| fs
    w1 -->|uses| exec
    w1 -->|sends| bus
    w1 -->|works in| wt1

    w2 -->|uses| fs
    w2 -->|uses| exec
    w2 -->|sends| bus
    w2 -->|works in| wt2

    designer -->|uses| fs
    designer -->|sends| bus
    designer -->|works in| wt3

    bus -->|coordinates| persona
    bus -->|manages| tasks

    style bus fill:#ff9900,stroke:#333,color:#000
    style orch fill:#3399ff,stroke:#333,color:#fff
    style w1 fill:#66cc99,stroke:#333,color:#000
    style w2 fill:#66cc99,stroke:#333,color:#000
    style designer fill:#cc99ff,stroke:#333,color:#000
```

## Event Bus Communication

```mermaid
graph LR
    w1["Worker 1<br/>(Haiku)"]
    w2["Worker 2<br/>(Sonnet)"]
    des["Designer"]
    orch["Orchestrator"]

    subgraph "Event Bus Message Types"
        msg1["coordination<br/>Agent↔Agent"]
        msg2["completion<br/>Worker→All"]
        msg3["error<br/>Any→All"]
        msg4["discovery<br/>System Events"]
        msg5["learning<br/>Knowledge Sharing"]
        msg6["question<br/>Query"]
    end

    w1 -->|sends| msg1
    w1 -->|sends| msg2
    w1 -->|sends| msg3

    w2 -->|sends| msg1
    w2 -->|sends| msg2

    des -->|sends| msg4
    des -->|sends| msg5

    orch -->|sends| msg1
    orch -->|receives| msg2
    orch -->|receives| msg3
    orch -->|broadcasts| msg6

    msg1 -.->|routed| w1
    msg1 -.->|routed| w2
    msg1 -.->|routed| des
    msg1 -.->|routed| orch
```

## Worktree Isolation Model

```mermaid
graph TB
    root["Project Root<br/>(main branch)"]

    subgraph "Git Worktrees"
        main["main/<br/>(reference)"]
        wt1["feat-auth-123/<br/>(Worker 1)"]
        wt2["fix-perf-456/<br/>(Worker 2)"]
        wt3["design-sys-789/<br/>(Designer)"]
    end

    subgraph "Shared Resources"
        src["src/<br/>(symlink)"]
        tests["tests/<br/>(symlink)"]
        docs["docs/<br/>(symlink)"]
    end

    subgraph "Agent-Specific"
        env1["env1<br/>(deps, config)"]
        env2["env2<br/>(deps, config)"]
        env3["env3<br/>(deps, config)"]
    end

    root -->|contains| main
    root -->|contains| wt1
    root -->|contains| wt2
    root -->|contains| wt3

    main -.->|links to| src
    wt1 -.->|links to| src
    wt2 -.->|links to| src
    wt3 -.->|links to| src

    wt1 -->|has| env1
    wt2 -->|has| env2
    wt3 -->|has| env3

    style main fill:#99ccff,stroke:#333
    style wt1 fill:#99ff99,stroke:#333
    style wt2 fill:#99ff99,stroke:#333
    style wt3 fill:#ffcc99,stroke:#333
```

## Task Lifecycle

```mermaid
graph TB
    create["Task Created<br/>(Orchestrator)"]
    pending["PENDING<br/>(in queue)"]
    assigned["ASSIGNED<br/>(worker claimed)"]
    progress["IN_PROGRESS<br/>(work executing)"]
    completed["COMPLETED<br/>(result submitted)"]
    failed["FAILED<br/>(error)"]

    create -->|queue| pending
    pending -->|bus_send assign| assigned
    assigned -->|start work| progress
    progress -->|success| completed
    progress -->|error| failed
    failed -->|retry| pending

    completed -->|record result| create

    style create fill:#e1f5ff,stroke:#333
    style pending fill:#fff9c4,stroke:#333
    style assigned fill:#f3e5f5,stroke:#333
    style progress fill:#c8e6c9,stroke:#333
    style completed fill:#81c784,stroke:#333,color:#fff
    style failed fill:#ff8a80,stroke:#333,color:#fff
```

## Data Flow: Parallel Development

```mermaid
sequenceDiagram
    participant Orch as Orchestrator
    participant Bus as Event Bus
    participant W1 as Worker 1
    participant W2 as Worker 2
    participant WT1 as .worktrees/feat-auth
    participant WT2 as .worktrees/fix-perf

    Orch->>Bus: Create tasks (feat-auth, fix-perf)
    Bus->>W1: Assign task: feat-auth
    Bus->>W2: Assign task: fix-perf

    par Parallel Execution
        W1->>Bus: Start task f28601bc
        W2->>Bus: Start task 6126550e
        W1->>WT1: git checkout feat/auth
        W2->>WT2: git checkout fix/perf
        W1->>WT1: implement feature A
        W2->>WT2: implement feature B
        W1->>WT1: run tests
        W2->>WT2: run tests
    end

    W1->>Bus: Complete task f28601bc ✓
    W2->>Bus: Complete task 6126550e ✓
    Orch->>Bus: Receive completion messages
    Orch->>Bus: Verify no conflicts
    Orch->>WT1: Merge feat/auth to main
    Orch->>WT2: Merge fix/perf to main
    Orch->>Bus: Broadcast: Work complete!
```

## Agent Communication Pattern

```mermaid
graph TB
    subgraph "Agent A"
        a1["Prepare<br/>Message"]
        a2["Send via<br/>bus_send"]
        a3["Poll for<br/>Responses"]
    end

    subgraph "Event Bus"
        queue["Message<br/>Queue"]
        registry["Agent<br/>Registry"]
    end

    subgraph "Agent B"
        b1["Poll<br/>bus_messages"]
        b2["Process<br/>Message"]
        b3["Prepare<br/>Reply"]
        b4["Send via<br/>bus_send"]
    end

    a1 -->|format| a2
    a2 -->|publish| queue
    queue -->|route| b1
    b1 -->|receive| b2
    b2 -->|decide| b3
    b3 -->|send| b4
    b4 -->|publish| queue
    queue -->|route| a3

    registry -.->|track| a3
    registry -.->|track| b1

    style queue fill:#ff9900,stroke:#333,color:#000
    style registry fill:#ff9900,stroke:#333,color:#000
```

## Configuration Hierarchy

```mermaid
graph TB
    config["rapid.json<br/>(Project Config)"]

    subgraph "Configuration Sections"
        agents["agents<br/>(default, available)"]
        personas["personas<br/>(team, autoSpawn)"]
        eventbus["eventBus<br/>(redis config)"]
        container["container<br/>(devcontainer)"]
        secrets["secrets<br/>(provider, vault)"]
    end

    subgraph "Persona Definitions<br/>(.rapid/personas/)"
        orch_def["orchestrator.yaml"]
        worker_def["worker.yaml"]
        designer_def["designer.yaml"]
    end

    subgraph "Runtime Components"
        agents_runtime["Available Agents<br/>Registry"]
        personas_runtime["Spawned Agents<br/>Registry"]
        eb_runtime["Event Bus<br/>Connection"]
        wt_runtime["Active Worktrees<br/>Registry"]
    end

    config -->|defines| agents
    config -->|defines| personas
    config -->|defines| eventbus
    config -->|defines| container
    config -->|defines| secrets

    personas -->|loads| orch_def
    personas -->|loads| worker_def
    personas -->|loads| designer_def

    agents -->|creates| agents_runtime
    orch_def -->|spawns| personas_runtime
    worker_def -->|spawns| personas_runtime
    designer_def -->|spawns| personas_runtime
    eventbus -->|connects| eb_runtime
    personas_runtime -->|creates| wt_runtime

    style config fill:#e3f2fd,stroke:#333
    style agents_runtime fill:#c8e6c9,stroke:#333
    style personas_runtime fill:#c8e6c9,stroke:#333
    style eb_runtime fill:#ffcc80,stroke:#333
```

## Ralph-Loop Execution

```mermaid
graph TB
    start["Start Ralph Loop"]
    setup["Setup State File<br/>(active=true)"]

    loop["Main Loop<br/>(Iteration N)"]
    poll["Poll Event Bus"]
    task["Task Available?"]
    claim["Claim Task"]
    execute["Execute Task"]
    complete["Mark Complete"]
    increment["Increment Iteration"]

    check_max["Check Max<br/>Iterations"]
    check_promise["Check Completion<br/>Promise"]

    continue["Continue"]
    stop["Stop Loop"]

    start -->|initialize| setup
    setup -->|enter| loop

    loop -->|poll| poll
    poll -->|check| task

    task -->|yes| claim
    claim -->|execute| execute
    execute -->|result| complete
    complete -->|next| increment

    task -->|no| increment
    increment -->|check| check_max

    check_max -->|max reached| stop
    check_max -->|continue| check_promise

    check_promise -->|promise met| stop
    check_promise -->|not met| continue

    continue -->|restart| loop

    style start fill:#81c784,stroke:#333,color:#fff
    style loop fill:#ffeb3b,stroke:#333,color:#000
    style stop fill:#f44336,stroke:#333,color:#fff
    style continue fill:#2196f3,stroke:#333,color:#fff
```

## Deployment Workflow

```mermaid
graph LR
    rapid_init["rapid init<br/>(Setup Project)"]
    config["rapid.json<br/>+ .rapid/personas/"]
    rapid_start["rapid start<br/>(Launch System)"]

    subgraph "System Startup"
        check_docker["Check Docker"]
        build_container["Build Container"]
        start_bus["Start Event Bus"]
        spawn_team["Spawn Team Agents"]
    end

    rapid_dev["rapid dev<br/>(Enter Environment)"]

    subgraph "Development"
        agents_work["Agents Process<br/>Tasks Continuously"]
    end

    rapid_stop["rapid stop<br/>(Shutdown)"]

    rapid_init -->|create| config
    config -->|use| rapid_start
    rapid_start -->|verify| check_docker
    check_docker -->|build| build_container
    build_container -->|launch| start_bus
    start_bus -->|load personas| spawn_team
    spawn_team -->|ready| rapid_dev
    rapid_dev -->|enter| agents_work
    agents_work -->|poll| agents_work
    agents_work -->|stop| rapid_stop

    style rapid_init fill:#4caf50,stroke:#333,color:#fff
    style rapid_start fill:#2196f3,stroke:#333,color:#fff
    style rapid_dev fill:#ff9800,stroke:#333,color:#fff
    style agents_work fill:#9c27b0,stroke:#333,color:#fff
    style rapid_stop fill:#f44336,stroke:#333,color:#fff
```

## System Statistics

| Metric                            | Current                     | Target         |
| --------------------------------- | --------------------------- | -------------- |
| Active Agents                     | 2-3                         | 10+            |
| Task Throughput                   | 15 tasks                    | 50+ tasks/hour |
| Event Bus Messages                | 50+                         | 1000+          |
| Worktree Support                  | 3 active                    | 20+ concurrent |
| Agent Types                       | 3 (Haiku, Sonnet, Designer) | 6+ specialized |
| MCP Tools                         | 30+                         | 50+            |
| Response Time (task → completion) | < 5 min                     | < 2 min        |
| System Uptime                     | N/A                         | 99.9%          |

## Key Features

✅ **Orchestration** - Intelligent task assignment and coordination
✅ **Isolation** - Git worktrees prevent conflicts
✅ **Communication** - Real-time event bus messaging
✅ **Scaling** - Add agents dynamically
✅ **Automation** - Minimal human intervention
✅ **Transparency** - Complete audit trail
✅ **Resilience** - Fault tolerance and recovery
✅ **Integration** - Connects to GitHub, GitLab, Linear, Slack, etc.
