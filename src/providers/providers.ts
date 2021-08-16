import { APIMessageContentResolvable } from "discord.js";
import { MessageAdditions } from "discord.js";
import { NewsChannel } from "discord.js";
import { Message } from "discord.js";
import { DMChannel } from "discord.js";
import { TextChannel } from "discord.js";
import { MessageOptions } from "discord.js";
import { Client, GuildMember } from "discord.js";
import { Akabot } from "../Akabot";
import * as util from "util";

type UsableChannel = TextChannel | NewsChannel | DMChannel;
type DiscordMessage = (APIMessageContentResolvable | (MessageOptions & { split?: false | undefined; }) | MessageAdditions) & {
    embeds?: any[],
    components?: any[]
};
type MessageUsable = Message | {
    id: string
};

type DiscordMessageEdit = {
    embeds?: any[],
    components?: any[]
};

export abstract class ProviderBase {
    protected bot: Akabot;
    
    constructor(bot: Akabot) {
        this.bot = bot;
    }

    public abstract sendToChannel(channel: UsableChannel, data: DiscordMessage): Promise<MessageUsable>;
    public abstract editMessageAt(channel: UsableChannel, msg: string, data: DiscordMessageEdit): Promise<MessageUsable>;
    public abstract sendToMember(member: GuildMember, data: DiscordMessage): Promise<void>;
    public abstract kickMember(member: GuildMember, reason: string): Promise<void>;
    public abstract removeRole(member: GuildMember, roleId: string): Promise<void>;
    public abstract setChannelTopic(channel: TextChannel, topic: string, reason?: string): Promise<void>;
}

export class OnDutyProvider extends ProviderBase {
    constructor(bot: Akabot) {
        super(bot);
    }

    public async sendToChannel(channel: UsableChannel, data: DiscordMessage) {
        if(data.components || data.embeds) {
            // @ts-ignore
            const api: any = this.bot.bot.api;
            return await api.channels(channel.id).messages.post({ data });
        } else {
            return await channel.send(data);
        }
    }

    public async sendToMember(member: GuildMember, data: DiscordMessage) {
        await member.send(data);
    }
    
    public async kickMember(member: GuildMember, reason: string): Promise<void> {
        await member.kick(reason);
    }

    public async removeRole(member: GuildMember, roleId: string): Promise<void> {
        await member.roles.remove(roleId);
    }

    public async setChannelTopic(channel: TextChannel, topic: string, reason?: string): Promise<void> {
        await channel.setTopic(topic, reason);
    }

    public async editMessageAt(channel: UsableChannel, msg: string, data: DiscordMessageEdit): Promise<MessageUsable> {
        // @ts-ignore
        const api: any = this.bot.bot.api;
        return await api.channels(channel.id).messages(msg).patch({ data });
    }
}

export class TestProvider extends ProviderBase {
    constructor(bot: Akabot) {
        super(bot);
    }

    public async sendToChannel(channel: UsableChannel, data: DiscordMessage) {
        const name = channel instanceof DMChannel ? channel.recipient.tag : channel.name;
        this.bot.logger.info(`-- Debug: Sends message with data to channel: ${name} (#${channel.id})`);
        this.bot.logger.info(util.inspect(data, false, 2, true));
        return { id: "<debug>" };
    }

    public async sendToMember(member: GuildMember, data: DiscordMessage): Promise<void> {
        this.bot.logger.info(`-- Debug: Sends message with data to member: ${member.user.tag} (#${member.id})`);
        this.bot.logger.info(util.inspect(data, false, 2, true));
    }

    public async kickMember(member: GuildMember, reason: string): Promise<void> {
        this.bot.logger.info(`-- Debug: Kicks member: ${member.user.tag} (reason: ${reason})`);
    }

    public async removeRole(member: GuildMember, roleId: string): Promise<void> {
        this.bot.logger.info(`-- Debug: Removes role #${roleId} from member: ${member.user.tag}`);
    }

    public async setChannelTopic(channel: TextChannel, topic: string, reason?: string): Promise<void> {
        this.bot.logger.info(`-- Debug: Sets channel: ${channel.name} (#${channel.id}) topic: ${topic} (reason: ${reason})`);
    }

    public async editMessageAt(channel: UsableChannel, msg: string, data: DiscordMessageEdit): Promise<MessageUsable> {
        const name = channel instanceof DMChannel ? channel.recipient.tag : channel.name;
        this.bot.logger.info(`-- Debug: Edits message: #${msg} with data to channel: ${name} (#${channel.id})`);
        this.bot.logger.info(util.inspect(data, false, 2, true));
        return { id: "<debug>" };
    }
}