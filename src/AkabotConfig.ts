import * as fs from "fs"
import { DataUpgrader } from "./utils/DataUpgrader";

const CONFIG_FILE = "config.json";

type AkabotConfigData = {
    version: number,
    appId: string,
    botToken: string,
    status: string,
    enableTypeDelay: boolean,
    allowSelfInvoke: boolean,
    activeSchedule: string | null,
    activeRole: string,
    activeCheckMsg: string | null,
    channels: AkabotConfigChannelData,
    guildId: string,
    ignoredRoles: string[],
    kickThresholdRole: string
    [key: string]: any
};

type AkabotConfigChannelData = {
    logger: string | null,
    announcement: string,
    checker: string
};

export class AkabotConfigUpgrader extends DataUpgrader<AkabotConfigData> {
    public constructor() {
        super();

        // For invalid files.
        this.addVersion(0, _ => {});

        this.addVersion(1, data => {
            data.version = 1;
            data.appId = "<insert app ID here>";
            data.botToken = "<insert token here>";
            data.allowSelfInvoke = false;
            data.enableTypeDelay = true;
            data.status = "Akabot on duty!";
            data.activeSchedule = null;
            data.activeRole = "<role being active>";
            data.activeCheckMsg = null;
            data.channels = {
                logger: null,
                announcement: "<empty>",
                checker: "empty"
            };
            data.guildId = "<empty>";
            data.kickThresholdRole = "<empty>";
            data.ignoredRoles = [];
        });
    }
}

export class AkabotConfig {
    public static readonly DEFAULT: AkabotConfigData = {
        version: 1,
        appId: "<insert app ID here>",
        botToken: "<insert token here>",
        status: "Akabot on duty!",
        enableTypeDelay: true,
        allowSelfInvoke: false,
        activeSchedule: null,
        activeRole: "<role indicates that member is being active>",
        activeCheckMsg: null,
        guildId: "<empty>",
        channels: {
            logger: null,
            announcement: "<empty>",
            checker: "empty"
        },
        kickThresholdRole: "<empty>",
        ignoredRoles: []
    }

    public data: AkabotConfigData = AkabotConfig.DEFAULT;
    
    public constructor() {
        this.load();
    }

    public load() {
        var upgrader = new AkabotConfigUpgrader();

        if(!fs.existsSync(CONFIG_FILE)) {
            this.save();
        }
        var buffer = fs.readFileSync(CONFIG_FILE);
        this.data = {
            ...this.data,
            ...JSON.parse(buffer.toString("utf8"))
        };

        var currentVersion = upgrader.getVersion(this.data.version);
        if(currentVersion == null) {
            throw new Error(`This configuration version (${this.data.version}) is not supported.`);
        }
        upgrader.upgrade(this.data, currentVersion, upgrader.getNewestVersion());
        this.save();
    }

    public getBotToken(): string {
        return this.data.botToken;
    }

    public getStatus(): string {
        return this.data.status;
    }

    public isTypeDelayEnabled(): boolean {
        return this.data.enableTypeDelay;
    }

    public isSelfInvokeAllowed(): boolean {
        return this.data.allowSelfInvoke;
    }

    public getActiveSchedule(): string | null {
        return this.data.activeSchedule;
    }

    public getActiveRole(): string {
        return this.data.activeRole;
    }

    public getActiveCheckMsg(): string | null {
        return this.data.activeCheckMsg;
    }

    public channels(): AkabotConfigChannelData {
        return this.data.channels;
    }

    public getGuildId(): string {
        return this.data.guildId;
    }

    public getIgnoredRoles(): string[] {
        return this.data.ignoredRoles;
    }

    public getKickThresholdRole(): string {
        return this.data.kickThresholdRole;
    }

    public save() {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.data, null, 4));
    }
}