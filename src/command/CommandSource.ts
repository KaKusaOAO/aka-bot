import { DMChannel } from "discord.js";
import { Client } from "discord.js";
import { NewsChannel } from "discord.js";
import { TextChannel } from "discord.js";
import { Message, User, GuildMember, KInteractionWS } from "discord.js";
import { Akabot } from "../Akabot";

export abstract class CommandSource {
    public abstract getName(): string
    public async init(): Promise<void> {

    }
}

export class ConsoleCommandSource extends CommandSource {
    public message: string;

    public constructor(message: string) {
        super();
        this.message = message;
    }

    public getName() {
        return "Console";
    }
}

export abstract class DiscordSource extends CommandSource {
    public abstract getName(): string;
    public abstract getAuthor(): User;
    public abstract getMember(): GuildMember | null;
    public abstract getChannel(): TextChannel | DMChannel | NewsChannel;

    public getMentionName(): string {
        return `<@!${this.getAuthor().id}>`
    }
}

export class DiscordCommandSource extends DiscordSource {
    public message: Message;

    public constructor(message: Message) {
        super();
        this.message = message;
    }

    public getName() {
        return this.getAuthor().tag;
    }

    public getAuthor() {
        return this.message.author;
    }

    public getMember() {
        return this.message.member;
    }

    public getMentionName() {
        return `<@!${this.getAuthor().id}>`
    }

    public getChannel(): TextChannel | DMChannel | NewsChannel {
        return this.message.channel;
    }
}

export class DiscordSlashSource extends DiscordSource {
    private user: User | null = null;
    private member: GuildMember | null = null;
    private channel: TextChannel | DMChannel | NewsChannel | null = null;

    private bot: Client;
    private interaction: KInteractionWS;

    public constructor(bot: Client, interaction: KInteractionWS) {
        super();
        this.bot = bot;
        this.interaction = interaction;
    }

    public async init() {
        const bot = this.bot;
        const interaction = this.interaction;

        await Promise.all([
            bot.users.fetch(interaction.member.user.id).then(user => {
                this.user = user;
            }),
            bot.guilds.fetch(interaction.guild_id).then(async guild => {
                if(this.user == null) return;
                await guild.members.fetch(this.user).then(member => {
                    this.member = member;
                })
            }),
            bot.channels.fetch(interaction.channel_id).then(channel => {
                if(channel instanceof TextChannel || channel instanceof DMChannel || channel instanceof NewsChannel) {
                    this.channel = channel;
                }
            })
        ]).then(() => {
            Akabot.getInstance().logger.info("DiscordSlashSource ready");
        });
    }

    public getName(): string {
        return this.user?.tag ?? "<null>";
    }
    public getAuthor(): User {
        if(this.user == null) {
            throw new Error("user == null");
        }
        return this.user;
    }
    public getMember(): GuildMember | null {
        return this.member;
    }
    public getChannel(): TextChannel | DMChannel | NewsChannel {
        if(this.channel == null) {
            throw new Error("channel == null");
        }
        return this.channel;
    }
}