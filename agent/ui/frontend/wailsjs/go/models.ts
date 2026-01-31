export namespace main {
	
	export class AdapterInfo {
	    name: string;
	    description: string;
	    type: string;
	    macAddress: string;
	    connected: boolean;
	    dhcpEnabled: boolean;
	    ipv4Address?: string;
	    subnetMask?: string;
	    defaultGateway?: string;
	    dhcpServer?: string;
	    dnsServers?: string[];
	
	    static createFrom(source: any = {}) {
	        return new AdapterInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.description = source["description"];
	        this.type = source["type"];
	        this.macAddress = source["macAddress"];
	        this.connected = source["connected"];
	        this.dhcpEnabled = source["dhcpEnabled"];
	        this.ipv4Address = source["ipv4Address"];
	        this.subnetMask = source["subnetMask"];
	        this.defaultGateway = source["defaultGateway"];
	        this.dhcpServer = source["dhcpServer"];
	        this.dnsServers = source["dnsServers"];
	    }
	}
	export class ConfigResponse {
	    serverUrl: string;
	    syncIntervalSeconds: number;
	
	    static createFrom(source: any = {}) {
	        return new ConfigResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.serverUrl = source["serverUrl"];
	        this.syncIntervalSeconds = source["syncIntervalSeconds"];
	    }
	}
	export class LinkStartResponse {
	    verificationUri: string;
	    userCode: string;
	    expiresIn: number;
	    interval: number;
	
	    static createFrom(source: any = {}) {
	        return new LinkStartResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.verificationUri = source["verificationUri"];
	        this.userCode = source["userCode"];
	        this.expiresIn = source["expiresIn"];
	        this.interval = source["interval"];
	    }
	}
	export class LinkStatusResponse {
	    status: string;
	    error?: string;
	    message?: string;
	
	    static createFrom(source: any = {}) {
	        return new LinkStatusResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.error = source["error"];
	        this.message = source["message"];
	    }
	}
	export class LogsResponse {
	    lines?: string[];
	
	    static createFrom(source: any = {}) {
	        return new LogsResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.lines = source["lines"];
	    }
	}
	export class NetworkResponse {
	    primary?: AdapterInfo;
	    adapters: AdapterInfo[];
	
	    static createFrom(source: any = {}) {
	        return new NetworkResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.primary = this.convertValues(source["primary"], AdapterInfo);
	        this.adapters = this.convertValues(source["adapters"], AdapterInfo);
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
	export class StatusResponse {
	    state: string;
	    linked: boolean;
	    agentUuid?: string;
	    obtainedAt?: string;
	    message?: string;
	
	    static createFrom(source: any = {}) {
	        return new StatusResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.state = source["state"];
	        this.linked = source["linked"];
	        this.agentUuid = source["agentUuid"];
	        this.obtainedAt = source["obtainedAt"];
	        this.message = source["message"];
	    }
	}

}

