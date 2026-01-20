export namespace main {
	
	export class Agent {
	    id: string;
	    name: string;
	    worktree?: string;
	    session?: string;
	
	    static createFrom(source: any = {}) {
	        return new Agent(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.worktree = source["worktree"];
	        this.session = source["session"];
	    }
	}
	export class DaemonStatus {
	    running: boolean;
	    pid?: number;
	    socketPath: string;
	    version?: string;
	    uptime?: number;
	    sessions?: number;
	
	    static createFrom(source: any = {}) {
	        return new DaemonStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.running = source["running"];
	        this.pid = source["pid"];
	        this.socketPath = source["socketPath"];
	        this.version = source["version"];
	        this.uptime = source["uptime"];
	        this.sessions = source["sessions"];
	    }
	}
	export class Message {
	    id: string;
	    type: string;
	    fromAgent: Agent;
	    timestamp: string;
	    payload: Record<string, any>;
	
	    static createFrom(source: any = {}) {
	        return new Message(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.type = source["type"];
	        this.fromAgent = this.convertValues(source["fromAgent"], Agent);
	        this.timestamp = source["timestamp"];
	        this.payload = source["payload"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Task {
	    id: string;
	    title: string;
	    description?: string;
	    status: string;
	    priority: string;
	    assignedTo?: string;
	    createdAt: string;
	    updatedAt: string;
	    tags?: string[];
	
	    static createFrom(source: any = {}) {
	        return new Task(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.description = source["description"];
	        this.status = source["status"];
	        this.priority = source["priority"];
	        this.assignedTo = source["assignedTo"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	        this.tags = source["tags"];
	    }
	}

}

